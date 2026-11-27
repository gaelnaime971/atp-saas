/**
 * Client CFTC (API publique Socrata, sans clé) : rapport Traders in
 * Financial Futures, futures seuls.
 */
import { CFTC_TFF_DATASET, COT_BY_CODE, COT_REPORT_TYPE, type CotMarketCode } from '@/lib/market/catalog'

export interface CotRow {
  market: CotMarketCode
  /** Mardi des positions, AAAA-MM-JJ. */
  reportDate: string
  cftcCode: string
  openInterest: number
  assetMgrLong: number
  assetMgrShort: number
  levMoneyLong: number
  levMoneyShort: number
  dealerLong: number
  dealerShort: number
}

const FIELDS = [
  'report_date_as_yyyy_mm_dd', 'cftc_contract_market_code', 'futonly_or_combined', 'open_interest_all',
  'asset_mgr_positions_long', 'asset_mgr_positions_short',
  'lev_money_positions_long', 'lev_money_positions_short',
  'dealer_positions_long_all', 'dealer_positions_short_all',
]

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) throw new Error('Valeur CFTC non numérique')
  return n
}

export function parseCotRows(json: unknown, market: CotMarketCode): CotRow[] {
  if (!Array.isArray(json)) throw new Error('Réponse CFTC inattendue')
  const { cftcCode } = COT_BY_CODE[market]
  const out: CotRow[] = []
  for (const r of json as Record<string, unknown>[]) {
    if (r.cftc_contract_market_code !== cftcCode || r.futonly_or_combined !== COT_REPORT_TYPE) continue
    const date = String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    out.push({
      market, reportDate: date, cftcCode,
      openInterest: num(r.open_interest_all),
      assetMgrLong: num(r.asset_mgr_positions_long), assetMgrShort: num(r.asset_mgr_positions_short),
      levMoneyLong: num(r.lev_money_positions_long), levMoneyShort: num(r.lev_money_positions_short),
      dealerLong: num(r.dealer_positions_long_all), dealerShort: num(r.dealer_positions_short_all),
    })
  }
  return out.sort((a, b) => a.reportDate.localeCompare(b.reportDate))
}

export async function fetchCotRows(market: CotMarketCode, since: string, fetchImpl: typeof fetch = fetch): Promise<CotRow[]> {
  const { cftcCode } = COT_BY_CODE[market]
  // `since` entre dans la requête : format strict, pas d'injection possible.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('Date de début invalide')
  const params = new URLSearchParams({
    $select: FIELDS.join(','),
    $where: `cftc_contract_market_code='${cftcCode}' AND futonly_or_combined='${COT_REPORT_TYPE}' AND report_date_as_yyyy_mm_dd >= '${since}T00:00:00.000'`,
    $order: 'report_date_as_yyyy_mm_dd ASC',
    $limit: '5000',
  })
  let res: Response
  try {
    res = await fetchImpl(`https://publicreporting.cftc.gov/resource/${CFTC_TFF_DATASET}.json?${params}`, {
      cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new Error(`CFTC ${market} : réseau (${(e as Error).name})`)
  }
  if (!res.ok) throw new Error(`CFTC ${market} : HTTP ${res.status}`)
  return parseCotRows(await res.json(), market)
}
