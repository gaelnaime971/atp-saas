/**
 * GET /api/admin/whop-access?user_id=user_xxxxxxxxxxxx
 *
 * Outil de support admin : "pourquoi ce membre n'arrive pas à se
 * connecter ?". Lecture seule — aucune écriture DB, aucun effet sur
 * l'accès effectif.
 *
 * Remplace l'ancienne route whop-compare (migration v2→Current API
 * finie, plus rien à comparer).
 *
 * SÉCURITÉ : 404 à TOUT appelant non admin (non connecté, trader,
 * auth cassée). Jamais 401/403 → l'existence de la route n'est pas
 * révélée aux non-admins.
 *
 * RÉPONSE :
 *   {
 *     user_id:      "user_xxxx",
 *     granted:      boolean,                 // décision finale
 *     pagesChecked: number,                  // pagination Current API
 *     memberships:  [                        // audit ligne par ligne
 *       {
 *         id, status, productId,
 *         memberAccessLevel,                 // info seulement
 *         reasonValid: 'status' | null       // null = n'ouvre pas l'accès
 *       }, …
 *     ],
 *     deprecationHeader: string | null,      // header Whop si bascule future
 *     errorStatus:       number | null,
 *     errorMessage:      string | null,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { fetchEliteProAccess } from '@/lib/whop/client'

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

  // 3. Appel lecture seule — fail-closed de son côté.
  const detail = await fetchEliteProAccess(whopUserId)

  return NextResponse.json({
    user_id: whopUserId,
    granted: detail.granted,
    pagesChecked: detail.pagesChecked,
    memberships: detail.memberships,
    deprecationHeader: detail.deprecationHeader,
    errorStatus: detail.errorStatus,
    errorMessage: detail.errorMessage,
  })
}
