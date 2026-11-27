/**
 * Ingestion des données Terminal (FRED + CFTC), incrémentale et
 * idempotente.
 *
 * - Incrémentale : pour chaque série / marché, on ne redemande que depuis
 *   la dernière date en base, moins un court recouvrement (les dernières
 *   valeurs sont parfois révisées, ex. inscriptions au chômage). Base vide
 *   → depuis le début de l'historique.
 * - Idempotente : écriture en upsert sur (série, date) / (marché, date) ;
 *   relancer ne crée aucun doublon.
 * - Une erreur sur une série n'arrête pas les autres : statut « partial ».
 * - Chaque source écrit une ligne dans le journal d'ingestion.
 *
 * La base est derrière un port (MarketStore) : logique testée sans
 * Supabase (ingest.test.ts), implémentation dans store-supabase.ts.
 */
import { COT_MARKETS, COT_HISTORY_SINCE, FRED_HISTORY_YEARS, FRED_SERIES, type CotMarketCode } from '@/lib/market/catalog'
import type { Observation } from '@/lib/market/fred'
import type { CotRow } from '@/lib/market/cftc'

export type IngestSource = 'fred' | 'cftc'
export type IngestTrigger = 'cron' | 'admin' | 'backfill'
export type IngestStatus = 'ok' | 'partial' | 'error'

export interface MarketStore {
  ensureCatalog(): Promise<void>
  lastObservationDate(code: string): Promise<string | null>
  upsertObservations(code: string, rows: Observation[]): Promise<number>
  lastCotDate(market: CotMarketCode): Promise<string | null>
  upsertCot(rows: CotRow[]): Promise<number>
  journalStart(source: IngestSource, trigger: IngestTrigger): Promise<string>
  journalFinish(id: string, result: { status: IngestStatus; rows: number; error: string | null }): Promise<void>
}

export interface MarketFetchers {
  fred(code: string, start: string): Promise<Observation[]>
  cot(market: CotMarketCode, since: string): Promise<CotRow[]>
}

export interface SourceResult {
  source: IngestSource
  status: IngestStatus
  rows: number
  errors: string[]
}

/** Recouvrement pour capter les révisions récentes. */
export const OVERLAP_DAYS = { fred: 14, cftc: 21 } as const

const DAY = 86_400_000

export function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

export function yearsAgo(today: string, years: number): string {
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y - years, m - 1, d)).toISOString().slice(0, 10)
}

/** Date de début d'une ingestion : base vide → début de l'historique ; sinon dernière date − recouvrement. */
export function incrementalStart(last: string | null, initial: string, overlapDays: number): string {
  if (!last) return initial
  const start = shiftDays(last, -overlapDays)
  return start < initial ? initial : start
}

/** Garde seulement les lignes à partir de `start` (une API peut renvoyer plus large). */
export function sinceDate<T>(rows: T[], start: string, dateOf: (r: T) => string): T[] {
  return rows.filter(r => dateOf(r) >= start)
}

function statusOf(errors: string[], total: number): IngestStatus {
  if (errors.length === 0) return 'ok'
  return errors.length >= total ? 'error' : 'partial'
}

interface RunOptions {
  trigger: IngestTrigger
  /** AAAA-MM-JJ (UTC), injectable pour les tests. */
  today: string
}

export async function ingestFred(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult> {
  const journalId = await store.journalStart('fred', opts.trigger)
  const errors: string[] = []
  let rows = 0
  try {
    await store.ensureCatalog()
    const initial = yearsAgo(opts.today, FRED_HISTORY_YEARS)
    for (const series of FRED_SERIES) {
      try {
        const start = incrementalStart(await store.lastObservationDate(series.code), initial, OVERLAP_DAYS.fred)
        const obs = sinceDate(await fetchers.fred(series.code, start), start, o => o.date)
        rows += await store.upsertObservations(series.code, obs)
      } catch (e) {
        errors.push(`${series.code} : ${(e as Error).message}`)
      }
    }
  } catch (e) {
    errors.push(`catalogue : ${(e as Error).message}`)
  }
  const status = statusOf(errors, FRED_SERIES.length)
  await store.journalFinish(journalId, { status, rows, error: errors.length ? errors.join(' | ').slice(0, 1000) : null })
  return { source: 'fred', status, rows, errors }
}

export async function ingestCot(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult> {
  const journalId = await store.journalStart('cftc', opts.trigger)
  const errors: string[] = []
  let rows = 0
  for (const market of COT_MARKETS) {
    try {
      const start = incrementalStart(await store.lastCotDate(market.code), COT_HISTORY_SINCE, OVERLAP_DAYS.cftc)
      const fetched = sinceDate(await fetchers.cot(market.code, start), start, r => r.reportDate)
      rows += await store.upsertCot(fetched)
    } catch (e) {
      errors.push(`${market.code} : ${(e as Error).message}`)
    }
  }
  const status = statusOf(errors, COT_MARKETS.length)
  await store.journalFinish(journalId, { status, rows, error: errors.length ? errors.join(' | ').slice(0, 1000) : null })
  return { source: 'cftc', status, rows, errors }
}

/** Toutes les sources, l'une après l'autre (un seul cron quotidien). */
export async function ingestAll(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult[]> {
  const fred = await ingestFred(store, fetchers, opts)
  const cftc = await ingestCot(store, fetchers, opts)
  return [fred, cftc]
}

export function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}
