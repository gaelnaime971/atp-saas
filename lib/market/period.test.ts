import { describe, expect, it } from 'vitest'
import { formatPeriod, periodLabel } from './period'

describe('libellés de période', () => {
  it('séries mensuelles : « En octobre 2026 » (pas « Au octobre »)', () => {
    expect(periodLabel('2026-10-01', 'M')).toBe('En octobre 2026')
  })
  it('quotidien / hebdomadaire : « Au » + date ; trimestriel : estimation pour le trimestre', () => {
    expect(periodLabel('2026-11-24', 'D')).toBe('Au mar. 24 nov. 2026')
    expect(periodLabel('2026-10-01', 'Q')).toBe('Estimation pour le T4 2026')
    expect(formatPeriod('2026-07-01', 'Q')).toBe('T3 2026')
  })
})
