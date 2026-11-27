/**
 * Sessions & horaires : calcul pur, sans réseau.
 *
 * Chaque horaire est défini dans le fuseau de sa place, pour une date de
 * cette place, puis converti (lib/time.ts) : changements d'heure compris.
 * Fériés et clôtures anticipées : lib/terminal/market-holidays.ts.
 */

import {
  MARKET_ZONES, addDays, dateKey, formatTime, weekdayOf, zonedTimeToUtc,
} from '@/lib/time'
import { isNyseHoliday, specialDay, type HHMM, type MarketSpecialDay, MARKET_SPECIAL_DAYS } from '@/lib/terminal/market-holidays'

const ET = MARKET_ZONES.newYork
const MIN = 60_000
const HOUR = 60 * MIN

export interface Interval { start: number; end: number }

export type SessionId = 'tokyo' | 'london' | 'newYork' | 'cashUs' | 'globex'

export interface SessionDef {
  id: SessionId
  label: string
  /** Libellé court (frise, horloge). */
  short: string
  zone: string
  /** Horaires locaux habituels, pour l'affichage « 08:00–17:00 locale ». */
  localHours: string
}

export const SESSIONS: SessionDef[] = [
  { id: 'tokyo', label: 'Asie · Tokyo', short: 'Tokyo', zone: MARKET_ZONES.tokyo, localHours: '09:00–18:00' },
  { id: 'london', label: 'Europe · Londres', short: 'Londres', zone: MARKET_ZONES.london, localHours: '08:00–17:00' },
  { id: 'newYork', label: 'US · New York', short: 'New York', zone: ET, localHours: '08:00–17:00' },
  { id: 'cashUs', label: 'Cash US · NYSE', short: 'Cash US', zone: ET, localHours: '09:30–16:00' },
  { id: 'globex', label: 'CME Globex · NQ et YM', short: 'NQ · YM', zone: ET, localHours: 'dim. 18:00 → ven. 17:00, pause 17:00–18:00' },
]

export const SESSION_BY_ID = Object.fromEntries(SESSIONS.map(s => [s.id, s])) as Record<SessionId, SessionDef>

// ─── Plages d'une date locale ───────────────────────────────────

function at(date: string, time: HHMM | string, zone: string): number {
  if (time === '24:00') return zonedTimeToUtc(addDays(date, 1), '00:00', zone).getTime()
  return zonedTimeToUtc(date, time, zone).getTime()
}

const isWeekday = (date: string) => { const w = weekdayOf(date); return w >= 1 && w <= 5 }

/** Plages (heure murale) d'une session pour une date civile de sa place. */
function wallRanges(id: SessionId, date: string): [string, string][] {
  const w = weekdayOf(date)
  const special = specialDay(date)
  switch (id) {
    case 'tokyo': return isWeekday(date) ? [['09:00', '18:00']] : []
    case 'london': return isWeekday(date) ? [['08:00', '17:00']] : []
    case 'newYork':
      if (!isWeekday(date) || special?.nyse === 'closed') return []
      return [['08:00', special?.nyse === 'early' ? '13:00' : '17:00']]
    case 'cashUs':
      if (!isWeekday(date) || special?.nyse === 'closed') return []
      return [['09:30', special?.nyse === 'early' ? '13:00' : '16:00']]
    case 'globex':
      if (special?.globex) return special.globex
      if (w === 0) return [['18:00', '24:00']]
      if (w === 6) return []
      if (w === 5) return [['00:00', '17:00']]
      return [['00:00', '17:00'], ['18:00', '24:00']]
  }
}

/** Plages ouvertes d'une session, fusionnées, qui recoupent [from, to]. */
export function sessionIntervals(id: SessionId, from: number, to: number): Interval[] {
  const zone = SESSION_BY_ID[id].zone
  const first = addDays(dateKey(from, zone), -1)
  const last = addDays(dateKey(to, zone), 1)
  const raw: Interval[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    for (const [s, e] of wallRanges(id, d)) raw.push({ start: at(d, s, zone), end: at(d, e, zone) })
  }
  raw.sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const iv of raw) {
    const prev = merged[merged.length - 1]
    if (prev && iv.start <= prev.end) prev.end = Math.max(prev.end, iv.end)
    else merged.push({ ...iv })
  }
  return merged.filter(iv => iv.end > from && iv.start < to)
}

// ─── État en direct ─────────────────────────────────────────────

export type SessionStatus = 'open' | 'pause' | 'closed'

export interface SessionState {
  id: SessionId
  status: SessionStatus
  /** Prochain changement d'état (fermeture si ouvert, ouverture sinon). */
  nextChange: number | null
  /** Jour spécial (ET) qui explique une fermeture ou un horaire réduit aujourd'hui. */
  special?: MarketSpecialDay
}

