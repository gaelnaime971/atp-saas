import { describe, it, expect } from 'vitest'
import {
  computeSessionState,
  evaluateRules,
  wasAlreadyAnnounced,
  DEFAULT_RULES,
  RULE_MESSAGES,
  type TradeEvent,
  type TraderRules,
} from './rules-engine'

// ─── Helpers ────────────────────────────────────────────────────────
let seq = 0
function trade(partial: Partial<TradeEvent> & Pick<TradeEvent, 'result_r' | 'result_usd'>): TradeEvent {
  return {
    id: String(++seq),
    at: new Date(2026, 9, 19, 15, 30 + seq, 0), // ordre chronologique garanti
    config: null,
    pending: false,
    ...partial,
  } as TradeEvent
}
function keys(rules: ReturnType<typeof evaluateRules>): string[] {
  return rules.map(r => r.key).sort()
}

const RULES: TraderRules = DEFAULT_RULES

// ─── Scénarios ──────────────────────────────────────────────────────
describe('rules-engine — scénarios de base', () => {
  it('[G] 1er trade gagnant → first_win + max_trades=NO (1<3)', () => {
    const trades = [trade({ result_r: 1, result_usd: 200 })]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.tradesCount).toBe(1)
    expect(state.firstTradeWin).toBe(true)
    expect(state.rSum).toBe(1)
    expect(keys(r)).toEqual(['first_win'])
    expect(r[0].message).toBe(RULE_MESSAGES.first_win)
    expect(r[0].blocking).toBe(true)
  })

  it('[P, G] perdant puis gagnant → loss_then_win', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 1.5, result_usd: 300 }),
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.firstTradeWin).toBe(false)
    expect(state.lossThenWinSeen).toBe(true)
    expect(state.rSum).toBe(0.5)
    expect(keys(r)).toContain('loss_then_win')
    expect(keys(r)).not.toContain('first_win')
  })

  it('[P, P, P] 3 pertes consécutives → three_losses + max_trades', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: -0.5, result_usd: -100 }),
      trade({ result_r: -1, result_usd: -200 }),
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.consecutiveLosses).toBe(3)
    expect(state.rSum).toBe(-2.5)
    expect(keys(r)).toEqual(['max_trades', 'three_losses'])
  })

  it('[+9 R d\'un coup] → target_reached', () => {
    const trades = [trade({ result_r: 9, result_usd: 1800 })]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.rSum).toBe(9)
    expect(keys(r)).toContain('target_reached')
    // Le message interpole {R} : "Plus 9 R"
    const tr = r.find(x => x.key === 'target_reached')!
    expect(tr.message).toContain('Plus 9 R')
  })

  it('3 trades joués (quelconques) → max_trades annoncé avec {N}=3', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 0, result_usd: 0 }), // BE
      trade({ result_r: 0.3, result_usd: 60 }),
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.tradesCount).toBe(3)
    expect(keys(r)).toContain('max_trades')
    const mt = r.find(x => x.key === 'max_trades')!
    expect(mt.message).toContain('3 trades joués')
  })
})

describe('rules-engine — same_config_hard_stop', () => {
  it('[P OB, P OB] 2 échecs sur la MÊME config → frein à main', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200, config: 'OB M15' }),
      trade({ result_r: -1, result_usd: -200, config: 'OB M15' }),
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.sameConfigFails['ob m15']).toBe(2)
    expect(keys(r)).toContain('same_config_hard_stop')
    const sc = r.find(x => x.key === 'same_config_hard_stop')!
    expect(sc.config).toBe('ob m15')
  })

  it('[P OB, P FVG] 2 pertes mais sur configs DIFFÉRENTES → PAS de frein à main', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200, config: 'OB M15' }),
      trade({ result_r: -1, result_usd: -200, config: 'FVG H4' }),
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES)
    expect(state.sameConfigFails['ob m15']).toBe(1)
    expect(state.sameConfigFails['fvg h4']).toBe(1)
    expect(keys(r)).not.toContain('same_config_hard_stop')
  })
})

