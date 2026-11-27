/**
 * Lecture des données Terminal pour les pages Marchés (Server Components).
 *
 * - Les données sont les mêmes pour tous les membres : lecture par le
 *   service-role et cache court PARTAGÉ (15 min), invalidé par le cron et
 *   le bouton admin (tag MARKET_CACHE_TAG).
 * - À appeler uniquement APRÈS requireMarketsViewer() (contrôle d'accès
 *   membre, lib/terminal/viewer-server.ts). Les tables restent lisibles
 *   par les membres via RLS (has_dashboard_access()), mais ce chemin ne
 *   dépend pas de la session : un seul cache pour tous.
 * - Supabase renvoie au plus 1 000 lignes par requête : lecture paginée.
 */
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { MARKET_CACHE_TAG } from '@/lib/market/run'
import type { Observation } from '@/lib/market/fred'
import type { CotRow } from '@/lib/market/cftc'
import type { CotMarketCode } from '@/lib/market/catalog'
import type { IngestSource } from '@/lib/market/ingest'
import type { CalendarEvent, AgendaItem } from '@/lib/market/calendar/events'
import type { HolidayConfirmation } from '@/lib/terminal/market-holidays'
import { fetchVintageObservations, figureCacheKey, publishedFigure, type PublishedFigure } from '@/lib/market/calendar/figure'
import { fetchTreasuryAuctions } from '@/lib/market/calendar/sources'
import { fetchOfficialNews } from '@/lib/market/news/sources'
import { supabaseMarketStore } from '@/lib/market/store-supabase'
import type { NewsItem } from '@/lib/market/news/news'

const PAGE = 1000
const REVALIDATE_SECONDS = 900

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

async function loadSeries(codes: string[], since: string): Promise<Record<string, Observation[]>> {
  const db = createAdminClient()
  const entries = await Promise.all(codes.map(async code => {
    const rows = await readAll<{ obs_date: string; value: number }>((from, to) =>
      db.from('market_series_observations').select('obs_date, value')
        .eq('series_code', code).gte('obs_date', since).order('obs_date', { ascending: true }).range(from, to))
    return [code, rows.map(r => ({ date: r.obs_date, value: Number(r.value) }))] as const
  }))
  return Object.fromEntries(entries)
}

interface CotRecord {
  market_code: CotMarketCode
  report_date: string
  cftc_contract_code: string
  open_interest: number
  asset_mgr_long: number
  asset_mgr_short: number
  lev_money_long: number
  lev_money_short: number
  dealer_long: number
  dealer_short: number
}

async function loadCot(since: string): Promise<CotRow[]> {
  const db = createAdminClient()
  const rows = await readAll<CotRecord>((from, to) =>
    db.from('market_cot_reports').select('market_code, report_date, cftc_contract_code, open_interest, asset_mgr_long, asset_mgr_short, lev_money_long, lev_money_short, dealer_long, dealer_short')
      .gte('report_date', since).order('report_date', { ascending: true }).range(from, to))
  return rows.map(r => ({
    market: r.market_code, reportDate: r.report_date, cftcCode: r.cftc_contract_code,
    openInterest: Number(r.open_interest),
    assetMgrLong: Number(r.asset_mgr_long), assetMgrShort: Number(r.asset_mgr_short),
    levMoneyLong: Number(r.lev_money_long), levMoneyShort: Number(r.lev_money_short),
    dealerLong: Number(r.dealer_long), dealerShort: Number(r.dealer_short),
  }))
}

async function loadLastSuccess(): Promise<Record<IngestSource, string | null>> {
  const db = createAdminClient()
  const { data, error } = await db.from('market_ingest_journal').select('source, finished_at')
    .eq('status', 'ok').order('finished_at', { ascending: false }).limit(40)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { source: IngestSource; finished_at: string | null }[]
  const last = (s: IngestSource) => rows.find(r => r.source === s)?.finished_at ?? null
  return { fred: last('fred'), cftc: last('cftc'), ecb: last('ecb'), calendar: last('calendar'), news: last('news') }
}

