import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Routes /api réservées aux membres : requireMember() (lib/ai/quota),
// règle unique lib/access/member-access. Un ancien abonné connecté
// reçoit 403 sur TOUTES, avant tout appel externe (fetch, Groq, Yahoo,
// clé service Supabase). Un garde statique oblige à classer toute
// nouvelle route (membre ou hors périmètre).

const MEMBER_ROUTES = [
  'ai-chart', 'ai-coach-analysis', 'ai-coach-chat', 'ai-coach-metrics', 'ai-news',
  'asset-analysis/correlations', 'asset-analysis/macro', 'asset-analysis/news',
  'asset-analysis/sentiment', 'asset-analysis/synthesis', 'asset-analysis/technical',
  'backtest/criteria', 'backtest/criteria/categories/[id]', 'backtest/criteria/options/[id]',
  'coaching/book', 'coaching/cancel', 'coaching/slots', 'coaching/token',
  'stock/ai-scores', 'stock/ai-verdict', 'stock/data', 'stock/search',
] as const

// Hors périmètre : admin (contrôle admin propre), cron, webhook, Jarvis
// (liste d'autorisation), routes publiques ou d'authentification.
const OUT_OF_SCOPE = [
  // cron/market-data (données Terminal) : Bearer CRON_SECRET, cf. market-cron.test.ts.
  /^admin\//, /^cron\//, /^webhooks\//, /^jarvis\//, /^auth\//, /^google\//,
  /^invitations(\/|$)/, /^invoices\//, /^padel\//, /^prospects(\/|$)/, /^unsubscribe$/,
  /^backtest\/is-tester$/, // indicateur d'affichage seulement, répond sans session
]

const API_DIR = join(process.cwd(), 'app/api')
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return routeFiles(p)
    return name === 'route.ts' ? [relative(API_DIR, dir)] : []
  })
}

describe('classement des routes /api', () => {
  const all = routeFiles(API_DIR)

  it('chaque route est soit membre, soit explicitement hors périmètre', () => {
    const unclassified = all.filter(r =>
      !(MEMBER_ROUTES as readonly string[]).includes(r) && !OUT_OF_SCOPE.some(re => re.test(r)))
    expect(unclassified).toEqual([])
  })
  it('les routes membres appellent requireMember(), pas requireUser()', () => {
    for (const r of MEMBER_ROUTES) {
      const src = readFileSync(join(API_DIR, r, 'route.ts'), 'utf8')
      expect(src, r).toContain('requireMember()')
      expect(src, r).not.toContain('requireUser(')
    }
  })
  it('le cron des données Terminal est classé hors périmètre', () => {
    expect(all).toContain('cron/market-data')
    expect(OUT_OF_SCOPE.some(re => re.test('cron/market-data'))).toBe(true)
    expect(OUT_OF_SCOPE.some(re => re.test('admin/market-data'))).toBe(true)
  })
  it('Jarvis, admin, cron et webhook ne passent pas par requireMember()', () => {
    for (const r of all.filter(r => /^(jarvis|admin|cron|webhooks)\//.test(r))) {
      expect(readFileSync(join(API_DIR, r, 'route.ts'), 'utf8'), r).not.toContain('requireMember')
    }
  })
})

// ─── Exécution réelle des handlers ──────────────────────────────────────

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string },
  profile: null as null | Record<string, unknown>,
  serviceCalls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile, error: null }),
          single: async () => ({ data: state.profile, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

// Clé service : toute utilisation après le chargement du module est notée.
vi.mock('@supabase/supabase-js', () => {
  const chain: unknown = new Proxy(() => {}, {
    get: (_t, prop) => (prop === 'then' ? undefined : chain),
    apply: () => chain,
  })
  return {
    createClient: () => new Proxy({}, {
      get: (_t, prop) => { state.serviceCalls.push(String(prop)); return chain },
    }),
  }
})
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock('yahoo-finance2', () => ({
  default: function YahooFinance() {
    return { search: vi.fn(), chart: vi.fn(), insights: vi.fn(), quote: vi.fn(), quoteSummary: vi.fn(), suppressNotices: () => {} }
  },
}))
vi.mock('@/lib/daily', () => ({
  createCoachingRoom: vi.fn(), deleteRoom: vi.fn(), createMeetingToken: vi.fn(),
}))
vi.mock('@/lib/google', () => ({
  createCalendarEvent: vi.fn(), deleteCalendarEvent: vi.fn(), findConnectedAdminId: vi.fn(),
}))

vi.stubEnv('GROQ_API_KEY', 'test-key')

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const
const handlers: Array<{ name: string; fn: Handler }> = []
for (const r of MEMBER_ROUTES) {
  const mod = (await import(/* @vite-ignore */ `@/app/api/${r}/route`)) as Record<string, unknown>
  for (const m of METHODS) {
    if (typeof mod[m] === 'function') handlers.push({ name: `${m} /api/${r}`, fn: mod[m] as Handler })
  }
}

const call = (h: { name: string; fn: Handler }) => {
  const [method, path] = h.name.split(' ')
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } }
  if (method !== 'GET') init.body = JSON.stringify({ symbol: 'AAPL', session_id: 's1', scheduled_at: '2099-01-01T10:00:00Z' })
  return h.fn(new Request(`http://localhost${path.replace('[id]', 'x')}?symbol=AAPL&q=apple`, init), {
    params: Promise.resolve({ id: 'x' }),
  })
}

