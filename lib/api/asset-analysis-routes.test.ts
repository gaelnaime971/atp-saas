import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// /api/asset-analysis/{correlations,macro,news,sentiment} : réservées aux
// membres connectés (requireUser). Session Supabase simulée ; Yahoo
// (yahoo-finance2) et fetch (ForexFactory, CNN, alternative.me) espionnés.

const session = vi.hoisted(() => ({ user: null as null | { id: string } }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'trader' } }) }) }) }),
  }),
}))

const yf = vi.hoisted(() => ({ chart: vi.fn() }))
vi.mock('yahoo-finance2', () => ({
  default: function YahooFinance() { return { ...yf, suppressNotices: () => {} } },
}))

const routes = {
  correlations: (await import('@/app/api/asset-analysis/correlations/route')).POST,
  macro: (await import('@/app/api/asset-analysis/macro/route')).POST,
  news: (await import('@/app/api/asset-analysis/news/route')).POST,
  sentiment: (await import('@/app/api/asset-analysis/sentiment/route')).POST,
}
type Key = keyof typeof routes
const keys = Object.keys(routes) as Key[]

const post = () => new Request('http://localhost/api/asset-analysis/x', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbol: 'NQ=F' }),
})

let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  session.user = null
  yf.chart.mockReset()
  yf.chart.mockResolvedValue({ meta: {}, quotes: [] })
  fetchSpy = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe.each(keys)('/api/asset-analysis/%s', key => {
  it('sans session → 401, aucun appel externe', async () => {
    const r = await routes[key](post())
    expect(r.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(yf.chart).not.toHaveBeenCalled()
  })
  it('membre connecté → passe et interroge sa source', async () => {
    session.user = { id: 'trader-1' }
    const r = await routes[key](post())
    expect(r.status).not.toBe(401)
    expect(fetchSpy.mock.calls.length + yf.chart.mock.calls.length).toBeGreaterThan(0)
  })
})
