/**
 * MarketStore sur Supabase (client service-role, seul autorisé à écrire
 * les tables Terminal). Upserts par paquets, idempotents.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FRED_SERIES, type CotMarketCode } from '@/lib/market/catalog'
import type { CotRow } from '@/lib/market/cftc'
import type { Observation } from '@/lib/market/fred'
import type { IngestSource, IngestStatus, IngestTrigger, MarketStore } from '@/lib/market/ingest'

const CHUNK = 1000

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
  return out
}

export function cotRowToRecord(r: CotRow) {
  return {
    market_code: r.market,
    report_date: r.reportDate,
    cftc_contract_code: r.cftcCode,
    open_interest: r.openInterest,
    asset_mgr_long: r.assetMgrLong,
    asset_mgr_short: r.assetMgrShort,
    lev_money_long: r.levMoneyLong,
    lev_money_short: r.levMoneyShort,
    dealer_long: r.dealerLong,
    dealer_short: r.dealerShort,
    // received_at : valeur par défaut à la première insertion, jamais réécrite.
  }
}

export function supabaseMarketStore(db: SupabaseClient): MarketStore {
  return {
    async ensureCatalog() {
      const { error } = await db.from('market_series').upsert(
        FRED_SERIES.map(s => ({
          code: s.code, source: 'fred', label: s.label, unit: s.unit, frequency: s.frequency,
          provider: s.provider, license: s.license, updated_at: new Date().toISOString(),
        })),
        { onConflict: 'code' },
      )
      if (error) throw new Error(error.message)
    },

    async lastObservationDate(code: string) {
      const { data, error } = await db.from('market_series_observations')
        .select('obs_date').eq('series_code', code).order('obs_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as { obs_date: string } | null)?.obs_date ?? null
    },

    async upsertObservations(code: string, rows: Observation[]) {
      let n = 0
      for (const part of chunks(rows)) {
        const { error } = await db.from('market_series_observations').upsert(
          part.map(o => ({ series_code: code, obs_date: o.date, value: o.value })),
          { onConflict: 'series_code,obs_date' },
        )
        if (error) throw new Error(error.message)
        n += part.length
      }
      return n
    },

    async lastCotDate(market: CotMarketCode) {
      const { data, error } = await db.from('market_cot_reports')
        .select('report_date').eq('market_code', market).order('report_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as { report_date: string } | null)?.report_date ?? null
    },

    async upsertCot(rows: CotRow[]) {
      let n = 0
      for (const part of chunks(rows)) {
        const { error } = await db.from('market_cot_reports').upsert(part.map(cotRowToRecord), { onConflict: 'market_code,report_date' })
        if (error) throw new Error(error.message)
        n += part.length
      }
      return n
    },

    async journalStart(source: IngestSource, trigger: IngestTrigger) {
      const { data, error } = await db.from('market_ingest_journal')
        .insert({ source, trigger, status: 'running' }).select('id').single()
      if (error) throw new Error(error.message)
      return (data as { id: string }).id
    },

    async journalFinish(id: string, result: { status: IngestStatus; rows: number; error: string | null }) {
      const { error } = await db.from('market_ingest_journal').update({
        status: result.status, rows_upserted: result.rows, error: result.error, finished_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