const LOOKAHEAD = 10 * 24 * HOUR

export function sessionState(id: SessionId, now: number): SessionState {
  const ivs = sessionIntervals(id, now - 3 * 24 * HOUR, now + LOOKAHEAD)
  const current = ivs.find(iv => iv.start <= now && now < iv.end)
  const etDate = dateKey(now, ET)
  const special = id === 'tokyo' || id === 'london' ? undefined : specialDay(etDate)
  if (current) return { id, status: 'open', nextChange: current.end, special }
  const next = ivs.find(iv => iv.start > now) ?? null
  const prev = [...ivs].reverse().find(iv => iv.end <= now)
  // Pause Globex : la coupure quotidienne de 17:00 à 18:00 ET (une heure).
  const isPause = id === 'globex' && !!prev && !!next && next.start - prev.end <= HOUR
  return { id, status: isPause ? 'pause' : 'closed', nextChange: next?.start ?? null, special }
}

export function allSessionStates(now: number): Record<SessionId, SessionState> {
  return Object.fromEntries(SESSIONS.map(s => [s.id, sessionState(s.id, now)])) as Record<SessionId, SessionState>
}

/** Plages de « aujourd'hui » du membre (minuit à minuit chez lui), pour la frise et l'horloge. */
export function dayRanges(id: SessionId, day: string, memberTz: string): { start: number; end: number; dayStart: number; dayEnd: number }[] {
  const dayStart = zonedTimeToUtc(day, '00:00', memberTz).getTime()
  const dayEnd = zonedTimeToUtc(addDays(day, 1), '00:00', memberTz).getTime()
  return sessionIntervals(id, dayStart, dayEnd).map(iv => ({
    start: Math.max(iv.start, dayStart), end: Math.min(iv.end, dayEnd), dayStart, dayEnd,
  }))
}

/** « 08:00–17:00 » de la session dans le fuseau du membre, pour sa prochaine séance (ou l'actuelle). */
export function memberHours(id: SessionId, now: number, memberTz: string): string | null {
  const iv = sessionIntervals(id, now, now + LOOKAHEAD)[0]
  if (!iv) return null
  return `${formatTime(iv.start, memberTz)}–${formatTime(iv.end, memberTz)}`
}

// ─── Rendez-vous fixes de la journée US ─────────────────────────

export interface UsAppointment {
  id: string
  label: string
  /** Heure à New York. */
  etTime: string
  at: number
  /** Fenêtre ATP ±15 min. */
  windowStart: number
  windowEnd: number
}

/** Prochain jour de séance du cash US (date ET) à partir de `now`, aujourd'hui compris s'il reste à venir. */
export function usTradingDay(now: number): string {
  let d = dateKey(now, ET)
  // Après 17:00 ET, la journée US est finie : on montre la suivante.
  if (now >= at(d, '17:00', ET)) d = addDays(d, 1)
  for (let i = 0; i < 10 && (!isWeekday(d) || isNyseHoliday(d)); i++) d = addDays(d, 1)
  return d
}

export function usAppointments(day: string): UsAppointment[] {
  const special = specialDay(day)
  const early = special?.nyse === 'early'
  const items: { id: string; label: string; etTime: string }[] = [
    { id: 'stats-0830', label: 'Statistiques de 8:30 (emploi, inflation, ventes…)', etTime: '08:30' },
    { id: 'cash-open', label: 'Ouverture du cash US', etTime: '09:30' },
    { id: 'stats-1000', label: 'Statistiques de 10:00 (ISM, confiance, JOLTS…)', etTime: '10:00' },
    early
      ? { id: 'cash-close', label: 'Clôture anticipée du cash US', etTime: '13:00' }
      : { id: 'cash-close', label: 'Clôture du cash US', etTime: '16:00' },
    early
      ? { id: 'globex-pause', label: 'Clôture anticipée CME Globex (à confirmer)', etTime: '13:15' }
      : { id: 'globex-pause', label: 'Pause quotidienne CME Globex', etTime: '17:00' },
  ]
  return items.map(it => {
    const t = at(day, it.etTime, ET)
    return { ...it, at: t, windowStart: t - 15 * MIN, windowEnd: t + 15 * MIN }
  })
}

// ─── Échéances, roll et OPEX ────────────────────────────────────

const QUARTER_CODES: Record<number, string> = { 3: 'H', 6: 'M', 9: 'U', 12: 'Z' }
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** 3e vendredi du mois (date civile). */
export function thirdFriday(year: number, month: number): string {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const offset = (5 - weekdayOf(first) + 7) % 7
  return addDays(first, offset + 14)
}

