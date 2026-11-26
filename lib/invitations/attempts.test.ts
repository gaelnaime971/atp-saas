import { describe, expect, it } from 'vitest'
import {
  codesMatch, decideInvitationAttempt, generateInvitationCode,
  INVITE_LOCK_MINUTES, INVITE_MAX_ATTEMPTS, type PendingInvitation,
} from '@/lib/invitations/attempts'

const NOW = new Date('2026-11-26T12:00:00Z')
const inv = (o: Partial<PendingInvitation> = {}): PendingInvitation => ({
  id: 'i1', code: '482915', expires_at: '2026-12-20T00:00:00Z', used_at: null,
  failed_attempts: 0, locked_until: null, ...o,
})

describe('generateInvitationCode', () => {
  it('6 chiffres, 100000–999999, tirages variés', () => {
    const codes = new Set(Array.from({ length: 200 }, generateInvitationCode))
    for (const c of codes) {
      expect(c).toMatch(/^\d{6}$/)
      expect(Number(c)).toBeGreaterThanOrEqual(100000)
      expect(Number(c)).toBeLessThanOrEqual(999999)
    }
    expect(codes.size).toBeGreaterThan(190)
  })
})

describe('codesMatch', () => {
  it('égalité stricte, espaces ignorés, longueurs différentes refusées', () => {
    expect(codesMatch('482915', ' 482915 ')).toBe(true)
    expect(codesMatch('482915', '482916')).toBe(false)
    expect(codesMatch('482915', '48291')).toBe(false)
  })
})

describe('decideInvitationAttempt', () => {
  it('invitation existante à 6 chiffres (compteur absent) → acceptée', () => {
    const d = decideInvitationAttempt([inv({ failed_attempts: null })], '482915', NOW)
    expect(d).toMatchObject({ kind: 'accept', expectAttempts: 0 })
  })
  it('code faux → compteur +1, sans blocage avant le 5e', () => {
    const d = decideInvitationAttempt([inv({ failed_attempts: 3 })], '000000', NOW)
    expect(d).toEqual({ kind: 'wrong', updates: [{ id: 'i1', expectAttempts: 3, failed_attempts: 4, locked_until: null }] })
  })
  it('5e code faux → blocage 15 minutes', () => {
    const d = decideInvitationAttempt([inv({ failed_attempts: INVITE_MAX_ATTEMPTS - 1 })], '000000', NOW)
    if (d.kind !== 'wrong') throw new Error(d.kind)
    expect(d.updates[0].failed_attempts).toBe(5)
    expect(d.updates[0].locked_until).toBe(new Date(NOW.getTime() + INVITE_LOCK_MINUTES * 60_000).toISOString())
  })
  it('bon code pendant le blocage → refusé', () => {
    const locked = inv({ failed_attempts: 5, locked_until: '2026-11-26T12:10:00Z' })
    expect(decideInvitationAttempt([locked], '482915', NOW)).toEqual({ kind: 'refuse' })
  })
  it('blocage terminé → bon code accepté, et 5 nouveaux faux re-bloquent', () => {
    const after = inv({ failed_attempts: 5, locked_until: '2026-11-26T11:59:00Z' })
    expect(decideInvitationAttempt([after], '482915', NOW).kind).toBe('accept')
    const d = decideInvitationAttempt([inv({ failed_attempts: 9, locked_until: '2026-11-26T11:59:00Z' })], '1', NOW)
    if (d.kind !== 'wrong') throw new Error(d.kind)
    expect(d.updates[0].failed_attempts).toBe(10)
    expect(d.updates[0].locked_until).not.toBe('2026-11-26T11:59:00Z')
  })
  it('expirée, déjà utilisée ou absente → refus', () => {
    expect(decideInvitationAttempt([inv({ expires_at: '2026-11-01T00:00:00Z' })], '482915', NOW)).toEqual({ kind: 'refuse' })
    expect(decideInvitationAttempt([inv({ used_at: '2026-11-20T00:00:00Z' })], '482915', NOW)).toEqual({ kind: 'refuse' })
    expect(decideInvitationAttempt([], '482915', NOW)).toEqual({ kind: 'refuse' })
  })
  it('une invitation bloquée bloque tout l’e-mail', () => {
    const d = decideInvitationAttempt(
      [inv({ id: 'a', locked_until: '2026-11-26T12:10:00Z' }), inv({ id: 'b', code: '111111' })], '111111', NOW)
    expect(d).toEqual({ kind: 'refuse' })
  })
})
