/**
 * GET /api/admin/whop-sync-report?maxPages=40
 *
 * Rapport de rattrapage post-13/11/2026 — admin uniquement, LECTURE SEULE.
 *
 * Tire TOUTES les memberships ÉLITE PRO actives chez Whop (pagination
 * curseur, plafond `maxPages`), croise avec les profils du dashboard
 * (whop_user_id, puis email) et renvoie deux listes :
 *
 *   a. `missingDashboardAccounts` — abonnés ÉLITE PRO actifs chez Whop
 *      qui n'ont PAS de compte dashboard (ni par whop_user_id, ni par
 *      email) : ceux qui ont pu être bloqués au login OAuth depuis le
 *      13/11 (quand la v2 ne répondait plus et qu'on vérifiait encore
 *      via elle). Email + createdAt remontés pour relance manuelle.
 *
 *   b. `flagMismatches` — profils dont `whop_subscription_active` ne
 *      correspond pas à Whop :
 *        - `flagged_as_active_but_not_on_whop` : dashboard=true, mais
 *          aucune membership ÉLITE PRO active côté Whop (grâce période
 *          historique, ou abonnement récemment coupé).
 *        - `active_on_whop_but_flag_false` : abonné actif Whop, mais
 *          flag dashboard=false (webhook raté, ou user non encore
 *          connecté depuis la bascule).
 *
 * AUCUNE ÉCRITURE DB. La correction (passer un flag, recréer un compte)
 * se fait à part. Ce rapport ne fait que montrer où rattraper.
 *
 * SÉCURITÉ : 404 à TOUT appelant non admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { listActiveEliteProMemberships } from '@/lib/whop/client'

export const runtime = 'nodejs'
// Rapport long (pagination Whop + lecture profiles). Rester généreux sur
// le timeout pour ne pas tronquer au milieu d'un run.
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

interface ProfileRow {
  id: string
  email: string | null
  whop_user_id: string | null
  whop_subscription_active: boolean
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
  const maxPages = rawMax ? Number.parseInt(rawMax, 10) : undefined

  // 3. Lecture Whop — toutes les memberships ÉLITE PRO actives.
  const whopList = await listActiveEliteProMemberships(
    Number.isFinite(maxPages) && maxPages ? { maxPages } : {},
  )
  if (whopList.errorMessage) {
    return NextResponse.json({
      ok: false,
      whopError: {
        status: whopList.errorStatus,
        message: whopList.errorMessage,
      },
      pagesChecked: whopList.pagesChecked,
    }, { status: 502 })
  }

  // 4. Lecture profiles via admin client — bypass RLS (on a besoin de
  //    la vue complète). Lecture seule, pas d'UPDATE.
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

  // 5. Index profils pour lookup O(1). Email en lower-case pour matcher
  //    de la même façon que le callback OAuth (.ilike côté SQL).
  const byWhopId = new Map<string, ProfileRow>()
  const byEmail = new Map<string, ProfileRow>()
  for (const p of profiles) {
    if (p.whop_user_id) byWhopId.set(p.whop_user_id, p)
    if (p.email) byEmail.set(p.email.toLowerCase(), p)
  }

  // 6. Croise les memberships Whop avec les profils.
  //    - Si match whop_user_id OU email → on note l'ID profil.
  //    - Sinon → missing (candidat rattrapage).
  const matchedProfileIds = new Set<string>()
  const missingDashboardAccounts: Array<{
    whopUserId: string | null
    email: string | null
    status: string | null
    createdAt: string | null
    membershipId: string
  }> = []

  for (const m of whopList.memberships) {
    let match: ProfileRow | undefined
    if (m.whopUserId) match = byWhopId.get(m.whopUserId)
    if (!match && m.email) match = byEmail.get(m.email.toLowerCase())
    if (match) {
      matchedProfileIds.add(match.id)
    } else {
      missingDashboardAccounts.push({
        whopUserId: m.whopUserId,
        email: m.email,
        status: m.status,
        createdAt: m.createdAt,
        membershipId: m.membershipId,
      })
    }
  }

  // 7. Divergences de flag.
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

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    whop: {
      activeMembershipsCount: whopList.memberships.length,
      pagesChecked: whopList.pagesChecked,
      truncated: whopList.truncated,
      deprecationHeader: whopList.deprecationHeader,
    },
    profiles: {
      total: profiles.length,
      matchedCount: matchedProfileIds.size,
    },
    missingDashboardAccounts,
    flagMismatches,
  })
}
