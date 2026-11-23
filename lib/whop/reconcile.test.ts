/**
 * Tests de computeSyncPlan — fonction PURE, aucun I/O.
 * Pas de mocks fetch ni de supabase — on injecte directement les
 * memberships Whop + les profils.
 */

import { describe, it, expect } from 'vitest'
import { computeSyncPlan, type ProfileForReconcile } from './reconcile'
import type { SyncMembership } from './client'

function m(overrides: Partial<SyncMembership> = {}): SyncMembership {
  return {
    membershipId: 'mem_x',
    whopUserId: 'user_x',
    email: 'u@x.com',
    status: 'active',
    createdAt: '2026-10-01T00:00:00Z',
    planId: 'plan_mens',
    planName: 'Mensuel',
    kind: 'subscription',
    renewsOrExpiresAt: '2026-12-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

function p(overrides: Partial<ProfileForReconcile>): ProfileForReconcile {
  return {
    id: 'prof_x',
    email: 'u@x.com',
    role: 'trader',
    whop_user_id: null,
    whop_subscription_active: false,
    ...overrides,
  }
}

describe('computeSyncPlan — cas 1 : flag=false + accès Whop actif → set true', () => {
  it('match par whop_user_id, flag devient true', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_1', email: 'a@x.com' })],
      [p({ id: 'pA', whop_user_id: 'user_1', whop_subscription_active: false })],
    )
    expect(r.ops).toHaveLength(1)
    expect(r.ops[0].kind).toBe('set_subscription_active')
    expect(r.ops[0].reason).toBe('matched_by_whop_user_id')
    expect(r.ops[0].before.whop_subscription_active).toBe(false)
    expect(r.ops[0].after.whop_subscription_active).toBe(true)
    expect(r.summary.totals.byKind.set_subscription_active).toBe(1)
  })

  it('18 cas type "ménage d\'octobre" (completed oubliés) → 18 ops set true', () => {
    const memberships: SyncMembership[] = []
    const profiles: ProfileForReconcile[] = []
    for (let i = 0; i < 18; i++) {
      memberships.push(m({
        membershipId: `mem_${i}`,
        whopUserId: `user_${i}`,
        email: `trader${i}@x.com`,
        status: 'completed',
      }))
      profiles.push(p({
        id: `prof_${i}`,
        email: `trader${i}@x.com`,
        whop_user_id: `user_${i}`,
        whop_subscription_active: false,
      }))
    }
    const r = computeSyncPlan(memberships, profiles)
    expect(r.summary.totals.byKind.set_subscription_active).toBe(18)
    expect(r.summary.totals.opsPlanned).toBe(18)
  })
})

describe('computeSyncPlan — cas 2 : flag=true + pas d\'accès Whop → set false', () => {
  it('profile trader sans match Whop, flag true → set false (cas pens_fouine/vincent/guillaume)', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_someone_else', email: 'autre@x.com' })],
      [
        // pens_fouine : whop_user_id présent, mais sub Whop expirée
        p({ id: 'pA', email: 'pens_fouine@msn.com', whop_user_id: 'user_PENS',    whop_subscription_active: true }),
        // vincent : idem
        p({ id: 'pB', email: 'vincent-veron@hotmail.fr', whop_user_id: 'user_VV', whop_subscription_active: true }),
        // guillaume : idem
        p({ id: 'pC', email: 'guillaumeblondan2@gmail.com', whop_user_id: 'user_GB', whop_subscription_active: true }),
      ],
    )
    expect(r.ops).toHaveLength(3)
    for (const op of r.ops) {
      expect(op.kind).toBe('set_subscription_inactive')
      expect(op.reason).toBe('no_match_but_flag_true')
      expect(op.before.whop_subscription_active).toBe(true)
      expect(op.after.whop_subscription_active).toBe(false)
    }
    expect(r.summary.totals.byKind.set_subscription_inactive).toBe(3)
  })

  it('profile trader sans whop_user_id, flag true, email absent de Whop → set false', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_A', email: 'a@x.com' })],
      [p({ email: 'orphan@x.com', whop_user_id: null, whop_subscription_active: true })],
    )
    expect(r.ops).toHaveLength(1)
    expect(r.ops[0].kind).toBe('set_subscription_inactive')
  })
})

