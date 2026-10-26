import { describe, it, expect } from 'vitest'
import {
  validateGoalDraft, isValidGoal, computeGoalProgress,
  formatProgressEur, STATUS_COLOR, BASIS_LABEL,
  type GoalDraft, type GoalInput,
} from './goal'

// ─── validateGoalDraft ─────────────────────────────────────────────────────

describe('validateGoalDraft', () => {
  const base: GoalDraft = {
    amount_eur: 5000, basis: 'since_last_payout', deadline: '', notes: '',
  }
  it('OK → aucune erreur', () => {
    expect(isValidGoal(validateGoalDraft(base))).toBe(true)
  })
  it('montant ≤ 0 → erreur', () => {
    expect(validateGoalDraft({ ...base, amount_eur: 0 }).amount_eur).toBeDefined()
    expect(validateGoalDraft({ ...base, amount_eur: -100 }).amount_eur).toBeDefined()
  })
  it('base invalide → erreur', () => {
    const bad = { ...base, basis: 'autre_truc' as unknown as GoalDraft['basis'] }
    expect(validateGoalDraft(bad).basis).toBeDefined()
  })
  it('deadline vide → OK', () => {
    expect(validateGoalDraft({ ...base, deadline: '' }).deadline).toBeUndefined()
  })
  it('deadline invalide → erreur', () => {
    expect(validateGoalDraft({ ...base, deadline: '2026-99-99' }).deadline).toBeDefined()
  })
  it('deadline valide → OK', () => {
    expect(validateGoalDraft({ ...base, deadline: '2026-12-31' }).deadline).toBeUndefined()
  })
})

// ─── computeGoalProgress ───────────────────────────────────────────────────

function mk(partial: Partial<GoalInput> = {}): GoalInput {
  return {
    goal: null,
    starting_balance: 100_000,
    current_balance: 105_000,
    pnls: [],
    lastPayoutDate: null,
    todayISO: '2026-10-26',
    ...partial,
  }
}

describe('computeGoalProgress — pas d\'objectif', () => {
  it('goal null → status "none"', () => {
    const r = computeGoalProgress(mk({ goal: null }))
    expect(r.status).toBe('none')
    expect(r.pct).toBe(0)
  })
})

describe('computeGoalProgress — basis "since_start"', () => {
  it('current = current_balance - starting_balance', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 10_000, basis: 'since_start', deadline: null, notes: null },
      starting_balance: 100_000, current_balance: 105_000,
    }))
    expect(r.current).toBe(5000)
    expect(r.target).toBe(10_000)
    expect(r.pct).toBe(50)
    expect(r.remaining).toBe(5000)
    expect(r.status).toBe('on_track')
  })
  it('objectif atteint → done', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 5000, basis: 'since_start', deadline: null, notes: null },
      starting_balance: 100_000, current_balance: 108_000,
    }))
    expect(r.status).toBe('done')
    expect(r.pct).toBe(160)
    expect(r.remaining).toBe(0)
  })
})

describe('computeGoalProgress — basis "since_last_payout"', () => {
  it('sans payout → tombe sur since_start', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 10_000, basis: 'since_last_payout', deadline: null, notes: null },
      starting_balance: 100_000, current_balance: 104_000,
      lastPayoutDate: null,
    }))
    expect(r.current).toBe(4000)
  })
  it('avec payout → somme des pnl après la date du dernier payout', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 5000, basis: 'since_last_payout', deadline: null, notes: null },
      lastPayoutDate: '2026-10-10',
      pnls: [
        { date: '2026-10-05', pnl: 1000 },   // AVANT payout → ignoré
        { date: '2026-10-10', pnl: 500 },    // JOUR payout → ignoré (>)
        { date: '2026-10-11', pnl: 2000 },   // compte
        { date: '2026-10-15', pnl: -500 },   // compte (perte)
        { date: '2026-10-20', pnl: 1500 },   // compte
      ],
    }))
    expect(r.current).toBe(3000) // 2000 - 500 + 1500
    expect(r.pct).toBe(60)
    expect(r.remaining).toBe(2000)
  })
})

describe('computeGoalProgress — deadline', () => {
  it('deadline dans 15j → on_track', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 10_000, basis: 'since_start', deadline: '2026-11-10', notes: null },
      todayISO: '2026-10-26',
      current_balance: 103_000, starting_balance: 100_000,
    }))
    expect(r.daysLeft).toBe(15)
    expect(r.status).toBe('on_track')
  })
  it('deadline dans 5j → urgent', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 10_000, basis: 'since_start', deadline: '2026-10-31', notes: null },
      todayISO: '2026-10-26',
      current_balance: 103_000, starting_balance: 100_000,
    }))
    expect(r.daysLeft).toBe(5)
    expect(r.status).toBe('urgent')
  })
  it('deadline dépassée → late', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 10_000, basis: 'since_start', deadline: '2026-10-20', notes: null },
      todayISO: '2026-10-26',
      current_balance: 103_000, starting_balance: 100_000,
    }))
    expect(r.daysLeft).toBe(-6)
    expect(r.status).toBe('late')
  })
  it('objectif atteint prime sur deadline dépassée', () => {
    const r = computeGoalProgress(mk({
      goal: { amount_eur: 5000, basis: 'since_start', deadline: '2026-10-20', notes: null },
      todayISO: '2026-10-26',
      current_balance: 108_000, starting_balance: 100_000,
    }))
    expect(r.status).toBe('done')
  })
})

// ─── Format + maps ─────────────────────────────────────────────────────────

describe('formatProgressEur', () => {
  it('positif avec signe +', () => { expect(formatProgressEur(1500)).toContain('+1') })
  it('zéro sans signe', () => { expect(formatProgressEur(0).startsWith('0')).toBe(true) })
  it('négatif avec -', () => { expect(formatProgressEur(-500).startsWith('-')).toBe(true) })
  it('NaN → "—"', () => { expect(formatProgressEur(NaN)).toBe('—') })
})

describe('BASIS_LABEL / STATUS_COLOR', () => {
  it('toutes les clés présentes', () => {
    expect(BASIS_LABEL.since_last_payout).toContain('payout')
    expect(BASIS_LABEL.since_start).toContain('début')
    expect(STATUS_COLOR.done).toBeDefined()
    expect(STATUS_COLOR.late).toBeDefined()
    expect(STATUS_COLOR.urgent).toBeDefined()
    expect(STATUS_COLOR.on_track).toBeDefined()
  })
})
