import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accessRedirect, firstMissingEnv, logMissingConfig,
  WHOP_SUBSCRIPTION_REQUIRED_PATH, WHOP_UNAVAILABLE_PATH,
} from '@/lib/whop/callback'
import { fetchEliteProAccess, WhopConfigError } from '@/lib/whop/client'

describe('accessRedirect (aiguillage du callback)', () => {
  it('variable de config absente → refus, page « indisponible », nom à logger', () => {
    expect(accessRedirect({ granted: false, missingEnv: 'WHOP_COMPANY_ID' }))
      .toEqual({ path: WHOP_UNAVAILABLE_PATH, missingEnv: 'WHOP_COMPANY_ID' })
  })
  it('pas d’abonnement → page « abonnement requis », rien à logger', () => {
    expect(accessRedirect({ granted: false, missingEnv: null }))
      .toEqual({ path: WHOP_SUBSCRIPTION_REQUIRED_PATH, missingEnv: null })
  })
  it('abonnement valide → null (le callback continue)', () => {
    expect(accessRedirect({ granted: true, missingEnv: null })).toBeNull()
  })
  it('la config manquante l’emporte toujours (refus, jamais d’accès)', () => {
    expect(accessRedirect({ granted: true, missingEnv: 'WHOP_API_KEY' })?.path).toBe(WHOP_UNAVAILABLE_PATH)
  })
})

describe('firstMissingEnv', () => {
  it('renvoie le premier nom absent ou vide', () => {
    expect(firstMissingEnv(['A', 'B', 'C'], { A: 'x', B: '', C: 'y' })).toBe('B')
    expect(firstMissingEnv(['A', 'B'], { A: 'x' })).toBe('B')
    expect(firstMissingEnv(['A'], { A: 'x' })).toBeNull()
  })
})

describe('logMissingConfig', () => {
  it('écrit le NOM de la variable dans les logs serveur', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logMissingConfig('WHOP_COMPANY_ID')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('WHOP_COMPANY_ID')
    spy.mockRestore()
  })
})

describe('fetchEliteProAccess → missingEnv', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.WHOP_API_KEY = 'k'
    process.env.WHOP_PRODUCT_ID = 'prod_X'
    process.env.WHOP_COMPANY_ID = 'biz_X'
  })
  afterEach(() => {
    process.env = { ...saved }
    vi.unstubAllGlobals()
  })

  it('porte le nom de la variable absente, refuse, et n’appelle pas Whop', async () => {
    delete process.env.WHOP_COMPANY_ID
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await fetchEliteProAccess('user_abc')
    expect(r.granted).toBe(false)
    expect(r.missingEnv).toBe('WHOP_COMPANY_ID')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(accessRedirect(r)?.path).toBe(WHOP_UNAVAILABLE_PATH)
  })

  it('reste null quand la config est complète (refus = vrai refus)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], page_info: { has_next_page: false } }), { status: 200 })))
    const r = await fetchEliteProAccess('user_abc')
    expect(r.missingEnv).toBeNull()
    expect(accessRedirect(r)?.path).toBe(WHOP_SUBSCRIPTION_REQUIRED_PATH)
  })

  it('WhopConfigError expose le nom, jamais de valeur', () => {
    const e = new WhopConfigError('WHOP_API_KEY')
    expect(e.envName).toBe('WHOP_API_KEY')
    expect(e.message).toContain('WHOP_API_KEY')
  })
})
