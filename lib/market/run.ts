/**
 * Point d'entrée unique de l'ingestion : cron quotidien, bouton admin
 * « Mettre à jour maintenant » et script local d'historique.
 * Côté serveur uniquement (client service-role).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchCotRows } from '@/lib/market/cftc'
import { fetchFredObservations } from '@/lib/market/fred'
import { ECB_SERIES, fetchEcbSeries } from '@/lib/market/ecb'
import { auctionEvents, dedupe, releaseEvents } from '@/lib/market/calendar/events'
import { fetchOfficialNews } from '@/lib/market/news/sources'
import { fetchBeaIcs, fetchFredReleaseDates, fetchTreasuryAuctions } from '@/lib/market/calendar/sources'
import { ingestAll, todayUtc, type IngestTrigger, type MarketFetchers, type SourceResult } from '@/lib/market/ingest'
import { supabaseMarketStore } from '@/lib/market/store-supabase'

/** Tag du cache partagé des pages Terminal (lib/market/read.ts). */
export const MARKET_CACHE_TAG = 'market-data'

export const liveFetchers: MarketFetchers = {
  fred: (code, start) => fetchFredObservations(code, start),
  cot: (market, since) => fetchCotRows(market, since),
  ecb: (code, start) => {
    const def = ECB_SERIES.find(s => s.code === code)
    if (!def) throw new Error(`Série BCE inconnue : ${code}`)
    return fetchEcbSeries(def, start)
  },
  // Publications (dates FRED + heures du BEA) et adjudications à 10 et 30 ans.
  calendar: async (from, to) => {
    const [dates, bea, auctions] = await Promise.all([fetchFredReleaseDates(from, to), fetchBeaIcs(), fetchTreasuryAuctions()])
    return dedupe([...releaseEvents(dates, bea), ...auctionEvents(auctions)])
  },
  // Actus officielles : Fed, BCE (RSS) et résultats d'adjudications (TreasuryDirect).
  news: () => fetchOfficialNews(),
}

export async function runIngestion(trigger: IngestTrigger): Promise<SourceResult[]> {
  const store = supabaseMarketStore(createAdminClient())
  return ingestAll(store, liveFetchers, { trigger, today: todayUtc() })
}

/** Résumé sans secret ni contenu, pour les réponses HTTP et les logs. */
export function summarize(results: SourceResult[]) {
  return results.map(r => ({ source: r.source, status: r.status, rows: r.rows, errors: r.errors.length }))
}
