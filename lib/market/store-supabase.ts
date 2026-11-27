/**
 * MarketStore sur Supabase (client service-role, seul autorisé à écrire
 * les tables Terminal). Upserts par paquets, idempotents.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FRED_SERIES, type CotMarketCode } from '@/lib/market/catalog'
import type { CotRow } from '@/lib/market/cftc'
import type { Observation } from '@/lib/market/fred'
import type { IngestSource, IngestStatus, IngestTrigger, MarketStore } from '@/lib/market/ingest'
import type { CalendarEvent } from '@/lib/market/calendar/events'
import type { NewsItem } from '@/lib/market/news/news'
import { ECB_SERIES } from '@/lib/market/ecb'

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

export function calendarEventToRecord(e: CalendarEvent) {
  return {
    id: e.id, kind: e.kind, title: e.title, detail: e.detail ?? null, agency: e.agency,
    scheduled_at: e.at === null ? null : new Date(e.at).toISOString(), event_date: e.date,
    impact: e.impact, time_official: e.timeOfficial,
    figure: e.figure ?? null, auction: e.auction ?? null, updated_at: new Date().toISOString(),
  }
}

export function newsItemToRecord(n: NewsItem) {
  return {
    id: n.id, source: n.source, kind: n.kind, title: n.title.slice(0, 400), summary: n.summary?.slice(0, 2000) ?? null,
    url: n.url, category: n.category, impact: n.impact, published_at: new Date(n.publishedAt).toISOString(),
    updated_at: new Date().toISOString(),
    // first_seen_at : valeur par défaut à la première insertion, jamais réécrite.
  }
}

export function supabaseMarketStore(db: SupabaseClient): MarketStore {
  return {
    async ensureCatalog() {
      const now = new Date().toISOString()
      const { error } = await db.from('market_series').upsert(
        [
          ...FRED_SERIES.map(s => ({
            code: s.code, source: 'fred', label: s.label, unit: s.unit, frequency: s.frequency,
            provider: s.provider, license: s.license, updated_at: now,
          })),
          ...ECB_SERIES.map(s => ({
            code: s.code, source: 'ecb', label: s.label, unit: 'pct', frequency: 'D',
            provider: 'European Central Bank', license: 'ESCB statistics reuse policy (source cited)', updated_at: now,
          })),
        ],
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

    async replaceCalendarEvents(fromDate: string, rows: CalendarEvent[]) {
      let n = 0
      for (const part of chunks(rows)) {
        const { error } = await db.from('market_calendar_events').upsert(part.map(calendarEventToRecord), { onConflict: 'id' })
        if (error) throw new Error(error.message)
        n += part.length
      }
      // Événements de la fenêtre disparus de la source (date déplacée, annulation).
      const ids = rows.map(r => `"${r.id.replace(/"/g, '')}"`).join(',')
      let del = db.from('market_calendar_events').delete().gte('event_date', fromDate)
      if (rows.length) del = del.not('id', 'in', `(${ids})`)
      const { error } = await del
      if (error) throw new Error(error.message)
      return n
    },

    async upsertNews(rows: NewsItem[]) {
      let n = 0
      for (const part of chunks(rows)) {
        const { error } = await db.from('market_news').upsert(part.map(newsItemToRecord), { onConflict: 'id' })
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
