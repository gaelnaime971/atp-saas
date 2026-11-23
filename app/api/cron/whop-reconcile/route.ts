/**
 * GET /api/cron/whop-reconcile
 *
 * Tâche planifiée Vercel — passe une fois par jour (cf. vercel.json).
 * Réconcilie les flags whop_subscription_active ↔ Whop, applique les
 * changements, et envoie un email récap à ALERT_EMAIL uniquement si
 * des modifications ont eu lieu. Filet de sécurité si un webhook rate.
 *
 * SÉCURITÉ :
 *   - Auth par Bearer CRON_SECRET (même pattern que Vercel's cron :
 *     `Authorization: Bearer <CRON_SECRET>`).
 *   - 404 silencieux à toute requête sans / avec mauvais secret
 *     (exposer un 401 trahirait l'existence de la route au grand public).
 *   - Utilise la même logique que /api/admin/whop-sync-report?apply=1
 *     en passant par les fonctions pures partagées — zéro duplication.
 *
 * COMPORTEMENT :
 *   - 0 op planifiée → 200 { changes: 0 } + aucun email.
 *   - ≥ 1 op → applique + 200 { changes, failed } + email récap.
 *   - Erreur Whop (502 upstream) → 502 + email d'alerte "cron whop ko".
 *
 * JAMAIS DE DELETE. JAMAIS D'ÉCRITURE SUR AUTH.USERS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  listActiveEliteProMemberships,
  fetchActiveEliteProMemberEmails,
  fetchEliteProPlans,
} from '@/lib/whop/client'
import {
  computeSyncPlan,
  type ProfileForReconcile,
  type ReconcileOp,
} from '@/lib/whop/reconcile'
import { notifyAdmin } from '@/lib/email/notify-admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/.exec(header)
  if (!match) return false
  return timingSafeEqual(match[1].trim(), secret)
}

async function applyOps(
  admin: SupabaseClient,
  ops: ReconcileOp[],
): Promise<{ applied: number; failed: Array<{ profileId: string; kind: string; error: string }> }> {
  const failed: Array<{ profileId: string; kind: string; error: string }> = []
  let applied = 0
  for (const op of ops) {
    const update: Record<string, unknown> = { ...op.after }
    const { error: updErr } = await admin
      .from('profiles')
      .update(update)
      .eq('id', op.profileId)
    if (updErr) {
      failed.push({ profileId: op.profileId, kind: op.kind, error: updErr.message })
      continue
    }
    const { error: journalErr } = await admin
      .from('whop_sync_journal')
      .insert({
        applied_by_user_id: null,
        source: 'cron_daily',
        profile_id: op.profileId,
        change_kind: op.kind,
        before: op.before,
        after: op.after,
        reason: op.reason,
      })
    if (journalErr) {
      failed.push({ profileId: op.profileId, kind: op.kind, error: `journal_failed: ${journalErr.message}` })
    }
    applied++
  }
  return { applied, failed }
}

function opsAsHtml(ops: ReconcileOp[]): string {
  if (ops.length === 0) return '<p><em>Aucun changement.</em></p>'
  const rows = ops.map(op => `
    <tr>
      <td>${op.kind}</td>
      <td>${op.email ?? '—'}</td>
      <td><code>${op.profileId}</code></td>
      <td>${JSON.stringify(op.before)}</td>
      <td>${JSON.stringify(op.after)}</td>
      <td>${op.reason}</td>
    </tr>
  `).join('')
  return `
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px">
      <thead><tr><th>Type</th><th>Email</th><th>Profil</th><th>Avant</th><th>Après</th><th>Raison</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NOT_FOUND()

  // 1. Lecture Whop en parallèle.
  const [whopList, memberEmails, plans] = await Promise.all([
    listActiveEliteProMemberships(),
    fetchActiveEliteProMemberEmails(),
    fetchEliteProPlans(),
  ])

  if (whopList.errorMessage) {
    await notifyAdmin({
      subject: '[ATP][cron] Whop reconcile — erreur upstream',
      html: `<p>Lecture /memberships KO : <code>${whopList.errorMessage}</code> (status ${whopList.errorStatus})</p>`,
      text: `Whop /memberships KO : ${whopList.errorMessage}`,
    })
    return NextResponse.json({
      ok: false,
      source: 'memberships',
      status: whopList.errorStatus,
      message: whopList.errorMessage,
    }, { status: 502 })
  }

  // 2. Enrichit emails (le match profil utilise whop_user_id ET email).
  const enriched = whopList.memberships.map(m => {
    const email = m.whopUserId ? memberEmails.emailsByUserId.get(m.whopUserId) ?? null : null
    const plan = m.planId ? plans.plansById.get(m.planId) ?? null : null
    return {
      ...m,
      email,
      planName: plan?.name ?? null,
      kind: plan?.kind && plan.kind !== 'unknown' ? plan.kind : m.kind,
    }
  })

  // 3. Lecture profils.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'supabase_env_missing' }, { status: 500 })
  }
  const admin = createAdminClient(supabaseUrl, serviceKey)
  const { data: profilesRaw, error: profilesErr } = await admin
    .from('profiles')
    .select('id, email, role, whop_user_id, whop_subscription_active')
  if (profilesErr) {
    return NextResponse.json({ ok: false, error: profilesErr.message }, { status: 500 })
  }
  const profiles = (profilesRaw ?? []) as ProfileForReconcile[]

  // 4. Plan + application.
  const plan = computeSyncPlan(enriched, profiles)
  if (plan.ops.length === 0) {
    return NextResponse.json({
      ok: true,
      changes: 0,
      note: 'nothing_to_apply',
      inspected: profiles.length,
      whopMemberships: enriched.length,
    })
  }

  const applyResult = await applyOps(admin, plan.ops)

  // 5. Email récap (uniquement s'il y a eu des changements, cf. spec).
  await notifyAdmin({
    subject: `[ATP][cron] Whop reconcile — ${applyResult.applied} changement(s)`,
    html: `
      <p>Réconciliation Whop quotidienne — ${new Date().toISOString()}.</p>
      <p>
        Appliqués : <strong>${applyResult.applied}</strong><br>
        Échecs    : <strong>${applyResult.failed.length}</strong>
      </p>
      <p>Détail par type :</p>
      <ul>
        <li>set_subscription_active : ${plan.summary.totals.byKind.set_subscription_active}</li>
        <li>set_subscription_inactive : ${plan.summary.totals.byKind.set_subscription_inactive}</li>
        <li>link_whop_user_id : ${plan.summary.totals.byKind.link_whop_user_id}</li>
      </ul>
      ${opsAsHtml(plan.ops)}
    `,
    text: `Whop reconcile — ${applyResult.applied} changements, ${applyResult.failed.length} échecs.`,
  })

  return NextResponse.json({
    ok: true,
    changes: applyResult.applied,
    failed: applyResult.failed,
    summary: plan.summary,
  })
}
