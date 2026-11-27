/**
 * Sources du calendrier (côté serveur) : fichiers et API officiels
 * uniquement, aucun HTML analysé.
 *
 * - FRED « releases/dates » : dates des publications des agences (BLS,
 *   BEA, Census, DOL, Fed). Conditions : celles de l'API FRED (déjà
 *   respectées : mention et lien).
 * - BEA : fichier iCalendar officiel du calendrier des publications
 *   (domaine public, gouvernement fédéral US).
 * - TreasuryDirect : API publique des adjudications (domaine public).
 */
import type { BeaIcsEvent, FredReleaseDate, TreasuryAuction } from '@/lib/market/calendar/events'
import { RELEASES } from '@/lib/market/calendar/releases'

export const BEA_ICS_URL = 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics'
const TREASURY = 'https://www.treasurydirect.gov/TA_WS/securities'

async function get(url: string, label: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'ATP-Terminal/1.0' } })
  } catch (e) {
    throw new Error(`${label} : réseau (${(e as Error).name})`)
  }
  if (!res.ok) throw new Error(`${label} : HTTP ${res.status}`)
  return res
}

/** Dates de publication FRED des publications suivies, entre deux dates (futures comprises). */
export async function fetchFredReleaseDates(from: string, to: string): Promise<FredReleaseDate[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY absente')
  // FRED : 1000 dates au plus par appel (toutes publications confondues) → pagination.
  const out: FredReleaseDate[] = []
  for (let offset = 0, page = 0; page < 20; page++, offset += 1000) {
    const params = new URLSearchParams({
      api_key: key, file_type: 'json', realtime_start: from, realtime_end: to,
      include_release_dates_with_no_data: 'true', limit: '1000', offset: String(offset), order_by: 'release_date', sort_order: 'asc',
    })
    const res = await get(`https://api.stlouisfed.org/fred/releases/dates?${params}`, 'FRED calendrier')
    const json = await res.json() as { count?: unknown; release_dates?: unknown[] }
    out.push(...parseFredReleaseDates(json))
    const count = typeof json.count === 'number' ? json.count : 0
    if (offset + 1000 >= count || !json.release_dates?.length) break
  }
  return out
}

export function parseFredReleaseDates(json: unknown): FredReleaseDate[] {
  const list = (json as { release_dates?: { release_id?: unknown; date?: unknown }[] } | null)?.release_dates
  if (!Array.isArray(list)) throw new Error('Réponse FRED inattendue')
  const wanted = new Set(RELEASES.map(r => r.releaseId))
  return list
    .filter(d => typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && wanted.has(Number(d.release_id)))
    .map(d => ({ releaseId: Number(d.release_id), date: d.date as string }))
}

/** Fichier iCalendar du BEA → événements (instant UTC + intitulé). */
export function parseIcs(text: string): BeaIcsEvent[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const out: BeaIcsEvent[] = []
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0]
    const start = /^DTSTART[^:\n]*:(\d{8}T\d{6})(Z?)$/m.exec(body)
    const summary = /^SUMMARY:(.*)$/m.exec(body)
    if (!start || !summary) continue
    const s = start[1]
    // Le fichier du BEA donne les heures en UTC (suffixe Z).
    if (start[2] !== 'Z') continue
    const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15))
    out.push({ start: ms, summary: summary[1].replace(/\\,/g, ',').replace(/\\;/g, ';').trim() })
  }
  return out
}

export async function fetchBeaIcs(): Promise<BeaIcsEvent[]> {
  const res = await get(BEA_ICS_URL, 'BEA calendrier')
  return parseIcs(await res.text())
}

interface TreasuryRow {
  cusip?: string
  originalSecurityTerm?: string
  securityTerm?: string
  competitiveAuctionCloseDate?: string
  competitiveAuctionCloseTime?: string
  highYield?: string
}

export function parseTreasury(json: unknown): TreasuryAuction[] {
  if (!Array.isArray(json)) throw new Error('Réponse TreasuryDirect inattendue')
  return (json as TreasuryRow[])
    .filter(r => r.cusip && r.competitiveAuctionCloseDate && (r.originalSecurityTerm === '10-Year' || r.originalSecurityTerm === '30-Year'))
    .map(r => {
      const y = r.highYield ? Number(r.highYield) : NaN
      return {
        cusip: r.cusip!, originalTerm: r.originalSecurityTerm!, securityTerm: r.securityTerm ?? r.originalSecurityTerm!,
        closeDate: r.competitiveAuctionCloseDate!.slice(0, 10), closeTime: r.competitiveAuctionCloseTime ?? '01:00 PM',
        highYield: Number.isFinite(y) ? y : null,
      }
    })
}

/** Adjudications à 10 et 30 ans : annoncées (à venir) et réalisées sur `days` jours (avec le taux). */
export async function fetchTreasuryAuctions(days = 120): Promise<TreasuryAuction[]> {
  const [upcoming, notes, bonds] = await Promise.all([
    get(`${TREASURY}/upcoming?format=json`, 'Trésor (à venir)').then(r => r.json()),
    get(`${TREASURY}/auctioned?format=json&type=Note&days=${days}`, 'Trésor (notes)').then(r => r.json()),
    get(`${TREASURY}/auctioned?format=json&type=Bond&days=${days}`, 'Trésor (bonds)').then(r => r.json()),
  ])
  return [...parseTreasury(upcoming), ...parseTreasury(notes), ...parseTreasury(bonds)]
}
