/** Libellés de période des séries FRED (page Macro US). */
import type { FredFrequency } from '@/lib/market/catalog'
import { formatDateKey } from '@/lib/time'

/** « mar. 24 nov. 2026 », « octobre 2026 », « T4 2026 ». */
export function formatPeriod(date: string, frequency: FredFrequency): string {
  const [y, m] = date.split('-').map(Number)
  if (frequency === 'Q') return `T${Math.floor((m - 1) / 3) + 1} ${y}`
  if (frequency === 'M') return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1))
  return formatDateKey(date, { year: true })
}

/** « Au mar. 24 nov. 2026 », « En octobre 2026 », « Estimation pour le T4 2026 ». */
export function periodLabel(date: string, frequency: FredFrequency): string {
  if (frequency === 'Q') return `Estimation pour le ${formatPeriod(date, 'Q')}`
  if (frequency === 'M') return `En ${formatPeriod(date, 'M')}`
  return `Au ${formatPeriod(date, frequency)}`
}
