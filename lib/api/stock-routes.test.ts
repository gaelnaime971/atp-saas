import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Routes /api/stock/{data,search} : réservées aux membres
// via requireMember() (lib/ai/quota) ; le membre simulé est abonné Whop. On simule la session
// Supabase et on espionne TOUS les appels sortants (fetch global +
// client yahoo-finance2) pour prouver qu'aucun n'a lieu sans session.

const session = vi.hoisted(() => ({ user: null as null | { id: string }, role: 'trader' }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { role: session.role, whop_subscription_active: true }, error: null }) }),
      }),
    }),
  }),
}))

const yf = vi.hoisted(() => ({
  search: vi.fn(),
  chart: vi.fn(),
  insights: vi.fn(),
  quote: vi.fn(),
  quoteSummary: vi.fn(),
}))

vi.mock('yahoo-finance2', () => ({
  default: function YahooFinance() { return { ...yf, suppressNotices: () => {} } },
}))

const { GET: getData } = await import('@/app/api/stock/data/route')
const { GET: getSearch } = await import('@/app/api/stock/search/route')

const req = (path: string) => new Request(`http://localhost${path}`)
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  session.user = null
  session.role = 'trader'
  for (const fn of Object.values(yf)) fn.mockReset()
  yf.search.mockResolvedValue({ quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', exchDisp: 'NASDAQ', typeDisp: 'Equity' }], news: [] })
  yf.chart.mockResolvedValue({ meta: { regularMarketPrice: 200, currency: 'USD' }, quotes: [] })
  yf.insights.mockResolvedValue(null)
  // Réseau direct (crumb Yahoo, Finnhub) : réponse vide.
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const noOutboundCall = () => {
  expect(fetchSpy).not.toHaveBeenCalled()
  for (const fn of Object.values(yf)) expect(fn).not.toHaveBeenCalled()
}

describe('sans session → 401, aucun appel externe', () => {
  it('/api/stock/data', async () => {
    const r = await getData(req('/api/stock/data?symbol=AAPL&period=6mo'))
    expect(r.status).toBe(401)
    noOutboundCall()
  })
  it('/api/stock/search', async () => {
    const r = await getSearch(req('/api/stock/search?q=apple'))
    expect(r.status).toBe(401)
    noOutboundCall()
  })
})

describe('session membre → OK', () => {
  beforeEach(() => { session.user = { id: 'user-1' } })

  it('/api/stock/search renvoie les résultats', async () => {
    const r = await getSearch(req('/api/stock/search?q=apple'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.results[0]).toMatchObject({ symbol: 'AAPL', name: 'Apple Inc.' })
    expect(yf.search).toHaveBeenCalledTimes(1)
  })
  it('/api/stock/data renvoie la fiche', async () => {
    const r = await getData(req('/api/stock/data?symbol=AAPL&period=6mo'))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.symbol).toBe('AAPL')
    expect(body.quote.regularMarketPrice).toBe(200)
    expect(yf.chart).toHaveBeenCalledTimes(1)
  })
  it('un admin connecté passe aussi', async () => {
    session.role = 'admin'
    const r = await getSearch(req('/api/stock/search?q=apple'))
    expect(r.status).toBe(200)
  })
})
