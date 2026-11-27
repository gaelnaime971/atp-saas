/**
 * Calendrier : paramètres de la page (vue, période, filtres) et formats
 * des chiffres. Pur, testé dans view.test.ts.
 */
import { addDays } from '@/lib/time'
import type { FigureTransform } from '@/lib/market/calendar/releases'
import { weekStart, type ImpactFilter, type TypeFilter } from '@/lib/market/calendar/events'
import { fmtNumber } from '@/lib/format'

export type CalendarView = 'jour' | 'semaine'

export interface CalendarParams {
  view: CalendarView
  /** Jour affiché (vue jour) ou lundi de la semaine (vue semaine), date du membre. */
  from: string
  to: string
  impacts: ImpactFilter[]
  types: TypeFilter[]
}

const IMPACTS: Record<string, ImpactFilter> = { fort: 'high', moyen: 'medium', faible: 'low' }
const TYPES: Record<string, TypeFilter> = { publications: 'release', fed: 'fed', adjudications: 'auction', resultats: 'earnings', feries: 'holiday' }
export const IMPACT_SLUG: Record<ImpactFilter, string> = { high: 'fort', medium: 'moyen', low: 'faible' }
export const TYPE_SLUG: Record<TypeFilter, string> = { release: 'publications', fed: 'fed', auction: 'adjudications', earnings: 'resultats', holiday: 'feries' }

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)

/** Paramètres d'URL → vue, période (dates du membre) et filtres. Valeurs inconnues ignorées. */
export function parseCalendarParams(sp: Record<string, string | string[] | undefined>, today: string): CalendarParams {
  const view: CalendarView = list(sp.vue)[0] === 'semaine' ? 'semaine' : 'jour'
  const raw = list(sp.du)[0]
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today
  const impacts = [...new Set(list(sp.impact).map(x => IMPACTS[x]).filter(Boolean))]
  const types = [...new Set(list(sp.type).map(x => TYPES[x]).filter(Boolean))]
  if (view === 'semaine') {
    const from = weekStart(day)
    return { view, from, to: addDays(from, 6), impacts, types }
  }
  return { view, from: day, to: day, impacts, types }
}

/** URL de la page avec des paramètres modifiés (filtres conservés). */
export function calendarHref(p: CalendarParams, change: Partial<Pick<CalendarParams, 'view' | 'from' | 'impacts' | 'types'>>): string {
  const next = { ...p, ...change }
  const q = new URLSearchParams()
  if (next.view === 'semaine') q.set('vue', 'semaine')
  q.set('du', next.from)
  if (next.impacts.length) q.set('impact', next.impacts.map(i => IMPACT_SLUG[i]).join(','))
  if (next.types.length) q.set('type', next.types.map(t => TYPE_SLUG[t]).join(','))
  return `?${q.toString()}`
}

export function toggle<T>(values: readonly T[], v: T): T[] {
  return values.includes(v) ? values.filter(x => x !== v) : [...values, v]
}

/** Format du chiffre publié selon sa mesure. */
export function formatFigure(v: number | null, t: FigureTransform): string {
  if (v === null || !Number.isFinite(v)) return '—'
  switch (t) {
    case 'pct_mom':
    case 'pct_qoq': return `${fmtNumber(v, 1, { sign: true })} %`
    case 'change_k': return `${fmtNumber(v, 0, { sign: true })} k`
    case 'level_pct': return `${fmtNumber(v, 1)} %`
    case 'level_k': return `${fmtNumber(v, 0)} k`
    case 'level_m': return `${fmtNumber(v, 2)} M`
    case 'level_bn': return `${fmtNumber(v, 1)} Md$`
  }
}
