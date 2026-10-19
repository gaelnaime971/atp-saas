import { describe, it, expect } from 'vitest'
import {
  advanceJokerState,
  getCurrentJokerContext,
  READY_MESSAGE,
  type JokerContext,
  type JokerStep,
} from './joker'

function ctx(step: JokerStep, sinceAgoMinutes = 0): JokerContext {
  const since = new Date(Date.now() - sinceAgoMinutes * 60_000).toISOString()
  return step === 'inactive' ? { step } : { step, since }
}

describe('joker — armement', () => {
  it('"cas Joker" → armed depuis inactive', () => {
    const r = advanceJokerState(ctx('inactive'), 'C\'est un cas Joker')
    expect(r.next).toBe('armed')
  })
  it('"mode Joker" → armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'mode joker')
    expect(r.next).toBe('armed')
  })
  it('"flux baissier sur mon support" → armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'Flux baissier mais je suis sur mon support')
    expect(r.next).toBe('armed')
  })
  it('"flux haussier sur ma résistance" → armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'Flux haussier sur ma résistance H4')
    expect(r.next).toBe('armed')
  })
  it('"flux baissier sur mon order block" → armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'flux baissier sur mon order block M15')
    expect(r.next).toBe('armed')
  })
  it('"flux haussier sur ma FVG" → armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'flux haussier sur ma FVG')
    expect(r.next).toBe('armed')
  })
  it('phrase neutre → reste inactive', () => {
    const r = advanceJokerState(ctx('inactive'), 'je vise 2R aujourd\'hui')
    expect(r.next).toBe('inactive')
  })
  it('"flux baissier" seul (sans zone) → PAS armed', () => {
    const r = advanceJokerState(ctx('inactive'), 'le flux est baissier aujourd\'hui')
    expect(r.next).toBe('inactive')
  })
})

describe('joker — avancée (ordre strict + confirmations)', () => {
  it('armed + "CHoCH M1 validé" → choch_m1', () => {
    const r = advanceJokerState(ctx('armed'), 'CHoCH M1 validé')
    expect(r.next).toBe('choch_m1')
  })
  it('armed + "choche m1 j\'ai vu" → choch_m1 (transcription approximative)', () => {
    const r = advanceJokerState(ctx('armed'), 'choche m1 j\'ai vu la cassure')
    expect(r.next).toBe('choch_m1')
  })
  it('armed + "choc une minute confirmé" → choch_m1', () => {
    const r = advanceJokerState(ctx('armed'), 'Choc une minute confirmé')
    expect(r.next).toBe('choch_m1')
  })
  it('armed + "chock M1 cassé" → choch_m1', () => {
    const r = advanceJokerState(ctx('armed'), 'chock M1 cassé')
    expect(r.next).toBe('choch_m1')
  })
  it('armed + "CHoCH M5" (hors ordre) → reste armed, outOfOrder', () => {
    const r = advanceJokerState(ctx('armed'), 'CHoCH M5 validé')
    expect(r.next).toBe('armed')
    expect(r.outOfOrder).toBe(true)
  })
  it('choch_m1 + "CHoCH M5 validé" → choch_m5', () => {
    const r = advanceJokerState(ctx('choch_m1'), 'CHoCH M5 validé')
    expect(r.next).toBe('choch_m5')
  })
  it('choch_m1 + "cinq minutes confirmé" → choch_m5', () => {
    const r = advanceJokerState(ctx('choch_m1'), 'choche cinq minutes confirmé')
    expect(r.next).toBe('choch_m5')
  })
})

describe('joker — ready', () => {
  it('choch_m5 + "retracement sur OB avec hammer" → ready + annonce', () => {
    const r = advanceJokerState(ctx('choch_m5'), 'retracement sur mon OB avec un hammer')
    expect(r.next).toBe('ready')
    expect(r.reachedReady).toBe(true)
  })
  it('choch_m5 + "retracement validé" seul → ready (retracement+signal implicite)', () => {
    const r = advanceJokerState(ctx('choch_m5'), 'retracement validé')
    expect(r.next).toBe('ready')
    expect(r.reachedReady).toBe(true)
  })
  it('READY_MESSAGE est le libellé officiel mot pour mot', () => {
    expect(READY_MESSAGE).toBe("Ta checklist Joker est complète. C'est toi qui cliques, et toi seul qui décides.")
  })
  it('choch_m5 + "hammer" seul (sans mention zone) → reste choch_m5', () => {
    const r = advanceJokerState(ctx('choch_m5'), 'je vois un hammer')
    expect(r.next).toBe('choch_m5')
  })
})

describe('joker — annulation + timeout', () => {
  it('"annule le joker" depuis n\'importe quel état → inactive', () => {
    for (const s of ['armed', 'choch_m1', 'choch_m5', 'ready'] as JokerStep[]) {
      const r = advanceJokerState(ctx(s), 'annule le joker')
      expect(r.next).toBe('inactive')
      expect(r.cancelled).toBe(true)
    }
  })
  it('"finalement je ne le prends pas" → inactive', () => {
    const r = advanceJokerState(ctx('choch_m5'), 'finalement je ne le prends pas')
    expect(r.next).toBe('inactive')
    expect(r.cancelled).toBe(true)
  })
  it('timeout 30 min → inactive', () => {
    const r = advanceJokerState(ctx('choch_m1', 31), 'je regarde encore')
    expect(r.next).toBe('inactive')
    expect(r.timedOut).toBe(true)
  })
  it('pas de timeout avant 30 min', () => {
    const r = advanceJokerState(ctx('choch_m1', 29), 'je regarde encore')
    expect(r.next).toBe('choch_m1')
    expect(r.timedOut).toBeUndefined()
  })
})

describe('joker — getCurrentJokerContext', () => {
  it('aucun event → inactive', () => {
    expect(getCurrentJokerContext([])).toEqual({ step: 'inactive' })
  })
  it('dernier joker_state récent → ses attributs', () => {
    const now = new Date('2026-10-20T14:00:00Z')
    const events = [{
      type: 'joker_state',
      payload: { step: 'choch_m1' as JokerStep },
      created_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
    }]
    const r = getCurrentJokerContext(events, now)
    expect(r.step).toBe('choch_m1')
    expect(r.since).toBeTruthy()
  })
  it('dernier joker_state trop ancien (> 30 min) → inactive', () => {
    const now = new Date('2026-10-20T14:00:00Z')
    const events = [{
      type: 'joker_state',
      payload: { step: 'armed' as JokerStep },
      created_at: new Date(now.getTime() - 31 * 60_000).toISOString(),
    }]
    expect(getCurrentJokerContext(events, now)).toEqual({ step: 'inactive' })
  })
  it('ignore les events non-joker', () => {
    const events = [
      { type: 'trade' as const, payload: { result_r: 1 }, created_at: new Date().toISOString() },
    ]
    expect(getCurrentJokerContext(events)).toEqual({ step: 'inactive' })
  })
})
