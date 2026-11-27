/** Statut des sources Terminal pour la carte admin (route /api/admin/market-data). */
import type { IngestSource } from '@/lib/market/ingest'

export interface JournalRow {
  source: IngestSource
  trigger: string
  status: string
  started_at: string
  finished_at: string | null
  rows_upserted: number
  error: string | null
}

export interface MarketDataStatus {
  source: IngestSource
  label: string
  last: JournalRow | null
  lastOk: JournalRow | null
  latestData: string | null
}
