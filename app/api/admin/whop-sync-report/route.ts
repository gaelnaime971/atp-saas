/**
 * GET /api/admin/whop-sync-report?maxPages=40
 *
 * Rapport de rattrapage post-13/11/2026 — admin uniquement, LECTURE SEULE.
 *
 * Trois sources Whop Current API, jointes côté serveur :
 *   - /memberships   : par membership (status, plan_id, dates, cancel)
 *   - /members       : table user_id → email (manquant sur /memberships)
 *   - /plans         : table plan_id → nom lisible + type (abonnement
 *                      ou achat unique) + durée de cycle
 *
 * Croise ensuite avec les profils du dashboard (whop_user_id, puis
 * email) et renvoie :
 *
 *   summary : agrégats pour voir le pouls en un coup d'œil
 *     - totals.whopMemberships
 *     - totals.matched / totals.missing
 *     - byStatus    : { active: n, trialing: m, ... }
 *     - byPlan      : { "<planId>": { name, count } }
 *     - emailsPermissionMissing : true si /members ne retourne aucun
 *       email → scope member:email:read à cocher côté App Whop
 *
 *   missingDashboardAccounts : abonnés ÉLITE PRO actifs chez Whop
 *     SANS compte dashboard (candidats rattrapage post-13/11). Email,
 *     plan, dates et cancel_at_period_end remontés pour relance manuelle.
 *
 *   flagMismatches : profils dont whop_subscription_active ne
 *     correspond pas à Whop :
 *       - flagged_as_active_but_not_on_whop : flag=true côté dashboard,
 *         plus d'abonnement ÉLITE PRO actif côté Whop.
 *       - active_on_whop_but_flag_false : abonnement Whop actif, flag=
 *         false côté dashboard (webhook raté ou user non reconnecté).
 *
 * AUCUNE ÉCRITURE DB. 404 à tout appelant non admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  listActiveEliteProMemberships,
  fetchActiveEliteProMemberEmails,
  fetchEliteProPlans,
  type SyncMembership,
  type PlanInfo,
} from '@/lib/whop/client'

export const runtime = 'nodejs'
// Rapport long (3 pagentions API + lecture profiles). Timeout généreux
// pour ne pas tronquer au milieu d'un run.
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

interface ProfileRow {
  id: string
  email: string | null
  whop_user_id: string | null
  whop_subscription_active: boolean
}

interface EnrichedMembership extends SyncMembership {
  plan: Pick<PlanInfo, 'id' | 'name' | 'kind' | 'billingPeriodDays'> | null
}

export async function GET(request: NextRequest) {
  // 1. Auth + rôle admin — 404 à tout le reste.
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

  // 2. Param optionnel maxPages (bump ponctuel si un run est truncated).
  const rawMax = request.nextUrl.searchParams.get('maxPages')
  const parsed = rawMax ? Number.parseInt(rawMax, 10) : NaN
  const maxPagesOpt = Number.isFinite(parsed) && parsed > 0
    ? { maxPages: parsed }
    : {}

  // 3. Lecture Whop — 3 sources en parallèle.
  const [whopList, memberEmails, plans] = await Promise.all([
    listActiveEliteProMemberships(maxPagesOpt),
    fetchActiveEliteProMemberEmails(maxPagesOpt),
    fetchEliteProPlans(),
  ])

  if (whopList.errorMessage) {
    return NextResponse.json({
      ok: false,
      source: 'memberships',
      whopError: { status: whopList.errorStatus, message: whopList.errorMessage },
      pagesChecked: whopList.pagesChecked,
    }, { status: 502 })
  }

  // 4. Enrichit chaque membership avec email (via /members) + plan.
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

  // 5. Lecture profiles via admin client — bypass RLS (lecture seule).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'supabase_env_missing' },
      { status: 500 },
    )
  }
  const admin = createAdminClient(supabaseUrl, serviceKey)
  const { data: profilesRaw, error: profilesErr } = await admin
    .from('profiles')
    .select('id, email, whop_user_id, whop_subscription_active')
  if (profilesErr) {
    return NextResponse.json(
      { ok: false, error: 'profiles_fetch_failed', details: profilesErr.message },
      { status: 500 },
    )
  }
  const profiles = (profilesRaw ?? []) as ProfileRow[]

  // 6. Index profils (O(1) lookup). Email lower-case — comme .ilike SQL.
  const byWhopId = new Map<string, ProfileRow>()
  const byEmail = new Map<string, ProfileRow>()
  for (const p of profiles) {
    if (p.whop_user_id) byWhopId.set(p.whop_user_id, p)
    if (p.email) byEmail.set(p.email.toLowerCase(), p)
  }

  // 7. Croise Whop → profils. matchedProfileIds = source de vérité pour
  //    "ce profil a un abonnement Whop actif".
  const matchedProfileIds = new Set<string>()
  const missingDashboardAccounts: Array<EnrichedMembership & { reason: 'no_match_whop_id_nor_email' }> = []

  for (const m of enriched) {
    let match: ProfileRow | undefined
    if (m.whopUserId) match = byWhopId.get(m.whopUserId)
    if (!match && m.email) match = byEmail.get(m.email.toLowerCase())
    if (match) {
      matchedProfileIds.add(match.id)
    } else {
      missingDashboardAccounts.push({ ...m, reason: 'no_match_whop_id_nor_email' })
    }
  }

  // 8. Divergences de flag.
  const flagMismatches: Array<{
    kind: 'flagged_as_active_but_not_on_whop' | 'active_on_whop_but_flag_false'
    profileId: string
    email: string | null
    whopUserId: string | null
    whopSubscriptionActive: boolean
  }> = []

  for (const p of profiles) {
    const isActiveOnWhop = matchedProfileIds.has(p.id)
    if (p.whop_subscription_active && !isActiveOnWhop) {
      flagMismatches.push({
        kind: 'flagged_as_active_but_not_on_whop',
        profileId: p.id,
        email: p.email,
        whopUserId: p.whop_user_id,
        whopSubscriptionActive: p.whop_subscription_active,
      })
    } else if (!p.whop_subscription_active && isActiveOnWhop) {
      flagMismatches.push({
        kind: 'active_on_whop_but_flag_false',
        profileId: p.id,
        email: p.email,
        whopUserId: p.whop_user_id,
        whopSubscriptionActive: p.whop_subscription_active,
      })
    }
  }

  // 9. Agrégats (par statut, par plan).
  const byStatus: Record<string, number> = {}
  const byPlan: Record<string, { name: string; count: number }> = {}
  for (const m of enriched) {
    const s = m.status ?? '(null)'
    byStatus[s] = (byStatus[s] ?? 0) + 1
    const key = m.planId ?? '(no_plan)'
    if (!byPlan[key]) byPlan[key] = { name: m.planName ?? m.planId ?? 'Inconnu', count: 0 }
    byPlan[key].count++
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      totals: {
        whopMemberships: enriched.length,
        matched: matchedProfileIds.size,
        missing: missingDashboardAccounts.length,
        flagMismatches: flagMismatches.length,
        profilesTotal: profiles.length,
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
    missingDashboardAccounts,
    flagMismatches,
  })
}
