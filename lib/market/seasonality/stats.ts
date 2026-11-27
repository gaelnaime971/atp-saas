/**
 * Saisonnalité : statistiques pures (testées dans stats.test.ts).
 *
 * - S&P 500 (Shiller) : par mois de l'année sur une fenêtre d'années
 *   complètes, et par année du cycle présidentiel américain.
 * - Journal du membre : P&L et taux de réussite par mois, jour de la
 *   semaine et heure (heure des trades saisis en Session live).
 */

export type ReturnsByYear = Readonly<Record<number, readonly (number | null)[]>>

export interface Extreme { year: number; value: number }

export interface SeriesStats {
  n: number
  mean: number
  median: number
  upCount: number
  /** Part des années en hausse, en %. */
  upShare: number
  /** Écart type (échantillon), en points de %. */
  volatility: number
  best: Extreme
  worst: Extreme
}

/** Statistiques d'une liste (année, rendement en %). null si vide. */
export function seriesStats(values: readonly Extreme[]): SeriesStats | null {
  const n = values.length
  if (n === 0) return null
  const xs = values.map(v => v.value)
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const sorted = [...xs].sort((a, b) => a - b)
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const upCount = xs.filter(x => x > 0).length
  const volatility = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0
  let best = values[0]
  let worst = values[0]
  for (const v of values) {
    if (v.value > best.value) best = v
    if (v.value < worst.value) worst = v
  }
  return { n, mean, median, upCount, upShare: (upCount / n) * 100, volatility, best, worst }
}

/** Rendements d'un mois (0 = janvier) sur les années [from, to] où il est connu. */
export function monthValues(data: ReturnsByYear, month: number, from: number, to: number): Extreme[] {
  const out: Extreme[] = []
  for (let y = from; y <= to; y++) {
    const v = data[y]?.[month]
    if (v !== null && v !== undefined) out.push({ year: y, value: v })
  }
  return out
}

/** Statistiques des 12 mois sur les années [from, to]. */
export function monthlyStats(data: ReturnsByYear, from: number, to: number): (SeriesStats | null)[] {
  return Array.from({ length: 12 }, (_, m) => seriesStats(monthValues(data, m, from, to)))
}

/** Rendement annuel en % (12 mois composés), null si un mois manque. */
export function yearReturn(months: readonly (number | null)[] | undefined): number | null {
  if (!months || months.length !== 12 || months.some(v => v === null)) return null
  return (months.reduce<number>((acc, v) => acc * (1 + (v as number) / 100), 1) - 1) * 100
}

/**
 * Cycle présidentiel : 1 = lendemain d'élection, 2 = mi-mandat,
 * 3 = veille d'élection, 4 = élection (2024, 2028…).
 */
export type CycleYear = 1 | 2 | 3 | 4
export function cycleYear(year: number): CycleYear {
  return ((((year - 2025) % 4) + 4) % 4 + 1) as CycleYear
}
export const CYCLE_LABEL: Record<CycleYear, string> = {
  1: 'Lendemain d’élection',
  2: 'Mi-mandat',
  3: 'Veille d’élection',
  4: 'Année d’élection',
}

