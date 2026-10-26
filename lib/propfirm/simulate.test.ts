import { describe, it, expect } from 'vitest'
import {
  simulate, validateSimInput, isSimValid, formatSimEur,
  FEASIBILITY_LABEL, FEASIBILITY_COLOR,
  type SimulateInput,
} from './simulate'

const BASE: SimulateInput = {
  startingCapital: 100_000,
  targetCapital:   110_000,
  horizonDays:     20,
  tradingDaysPerWeek: 5,
  lossDaysPerWeek: 1,
  avgLossPerRedDay: 150,
}

// ─── validateSimInput ─────────────────────────────────────────────────────

describe('validateSimInput', () => {
  it('OK → aucune erreur', () => {
    expect(isSimValid(validateSimInput(BASE))).toBe(true)
  })
  it('capital ≤ 0', () => {
    expect(validateSimInput({ ...BASE, startingCapital: 0 }).starting_capital).toBeDefined()
  })
  it('objectif ≤ capital', () => {
    expect(validateSimInput({ ...BASE, targetCapital: 90_000 }).target_capital).toBeDefined()
    expect(validateSimInput({ ...BASE, targetCapital: 100_000 }).target_capital).toBeDefined()
  })
  it('horizon < 1', () => {
    expect(validateSimInput({ ...BASE, horizonDays: 0 }).horizon_days).toBeDefined()
  })
  it('tdw hors 1..7', () => {
    expect(validateSimInput({ ...BASE, tradingDaysPerWeek: 0 }).trading_days_per_week).toBeDefined()
    expect(validateSimInput({ ...BASE, tradingDaysPerWeek: 8 }).trading_days_per_week).toBeDefined()
  })
  it('ldw > tdw', () => {
    expect(validateSimInput({ ...BASE, lossDaysPerWeek: 6, tradingDaysPerWeek: 5 }).loss_days_per_week).toBeDefined()
  })
  it('avgLoss négatif', () => {
    expect(validateSimInput({ ...BASE, avgLossPerRedDay: -50 }).avg_loss).toBeDefined()
  })
})

// ─── simulate ─────────────────────────────────────────────────────────────

describe('simulate — cas simple', () => {
  it('10k en 20 jours sans jours rouges → 500 €/jour', () => {
    const r = simulate({ ...BASE, lossDaysPerWeek: 0, avgLossPerRedDay: 0 })
    expect(r.totalProfitNeeded).toBe(10_000)
    expect(r.requiredDailyAvg).toBe(500)
    expect(r.requiredPerGreenDay).toBe(500) // tous les jours sont verts
    expect(r.totalWeeks).toBe(4)
    expect(r.feasible).toBe('ok')
  })

  it('10k en 20 jours avec 1 rouge/sem à 150 € → requiredPerGreenDay > 500', () => {
    const r = simulate(BASE)
    // 20 jours → 4 jours rouges (20/5 = 4 semaines × 1 rouge), 16 verts
    // Pertes totales attendues = 4 × 150 = 600 €
    // Besoin par jour vert = (10 000 + 600) / 16 = 662,5 €
    expect(r.requiredPerGreenDay).toBe(662.5)
    expect(r.feasible).toBe('ok')
  })

  it('objectif impossible (seuil 5 % du capital par jour vert) → unrealistic', () => {
    const r = simulate({
      startingCapital: 10_000,  // petit capital
      targetCapital: 20_000,    // double en 20 jours
      horizonDays: 20,
      tradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      avgLossPerRedDay: 200,
    })
    // requiredPerGreenDay = (10 000 + 4×200) / 16 = 675 €/jour vert sur 10 000 €
    // = 6,75 % → unrealistic
    expect(r.feasible).toBe('unrealistic')
  })
})

describe('simulate — projection hebdo', () => {
  it('4 semaines complètes à 5 jours tradés', () => {
    const r = simulate(BASE)
    expect(r.weeklyProjection).toHaveLength(4)
    expect(r.weeklyProjection[0].tradingDays).toBe(5)
    expect(r.weeklyProjection[0].redDays).toBe(1)
    expect(r.weeklyProjection[0].greenDays).toBe(4)
    // Balance finale ≈ capital + totalProfitNeeded
    const last = r.weeklyProjection[r.weeklyProjection.length - 1]
    expect(Math.abs(last.balance - 110_000)).toBeLessThan(1)
  })

  it('horizon non-multiple : dernière semaine partielle', () => {
    const r = simulate({ ...BASE, horizonDays: 12 })
    // 12 jours = 2 semaines complètes + 2 jours
    expect(r.totalWeeks).toBe(3)
    expect(r.weeklyProjection[2].tradingDays).toBe(2)
  })
})

describe('simulate — pas de jours verts (impossible)', () => {
  it('tdw=5, ldw=5 → requiredPerGreenDay = null', () => {
    const r = simulate({ ...BASE, lossDaysPerWeek: 5 })
    expect(r.requiredPerGreenDay).toBeNull()
    expect(r.feasible).toBe('unrealistic')
  })
})

describe('simulate — garde-fous', () => {
  it('horizon arrondi au plancher 1', () => {
    const r = simulate({ ...BASE, horizonDays: 0.5 })
    expect(r.totalWeeks).toBe(1)
  })
  it('tdw clampé à [1..7]', () => {
    const r = simulate({ ...BASE, tradingDaysPerWeek: 10 })
    expect(r.weeklyProjection[0].tradingDays).toBeLessThanOrEqual(7)
  })
})

// ─── Format + maps ────────────────────────────────────────────────────────

describe('formatSimEur', () => {
  it('positif avec +', () => { expect(formatSimEur(1500)).toContain('+1') })
  it('négatif avec -', () => { expect(formatSimEur(-500).startsWith('-')).toBe(true) })
  it('NaN → "—"', () => { expect(formatSimEur(NaN)).toBe('—') })
})

describe('FEASIBILITY_LABEL / COLOR', () => {
  it('toutes les clés', () => {
    expect(FEASIBILITY_LABEL.ok).toBeDefined()
    expect(FEASIBILITY_LABEL.ambitious).toBeDefined()
    expect(FEASIBILITY_LABEL.unrealistic).toBeDefined()
    expect(FEASIBILITY_COLOR.ok).toBeDefined()
    expect(FEASIBILITY_COLOR.ambitious).toBeDefined()
    expect(FEASIBILITY_COLOR.unrealistic).toBeDefined()
  })
})
