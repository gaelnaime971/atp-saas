import { describe, it, expect } from 'vitest'
import { ACTIVE_STATUSES, isMembershipActive } from './status'

describe('ACTIVE_STATUSES — allowlist statuts donnant accès', () => {
  it('contient les 5 statuts actifs attendus, rien de plus', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(
      ['active', 'canceling', 'completed', 'past_due', 'trialing'],
    )
    expect(ACTIVE_STATUSES.size).toBe(5)
  })
})

describe('isMembershipActive — statuts actifs', () => {
  it.each(['active', 'trialing', 'completed', 'canceling', 'past_due'])(
    'statut "%s" → true', (s) => {
      expect(isMembershipActive(s)).toBe(true)
    },
  )

  it('insensible à la casse', () => {
    expect(isMembershipActive('ACTIVE')).toBe(true)
    expect(isMembershipActive('Trialing')).toBe(true)
    expect(isMembershipActive('Past_Due')).toBe(true)
  })
})

describe('isMembershipActive — statuts inactifs (fail-closed)', () => {
  it.each(['canceled', 'cancelled', 'expired', 'unresolved', 'drafted'])(
    'statut "%s" → false', (s) => {
      expect(isMembershipActive(s)).toBe(false)
    },
  )

  it('statut inconnu → false (fail-closed par allowlist)', () => {
    expect(isMembershipActive('refunded_by_support')).toBe(false)
    expect(isMembershipActive('awaiting_payment')).toBe(false)
    expect(isMembershipActive('')).toBe(false)
  })

  it('non-string → false', () => {
    expect(isMembershipActive(undefined)).toBe(false)
    expect(isMembershipActive(null)).toBe(false)
    expect(isMembershipActive(42)).toBe(false)
    expect(isMembershipActive({ status: 'active' })).toBe(false)
  })
})
