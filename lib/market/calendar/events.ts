/**
 * Calendrier économique : construction des événements, dédoublonnage,
 * fenêtres ATP, filtres. Pur, testé dans events.test.ts.
 *
 * Toutes les heures sont des instants (epoch ms) calculés depuis l'heure
 * de New York de la date de publication (lib/time.ts), puis affichés dans
 * le fuseau du membre.
 */
import { MARKET_ZONES, addDays, dateKey, zonedTimeToUtc } from '@/lib/time'
import { RELEASE_BY_ID, RELEASES, type FigureTransform, type Impact } from '@/lib/market/calendar/releases'
import { FOMC_MEETINGS } from '@/lib/market/central-banks'
import { MARKET_SPECIAL_DAYS, type MarketSpecialDay } from '@/lib/terminal/market-holidays'

const ET = MARKET_ZONES.newYork
const MIN = 60_000

export type EventKind = 'release' | 'fomc' | 'auction' | 'earnings' | 'speech' | 'holiday'

export interface CalendarEvent {
  /** Clé stable : sert au dédoublonnage et à l'upsert. */
  id: string
  kind: EventKind
  title: string
  detail?: string
  agency: string
  /** Instant de l'événement ; null = toute la journée (férié, résultat sans heure). */
  at: number | null
  /** Date à New York, AAAA-MM-JJ. */
  date: string
  impact: Impact | 'holiday'
  /** Heure donnée par la source officielle (sinon heure habituelle de l'agence). */
  timeOfficial: boolean
  figure?: { series: string; transform: FigureTransform; label: string }
  auction?: { cusip: string; term: string }
  url?: string
}

export const KIND_LABEL: Record<EventKind, string> = {
  release: 'Publication', fomc: 'Fed', auction: 'Adjudication', earnings: 'Résultats', speech: 'Discours', holiday: 'Férié',
}

const at = (date: string, time: string) => zonedTimeToUtc(date, time, ET).getTime()

// ─── Publications (FRED + BEA) ──────────────────────────────────

export interface FredReleaseDate { releaseId: number; date: string }
export interface BeaIcsEvent { start: number; summary: string }

/** Publications à partir des dates FRED, heures du BEA quand il les donne. */
export function releaseEvents(fredDates: readonly FredReleaseDate[], bea: readonly BeaIcsEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const d of fredDates) {
    const def = RELEASE_BY_ID.get(d.releaseId)
    if (!def) continue
    out.push({
      id: `release:${def.releaseId}:${d.date}`, kind: 'release', title: def.title, agency: def.agency,
      at: at(d.date, def.timeEt), date: d.date, impact: def.impact, timeOfficial: false,
      figure: def.figure,
    })
  }
  for (const b of bea) {
    const def = RELEASES.find(r => r.beaSummary?.test(b.summary))
    if (!def) continue
    const date = dateKey(b.start, ET)
    out.push({
      id: `release:${def.releaseId}:${date}`, kind: 'release', title: def.title, detail: b.summary, agency: def.agency,
      at: b.start, date, impact: def.impact, timeOfficial: true, figure: def.figure,
    })
  }
  return dedupe(out)
}

/**
 * Dédoublonnage par clé : une même publication peut venir de FRED (date,
 * heure habituelle) et du BEA (heure officielle). On garde l'heure
 * officielle et on complète les champs manquants.
 */
export function dedupe(events: readonly CalendarEvent[]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>()
  for (const e of events) {
    const prev = byId.get(e.id)
    if (!prev) { byId.set(e.id, e); continue }
    const best = e.timeOfficial && !prev.timeOfficial ? e : prev
    const other = best === e ? prev : e
    byId.set(e.id, { ...other, ...best, detail: best.detail ?? other.detail, figure: best.figure ?? other.figure })
  }
  return [...byId.values()].sort(compareEvents)
}

export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  // Journée entière (férié) en tête de journée.
  if (a.at === null || b.at === null) return a.at === null ? (b.at === null ? 0 : -1) : 1
  return a.at - b.at || a.title.localeCompare(b.title)
}

// ─── Fed (FOMC) ─────────────────────────────────────────────────

export function fomcEvents(): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const m of FOMC_MEETINGS) {
    const proj = m.projections ? ' et projections' : ''
    out.push({ id: `fomc:decision:${m.decisionDate}`, kind: 'fomc', title: `Décision de la Fed${proj}`, detail: m.tentative ? 'Date à confirmer par la Fed' : undefined, agency: 'Fed', at: at(m.decisionDate, '14:00'), date: m.decisionDate, impact: 'high', timeOfficial: true })
    out.push({ id: `fomc:press:${m.decisionDate}`, kind: 'fomc', title: 'Conférence de presse du président de la Fed', agency: 'Fed', at: at(m.decisionDate, '14:30'), date: m.decisionDate, impact: 'high', timeOfficial: true })
    if (m.minutesDate) out.push({ id: `fomc:minutes:${m.minutesDate}`, kind: 'fomc', title: 'Compte rendu de la Fed (minutes)', agency: 'Fed', at: at(m.minutesDate, '14:00'), date: m.minutesDate, impact: 'medium', timeOfficial: true })
  }
  return out
}

// ─── Adjudications du Trésor (10 et 30 ans) ─────────────────────

export interface TreasuryAuction {
  cusip: string
  /** « 10-Year » ou « 30-Year » (titre d'origine, réouvertures comprises). */
  originalTerm: string
  securityTerm: string
  /** AAAA-MM-JJ */
  closeDate: string
  /** « 01:00 PM » */
  closeTime: string
  highYield: number | null
}