/** Jour de séance NYSE précédent si la date est fériée ou en week-end. */
export function previousBusinessDay(date: string): string {
  let d = date
  for (let i = 0; i < 10 && (!isWeekday(d) || isNyseHoliday(d)); i++) d = addDays(d, -1)
  return d
}

export interface Expiration {
  /** Échéance (date ET) : 3e vendredi, avancé si férié. */
  date: string
  /** Roll recommandé : 8 jours avant (le jeudi de la semaine précédente), avancé si férié. */
  roll: string
  /** Contrat qui expire, ex. « Décembre 2026 · NQZ6 / YMZ6 ». */
  contract: string
  code: string
}

export function quarterlyExpirations(from: string, count = 4): Expiration[] {
  const out: Expiration[] = []
  let { year, month } = { year: Number(from.slice(0, 4)), month: Number(from.slice(5, 7)) }
  while (out.length < count) {
    if (QUARTER_CODES[month]) {
      const date = previousBusinessDay(thirdFriday(year, month))
      if (date >= from) {
        const code = `${QUARTER_CODES[month]}${year % 10}`
        out.push({
          date,
          roll: previousBusinessDay(addDays(thirdFriday(year, month), -8)),
          contract: `${MONTHS_FR[month - 1][0].toUpperCase()}${MONTHS_FR[month - 1].slice(1)} ${year}`,
          code,
        })
      }
    }
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return out
}

/** OPEX mensuelles : 3e vendredi (jeudi si férié), à partir de `from` inclus. */
export function monthlyOpex(from: string, count = 4): string[] {
  const out: string[] = []
  let { year, month } = { year: Number(from.slice(0, 4)), month: Number(from.slice(5, 7)) }
  while (out.length < count) {
    const d = previousBusinessDay(thirdFriday(year, month))
    if (d >= from) out.push(d)
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return out
}

// ─── Jours spéciaux à venir ─────────────────────────────────────

export interface UpcomingSpecial {
  /** Date (ET pour les fériés, date du membre pour les changements d'heure). */
  date: string
  kind: 'closed' | 'early' | 'globex' | 'dst'
  title: string
  detail: string
  cmeConfirmed?: boolean
}

/** Fériés et clôtures anticipées à venir (table), du plus proche au plus lointain. */
export function upcomingHolidays(now: number, memberTz: string, count = 6): UpcomingSpecial[] {
  const today = dateKey(now, ET)
  return MARKET_SPECIAL_DAYS
    .filter(d => d.date >= today && d.nyse)
    .slice(0, count)
    .map(d => {
      if (d.nyse === 'early') {
        const close = formatTime(at(d.date, '13:00', ET), memberTz)
        return {
          date: d.date, kind: 'early' as const, title: d.name, cmeConfirmed: d.cmeConfirmed,
          detail: `Clôture anticipée du cash US à ${close} chez toi (13:00 à New York). NQ et YM : clôture vers ${formatTime(at(d.date, '13:15', ET), memberTz)}.`,
        }
      }
      const morning = d.globex?.find(([s]) => s === '00:00')
      const evening = d.globex?.find(([s]) => s !== '00:00')
      const globexText = morning
        ? `NQ et YM : séance écourtée, arrêt à ${formatTime(at(d.date, morning[1], ET), memberTz)} chez toi.`
        : evening
          ? `NQ et YM : fermés, réouverture à ${formatTime(at(d.date, evening[0], ET), memberTz)} chez toi.`
          : 'NQ et YM : fermés.'
      return {
        date: d.date, kind: 'closed' as const, title: d.name, cmeConfirmed: d.cmeConfirmed,
        detail: `Wall Street fermée. ${globexText}`,
      }
    })
}

/**
 * Changements d'heure à venir vus du membre : chaque date à partir de
 * laquelle l'ouverture du cash US (9:30 ET) tombe à une autre heure chez
 * lui. Couvre les décalages US/Europe (2 à 3 semaines en mars, 1 en
 * octobre-novembre), et rien pour un membre en Guadeloupe hors
 * changement américain.
 */
export function upcomingClockShifts(now: number, memberTz: string, days = 150): UpcomingSpecial[] {
  const out: UpcomingSpecial[] = []
  let d = dateKey(now, ET)
  let prev = formatTime(at(d, '09:30', ET), memberTz)
  for (let i = 1; i <= days; i++) {
    d = addDays(d, 1)
    const cur = formatTime(at(d, '09:30', ET), memberTz)
    if (cur !== prev) {
      out.push({
        date: d, kind: 'dst', title: 'Changement d’heure',
        detail: `À partir de cette date, le cash US ouvre à ${cur} chez toi (au lieu de ${prev}).`,
      })
      prev = cur
    }
  }
  return out
}
