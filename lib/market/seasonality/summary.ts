/**
 * Saisonnalité : fenêtres d'analyse et lecture rédigée par des règles
 * simples (aucune IA). Partagé par la page Saisonnalité et la Vue
 * d'ensemble. Testé dans stats.test.ts.
 */
import { fmtNumber } from '@/lib/format'
import {
  CYCLE_LABEL, cumulativePath, cycleStats, cycleYear, monthlyStats,
  type CycleYear, type ReturnsByYear, type SeriesStats,
} from './stats'

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const MONTH_NAMES_CAP = MONTH_NAMES.map(m => m[0].toUpperCase() + m.slice(1))

/** Nombre d'années complètes pour la saisonnalité par mois. */
export const MONTH_WINDOW_YEARS = 20
/** Début de l'historique du cycle présidentiel. */
export const CYCLE_FROM = 1950

export interface SeasonalityWindow {
  /** Années complètes [from, to] pour les mois. */
  from: number
  to: number
  /** Cycle présidentiel : [CYCLE_FROM, to]. */
  cycleFrom: number
  /** Année en cours dans les données (incomplète), sinon null. */
  partialYear: number | null
  /** Dernier mois connu de l'année en cours (0 = janvier), sinon null. */
  partialLastMonth: number | null
}

export function seasonalityWindow(lastMonth: string): SeasonalityWindow {
  const year = Number(lastMonth.slice(0, 4))
  const month = Number(lastMonth.slice(5, 7)) - 1
  const to = month === 11 ? year : year - 1
  return {
    from: to - MONTH_WINDOW_YEARS + 1, to, cycleFrom: CYCLE_FROM,
    partialYear: month === 11 ? null : year,
    partialLastMonth: month === 11 ? null : month,
  }
}

export const pct = (v: number, digits = 2) => `${fmtNumber(v, digits, { sign: true })} %`

/** « 16 années sur 20 » */
export const upPhrase = (s: SeriesStats) => `${s.upCount} ${s.upCount > 1 ? 'années' : 'année'} sur ${s.n}`

export interface SeasonalitySummary {
  window: SeasonalityWindow
  months: (SeriesStats | null)[]
  cycle: Record<CycleYear, SeriesStats | null>
  /** Position de l'année civile du membre dans le cycle. */
  currentCycle: CycleYear
  /** Trajectoire d'une année moyenne (13 points, 0 = début janvier). */
  averagePath: number[]
  /** Trajectoire de l'année en cours (jusqu'au dernier mois connu), sinon null. */
  partialPath: number[] | null
}

export function seasonalitySummary(data: ReturnsByYear, lastMonth: string, memberYear: number): SeasonalitySummary {
  const window = seasonalityWindow(lastMonth)
  const months = monthlyStats(data, window.from, window.to)
  return {
    window, months,
    cycle: cycleStats(data, window.cycleFrom, window.to),
    currentCycle: cycleYear(memberYear),
    averagePath: cumulativePath(months.map(s => s?.mean ?? null)),
    partialPath: window.partialYear !== null ? cumulativePath(data[window.partialYear] ?? []) : null,
  }
}

/** Rang de régularité d'un mois (1 = plus forte part d'années en hausse, puis moyenne). */
export function regularityRank(months: readonly (SeriesStats | null)[], month: number): number | null {
  const s = months[month]
  if (!s) return null
  const order = months
    .map((x, i) => ({ i, up: x?.upShare ?? -1, mean: x?.mean ?? -Infinity }))
    .sort((a, b) => b.up - a.up || b.mean - a.mean)
  return order.findIndex(o => o.i === month) + 1
}

/**
 * Lecture du mois (règles) : régularité du mois en cours, comparaison
 * de l'année en cours avec une année moyenne, position dans le cycle.
 */
export function seasonalityReading(sum: SeasonalitySummary, month: number): string[] {
  const out: string[] = []
  const s = sum.months[month]
  const name = MONTH_NAMES_CAP[month]
  const { from, to } = sum.window
  if (s) {
    const rank = regularityRank(sum.months, month)
    const tail = rank !== null && rank <= 3 ? ` : l’un des mois les plus réguliers de ${from} à ${to}`
      : rank !== null && rank >= 10 ? ` : l’un des mois les moins réguliers de ${from} à ${to}` : ''
    out.push(`${name} : S&P 500 en hausse ${upPhrase(s)}, ${pct(s.mean)} en moyenne${tail}.`)
  }
  if (sum.partialPath && sum.window.partialYear !== null && sum.partialPath.length > 1) {
    const k = sum.partialPath.length - 1
    const ytd = sum.partialPath[k]
    const avg = sum.averagePath[k]
    if (avg !== undefined) {
      const verdict = ytd >= avg ? 'mieux qu’une année moyenne' : 'moins bien qu’une année moyenne'
      out.push(`${sum.window.partialYear} fait ${verdict} : ${pct(ytd, 1)} fin ${MONTH_NAMES[k - 1]}, contre ${pct(avg, 1)} en moyenne.`)
    }
  }
  const c = sum.cycle[sum.currentCycle]
  if (c) {
    out.push(`${CYCLE_LABEL[sum.currentCycle]} : ${pct(c.mean, 1)} en moyenne sur l’année depuis ${sum.window.cycleFrom}, en hausse ${upPhrase(c)}.`)
  }
  out.push('La saisonnalité donne un vent de fond, jamais un signal d’entrée.')
  return out
}
