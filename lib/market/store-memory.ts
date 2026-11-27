/**
 * MarketStore en mémoire : tests et essai à blanc du script d'historique
 * (appels réels aux API, rien n'est écrit en base).
 */
import type { CotMarketCode } from '@/lib/market/catalog'
import type { CotRow } from '@/lib/market/cftc'
import type { Observation } from '@/lib/market/fred'
import type { IngestSource, IngestStatus, IngestTrigger, MarketStore } from '@/lib/market/ingest'
import type { CalendarEvent } from '@/lib/market/calendar/events'

export interface MemoryJournalRow {
  id: string
  source: IngestSource
  trigger: IngestTrigger
  status: IngestStatus | 'running'
  rows: number
  error: string | null
}

export function memoryMarketStore() {
  const observations = new Map<string, Map<string, number>>()
  const cot = new Map<string, CotRow>()
  const journal: MemoryJournalRow[] = []
  const calendar = new Map<string, CalendarEvent>()
  let catalogCalls = 0

  const store: MarketStore = {
    async ensureCatalog() { catalogCalls += 1 },
    async lastObservationDate(code) {
      const dates = [...(observations.get(code)?.keys() ?? [])].sort()
      return dates.at(-1) ?? null
    },
    async upsertObservations(code, rows: Observation[]) {
      const m = observations.get(code) ?? new Map<string, number>()
      for (const r of rows) m.set(r.date, r.value)
      observations.set(code, m)
      return rows.length
    },
    async lastCotDate(market: CotMarketCode) {
      const dates = [...cot.values()].filter(r => r.market === market).map(r => r.reportDate).sort()
      return dates.at(-1) ?? null
    },
    async upsertCot(rows: CotRow[]) {
      for (const r of rows) cot.set(`${r.market}|${r.reportDate}`, r)
      return rows.length
    },
    async replaceCalendarEvents(fromDate: string, rows: CalendarEvent[]) {
      const keep = new Set(rows.map(r => r.id))
      for (const [id, e] of calendar) if (e.date >= fromDate && !keep.has(id)) calendar.delete(id)
      for (const r of rows) calendar.set(r.id, r)
      return rows.length
    },
    async journalStart(source, trigger) {
      const id = String(journal.length + 1)
      journal.push({ id, source, trigger, status: 'running', rows: 0, error: null })
      return id
    },
    async journalFinish(id, result) {
      const row = journal.find(j => j.id === id)
      if (row) Object.assign(row, { status: result.status, rows: result.rows, error: result.error })
    },
  }

  return {
    store,
    journal,
    observationCount: (code: string) => observations.get(code)?.size ?? 0,
    cotCount: (market?: CotMarketCode) => [...cot.values()].filter(r => !market || r.market === market).length,
    observations: (code: string) => [...(observations.get(code)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
    cotRows: () => [...cot.values()].sort((a, b) => a.reportDate.localeCompare(b.reportDate)),
    catalogCalls: () => catalogCalls,
    calendarEvents: () => [...calendar.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}
