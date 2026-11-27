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
    .eq('status', 'ok').order('finished_at', { ascending: false }).limit(20)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { source: IngestSource; finished_at: string | null }[]
  return {
    fred: rows.find(r => r.source === 'fred')?.finished_at ?? null,
    cftc: rows.find(r => r.source === 'cftc')?.finished_at ?? null,
  }
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
