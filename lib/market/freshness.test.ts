import { describe, expect, it } from 'vitest'
import { isDataLate, isIngestLate } from './freshness'

describe('fraîcheur des données', () => {
  it('quotidien : un week-end + un férié ne sont pas un retard, une semaine oui', () => {
    expect(isDataLate('2026-11-25', 'D', '2026-11-30')).toBe(false)
    expect(isDataLate('2026-11-18', 'D', '2026-11-30')).toBe(true)
  })
  it('hebdomadaire, mensuel, trimestriel, COT', () => {
    expect(isDataLate('2026-11-20', 'W', '2026-11-27')).toBe(false)
    expect(isDataLate('2026-11-06', 'W', '2026-11-27')).toBe(true)
    expect(isDataLate('2026-10-01', 'M', '2026-11-15')).toBe(false)
    expect(isDataLate('2026-10-01', 'M', '2026-11-27')).toBe(false) // chômage d'octobre, publié en novembre
    expect(isDataLate('2026-08-01', 'M', '2026-11-15')).toBe(true)
    expect(isDataLate('2026-10-01', 'Q', '2026-12-31')).toBe(false)
    expect(isDataLate('2026-11-17', 'COT', '2026-11-27')).toBe(false)
    expect(isDataLate('2026-11-10', 'COT', '2026-11-27')).toBe(true)
    expect(isDataLate(null, 'D', '2026-11-27')).toBe(true)
  })
  it('mise à jour en panne depuis plus de 2 jours', () => {
    const now = Date.parse('2026-11-27T12:00:00Z')
    expect(isIngestLate('2026-11-26T22:31:00Z', now)).toBe(false)
    expect(isIngestLate('2026-11-24T22:31:00Z', now)).toBe(true)
    expect(isIngestLate(null, now)).toBe(true)
  })
})
