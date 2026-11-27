/**
 * Agenda Terminal (admin) : validation des saisies avant écriture par la
 * route admin (service-role). Pur, testé dans agenda-admin.test.ts.
 */
import { MARKET_SPECIAL_DAYS, parseGlobexRanges } from '@/lib/terminal/market-holidays'

/** Liste de départ : plus grosses pondérations du Nasdaq-100 et du Dow (DECISIONS.md). */
export const EARNINGS_SUGGESTIONS: { ticker: string; name: string }[] = [
  { ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' }, { ticker: 'NVDA', name: 'Nvidia' },
  { ticker: 'AMZN', name: 'Amazon' }, { ticker: 'GOOGL', name: 'Alphabet' }, { ticker: 'META', name: 'Meta' },
  { ticker: 'AVGO', name: 'Broadcom' }, { ticker: 'TSLA', name: 'Tesla' }, { ticker: 'COST', name: 'Costco' },
  { ticker: 'NFLX', name: 'Netflix' }, { ticker: 'AMD', name: 'AMD' }, { ticker: 'GS', name: 'Goldman Sachs' },
  { ticker: 'UNH', name: 'UnitedHealth' }, { ticker: 'HD', name: 'Home Depot' }, { ticker: 'CAT', name: 'Caterpillar' },
  { ticker: 'V', name: 'Visa' }, { ticker: 'JPM', name: 'JPMorgan' }, { ticker: 'CRM', name: 'Salesforce' },
  { ticker: 'MCD', name: 'McDonald’s' }, { ticker: 'BA', name: 'Boeing' },
]

export interface AgendaRecord {
  kind: 'earnings' | 'speech'
  event_date: string
  time_et: string | null
  timing: 'bmo' | 'amc' | null
  ticker: string | null
  title: string
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function validateAgendaItem(input: unknown): Result<AgendaRecord> {
  const i = (input ?? {}) as Record<string, unknown>
  if (i.kind !== 'earnings' && i.kind !== 'speech') return { ok: false, error: 'Type inconnu' }
  if (!validDate(i.date)) return { ok: false, error: 'Date invalide' }
  const title = typeof i.title === 'string' ? i.title.trim() : ''
  if (i.kind === 'earnings') {
    const ticker = typeof i.ticker === 'string' ? i.ticker.trim().toUpperCase() : ''
    if (!/^[A-Z.]{1,8}$/.test(ticker)) return { ok: false, error: 'Ticker invalide' }
    if (i.timing !== 'bmo' && i.timing !== 'amc') return { ok: false, error: 'Indique avant l’ouverture ou après la clôture' }
    const name = title || EARNINGS_SUGGESTIONS.find(s => s.ticker === ticker)?.name || ticker
    if (name.length > 160) return { ok: false, error: 'Nom trop long' }
    return { ok: true, value: { kind: 'earnings', event_date: i.date, time_et: null, timing: i.timing, ticker, title: name } }
  }
  if (title.length < 1 || title.length > 160) return { ok: false, error: 'Intitulé du discours requis (160 caractères au plus)' }
  const time = typeof i.timeEt === 'string' && i.timeEt.trim() !== '' ? i.timeEt.trim() : null
  if (time !== null && !TIME.test(time)) return { ok: false, error: 'Heure invalide (HH:MM, heure de New York)' }
  return { ok: true, value: { kind: 'speech', event_date: i.date, time_et: time, timing: null, ticker: null, title } }
}

export interface ConfirmationRecord {
  holiday_date: string
  cme_confirmed: boolean
  globex_ranges: string | null
  note: string | null
}

/** Confirmation d'un jour de fête : la date doit être dans la table des jours spéciaux. */
export function validateConfirmation(input: unknown): Result<ConfirmationRecord> {
  const i = (input ?? {}) as Record<string, unknown>
  if (!validDate(i.date) || !MARKET_SPECIAL_DAYS.some(d => d.date === i.date)) return { ok: false, error: 'Jour de fête inconnu' }
  let ranges: string | null = null
  if (typeof i.globexRanges === 'string') {
    const parsed = parseGlobexRanges(i.globexRanges)
    if (parsed === null) return { ok: false, error: 'Plages Globex invalides (ex. 00:00-13:15,18:00-24:00)' }
    ranges = parsed.map(([a, b]) => `${a}-${b}`).join(',')
  }
  const note = typeof i.note === 'string' && i.note.trim() ? i.note.trim().slice(0, 200) : null
  return { ok: true, value: { holiday_date: i.date as string, cme_confirmed: i.cmeConfirmed === true, globex_ranges: ranges, note } }
}