describe('rules-engine — break-even', () => {
  it('[P, BE, P] BE compte comme trade, pas une perte, mais ne RESET pas la série', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 0, result_usd: 0 }), // BE
      trade({ result_r: -1, result_usd: -200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.tradesCount).toBe(3)
    // 2 pertes malgré le BE au milieu : BE n'est pas une perte mais
    // ne reset pas la série.
    expect(state.consecutiveLosses).toBe(2)
    const r = evaluateRules(state, RULES)
    expect(keys(r)).not.toContain('three_losses')
    // max_trades OUI puisque 3 trades joués.
    expect(keys(r)).toContain('max_trades')
  })

  it('[P, P, BE, P] 3 pertes consécutives traversant un BE → three_losses', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 0, result_usd: 0 }), // BE
      trade({ result_r: -1, result_usd: -200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.consecutiveLosses).toBe(3)
    const r = evaluateRules(state, RULES)
    expect(keys(r)).toContain('three_losses')
  })

  it('[P, G, P] un gain reset la série de pertes', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 1, result_usd: 200 }),
      trade({ result_r: -1, result_usd: -200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.consecutiveLosses).toBe(1)
  })

  it('BE au début ne compte PAS comme first_win', () => {
    const trades = [
      trade({ result_r: 0, result_usd: 0 }),
      trade({ result_r: 1, result_usd: 200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.firstTradeWin).toBe(false)
    const r = evaluateRules(state, RULES)
    expect(keys(r)).not.toContain('first_win')
  })

  it('[P, BE, G] : séquence loss_then_win détectée malgré le BE au milieu', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200 }),
      trade({ result_r: 0, result_usd: 0 }),
      trade({ result_r: 1, result_usd: 200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.lossThenWinSeen).toBe(true)
  })
})

describe('rules-engine — trade en $ sans risk renseigné', () => {
  it('result_r=null + no risk_per_trade_usd → rSum=null, aucune règle R-dépendante', () => {
    const rulesNoRisk: TraderRules = { ...RULES, risk_per_trade_usd: 0 }
    const trades = [trade({ result_r: null, result_usd: 900 })]
    const state = computeSessionState(trades, rulesNoRisk)
    expect(state.tradesCount).toBe(1)
    expect(state.rSum).toBeNull()
    expect(state.usdSum).toBe(900)
    const r = evaluateRules(state, rulesNoRisk)
    // first_win se déclenche quand même (basé sur usd signé via classify)
    expect(keys(r)).toContain('first_win')
    // target_reached NE se déclenche pas (rSum null)
    expect(keys(r)).not.toContain('target_reached')
  })

  it('result_r=null + risk_per_trade_usd renseigné → rSum = usdSum / risk', () => {
    const rulesRisk: TraderRules = { ...RULES, risk_per_trade_usd: 200 }
    const trades = [trade({ result_r: null, result_usd: 400 })]
    const state = computeSessionState(trades, rulesRisk)
    expect(state.rSum).toBeCloseTo(2, 2)
    const r = evaluateRules(state, rulesRisk)
    expect(keys(r)).toContain('target_reached')
  })
})

describe('rules-engine — trade_after_stop', () => {
  it('Un trade post-stop déclenche trade_after_stop à chaque nouveau trade', () => {
    const trades = [
      trade({ result_r: 1, result_usd: 200 }), // first_win → stop annoncé
      trade({ result_r: -0.5, result_usd: -100 }), // trade après stop
    ]
    const state = computeSessionState(trades, RULES)
    const r = evaluateRules(state, RULES, /* priorStopAnnounced */ true)
    expect(keys(r)).toContain('trade_after_stop')
    expect(r.find(x => x.key === 'trade_after_stop')!.message).toBe(RULE_MESSAGES.trade_after_stop)
  })

  it('wasAlreadyAnnounced retourne TOUJOURS false pour trade_after_stop', () => {
    const r = { key: 'trade_after_stop' as const, message: '', blocking: true }
    expect(wasAlreadyAnnounced(r, [{ key: 'trade_after_stop' }])).toBe(false)
  })

  it('wasAlreadyAnnounced bloque first_win déjà annoncée', () => {
    const r = { key: 'first_win' as const, message: '', blocking: true }
    expect(wasAlreadyAnnounced(r, [{ key: 'first_win' }])).toBe(true)
    expect(wasAlreadyAnnounced(r, [{ key: 'max_trades' }])).toBe(false)
  })

  it('wasAlreadyAnnounced same_config_hard_stop est par config', () => {
    const r = { key: 'same_config_hard_stop' as const, message: '', blocking: true, config: 'ob m15' }
    expect(wasAlreadyAnnounced(r, [{ key: 'same_config_hard_stop', config: 'ob m15' }])).toBe(true)
    expect(wasAlreadyAnnounced(r, [{ key: 'same_config_hard_stop', config: 'fvg h4' }])).toBe(false)
  })
})

describe('rules-engine — pending ignoré', () => {
  it('Un trade pending=true n\'est PAS compté', () => {
    const trades = [
      trade({ result_r: -1, result_usd: -200, pending: true }),
      trade({ result_r: 1, result_usd: 200 }),
    ]
    const state = computeSessionState(trades, RULES)
    expect(state.tradesCount).toBe(1)
    expect(state.firstTradeWin).toBe(true) // le gain est premier car pending ignoré
  })
})
