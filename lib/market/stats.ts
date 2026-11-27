/**
 * Statistiques communes aux pages Terminal (COT, Sentiment) : percentile
 * sur une fenêtre glissante et alignement « à date » de séries de
 * fréquences différentes.
 */
import type { Observation } from '@/lib/market/fred'

/**
 * Rang percentile (0-100) de `current` parmi `values` (rang moyen : les
 * ex æquo comptent pour moitié). Le minimum de la fenêtre donne ~0, le
 * maximum ~100. Fenêtre vide → null.
 */
export function percentileRank(values: readonly number[], current: number): number | null {
  if (values.length === 0 || !Number.isFinite(current)) return null
  let below = 0
  let equal = 0
  for (const v of values) {
    if (v < current) below += 1
    else if (v === current) equal += 1
  }
  return (100 * (below + 0.5 * equal)) / values.length
}

/** Date AAAA-MM-JJ moins `years` années. */
export function minusYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y - years, m - 1, d)).toISOString().slice(0, 10)
}

export function minusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

/** Valeurs de la fenêtre ]date − years ; date]. Les observations doivent être triées. */
export function windowValues(obs: readonly Observation[], date: string, years: number): number[] {
  const from = minusYears(date, years)
  return obs.filter(o => o.date > from && o.date <= date).map(o => o.value)
}

/** Percentile de la valeur à `date` (dernière observation ≤ date) sur `years` ans. */
export function percentileAt(obs: readonly Observation[], date: string, years: number): number | null {
  const current = valueAt(obs, date)
  if (current === null) return null
  return percentileRank(windowValues(obs, date, years), current)
}

/** Dernière observation à la date ou avant (séries triées), sinon null. */
export function valueAt(obs: readonly Observation[], date: string): number | null {
  let lo = 0
  let hi = obs.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (obs[mid].date <= date) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found >= 0 ? obs[found].value : null
}

export function lastObservation(obs: readonly Observation[]): Observation | null {
  return obs.length ? obs[obs.length - 1] : null
}
