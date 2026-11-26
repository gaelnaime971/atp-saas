import { describe, expect, it, vi } from 'vitest'
import {
  accessLabel, hasDashboardAccess, manualAccessPatch, memberAccess, parisToday,
  readAccessProfile, type ProfileSelect,
} from '@/lib/access/member-access'

const TODAY = '2026-11-26'

describe('memberAccess : la règle unique', () => {
  it('admin → oui, même sans abonnement', () => {
    expect(memberAccess({ role: 'admin', whop_subscription_active: false }, TODAY))
      .toEqual({ granted: true, kind: 'admin', until: null })
  })
  it('abonné Whop actif → oui', () => {
    expect(memberAccess({ role: 'trader', whop_subscription_active: true }, TODAY))
      .toEqual({ granted: true, kind: 'whop', until: null })
  })
  it('accès manuel sans fin → oui', () => {
    expect(memberAccess({ role: 'trader', manual_access: true, manual_access_until: null }, TODAY))
      .toEqual({ granted: true, kind: 'manual', until: null })
  })
  it('accès manuel valide : date de fin future ou du jour (incluse) → oui', () => {
    expect(memberAccess({ role: 'trader', manual_access: true, manual_access_until: '2027-01-31' }, TODAY))
      .toEqual({ granted: true, kind: 'manual', until: '2027-01-31' })
    expect(hasDashboardAccess({ role: 'trader', manual_access: true, manual_access_until: TODAY }, TODAY)).toBe(true)
  })
  it('accès manuel expiré → non', () => {
    expect(memberAccess({ role: 'trader', manual_access: true, manual_access_until: '2026-11-25' }, TODAY))
      .toEqual({ granted: false, kind: 'manual-expired', until: '2026-11-25' })
  })
  it('date de fin illisible → non (jamais « sans fin » par erreur)', () => {
    expect(hasDashboardAccess({ role: 'trader', manual_access: true, manual_access_until: 'n/a' }, TODAY)).toBe(false)
  })
  it('ancien abonné (Whop inactif, pas d’accès manuel) → non', () => {
    expect(memberAccess({ role: 'trader', whop_subscription_active: false, manual_access: false }, TODAY))
      .toEqual({ granted: false, kind: 'none', until: null })
  })
  it('date de fin sans manual_access → non', () => {
    expect(hasDashboardAccess({ role: 'trader', manual_access: false, manual_access_until: '2030-01-01' }, TODAY)).toBe(false)
  })
  it('profil illisible → non (fail-closed)', () => {
    expect(hasDashboardAccess(null, TODAY)).toBe(false)
    expect(hasDashboardAccess(undefined, TODAY)).toBe(false)
  })
  it('valeurs non booléennes strictes → non', () => {
    expect(hasDashboardAccess({ role: 'trader', whop_subscription_active: 'true' as unknown as boolean }, TODAY)).toBe(false)
    expect(hasDashboardAccess({ role: 'Admin' }, TODAY)).toBe(false)
  })
  it('Whop prime sur l’accès manuel pour l’affichage', () => {
    expect(memberAccess({ role: 'trader', whop_subscription_active: true, manual_access: true }, TODAY).kind).toBe('whop')
  })
})

describe('parisToday', () => {
  it('suit le jour de Paris, pas celui d’UTC', () => {
    expect(parisToday(new Date('2026-11-26T23:30:00Z'))).toBe('2026-11-27')
    expect(parisToday(new Date('2026-11-26T22:30:00Z'))).toBe('2026-11-26')
  })
})

describe('accessLabel', () => {
  it('libellés admin › Traders', () => {
    expect(accessLabel({ granted: true, kind: 'whop', until: null })).toBe('Whop')
    expect(accessLabel({ granted: true, kind: 'manual', until: '2027-01-31' })).toBe('Manuel jusqu\'au 31/01/2027')
    expect(accessLabel({ granted: true, kind: 'manual', until: null })).toBe('Manuel sans fin')
    expect(accessLabel({ granted: false, kind: 'manual-expired', until: '2026-11-25' })).toBe('Manuel expiré le 25/11/2026')
    expect(accessLabel({ granted: false, kind: 'none', until: null })).toBe('Aucun')
  })
})

describe('manualAccessPatch (admin)', () => {
  it('accorde sans fin quand la date est vide', () => {
    expect(manualAccessPatch('grant', '  ', TODAY))
      .toEqual({ ok: true, patch: { manual_access: true, manual_access_until: null } })
  })
  it('accorde jusqu’à une date future ou du jour', () => {
    expect(manualAccessPatch('grant', '2027-01-31', TODAY))
      .toEqual({ ok: true, patch: { manual_access: true, manual_access_until: '2027-01-31' } })
    expect(manualAccessPatch('grant', TODAY, TODAY).ok).toBe(true)
  })
  it('refuse une date passée ou invalide', () => {
    expect(manualAccessPatch('grant', '2026-11-25', TODAY)).toEqual({ ok: false, error: 'La date de fin est déjà passée' })
    expect(manualAccessPatch('grant', '2027-02-30', TODAY)).toEqual({ ok: false, error: 'Date de fin invalide' })
    expect(manualAccessPatch('grant', '31/01/2027', TODAY)).toEqual({ ok: false, error: 'Date de fin invalide' })
  })
  it('retire l’accès et efface la date', () => {
    expect(manualAccessPatch('revoke', '2027-01-31', TODAY))
      .toEqual({ ok: true, patch: { manual_access: false, manual_access_until: null } })
  })
})

describe('readAccessProfile', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('lit les colonnes d’accès', async () => {
    const select = vi.fn<ProfileSelect>(async () => ({ data: { role: 'trader', manual_access: true }, error: null }))
    expect(await readAccessProfile(select)).toEqual({ role: 'trader', manual_access: true })
    expect(select).toHaveBeenCalledWith('role, whop_subscription_active, manual_access, manual_access_until')
  })
  it('migration pas encore appliquée (42703) → relit role + Whop', async () => {
    const spy = quiet()
    const select = vi.fn<ProfileSelect>(async cols => cols.includes('manual_access')
      ? { data: null, error: { code: '42703' } }
      : { data: { role: 'trader', whop_subscription_active: true }, error: null })
    expect(await readAccessProfile(select)).toEqual({ role: 'trader', whop_subscription_active: true })
    spy.mockRestore()
  })
  it('autre erreur → null (refus)', async () => {
    const spy = quiet()
    const select = vi.fn<ProfileSelect>(async () => ({ data: null, error: { code: 'PGRST301' } }))
    expect(await readAccessProfile(select)).toBeNull()
    expect(select).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
