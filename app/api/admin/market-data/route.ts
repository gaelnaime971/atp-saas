/**
 * /api/admin/market-data — carte admin « Données Terminal ».
 *
 * GET  : pour chaque source (FRED, CFTC), dernière ingestion (date,
 *        statut, lignes, erreur), dernière ingestion réussie et date de
 *        la donnée la plus récente.
 * POST : « Mettre à jour maintenant » — même ingestion incrémentale que
 *        le cron, puis invalidation du cache partagé.
 *
 * Admin uniquement (404 sinon, comme les autres routes admin). Lecture du
 * journal par le service-role : la table n'a aucune règle d'accès.
 */
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MARKET_CACHE_TAG, runIngestion, summarize } from '@/lib/market/run'
import type { IngestSource } from '@/lib/market/ingest'
import type { JournalRow, MarketDataStatus } from '@/lib/market/admin-status'

export const runtime = 'nodejs'
export const maxDuration = 60

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

async function isAdmin(): Promise<boolean> {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return (data as { role?: string } | null)?.role === 'admin'
}

async function status(): Promise<MarketDataStatus[]> {
  const db = createAdminClient()
  const { data: journal, error } = await db.from('market_ingest_journal')
    .select('source, trigger, status, started_at, finished_at, rows_upserted, error')
    .order('started_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  const rows = (journal ?? []) as JournalRow[]
  const [{ data: fredLatest }, { data: cotLatest }, { data: ecbLatest }, { data: calLatest }] = await Promise.all([
    db.from('market_series_observations').select('obs_date').not('series_code', 'like', 'ECB_%').order('obs_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('market_cot_reports').select('report_date').order('report_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('market_series_observations').select('obs_date').eq('series_code', 'ECB_DFR').order('obs_date', { ascending: false }).limit(1).maybeSingle(),
    db.from('market_calendar_events').select('event_date').order('event_date', { ascending: false }).limit(1).maybeSingle(),
  ])
  const sources: { source: IngestSource; label: string; latestData: string | null }[] = [
    { source: 'fred', label: 'FRED (séries de la Fed)', latestData: (fredLatest as { obs_date?: string } | null)?.obs_date ?? null },
    { source: 'cftc', label: 'CFTC (COT, futures seuls)', latestData: (cotLatest as { report_date?: string } | null)?.report_date ?? null },
    { source: 'ecb', label: 'BCE (taux directeurs)', latestData: (ecbLatest as { obs_date?: string } | null)?.obs_date ?? null },
    { source: 'calendar', label: 'Calendrier (FRED, BEA, Trésor)', latestData: (calLatest as { event_date?: string } | null)?.event_date ?? null },
  ]
  return sources.map(s => ({
    ...s,
    last: rows.find(r => r.source === s.source) ?? null,
    lastOk: rows.find(r => r.source === s.source && r.status === 'ok') ?? null,
  }))
}

export async function GET() {
  if (!(await isAdmin())) return NOT_FOUND()
  try {
    return NextResponse.json({ sources: await status() })
  } catch (e) {
    console.error('[admin market-data] statut :', (e as Error).message)
    return NextResponse.json({ error: 'status_unavailable' }, { status: 500 })
  }
}

export async function POST() {
  if (!(await isAdmin())) return NOT_FOUND()
  try {
    const results = await runIngestion('admin')
    revalidateTag(MARKET_CACHE_TAG, { expire: 0 })
    return NextResponse.json({ results: summarize(results), sources: await status() })
  } catch (e) {
    console.error('[admin market-data] ingestion :', (e as Error).message)
    return NextResponse.json({ error: 'ingestion_failed' }, { status: 500 })
  }
}