/** « 01:00 PM » → « 13:00 ». */
export function to24h(t: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim())
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

export function auctionEvents(auctions: readonly TreasuryAuction[]): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const a of auctions) {
    const term = a.originalTerm === '10-Year' ? '10 ans' : a.originalTerm === '30-Year' ? '30 ans' : null
    if (!term) continue
    const time = to24h(a.closeTime) ?? '13:00'
    out.push({
      id: `auction:${a.cusip}:${a.closeDate}`, kind: 'auction', title: `Adjudication à ${term}`,
      detail: a.securityTerm !== a.originalTerm ? 'Réouverture' : undefined, agency: 'Trésor',
      at: at(a.closeDate, time), date: a.closeDate, impact: 'medium', timeOfficial: true,
      auction: { cusip: a.cusip, term },
    })
  }
  return dedupe(out)
}

// ─── Fériés et clôtures anticipées (page Sessions) ──────────────

export function holidayEvents(days: readonly MarketSpecialDay[] = MARKET_SPECIAL_DAYS): CalendarEvent[] {
  return days.filter(d => d.nyse).map(d => d.nyse === 'closed'
    ? { id: `holiday:${d.date}`, kind: 'holiday' as const, title: `${d.name} · Wall Street fermée`, agency: 'NYSE', at: null, date: d.date, impact: 'holiday' as const, timeOfficial: true }
    : { id: `holiday:${d.date}`, kind: 'holiday' as const, title: `${d.name} · clôture anticipée de Wall Street`, agency: 'NYSE', at: at(d.date, '13:00'), date: d.date, impact: 'holiday' as const, timeOfficial: true })
}

// ─── Agenda saisi par l'admin (résultats, discours) ─────────────

export interface AgendaItem {
  id: string
  kind: 'earnings' | 'speech'
  /** AAAA-MM-JJ (New York) */
  date: string
  /** HH:MM à New York (discours) */
  timeEt: string | null
  /** Résultats : avant l'ouverture ou après la clôture. */
  timing: 'bmo' | 'amc' | null
  ticker: string | null
  title: string
}

export function agendaEvents(items: readonly AgendaItem[]): CalendarEvent[] {
  return items.map(i => {
    if (i.kind === 'earnings') {
      // Heure indicative : avant l'ouverture = 8:00, après la clôture = 16:05 (heure de New York).
      const time = i.timing === 'bmo' ? '08:00' : i.timing === 'amc' ? '16:05' : null
      return {
        id: `earnings:${i.id}`, kind: 'earnings' as const, title: `Résultats ${i.ticker ?? ''}`.trim(),
        detail: [i.title, i.timing === 'bmo' ? 'avant l’ouverture' : i.timing === 'amc' ? 'après la clôture' : null].filter(Boolean).join(' · '),
        agency: 'Société', at: time ? at(i.date, time) : null, date: i.date, impact: 'medium' as const, timeOfficial: false,
      }
    }
    return {
      id: `speech:${i.id}`, kind: 'speech' as const, title: i.title, agency: 'Fed',
      at: i.timeEt ? at(i.date, i.timeEt) : null, date: i.date, impact: 'medium' as const, timeOfficial: true,
    }
  })
}

// ─── Fenêtres ATP ───────────────────────────────────────────────

export const ATP_WINDOW_MIN = 15

/** Fenêtres de ±15 min autour des événements à fort impact, fusionnées quand elles se touchent. */
export function atpWindows(events: readonly CalendarEvent[]): { start: number; end: number; ids: string[] }[] {
  const raw = events
    .filter(e => e.impact === 'high' && e.at !== null)
    .map(e => ({ start: e.at! - ATP_WINDOW_MIN * MIN, end: e.at! + ATP_WINDOW_MIN * MIN, ids: [e.id] }))
    .sort((a, b) => a.start - b.start)
  const out: typeof raw = []
  for (const w of raw) {
    const prev = out[out.length - 1]
    if (prev && w.start <= prev.end) { prev.end = Math.max(prev.end, w.end); prev.ids.push(...w.ids) }
    else out.push({ ...w, ids: [...w.ids] })
  }
  return out
}

// ─── Filtres et période ─────────────────────────────────────────

export type ImpactFilter = 'high' | 'medium' | 'low'
export type TypeFilter = 'release' | 'fed' | 'auction' | 'earnings' | 'holiday'

export function typeOf(e: CalendarEvent): TypeFilter {
  if (e.kind === 'fomc' || e.kind === 'speech') return 'fed'
  return e.kind as TypeFilter
}

/** Filtres vides = tout. Les fériés passent toujours le filtre d'impact. */
export function filterEvents(events: readonly CalendarEvent[], impacts: readonly ImpactFilter[], types: readonly TypeFilter[]): CalendarEvent[] {
  return events.filter(e =>
    (impacts.length === 0 || e.impact === 'holiday' || impacts.includes(e.impact as ImpactFilter))
    && (types.length === 0 || types.includes(typeOf(e))))
}

/** Lundi de la semaine qui contient `day` (date civile). */
export function weekStart(day: string): string {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((w + 6) % 7))
}

/** Date de l'événement chez le membre (événement sans heure : sa date à New York). */
export function memberDate(e: CalendarEvent, memberTz: string): string {
  return e.at === null ? e.date : dateKey(e.at, memberTz)
}

/** Événements d'une période [from ; to] en dates du membre, dans l'ordre. */
export function eventsBetween(events: readonly CalendarEvent[], from: string, to: string, memberTz: string): CalendarEvent[] {
  return events.filter(e => { const d = memberDate(e, memberTz); return d >= from && d <= to }).sort(compareEvents)
}
