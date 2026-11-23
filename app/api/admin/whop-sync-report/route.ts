/**
 * GET  /api/admin/whop-sync-report              — simulation lecture seule
 * POST /api/admin/whop-sync-report?apply=1      — applique + journal
 * POST /api/admin/whop-sync-report              — dry-run (même sortie que GET)
 *
 * Rapport de réconciliation Whop ↔ profils dashboard.
 *
 * SOURCE DE VÉRITÉ : Whop. Les profils s'alignent dessus.
 *
 * SOURCES WHOP CROISÉES (via Current API /api/v1) :
 *   - /memberships  : par membership (status, plan, dates, cancel)
 *   - /members      : table user_id → email (manquant sur /memberships)
 *   - /plans        : table plan_id → nom lisible + type d'offre
 *
 * JOIN SUR LES PROFILS :
 *   - whop_user_id d'abord
 *   - email ilike en fallback (lower-cased)
 *   - jamais d'overwrite d'un whop_user_id existant
 *   - admins ignorés (whitelist middleware)
 *
 * MUTATIONS (POST ?apply=1) :
 *   - set_subscription_active     : flag false → true
 *   - set_subscription_inactive   : flag true → false (pas de match)
 *   - link_whop_user_id           : remplit whop_user_id matché par email
 *   Chaque opération est journalisée dans whop_sync_journal avec
 *   snapshot before/after. Pas de delete. Pas d'écriture auth.users.
 *
 * SÉCURITÉ : 404 à tout appelant non admin, GET comme POST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  listActiveEliteProMemberships,
  fetchActiveEliteProMemberEmails,
  fetchEliteProPlans,
  type SyncMembership,
  type PlanInfo,
} from '@/lib/whop/client'
import {
  computeSyncPlan,
  type ProfileForReconcile,
  type ReconcileOp,
} from '@/lib/whop/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

interface EnrichedMembership extends SyncMembership {
  plan: Pick<PlanInfo, 'id' | 'name' | 'kind' | 'billingPeriodDays'> | null
}

interface ReportContext {
  callerId: string | null
  source: 'admin_manual' | 'cron_daily'
  apply: boolean
  maxPagesOpt: { maxPages?: number }
}

// ─── Core : fetch Whop + profils + compute plan ─────────────────────

async function buildReport(ctx: ReportContext) {
  // 1. Lecture Whop — 3 sources en parallèle.
  const [whopList, memberEmails, plans] = await Promise.all([
    listActiveEliteProMemberships(ctx.maxPagesOpt),
    fetchActiveEliteProMemberEmails(ctx.maxPagesOpt),
    fetchEliteProPlans(),
  ])

  if (whopList.errorMessage) {
    return {
      error: {
        source: 'memberships' as const,
        status: whopList.errorStatus,
        message: whopList.errorMessage,
        pagesChecked: whopList.pagesChecked,
      },
    }
  }

  // 2. Enrichit chaque membership (email via /members, plan via /plans).
  const enriched: EnrichedMembership[] = whopList.memberships.map(m => {
    const email = m.whopUserId ? memberEmails.emailsByUserId.get(m.whopUserId) ?? null : null
    const plan = m.planId ? plans.plansById.get(m.planId) ?? null : null
    return {
      ...m,
      email,
      planName: plan?.name ?? null,
      kind: plan?.kind && plan.kind !== 'unknown' ? plan.kind : m.kind,
      plan: plan ? {
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        billingPeriodDays: plan.billingPeriodDays,
      } : null,
    }
  })

  // 3. Lecture profiles via admin client (bypass RLS).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { error: { source: 'supabase' as const, message: 'supabase_env_missing' } }
  }
  const admin = createAdminClient(supabaseUrl, serviceKey)
  const { data: profilesRaw, error: profilesErr } = await admin
    .from('profiles')
    .select('id, email, role, whop_user_id, whop_subscription_active')
  if (profilesErr) {
    return { error: { source: 'profiles' as const, message: profilesErr.message } }
  }
  const profiles = (profilesRaw ?? []) as ProfileForReconcile[]

  // 4. Plan de réconciliation (pure fn).
  const plan = computeSyncPlan(enriched, profiles)

  // 5. Agrégats pour le dashboard d'audit.
  const byStatus: Record<string, number> = {}
  const byPlan: Record<string, { name: string; count: number }> = {}
  for (const m of enriched) {
    const s = m.status ?? '(null)'
    byStatus[s] = (byStatus[s] ?? 0) + 1
    const key = m.planId ?? '(no_plan)'
    if (!byPlan[key]) byPlan[key] = { name: m.planName ?? m.planId ?? 'Inconnu', count: 0 }
    byPlan[key].count++
  }

  // 6. Candidats "sans compte dashboard" (membership Whop sans profil) —
  //    séparé des ops, c'est de l'information manuelle à traiter à part.
  const matchedProfileIds = new Set<string>()
  for (const op of plan.ops) matchedProfileIds.add(op.profileId)
  // Attention : "matched" dans computeSyncPlan inclut les no-ops — on ne
  // peut pas inférer "qui a été matché" depuis les ops seules. On doit
  // recalculer ici à partir du whopList pour missingDashboardAccounts.
  const byWhopId = new Map<string, ProfileForReconcile>()
  const byEmail = new Map<string, ProfileForReconcile>()
  for (const p of profiles) {
    if (p.whop_user_id) byWhopId.set(p.whop_user_id, p)
    if (p.email) byEmail.set(p.email.toLowerCase(), p)
  }
  const missingDashboardAccounts: Array<EnrichedMembership & { reason: 'no_match_whop_id_nor_email' }> = []
  for (const m of enriched) {
    let match: ProfileForReconcile | undefined
    if (m.whopUserId) match = byWhopId.get(m.whopUserId)
    if (!match && m.email) match = byEmail.get(m.email.toLowerCase())
    if (!match) {
      missingDashboardAccounts.push({ ...m, reason: 'no_match_whop_id_nor_email' })
    }
  }

  return {
    admin,
    whopList,
    memberEmails,
    plans,
    enriched,
    profiles,
    plan,
    missingDashboardAccounts,
    summary: {
      totals: {
        whopMemberships: enriched.length,
        matched: enriched.length - missingDashboardAccounts.length,
        missingDashboardAccounts: missingDashboardAccounts.length,
        profilesTotal: profiles.length,
        opsPlanned: plan.summary.totals.opsPlanned,
        byOpKind: plan.summary.totals.byKind,
      },
      byStatus,
      byPlan,
      emailsPermissionMissing: memberEmails.emailsPermissionMissing,
      membersEndpointError: memberEmails.errorMessage,
      plansEndpointError: plans.errorMessage,
      whop: {
        pagesChecked: whopList.pagesChecked,
        truncated: whopList.truncated,
        deprecationHeader: whopList.deprecationHeader,
      },
    },
  }
}

// ─── Application + journal ──────────────────────────────────────────

async function applyOps(
  admin: SupabaseClient,
  ops: ReconcileOp[],
  ctx: ReportContext,
): Promise<{ applied: ReconcileOp[]; failed: Array<{ op: ReconcileOp; error: string }> }> {
  const applied: ReconcileOp[] = []
  const failed: Array<{ op: ReconcileOp; error: string }> = []

  for (const op of ops) {
    // Construction de l'update strictement à partir de `op.after`
    // (whop_subscription_active et/ou whop_user_id).
    const update: Record<string, unknown> = { ...op.after }
    const { error: updErr } = await admin
      .from('profiles')
      .update(update)
      .eq('id', op.profileId)
    if (updErr) {
      failed.push({ op, error: updErr.message })
      continue
    }

    // Journal — fail-soft : une erreur de log ne doit PAS rétrograder
    // l'update profil (qui a réussi). On la signale dans failed sans
    // revert, sinon on crée une incohérence inversée.
    const { error: journalErr } = await admin
      .from('whop_sync_journal')
      .insert({
        applied_by_user_id: ctx.callerId,
        source: ctx.source,
        profile_id: op.profileId,
        change_kind: op.kind,
        before: op.before,
        after: op.after,
        reason: op.reason,
      })
    if (journalErr) {
      failed.push({ op, error: `journal_failed: ${journalErr.message}` })
    }
    applied.push(op)
  }
  return { applied, failed }
}

// ─── Handler commun ─────────────────────────────────────────────────

async function handle(request: NextRequest, method: 'GET' | 'POST') {
  // Auth + rôle admin — 404 à tout le reste.
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NOT_FOUND()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((callerProfile as { role?: string } | null)?.role !== 'admin') {
    return NOT_FOUND()
  }

  const rawMax = request.nextUrl.searchParams.get('maxPages')
  const parsed = rawMax ? Number.parseInt(rawMax, 10) : NaN
  const maxPagesOpt = Number.isFinite(parsed) && parsed > 0
    ? { maxPages: parsed as number }
    : {}
  const applyRequested = method === 'POST' &&
    request.nextUrl.searchParams.get('apply') === '1'

  const ctx: ReportContext = {
    callerId: user.id,
    source: 'admin_manual',
    apply: applyRequested,
    maxPagesOpt,
  }

  const built = await buildReport(ctx)
  if ('error' in built) {
    return NextResponse.json({ ok: false, ...built.error }, { status: 502 })
  }

  const basePayload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    mode: applyRequested ? 'applied' : 'dry_run',
    summary: built.summary,
    ops: built.plan.ops,
    missingDashboardAccounts: built.missingDashboardAccounts,
  }

  if (!applyRequested) {
    return NextResponse.json(basePayload)
  }

  const applyResult = await applyOps(built.admin, built.plan.ops, ctx)
  return NextResponse.json({
    ...basePayload,
    apply: {
      applied: applyResult.applied.length,
      failed: applyResult.failed.map(f => ({
        profileId: f.op.profileId,
        kind: f.op.kind,
        error: f.error,
      })),
    },
  })
}

export async function GET(request: NextRequest) {
  return handle(request, 'GET')
}

export async function POST(request: NextRequest) {
  return handle(request, 'POST')
}