describe('computeSyncPlan — cas 3 : rapprochement par email → link_whop_user_id', () => {
  it('match par email + whop_user_id vide → op link séparée + op set true', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_A', email: 'Trader@X.com' })],
      [p({ id: 'pA', email: 'trader@x.com', whop_user_id: null, whop_subscription_active: false })],
    )
    const kinds = r.ops.map(o => o.kind).sort()
    expect(kinds).toEqual(['link_whop_user_id', 'set_subscription_active'])
    const linkOp = r.ops.find(o => o.kind === 'link_whop_user_id')!
    expect(linkOp.after.whop_user_id).toBe('user_A')
    expect(linkOp.reason).toBe('matched_by_email')
  })

  it('n\'OVERWRITE jamais un whop_user_id existant (anti-anomalie 2 profils→1 Whop)', () => {
    // Profil avec un whop_user_id stale, mais même email qu'une sub Whop
    // active sous un user_id différent. Attendu : le match se rabat sur
    // email, garde flag=true, et ne génère AUCUNE op link_whop_user_id
    // (l'écrasement serait une correction silencieuse dangereuse).
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_NEW', email: 'trader@x.com' })],
      [p({ email: 'trader@x.com', whop_user_id: 'user_EXISTING', whop_subscription_active: true })],
    )
    expect(r.ops.find(o => o.kind === 'link_whop_user_id')).toBeUndefined()
    // Pas d'op set_subscription_inactive non plus : la personne EST
    // active chez Whop (par son email), même si un user_id stale traîne.
    expect(r.ops).toEqual([])
  })

  it('whop_user_id stale avec flag=false → active via email, sans écraser le user_id', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_NEW', email: 'trader@x.com' })],
      [p({ email: 'trader@x.com', whop_user_id: 'user_EXISTING', whop_subscription_active: false })],
    )
    expect(r.ops).toHaveLength(1)
    expect(r.ops[0].kind).toBe('set_subscription_active')
    expect(r.ops[0].reason).toBe('matched_by_email')
    // Et surtout : pas de link (whop_user_id reste 'user_EXISTING').
    expect(r.ops.find(o => o.kind === 'link_whop_user_id')).toBeUndefined()
  })

  it('pas de link si whop_user_id du membership est null (match par email côté Whop sans user)', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: null, email: 'trader@x.com' })],
      [p({ email: 'trader@x.com', whop_user_id: null, whop_subscription_active: false })],
    )
    expect(r.ops.find(o => o.kind === 'link_whop_user_id')).toBeUndefined()
    expect(r.ops.find(o => o.kind === 'set_subscription_active')).toBeDefined()
  })
})

describe('computeSyncPlan — règles de sécurité', () => {
  it('ignore les profils admin (whitelist middleware, hors du cycle Whop)', () => {
    const r = computeSyncPlan(
      [],
      [
        p({ id: 'pAdmin', role: 'admin', whop_subscription_active: true }),
        p({ id: 'pAdmin2', role: 'admin', whop_subscription_active: false }),
      ],
    )
    expect(r.ops).toEqual([])
    expect(r.summary.totals.adminsSkipped).toBe(2)
  })

  it('aucun no-op : un profil déjà aligné ne génère rien', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_A', email: 'a@x.com' })],
      [p({ whop_user_id: 'user_A', email: 'a@x.com', whop_subscription_active: true })],
    )
    expect(r.ops).toEqual([])
  })

  it('aucun no-op quand tout le monde est déjà synchronisé', () => {
    const r = computeSyncPlan(
      [m({ whopUserId: 'user_A' }), m({ whopUserId: 'user_B' })],
      [
        p({ id: 'pA', whop_user_id: 'user_A', whop_subscription_active: true }),
        p({ id: 'pB', whop_user_id: 'user_B', whop_subscription_active: true }),
      ],
    )
    expect(r.ops).toEqual([])
    expect(r.summary.totals.byKind.set_subscription_active).toBe(0)
    expect(r.summary.totals.byKind.set_subscription_inactive).toBe(0)
  })
})

describe('computeSyncPlan — scénario mixte "prod 23/11/2026"', () => {
  it('18 set_active + 7 set_inactive + N link + admins ignorés', () => {
    // Memberships Whop : 30 abonnés actifs avec user_id
    const memberships: SyncMembership[] = []
    for (let i = 0; i < 30; i++) {
      memberships.push(m({
        membershipId: `mem_${i}`,
        whopUserId: `user_${i}`,
        email: `whop${i}@x.com`,
      }))
    }

    const profiles: ProfileForReconcile[] = []

    // 18 profiles trader avec flag=false mais présents dans Whop
    for (let i = 0; i < 18; i++) {
      profiles.push(p({
        id: `trader_a_${i}`,
        email: `whop${i}@x.com`,
        whop_user_id: `user_${i}`,
        whop_subscription_active: false,
      }))
    }
    // 7 profiles trader avec flag=true mais absents de Whop
    for (let i = 0; i < 7; i++) {
      profiles.push(p({
        id: `trader_b_${i}`,
        email: `expired${i}@x.com`,
        whop_user_id: `user_expired_${i}`,
        whop_subscription_active: true,
      }))
    }
    // 3 admins avec flag true et false — doivent être ignorés
    profiles.push(p({ id: 'admin_1', role: 'admin', whop_subscription_active: true }))
    profiles.push(p({ id: 'admin_2', role: 'admin', whop_subscription_active: false }))
    profiles.push(p({ id: 'admin_3', role: 'admin', whop_subscription_active: false }))
    // 6 profiles déjà alignés (flag=true + Whop OK) → aucun op
    for (let i = 20; i < 26; i++) {
      profiles.push(p({
        id: `trader_c_${i}`,
        email: `whop${i}@x.com`,
        whop_user_id: `user_${i}`,
        whop_subscription_active: true,
      }))
    }

    const r = computeSyncPlan(memberships, profiles)
    expect(r.summary.totals.byKind.set_subscription_active).toBe(18)
    expect(r.summary.totals.byKind.set_subscription_inactive).toBe(7)
    expect(r.summary.totals.adminsSkipped).toBe(3)
    // 25 ops totales (sans compter les link, puisque tous ont déjà whop_user_id)
    expect(r.summary.totals.opsPlanned).toBe(25)
  })
})
