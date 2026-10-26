import { describe, it, expect } from 'vitest'
import {
  validatePromote, validateScaleUp, validateReset, validateClose, isValid,
  buildPromoteMutation, buildScaleUpMutation, buildResetMutation, buildCloseMutation,
  describeEvent, formatEur,
  type AccountSnapshot, type PromoteDraft, type ScaleUpDraft, type ResetDraft, type CloseDraft,
  type AccountEvent,
} from './events'

const SNAP: AccountSnapshot = {
  id: 'a1', label: 'FTMO 100k #1', propfirm: 'FTMO',
  account_size: 100_000,
  starting_balance: 100_000,
  current_balance: 108_000,
  phase: 'p2', status: 'passed',
  max_total_dd_pct: 10,
  payout_split_pct: null,
  trailing_dd: false,
}

// ─── validatePromote ───────────────────────────────────────────────────────

describe('validatePromote', () => {
  const base: PromoteDraft = {
    new_starting_balance: 100_000,
    payout_split_pct: 80,
    max_total_dd_pct: 10,
    trailing_dd: false,
    notes: '',
    event_date: '2026-10-26',
  }
  it('OK → aucune erreur', () => {
    expect(isValid(validatePromote(base))).toBe(true)
  })
  it('solde départ ≤ 0 → erreur', () => {
    expect(validatePromote({ ...base, new_starting_balance: 0 }).new_starting_balance).toBeDefined()
  })
  it('payout_split hors 1..100 → erreur', () => {
    expect(validatePromote({ ...base, payout_split_pct: 0 }).payout_split_pct).toBeDefined()
    expect(validatePromote({ ...base, payout_split_pct: 150 }).payout_split_pct).toBeDefined()
    expect(validatePromote({ ...base, payout_split_pct: 100 }).payout_split_pct).toBeUndefined()
  })
  it('max_total_dd_pct hors 0..100 → erreur', () => {
    expect(validatePromote({ ...base, max_total_dd_pct: 101 }).max_total_dd_pct).toBeDefined()
    expect(validatePromote({ ...base, max_total_dd_pct: null }).max_total_dd_pct).toBeUndefined()
  })
  it('date vide → erreur', () => {
    expect(validatePromote({ ...base, event_date: '' }).event_date).toBeDefined()
  })
})

// ─── validateScaleUp ───────────────────────────────────────────────────────

describe('validateScaleUp', () => {
  const base: ScaleUpDraft = {
    new_account_size: 200_000,
    new_starting_balance: 200_000,
    notes: '',
    event_date: '2026-10-26',
  }
  it('OK si taille strictement > ancienne', () => {
    expect(isValid(validateScaleUp(base, 100_000))).toBe(true)
  })
  it('taille identique → erreur', () => {
    expect(validateScaleUp({ ...base, new_account_size: 100_000 }, 100_000).new_account_size).toBeDefined()
  })
  it('taille < ancienne → erreur', () => {
    expect(validateScaleUp({ ...base, new_account_size: 50_000 }, 100_000).new_account_size).toContain('100')
  })
})

// ─── validateReset ─────────────────────────────────────────────────────────

describe('validateReset', () => {
  const base: ResetDraft = {
    cost_eur: 100,
    new_starting_balance: 100_000,
    notes: '',
    event_date: '2026-10-26',
  }
  it('OK', () => { expect(isValid(validateReset(base))).toBe(true) })
  it('cost négatif → erreur', () => {
    expect(validateReset({ ...base, cost_eur: -10 }).cost_eur).toBeDefined()
  })
  it('cost = 0 → OK (reset gratuit)', () => {
    expect(validateReset({ ...base, cost_eur: 0 }).cost_eur).toBeUndefined()
  })
})

// ─── validateClose ─────────────────────────────────────────────────────────

describe('validateClose', () => {
  it('raison connue → OK', () => {
    const d: CloseDraft = { reason: 'profit_withdrawn', notes: '', event_date: '2026-10-26' }
    expect(isValid(validateClose(d))).toBe(true)
  })
  it('raison inconnue → erreur', () => {
    const d = { reason: 'autre_truc' as unknown as CloseDraft['reason'], notes: '', event_date: '2026-10-26' }
    expect(validateClose(d).reason).toBeDefined()
  })
})

// ─── buildPromoteMutation ──────────────────────────────────────────────────

describe('buildPromoteMutation', () => {
  it('patch : phase=funded, status=active, soldes resetés aux nouveaux', () => {
    const d: PromoteDraft = {
      new_starting_balance: 100_000,
      payout_split_pct: 80,
      max_total_dd_pct: 10,
      trailing_dd: true,
      notes: 'nouveau funded',
      event_date: '2026-10-26',
    }
    const b = buildPromoteMutation(SNAP, d)
    expect(b.patch.phase).toBe('funded')
    expect(b.patch.status).toBe('active')
    expect(b.patch.starting_balance).toBe(100_000)
    expect(b.patch.current_balance).toBe(100_000)
    expect(b.patch.payout_split_pct).toBe(80)
    expect(b.patch.trailing_dd).toBe(true)
    expect(b.event.kind).toBe('funded_start')
    expect(b.event.notes).toBe('nouveau funded')
    expect(b.event.payload.prev_phase).toBe('p2')
  })
})