const cachedSeries = unstable_cache(loadSeries, ['market-series-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })
const cachedCot = unstable_cache(loadCot, ['market-cot-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })
const cachedLastSuccess = unstable_cache(loadLastSuccess, ['market-last-success-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })

export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function safe<T>(fn: () => Promise<T>): Promise<ReadResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    console.error('[market read]', (e as Error).message)
    return { ok: false, error: 'Données indisponibles pour le moment.' }
  }
}

/** Séries FRED depuis `since` (AAAA-MM-JJ), par code. */
export function readSeries(codes: string[], since: string) {
  return safe(() => cachedSeries([...codes].sort(), since))
}

/** Rapports COT (tous marchés) depuis `since`. */
export function readCot(since: string) {
  return safe(() => cachedCot(since))
}

/** Dernière ingestion réussie par source (avertissement de retard). */
export function readLastSuccess() {
  return safe(() => cachedLastSuccess())
}

// ─── Calendrier, agenda admin, confirmations CME ────────────────


interface CalendarRecord {
  id: string; kind: 'release' | 'auction'; title: string; detail: string | null; agency: string
  scheduled_at: string | null; event_date: string; impact: 'high' | 'medium' | 'low'; time_official: boolean
  figure: CalendarEvent['figure'] | null; auction: CalendarEvent['auction'] | null
}

async function loadCalendar(from: string, to: string): Promise<CalendarEvent[]> {
  const db = createAdminClient()
  const rows = await readAll<CalendarRecord>((a, b) => db.from('market_calendar_events')
    .select('id, kind, title, detail, agency, scheduled_at, event_date, impact, time_official, figure, auction')
    .gte('event_date', from).lte('event_date', to).order('event_date', { ascending: true }).range(a, b))
  return rows.map(r => ({
    id: r.id, kind: r.kind, title: r.title, detail: r.detail ?? undefined, agency: r.agency,
    at: r.scheduled_at ? Date.parse(r.scheduled_at) : null, date: r.event_date, impact: r.impact,
    timeOfficial: r.time_official, figure: r.figure ?? undefined, auction: r.auction ?? undefined,
  }))
}

async function loadAgenda(from: string, to: string): Promise<AgendaItem[]> {
  const db = createAdminClient()
  const { data, error } = await db.from('market_agenda_items').select('id, kind, event_date, time_et, timing, ticker, title')
    .gte('event_date', from).lte('event_date', to).order('event_date', { ascending: true }).limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; kind: 'earnings' | 'speech'; event_date: string; time_et: string | null; timing: 'bmo' | 'amc' | null; ticker: string | null; title: string }[])
    .map(r => ({ id: r.id, kind: r.kind, date: r.event_date, timeEt: r.time_et, timing: r.timing, ticker: r.ticker, title: r.title }))
}

async function loadConfirmations(): Promise<HolidayConfirmation[]> {
  const db = createAdminClient()
  const { data, error } = await db.from('market_holiday_confirmations').select('holiday_date, cme_confirmed, globex_ranges, note').limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { holiday_date: string; cme_confirmed: boolean; globex_ranges: string | null; note: string | null }[])
    .map(r => ({ date: r.holiday_date, cmeConfirmed: r.cme_confirmed, globexRanges: r.globex_ranges, note: r.note }))
}

const cachedCalendar = unstable_cache(loadCalendar, ['market-calendar-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })
const cachedAgenda = unstable_cache(loadAgenda, ['market-agenda-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })
const cachedConfirmations = unstable_cache(loadConfirmations, ['market-holiday-confirmations-v1'], { revalidate: REVALIDATE_SECONDS, tags: [MARKET_CACHE_TAG] })

/** Publications et adjudications stockées, dates (New York) entre `from` et `to`. */
export function readCalendar(from: string, to: string) {
  return safe(() => cachedCalendar(from, to))
}

/** Agenda saisi par l'admin (résultats, discours). */
export function readAgenda(from: string, to: string) {
  return safe(() => cachedAgenda(from, to))
}

/** Confirmations des horaires CME des jours de fête. */
export function readHolidayConfirmations() {
  return safe(() => cachedConfirmations())
}

/**
 * Chiffre publié d'une publication, lu à la consultation : rien avant
 * l'annonce ; cache de 60 s dans les 3 h qui suivent, puis 1 h
 * (lib/market/calendar/figure.ts). Partagé entre tous les membres.
 */
export async function readFigure(e: CalendarEvent, now: number): Promise<PublishedFigure | null> {
  if (!e.figure || e.at === null) return null
  const key = figureCacheKey(e.figure.series, e.date, e.at, now)
  if (!key) return { status: 'pending' }
  try {
    const figure = e.figure
    const load = unstable_cache(
      async () => publishedFigure(await fetchVintageObservations(figure.series), e.date, figure.transform),
      ['market-figure-v1', key],
      { revalidate: 3600 },
    )
    return await load()
  } catch (err) {
    console.error('[market figure]', (err as Error).message)
    return null
  }
}

const cachedAuctionResults = unstable_cache(
  async () => (await fetchTreasuryAuctions(21)).filter(a => a.highYield !== null).map(a => ({ cusip: a.cusip, date: a.closeDate, highYield: a.highYield as number })),
  ['market-auction-results-v1'],
  { revalidate: 300 },
)

/** Résultats des adjudications récentes (taux retenu), cache de 5 min. */
export function readAuctionResults() {
  return safe(() => cachedAuctionResults())
}

// ─── Actus officielles ──────────────────────────────────────────

/** Rafraîchissement des flux à la consultation : au plus un passage toutes les 90 s (cache partagé). */
export const NEWS_REFRESH_SECONDS = 90

const refreshNews = unstable_cache(
  async () => {
    const { items, errors } = await fetchOfficialNews()
    if (items.length) await supabaseMarketStore(createAdminClient()).upsertNews(items)
    if (errors.length) console.error('[market news]', errors.join(' | '))
    return { at: Date.now(), failedFeeds: errors.length }
  },
  ['market-news-refresh-v1'],
  { revalidate: NEWS_REFRESH_SECONDS },
)

export interface StoredNews extends NewsItem { firstSeenAt: number }

interface NewsRecord {
  id: string; source: NewsItem['source']; kind: NewsItem['kind']; title: string; summary: string | null; url: string
  category: string | null; impact: NewsItem['impact']; published_at: string; first_seen_at: string
}

async function loadNews(since: string): Promise<StoredNews[]> {
  const db = createAdminClient()
  const { data, error } = await db.from('market_news')
    .select('id, source, kind, title, summary, url, category, impact, published_at, first_seen_at')
    .gte('published_at', `${since}T00:00:00Z`).order('published_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as NewsRecord[]).map(r => ({
    id: r.id, source: r.source, kind: r.kind, title: r.title, summary: r.summary, url: r.url, category: r.category,
    impact: r.impact, publishedAt: Date.parse(r.published_at), firstSeenAt: Date.parse(r.first_seen_at),
  }))
}

const cachedNews = unstable_cache(
  // `stamp` (dernier rafraîchissement) fait partie de la clé : relecture après chaque passage.
  async (since: string, stamp: number) => { void stamp; return loadNews(since) },
  ['market-news-v1'],
  { revalidate: 60, tags: [MARKET_CACHE_TAG] },
)

/**
 * Actus officielles publiées depuis `since` (AAAA-MM-JJ) : rafraîchit
 * les flux si le dernier passage date de plus de 90 s (sans bloquer en
 * cas de panne), puis lit la table. `refreshedAt` : dernier passage.
 */
export async function readNews(since: string): Promise<ReadResult<{ items: StoredNews[]; refreshedAt: number | null; failedFeeds: number }>> {
  let refresh: { at: number; failedFeeds: number } | null = null
  try {
    refresh = await refreshNews()
  } catch (e) {
    console.error('[market news] rafraîchissement :', (e as Error).message)
  }
  const r = await safe(() => cachedNews(since, refresh?.at ?? 0))
  return r.ok ? { ok: true, data: { items: r.data, refreshedAt: refresh?.at ?? null, failedFeeds: refresh?.failedFeeds ?? 0 } } : r
}