let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  state.user = null
  state.profile = null
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  state.serviceCalls.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const expectNoOutbound = (name: string) => {
  expect(fetchSpy, name).not.toHaveBeenCalled()
  expect(state.serviceCalls, name).toEqual([])
}

describe('handlers membres', () => {
  it('couvre toutes les méthodes des routes membres', () => {
    expect(handlers.length).toBeGreaterThanOrEqual(MEMBER_ROUTES.length)
  })

  it('sans session → 401, aucun appel externe', async () => {
    for (const h of handlers) {
      const r = await call(h)
      expect(r.status, h.name).toBe(401)
      expectNoOutbound(h.name)
    }
  })

  it('ancien abonné connecté (Whop inactif, pas d’accès manuel) → 403, aucun appel externe', async () => {
    state.user = { id: 'ex-1', email: 'ex@example.test' }
    state.profile = { role: 'trader', whop_subscription_active: false, manual_access: false, manual_access_until: null }
    for (const h of handlers) {
      const r = await call(h)
      expect(r.status, h.name).toBe(403)
      expect(await r.json(), h.name).toEqual({ error: 'subscription_inactive' })
      expectNoOutbound(h.name)
    }
  })

  it('accès manuel expiré → 403', async () => {
    state.user = { id: 'm-1' }
    state.profile = { role: 'trader', whop_subscription_active: false, manual_access: true, manual_access_until: '2020-01-01' }
    for (const h of handlers) expect((await call(h)).status, h.name).toBe(403)
  })

  it('profil illisible → 403 (fail-closed)', async () => {
    state.user = { id: 'u-1' }
    state.profile = null
    for (const h of handlers) expect((await call(h)).status, h.name).toBe(403)
  })

  it('abonné Whop, accès manuel valide et admin passent le contrôle', async () => {
    const allowed = [
      { role: 'trader', whop_subscription_active: true },
      { role: 'trader', whop_subscription_active: false, manual_access: true, manual_access_until: null },
      { role: 'trader', whop_subscription_active: false, manual_access: true, manual_access_until: '2099-12-31' },
      { role: 'admin', whop_subscription_active: false },
    ]
    for (const profile of allowed) {
      state.user = { id: 'ok-1' }
      state.profile = profile
      for (const h of handlers) {
        const label = `${h.name} ${JSON.stringify(profile)}`
        let res: Response | null = null
        try { res = await call(h) } catch { /* plus loin : données simulées */ }
        if (!res) continue
        expect(res.status, label).not.toBe(401)
        // Un 403 ici ne peut venir que d'un contrôle propre à la route
        // (ex. coaching/cancel : séance d'un autre trader), jamais de l'accès.
        if (res.status === 403) expect(await res.json(), label).not.toEqual({ error: 'subscription_inactive' })
      }
    }
  })
})
