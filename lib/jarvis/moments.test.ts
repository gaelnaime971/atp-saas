import { describe, it, expect } from 'vitest'
import {
  pickMoment, stopTitleFor, computeTradeAngle, ORBIT_FULL_MS,
  type MomentInput,
} from './moments'
import type { RuleKey } from './rules-engine'

function input(overrides: Partial<MomentInput> = {}): MomentInput {
  return {
    casquette: 'TRADER',
    minutesToOpen: null,
    jokerStep: 'inactive',
    announced: [],
    tradesCount: 0,
    ...overrides,
  }
}

describe('pickMoment — priorité', () => {
  it('tout vide → none', () => {
    expect(pickMoment(input())).toBe('none')
  })

  it('Joker actif > tout le reste (jamais de carte moment)', () => {
    expect(pickMoment(input({ jokerStep: 'armed', announced: ['three_losses'] }))).toBe('none')
    expect(pickMoment(input({ jokerStep: 'ready', announced: ['target_reached'] }))).toBe('none')
    expect(pickMoment(input({ jokerStep: 'choch_m1', minutesToOpen: 20 }))).toBe('none')
  })

  it('stop du jour > mission accomplie', () => {
    expect(pickMoment(input({ announced: ['target_reached', 'max_trades'] }))).toBe('stop')
    expect(pickMoment(input({ announced: ['first_win', 'three_losses'] }))).toBe('stop')
    expect(pickMoment(input({ announced: ['loss_then_win', 'same_config_hard_stop'] }))).toBe('stop')
    expect(pickMoment(input({ announced: ['target_reached', 'trade_after_stop'] }))).toBe('stop')
  })

  it('mission > avant l\'Open', () => {
    expect(pickMoment(input({ announced: ['target_reached'], minutesToOpen: 20 }))).toBe('mission')
    expect(pickMoment(input({ announced: ['first_win'], minutesToOpen: 10 }))).toBe('mission')
    expect(pickMoment(input({ announced: ['loss_then_win'], minutesToOpen: 5 }))).toBe('mission')
  })

  it('avant l\'Open > session', () => {
    expect(pickMoment(input({ minutesToOpen: 30, tradesCount: 2 }))).toBe('avant_open')
    expect(pickMoment(input({ minutesToOpen: 1, tradesCount: 1 }))).toBe('avant_open')
  })

  it('avant l\'Open borné à T-45 → T-0', () => {
    expect(pickMoment(input({ minutesToOpen: 45 }))).toBe('avant_open')
    expect(pickMoment(input({ minutesToOpen: 46 }))).toBe('none')
    expect(pickMoment(input({ minutesToOpen: 0 }))).toBe('none')
    expect(pickMoment(input({ minutesToOpen: -1 }))).toBe('none')
  })

  it('session dès 1 trade', () => {
    expect(pickMoment(input({ tradesCount: 1 }))).toBe('session')
    expect(pickMoment(input({ tradesCount: 5 }))).toBe('session')
  })

  it('casquette marché-fermé → none par défaut', () => {
    expect(pickMoment(input({ casquette: 'marché-fermé' }))).toBe('none')
  })

  it('stop reste tant que announced le dit (reconcilié côté serveur)', () => {
    // Si la correction d'un trade enlève le trigger côté serveur,
    // announced ne contient plus la clé → plus de stop.
    expect(pickMoment(input({ announced: ['three_losses'], tradesCount: 3 }))).toBe('stop')
    expect(pickMoment(input({ announced: [], tradesCount: 3 }))).toBe('session')
  })
})

describe('stopTitleFor', () => {
  it('same_config_hard_stop → "Frein à main"', () => {
    expect(stopTitleFor(['same_config_hard_stop'])).toBe('Frein à main')
    expect(stopTitleFor(['same_config_hard_stop', 'three_losses'])).toBe('Frein à main')
  })
  it('autres stops → "Stop du jour"', () => {
    expect(stopTitleFor(['three_losses'])).toBe('Stop du jour')
    expect(stopTitleFor(['max_trades'])).toBe('Stop du jour')
    expect(stopTitleFor(['trade_after_stop'])).toBe('Stop du jour')
  })
})

describe('computeTradeAngle — orbite 2h', () => {
  const open = new Date('2026-10-21T13:30:00Z') // Open NY 9:30 ET

  it('exactement à l\'Open → 0°', () => {
    expect(computeTradeAngle(open, open)).toBe(0)
  })

  it('+6 min → 18°', () => {
    const t = new Date(open.getTime() + 6 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(18)
  })

  it('+24 min → 72°', () => {
    const t = new Date(open.getTime() + 24 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(72)
  })

  it('+60 min → 180°', () => {
    const t = new Date(open.getTime() + 60 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(180)
  })

  it('+1h30 → 270°', () => {
    const t = new Date(open.getTime() + 90 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(270)
  })

  it('+2h → 360° (butée)', () => {
    const t = new Date(open.getTime() + ORBIT_FULL_MS)
    expect(computeTradeAngle(t, open)).toBe(360)
  })

  it('au-delà de 2h → reste à 360°', () => {
    const t = new Date(open.getTime() + ORBIT_FULL_MS + 5 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(360)
    const way = new Date(open.getTime() + 10 * 3600_000)
    expect(computeTradeAngle(way, open)).toBe(360)
  })

  it('avant l\'Open → 0°', () => {
    const t = new Date(open.getTime() - 10 * 60_000)
    expect(computeTradeAngle(t, open)).toBe(0)
  })

  it('accepte strings ISO', () => {
    expect(computeTradeAngle('2026-10-21T13:36:00Z', '2026-10-21T13:30:00Z')).toBe(18)
  })

  it('dates invalides → 0°', () => {
    expect(computeTradeAngle(new Date('invalid'), open)).toBe(0)
    expect(computeTradeAngle(open, new Date('invalid'))).toBe(0)
  })
})