// ─── buildScaleUpMutation ──────────────────────────────────────────────────

describe('buildScaleUpMutation', () => {
  it('patch : nouvelle taille + solde reseté', () => {
    const d: ScaleUpDraft = {
      new_account_size: 200_000, new_starting_balance: 200_000,
      notes: '', event_date: '2026-10-26',
    }
    const b = buildScaleUpMutation(SNAP, d)
    expect(b.patch.account_size).toBe(200_000)
    expect(b.patch.starting_balance).toBe(200_000)
    expect(b.patch.current_balance).toBe(200_000)
    expect(b.event.kind).toBe('scale_up')
    expect(b.event.payload.prev_size).toBe(100_000)
    expect(b.event.payload.new_size).toBe(200_000)
  })
})

// ─── buildResetMutation ────────────────────────────────────────────────────

describe('buildResetMutation', () => {
  it('patch : solde reseté, status=active', () => {
    const d: ResetDraft = {
      cost_eur: 150, new_starting_balance: 100_000,
      notes: 'reset FTMO', event_date: '2026-10-26',
    }
    const b = buildResetMutation(SNAP, d)
    expect(b.patch.starting_balance).toBe(100_000)
    expect(b.patch.current_balance).toBe(100_000)
    expect(b.patch.status).toBe('active')
    expect(b.event.kind).toBe('reset')
    expect(b.event.payload.cost_eur).toBe(150)
  })
})

// ─── buildCloseMutation ────────────────────────────────────────────────────

describe('buildCloseMutation', () => {
  it('profit_withdrawn → status=passed, event=closed', () => {
    const d: CloseDraft = { reason: 'profit_withdrawn', notes: '', event_date: '2026-10-26' }
    const b = buildCloseMutation(SNAP, d)
    expect(b.patch.status).toBe('passed')
    expect(b.event.kind).toBe('closed')
  })
  it('rule_breach → status=failed + phase=failed, event=rule_breach', () => {
    const d: CloseDraft = { reason: 'rule_breach', notes: '', event_date: '2026-10-26' }
    const b = buildCloseMutation(SNAP, d)
    expect(b.patch.status).toBe('failed')
    expect(b.patch.phase).toBe('failed')
    expect(b.event.kind).toBe('rule_breach')
  })
  it('scaled_elsewhere → status=passed, phase inchangé', () => {
    const d: CloseDraft = { reason: 'scaled_elsewhere', notes: '', event_date: '2026-10-26' }
    const b = buildCloseMutation(SNAP, d)
    expect(b.patch.status).toBe('passed')
    expect(b.patch.phase).toBe(SNAP.phase)
  })
})

// ─── describeEvent ─────────────────────────────────────────────────────────

function evt(kind: AccountEvent['kind'], payload: Record<string, unknown> = {}): AccountEvent {
  return {
    id: 'e', account_id: 'a', kind, event_date: '2026-10-26',
    payload, notes: null, created_at: '2026-10-26T12:00:00Z',
  }
}

describe('describeEvent', () => {
  it('funded_start avec balance', () => {
    expect(describeEvent(evt('funded_start', { new_balance: 100_000 }))).toContain('100')
  })
  it('scale_up prev → new', () => {
    expect(describeEvent(evt('scale_up', { prev_size: 100_000, new_size: 200_000 }))).toContain('→')
  })
  it('reset payant vs gratuit', () => {
    expect(describeEvent(evt('reset', { cost_eur: 150 }))).toContain('payant')
    expect(describeEvent(evt('reset', { cost_eur: 0 }))).toContain('gratuit')
  })
  it('closed selon raison', () => {
    expect(describeEvent(evt('closed', { reason: 'profit_withdrawn' }))).toContain('profit')
    expect(describeEvent(evt('closed', { reason: 'scaled_elsewhere' }))).toContain('scale')
  })
  it('rule_breach', () => {
    expect(describeEvent(evt('rule_breach'))).toContain('cassé')
  })
})

// ─── formatEur ─────────────────────────────────────────────────────────────

describe('formatEur', () => {
  it('100000 → "100 000 €"', () => {
    const s = formatEur(100_000)
    // Insensible à l'espace insécable utilisé par Intl : contient 100 et 000
    expect(s).toContain('100')
    expect(s).toContain('000')
    expect(s.endsWith('€')).toBe(true)
  })
  it('NaN → "—"', () => { expect(formatEur(NaN)).toBe('—') })
})
