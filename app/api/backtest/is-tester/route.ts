/**
 * GET /api/backtest/is-tester
 *
 * Lecture seule : indique au client si l'utilisateur connecté voit
 * la refonte Backtest V2 ("Mes critères" + nouvelle saisie).
 *
 * Retourne 200 { isTester: boolean }. Pas de 401 pour un visiteur
 * non connecté — l'UI continue d'afficher l'ancienne page.
 */

import { NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { isBacktestV2Tester } from '@/lib/backtest/access'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? null
  return NextResponse.json({ isTester: isBacktestV2Tester(email) })
}
