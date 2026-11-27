/**
 * GET /api/cron/market-data
 *
 * Tâche planifiée Vercel, une fois par jour (vercel.json), après la
 * clôture US : enchaîne toutes les sources du Terminal (FRED puis CFTC),
 * en incrémental, puis invalide le cache partagé des pages.
 *
 * SÉCURITÉ (même règle que /api/cron/whop-reconcile) : Bearer
 * CRON_SECRET, comparaison à temps constant, 404 silencieux sinon.
 * Réponse sans secret ni donnée : seulement statuts et nombres de lignes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { cronAuthorized } from '@/lib/api/cron-auth'
import { MARKET_CACHE_TAG, runIngestion, summarize } from '@/lib/market/run'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get('authorization'))) return new NextResponse(null, { status: 404 })
  try {
    const results = await runIngestion('cron')
    revalidateTag(MARKET_CACHE_TAG, { expire: 0 })
    const failed = results.some(r => r.status === 'error')
    return NextResponse.json({ results: summarize(results) }, { status: failed ? 502 : 200 })
  } catch (e) {
    console.error('[cron market-data] échec :', (e as Error).message)
    return NextResponse.json({ error: 'ingestion_failed' }, { status: 500 })
  }
}
