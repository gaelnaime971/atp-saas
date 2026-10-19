import { describe, it, expect } from 'vitest'
import { detectTradeEvent } from './event-detection'

function expectTrade(res: ReturnType<typeof detectTradeEvent>) {
  if (res.kind !== 'trade') throw new Error(`Expected trade, got ${res.kind}`)
  return res.trade
}

describe('event-detection — TRADES (chiffré, sans ambiguïté)', () => {
  it('"+9R" → +9 R', () => {
    const t = expectTrade(detectTradeEvent('+9R'))
    expect(t.result_r).toBe(9)
    expect(t.result_usd).toBeNull()
  })

  it('"plus 2 R sur le NQ" → +2 R, NQ', () => {
    const t = expectTrade(detectTradeEvent('plus 2 R sur le NQ'))
    expect(t.result_r).toBe(2)
    expect(t.instrument).toBe('NQ')
  })

  it('"moins un R" → -1 R', () => {
    const t = expectTrade(detectTradeEvent('moins un R'))
    expect(t.result_r).toBe(-1)
  })

  it('"-0,5R en short sur l\'ES" → -0,5 R, ES, short', () => {
    const t = expectTrade(detectTradeEvent("-0,5R en short sur l'ES"))
    expect(t.result_r).toBe(-0.5)
    expect(t.instrument).toBe('ES')
    expect(t.side).toBe('short')
  })

  it('"je me suis fait stopper" → -1 R', () => {
    const t = expectTrade(detectTradeEvent('je me suis fait stopper'))
    expect(t.result_r).toBe(-1)
  })

  it('"stoppé mais financé" → 0 R (BE)', () => {
    const t = expectTrade(detectTradeEvent('stoppé mais financé'))
    expect(t.result_r).toBe(0)
  })

  it('"sorti à BE" → 0 R', () => {
    const t = expectTrade(detectTradeEvent('sorti à BE'))
    expect(t.result_r).toBe(0)
  })

  it('"TP touché à 2R" → +2 R', () => {
    const t = expectTrade(detectTradeEvent('TP touché à 2R'))
    expect(t.result_r).toBe(2)
  })

  it('"j\'ai pris 450 dollars" → +450 $', () => {
    const t = expectTrade(detectTradeEvent("j'ai pris 450 dollars"))
    expect(t.result_r).toBeNull()
    expect(t.result_usd).toBe(450)
  })

  it('"perdu 120 $ sur le Dow" → -120 $, YM', () => {
    const t = expectTrade(detectTradeEvent('perdu 120 $ sur le Dow'))
    expect(t.result_r).toBeNull()
    expect(t.result_usd).toBe(-120)
    expect(t.instrument).toBe('YM')
  })

  it('"sorti à +1,5R" → +1,5 R', () => {
    const t = expectTrade(detectTradeEvent('sorti à +1,5R'))
    expect(t.result_r).toBe(1.5)
  })
})

describe('event-detection — PAS UN TRADE (intention / question / paramètre)', () => {
  const notATrade = [
    'je vise 2R aujourd\'hui',
    'objectif +2R',
    'demain je double ma taille',
    'si je prends 2R je m\'arrête ?',
    "c'est quoi le ratio minimum, 2R ?",
    'je risque 100 $ par trade',
  ]
  for (const phrase of notATrade) {
    it(`"${phrase}" → none`, () => {
      const res = detectTradeEvent(phrase)
      expect(res.kind).toBe('none')
    })
  }
})

describe('event-detection — FLOU (demande au trader)', () => {
  const ambiguous = [
    'TP touché',
    "j'ai gagné",
    'trade fini',
  ]
  for (const phrase of ambiguous) {
    it(`"${phrase}" → ambiguous`, () => {
      const res = detectTradeEvent(phrase)
      expect(res.kind).toBe('ambiguous')
    })
  }
})

describe('event-detection — détection de config', () => {
  it('"-1R sur mon order block M15" → config = "order block m15"', () => {
    const t = expectTrade(detectTradeEvent('-1R sur mon order block M15'))
    expect(t.result_r).toBe(-1)
    expect(t.config).toContain('order block')
  })

  it('"+2R sur l\'OB" → config détectée', () => {
    const t = expectTrade(detectTradeEvent("+2R sur l'OB"))
    expect(t.config).toBeTruthy()
  })
})