/** Statistiques des rendements annuels par année du cycle, sur [from, to]. */
export function cycleStats(data: ReturnsByYear, from: number, to: number): Record<CycleYear, SeriesStats | null> {
  const groups: Record<CycleYear, Extreme[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (let y = from; y <= to; y++) {
    const r = yearReturn(data[y])
    if (r !== null) groups[cycleYear(y)].push({ year: y, value: r })
  }
  return { 1: seriesStats(groups[1]), 2: seriesStats(groups[2]), 3: seriesStats(groups[3]), 4: seriesStats(groups[4]) }
}

/** Moyenne par mois sur les seules années d'une position du cycle. */
export function cycleMonthlyMeans(data: ReturnsByYear, cycle: CycleYear, from: number, to: number): (number | null)[] {
  return Array.from({ length: 12 }, (_, m) => {
    const vals: Extreme[] = []
    for (let y = from; y <= to; y++) {
      const v = data[y]?.[m]
      if (cycleYear(y) === cycle && v !== null && v !== undefined) vals.push({ year: y, value: v })
    }
    return seriesStats(vals)?.mean ?? null
  })
}

/**
 * Trajectoire cumulée (en %) : point 0 = 0 %, puis fin de chaque mois
 * connu. Pour une année réelle, s'arrête au dernier mois connu.
 */
export function cumulativePath(months: readonly (number | null)[]): number[] {
  const out = [0]
  let acc = 1
  for (const v of months) {
    if (v === null) break
    acc *= 1 + v / 100
    out.push((acc - 1) * 100)
  }
  return out
}

// ─── Journal du membre ───────────────────────────────────────────

/** Minimum de sessions saisies pour afficher la saisonnalité du journal. */
export const JOURNAL_MIN_SESSIONS = 20
/** Minimum de trades horodatés (Session live) pour la vue par heure. */
export const JOURNAL_MIN_TIMED_TRADES = 20

export interface JournalSession {
  /** Jour de la session, AAAA-MM-JJ. */
  date: string
  pnl: number
  /** Trades saisis en Session live : heure HH:MM(:SS) et P&L. */
  trades?: { time: string; pnl: number }[]
}

export interface Bucket {
  key: number
  label: string
  count: number
  pnl: number
  wins: number
  /** Taux de réussite en % (positifs / total), null si vide. */
  winRate: number | null
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function bucketize(items: readonly { key: number; pnl: number }[], keys: readonly number[], label: (k: number) => string): Bucket[] {
  return keys.map(key => {
    const xs = items.filter(i => i.key === key)
    const wins = xs.filter(i => i.pnl > 0).length
    return {
      key, label: label(key), count: xs.length, wins,
      pnl: Math.round(xs.reduce((a, i) => a + i.pnl, 0) * 100) / 100,
      winRate: xs.length ? (wins / xs.length) * 100 : null,
    }
  })
}

/** Jour de la semaine d'une date AAAA-MM-JJ : 0 = lundi … 6 = dimanche. */
export function weekdayIndex(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay()
  return (d + 6) % 7
}

export interface JournalSeasonality {
  sessions: number
  enough: boolean
  byMonth: Bucket[]
  byWeekday: Bucket[]
  timedTrades: number
  /** null tant que le journal n'a pas assez de trades horodatés. */
  byHour: Bucket[] | null
}

export function journalSeasonality(sessions: readonly JournalSession[]): JournalSeasonality {
  const valid = sessions.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.pnl))
  const byMonth = bucketize(valid.map(s => ({ key: Number(s.date.slice(5, 7)) - 1, pnl: s.pnl })), [...Array(12).keys()], k => MONTHS_SHORT[k])
  const weekdays = valid.map(s => ({ key: weekdayIndex(s.date), pnl: s.pnl }))
  const weekdayKeys = weekdays.some(w => w.key >= 5) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]
  const byWeekday = bucketize(weekdays, weekdayKeys, k => WEEKDAYS[k])
  const timed = valid.flatMap(s => (s.trades ?? []).flatMap(t => {
    const m = /^(\d{1,2}):\d{2}/.exec(t.time ?? '')
    const h = m ? Number(m[1]) : NaN
    return h >= 0 && h <= 23 && Number.isFinite(t.pnl) ? [{ key: h, pnl: t.pnl }] : []
  }))
  const hours = [...new Set(timed.map(t => t.key))].sort((a, b) => a - b)
  return {
    sessions: valid.length,
    enough: valid.length >= JOURNAL_MIN_SESSIONS,
    byMonth, byWeekday,
    timedTrades: timed.length,
    byHour: timed.length >= JOURNAL_MIN_TIMED_TRADES ? bucketize(timed, hours, k => `${String(k).padStart(2, '0')}h`) : null,
  }
}

/** Sessions du journal → entrées : P&L numérique, trades horodatés lus dans `setup` (JSON). */
export function journalFromRows(rows: readonly { session_date: string | null; pnl: number | string | null; setup: string | null }[]): JournalSession[] {
  return rows.flatMap(r => {
    if (!r.session_date) return []
    const pnl = Number(r.pnl ?? 0)
    let trades: { time: string; pnl: number }[] | undefined
    try {
      const setup = r.setup ? JSON.parse(r.setup) as { trades_detail?: unknown } : null
      if (Array.isArray(setup?.trades_detail)) {
        trades = setup.trades_detail.flatMap((t: { time?: unknown; pnl?: unknown }) =>
          typeof t?.time === 'string' && Number.isFinite(Number(t.pnl)) ? [{ time: t.time, pnl: Number(t.pnl) }] : [])
      }
    } catch { /* setup non JSON : pas d'heure */ }
    return [{ date: r.session_date.slice(0, 10), pnl: Number.isFinite(pnl) ? pnl : 0, trades }]
  })
}
