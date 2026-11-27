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
import type { CalendarEvent } from '@/lib/market/calendar/events'
import { ECB_SERIES } from '@/lib/market/ecb'
import type { NewsItem } from '@/lib/market/news/news'

export type IngestSource = 'fred' | 'cftc' | 'calendar' | 'ecb' | 'news'
export type IngestTrigger = 'cron' | 'admin' | 'backfill'
export type IngestStatus = 'ok' | 'partial' | 'error'

export interface MarketStore {
  ensureCatalog(): Promise<void>
  lastObservationDate(code: string): Promise<string | null>
  upsertObservations(code: string, rows: Observation[]): Promise<number>
  lastCotDate(market: CotMarketCode): Promise<string | null>
  upsertCot(rows: CotRow[]): Promise<number>
  /**
   * Calendrier : upsert des événements (publications, adjudications) et
   * suppression de ceux de la fenêtre qui ont disparu de la source
   * (date déplacée). Renvoie le nombre de lignes écrites.
   */
  replaceCalendarEvents(fromDate: string, rows: CalendarEvent[]): Promise<number>
  /** Actus officielles : upsert par clé (aucun doublon), première vue conservée. */
  upsertNews(rows: NewsItem[]): Promise<number>
  journalStart(source: IngestSource, trigger: IngestTrigger): Promise<string>
  journalFinish(id: string, result: { status: IngestStatus; rows: number; error: string | null }): Promise<void>
}

export interface MarketFetchers {
  fred(code: string, start: string): Promise<Observation[]>
  cot(market: CotMarketCode, since: string): Promise<CotRow[]>
  /** Publications et adjudications depuis `from` (à venir comprises). */
  calendar(from: string, to: string): Promise<CalendarEvent[]>
  ecb(code: string, start: string): Promise<Observation[]>
  /** Actus officielles récentes (Fed, BCE, adjudications), erreurs par flux. */
  news(): Promise<{ items: NewsItem[]; errors: string[] }>
}

export interface SourceResult {
  source: IngestSource
  status: IngestStatus
  rows: number
  errors: string[]
}

/** Recouvrement pour capter les révisions récentes. */
export const OVERLAP_DAYS = { fred: 14, cftc: 21, ecb: 14 } as const

/** Calendrier : fenêtre gardée à jour (passé utile pour les vues semaine, et à venir). */
export const CALENDAR_WINDOW = { pastDays: 90, futureDays: 180 } as const

/** Historique initial des taux de la BCE. */
export const ECB_HISTORY_SINCE = '2016-01-01'

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

export async function ingestCalendar(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult> {
  const journalId = await store.journalStart('calendar', opts.trigger)
  const errors: string[] = []
  let rows = 0
  try {
    const from = shiftDays(opts.today, -CALENDAR_WINDOW.pastDays)
    const to = shiftDays(opts.today, CALENDAR_WINDOW.futureDays)
    const events = (await fetchers.calendar(from, to)).filter(e => e.date >= from && e.date <= to)
    rows = await store.replaceCalendarEvents(from, events)
  } catch (e) {
    errors.push((e as Error).message)
  }
  const status: IngestStatus = errors.length ? 'error' : 'ok'
  await store.journalFinish(journalId, { status, rows, error: errors.length ? errors.join(' | ').slice(0, 1000) : null })
  return { source: 'calendar', status, rows, errors }
}

export async function ingestEcb(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult> {
  const journalId = await store.journalStart('ecb', opts.trigger)
  const errors: string[] = []
  let rows = 0
  for (const s of ECB_SERIES) {
    try {
      const start = incrementalStart(await store.lastObservationDate(s.code), ECB_HISTORY_SINCE, OVERLAP_DAYS.ecb)
      rows += await store.upsertObservations(s.code, sinceDate(await fetchers.ecb(s.code, start), start, o => o.date))
    } catch (e) {
      errors.push(`${s.code} : ${(e as Error).message}`)
    }
  }
  const status = statusOf(errors, ECB_SERIES.length)
  await store.journalFinish(journalId, { status, rows, error: errors.length ? errors.join(' | ').slice(0, 1000) : null })
  return { source: 'ecb', status, rows, errors }
}

export async function ingestNews(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult> {
  const journalId = await store.journalStart('news', opts.trigger)
  const errors: string[] = []
  let rows = 0
  let fetched = 0
  try {
    const { items, errors: feedErrors } = await fetchers.news()
    errors.push(...feedErrors)
    fetched = items.length
    rows = await store.upsertNews(items)
  } catch (e) {
    errors.push((e as Error).message)
  }
  const status: IngestStatus = errors.length === 0 ? 'ok' : fetched > 0 ? 'partial' : 'error'
  await store.journalFinish(journalId, { status, rows, error: errors.length ? errors.join(' | ').slice(0, 1000) : null })
  return { source: 'news', status, rows, errors }
}

/** Toutes les sources, l'une après l'autre (un seul cron quotidien). */
export async function ingestAll(store: MarketStore, fetchers: MarketFetchers, opts: RunOptions): Promise<SourceResult[]> {
  const fred = await ingestFred(store, fetchers, opts)
  const cftc = await ingestCot(store, fetchers, opts)
  const ecb = await ingestEcb(store, fetchers, opts)
  const calendar = await ingestCalendar(store, fetchers, opts)
  const news = await ingestNews(store, fetchers, opts)
  return [fred, cftc, ecb, calendar, news]
}

export function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}
