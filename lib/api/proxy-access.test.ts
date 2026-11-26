import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// proxy.ts : la règle d'accès (lib/access/member-access) s'applique à
// toutes les pages /dashboard, toujours (plus d'interrupteur
// WHOP_GATE_ENABLED). Sans accès → /whop/abonnement-inactif.

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  profile: null as null | Record<string, unknown>,
  profileError: null as null | { code: string },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profileError ? null : state.profile, error: state.profileError }),
        }),
      }),
    }),
  }),
}))

const { proxy } = await import('@/proxy')

const INACTIVE = '/whop/abonnement-inactif'
const visit = async (path: string) => {
  const res = await proxy(new NextRequest(`http://localhost${path}`))
  const location = res.headers.get('location')
  return location ? new URL(location).pathname : 'next'
}

const EX_MEMBER = { role: 'trader', whop_subscription_active: false, manual_access: false, manual_access_until: null }

beforeEach(() => {
  state.user = { id: 'u-1' }
  state.profile = null
  state.profileError = null
  vi.unstubAllEnvs()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('proxy : accès aux pages /dashboard', () => {
  it('abonné Whop → dashboard normal', async () => {
    state.profile = { role: 'trader', whop_subscription_active: true }
    expect(await visit('/dashboard')).toBe('next')
    expect(await visit('/dashboard?page=stats')).toBe('next')
  })

  it('accès manuel valide (sans fin ou date future) → dashboard', async () => {
    state.profile = { role: 'trader', whop_subscription_active: false, manual_access: true, manual_access_until: null }
    expect(await visit('/dashboard')).toBe('next')
    state.profile = { ...state.profile, manual_access_until: '2099-12-31' }
    expect(await visit('/dashboard')).toBe('next')
  })

  it('accès manuel expiré → page abonnement inactif', async () => {
    state.profile = { role: 'trader', whop_subscription_active: false, manual_access: true, manual_access_until: '2020-01-01' }
    expect(await visit('/dashboard')).toBe(INACTIVE)
  })

  it('ancien abonné → page abonnement inactif, sur toutes les pages /dashboard', async () => {
    state.profile = EX_MEMBER
    expect(await visit('/dashboard')).toBe(INACTIVE)
    expect(await visit('/dashboard?page=stock-analysis')).toBe(INACTIVE)
    vi.stubEnv('TERMINAL_ACCESS', 'all')
    expect(await visit('/dashboard/marches/cot')).toBe(INACTIVE)
  })

  it('ancien abonné : la page abonnement inactif s’ouvre (pas de boucle), /login renvoie vers /dashboard', async () => {
    state.profile = EX_MEMBER
    expect(await visit(INACTIVE)).toBe('next')
    expect(await visit('/logout')).toBe('next')
    expect(await visit('/login')).toBe('/dashboard')
  })

  it('le contrôle est toujours actif, quelle que soit WHOP_GATE_ENABLED', async () => {
    state.profile = EX_MEMBER
    vi.stubEnv('WHOP_GATE_ENABLED', 'false')
    expect(await visit('/dashboard')).toBe(INACTIVE)
  })

  it('profil illisible → page abonnement inactif (fail-closed)', async () => {
    state.profileError = { code: 'PGRST301' }
    expect(await visit('/dashboard')).toBe(INACTIVE)
  })

  it('admin : espace Marchés ouvert, reste de /dashboard vers l’admin (inchangé)', async () => {
    state.profile = { role: 'admin', whop_subscription_active: false }
    expect(await visit('/dashboard/marches')).toBe('next')
    expect(await visit('/dashboard')).toBe('/admin/dashboard')
  })

  it('sans session → /login ; /api n’est pas filtré par le proxy (requireMember)', async () => {
    state.user = null
    expect(await visit('/dashboard')).toBe('/login')
    state.user = { id: 'u-1' }
    state.profile = EX_MEMBER
    expect(await visit('/api/stock/search?q=a')).toBe('next')
  })
})
