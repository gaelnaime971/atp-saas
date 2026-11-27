/**
 * COT (rapport Traders in Financial Futures, futures seuls) : calculs de
 * la page Marchés › COT. Pur, testé dans cot.test.ts.
 *
 * - Position nette = longs − shorts (contrats).
 * - % de l'open interest = nette / open interest × 100.
 * - Variation sur la semaine = nette − nette du rapport précédent.
 * - Percentile sur 3 ans : rang de la nette en % de l'OI parmi les
 *   rapports des 3 dernières années (156 semaines). En % de l'OI plutôt
 *   qu'en contrats : l'open interest varie beaucoup en 3 ans, le % reste
 *   comparable.
 */
import { minusDays, minusYears, percentileRank } from '@/lib/market/stats'
import type { CotRow } from '@/lib/market/cftc'
import type { CotMarketCode } from '@/lib/market/catalog'

export type CotCategory = 'assetMgr' | 'levMoney' | 'dealer'

export const COT_CATEGORIES: { id: CotCategory; label: string; detail: string }[] = [
  { id: 'assetMgr', label: 'Institutionnels', detail: 'asset managers' },
  { id: 'levMoney', label: 'Spéculateurs', detail: 'leveraged funds' },
  { id: 'dealer', label: 'Banques', detail: 'dealers' },
]

export const PERCENTILE_YEARS = 3

export function netOf(row: CotRow, cat: CotCategory): number {
  switch (cat) {
    case 'assetMgr': return row.assetMgrLong - row.assetMgrShort
    case 'levMoney': return row.levMoneyLong - row.levMoneyShort
    case 'dealer': return row.dealerLong - row.dealerShort
  }
}

export function pctOfOi(net: number, openInterest: number): number | null {
  return openInterest > 0 ? (net / openInterest) * 100 : null
}

export interface CotCategorySnapshot {
  category: CotCategory
  net: number
  pctOi: number | null
  change: number | null
  /** Percentile sur 3 ans de la nette en % de l'OI (0-100). */
  percentile: number | null
}

export interface CotSnapshot {
  market: CotMarketCode
  reportDate: string
  /** Publication habituelle : le vendredi qui suit le mardi des positions. */
  publishedOn: string
  openInterest: number
  openInterestChange: number | null
  categories: Record<CotCategory, CotCategorySnapshot>
}

/** Vendredi suivant le mardi du rapport (règle habituelle de la CFTC). */
export function usualPublicationDate(reportDate: string): string {
  const day = new Date(`${reportDate}T00:00:00Z`).getUTCDay()
  const delta = (5 - day + 7) % 7 || 7
  return minusDays(reportDate, -delta)
}

/** Rapports d'un marché, triés par date. */
export function marketRows(rows: readonly CotRow[], market: CotMarketCode): CotRow[] {
  return rows.filter(r => r.market === market).sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

export function cotSnapshot(rows: readonly CotRow[], index = rows.length - 1): CotSnapshot | null {
  const row = rows[index]
  if (!row) return null
  const prev = index > 0 ? rows[index - 1] : null
  const from = minusYears(row.reportDate, PERCENTILE_YEARS)
  const window = rows.slice(0, index + 1).filter(r => r.reportDate > from)
  const categories = {} as Record<CotCategory, CotCategorySnapshot>
  for (const { id } of COT_CATEGORIES) {
    const net = netOf(row, id)
    const pct = pctOfOi(net, row.openInterest)
    const hist = window.map(r => pctOfOi(netOf(r, id), r.openInterest)).filter((v): v is number => v !== null)
    categories[id] = {
      category: id,
      net,
      pctOi: pct,
      change: prev ? net - netOf(prev, id) : null,
      percentile: pct === null ? null : percentileRank(hist, pct),
    }
  }
  return {
    market: row.market,
    reportDate: row.reportDate,
    publishedOn: usualPublicationDate(row.reportDate),
    openInterest: row.openInterest,
    openInterestChange: prev ? row.openInterest - prev.openInterest : null,
    categories,
  }
}

/** Historique des positions nettes (contrats) depuis `since`, pour le graphique. */
export function netHistory(rows: readonly CotRow[], since: string) {
  return COT_CATEGORIES.map(c => ({
    category: c.id,
    points: rows.filter(r => r.reportDate >= since).map(r => ({ date: r.reportDate, value: netOf(r, c.id) })),
  }))
}

/** Lecture factuelle du percentile (seuils 20 / 80). */
export function percentileReading(p: number | null): { label: string; extreme: boolean } {
  if (p === null) return { label: '—', extreme: false }
  if (p <= 20) return { label: 'Très vendeur (3 ans)', extreme: p <= 10 }
  if (p >= 80) return { label: 'Très acheteur (3 ans)', extreme: p >= 90 }
  return { label: 'Dans la norme', extreme: false }
}
