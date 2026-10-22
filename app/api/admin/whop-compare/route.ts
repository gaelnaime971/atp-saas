/**
 * GET /api/admin/whop-compare?user_id=user_xxx
 *
 * Route de comparaison V2 vs Current API Whop — admin uniquement.
 *
 * SÉCURITÉ : 404 à TOUT appelant non admin (user non connecté, trader,
 * admin absent). Jamais 401/403 → l'existence même de la route n'est
 * pas révélée aux non-admins.
 *
 * COMPORTEMENT : appelle les DEUX fonctions de vérification
 * d'abonnement en parallèle pour le whopUserId donné, renvoie :
 *   - old (bool)   : hasActiveEliteProMembership (legacy v2)
 *   - new (bool)   : hasActiveEliteProMembershipNew (Current API)
 *   - diff (bool)  : old !== new (indicateur rouge pour la bascule)
 *   - newRaw       : détail brut de la nouvelle API (memberships,
 *                    pages lues, header Deprecation éventuel, erreur
 *                    si une page a échoué)
 *
 * AUCUNE ÉCRITURE : ni DB, ni cookie, ni effet sur l'accès du membre.
 * Just a lecture + comparaison, utilisée pendant la fenêtre de
 * migration pour valider que la Current API renvoie la même décision
 * que la v2 avant d'activer WHOP_NEW_API_ENABLED en prod.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import {
  hasActiveEliteProMembership,
  fetchEliteProAccessNew,
} from '@/lib/whop/client'

export const runtime = 'nodejs'

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

export async function GET(request: NextRequest) {
  // 1. Auth + rôle admin — 404 à tout le reste.
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NOT_FOUND()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'admin') return NOT_FOUND()

  // 2. Param user_id (format Whop "user_xxxxxxxxxxx").
  const whopUserId = request.nextUrl.searchParams.get('user_id') || ''
  if (!/^user_[A-Za-z0-9]+$/.test(whopUserId)) {
    return NextResponse.json(
      { error: 'invalid user_id (expected format user_xxxxxxxxxxx)' },
      { status: 400 },
    )
  }

  // 3. Appels en parallèle, chacun fail-closed de son côté.
  const [oldResult, newResult] = await Promise.all([
    hasActiveEliteProMembership(whopUserId).catch(() => false),
    fetchEliteProAccessNew(whopUserId),
  ])

  return NextResponse.json({
    user_id: whopUserId,
    old: oldResult,
    new: newResult.granted,
    diff: oldResult !== newResult.granted,
    newRaw: {
      pagesChecked: newResult.pagesChecked,
      memberships: newResult.memberships,
      deprecationHeader: newResult.deprecationHeader,
      errorStatus: newResult.errorStatus,
      errorMessage: newResult.errorMessage,
    },
  })
}
