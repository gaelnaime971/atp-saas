import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { cronAuthorized, timingSafeEqual } from './cron-auth'

// /api/cron/market-data : protégée comme /api/cron/whop-reconcile.
const run = vi.hoisted(() => ({ runIngestion: vi.fn(), revalidated: [] as unknown[] }))
vi.mock('@/lib/market/run', () => ({
  MARKET_CACHE_TAG: 'market-data',
  runIngestion: run.runIngestion,
  summarize: (r: { source: string; status: string; rows: number; errors: string[] }[]) => r.map(x => ({ source: x.source, status: x.status, rows: x.rows, errors: x.errors.length })),
}))
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => run.revalidated.push(args) }))

const { GET } = await import('@/app/api/cron/market-data/route')
const req = (auth?: string) => new NextRequest('http://localhost/api/cron/market-data', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'secret-de-test')
  run.runIngestion.mockReset()
  run.revalidated.length = 0
})

describe('authentification des crons', () => {
  it('compare à temps constant, refuse sans secret configuré', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(cronAuthorized('Bearer x', '')).toBe(false)
    expect(cronAuthorized('Bearer x', undefined)).toBe(false)
    expect(cronAuthorized('Basic x', 'x')).toBe(false)
    expect(cronAuthorized('Bearer x', 'x')).toBe(true)
  })
})

describe('GET /api/cron/market-data', () => {
  it('sans secret ou mauvais secret : 404 silencieux, aucune ingestion', async () => {
    expect((await GET(req())).status).toBe(404)
    expect((await GET(req('Bearer faux'))).status).toBe(404)
    expect(run.runIngestion).not.toHaveBeenCalled()
  })
  it('avec le secret : ingestion « cron » puis invalidation du cache partagé', async () => {
    run.runIngestion.mockResolvedValue([
      { source: 'fred', status: 'ok', rows: 12, errors: [] },
      { source: 'cftc', status: 'ok', rows: 4, errors: [] },
    ])
    const res = await GET(req('Bearer secret-de-test'))
    expect(res.status).toBe(200)
    expect(run.runIngestion).toHaveBeenCalledWith('cron')
    expect(run.revalidated).toEqual([['market-data', { expire: 0 }]])
    expect(await res.json()).toEqual({ results: [
      { source: 'fred', status: 'ok', rows: 12, errors: 0 },
      { source: 'cftc', status: 'ok', rows: 4, errors: 0 },
    ] })
  })
  it('une source en échec : 502 (visible dans les logs Vercel)', async () => {
    run.runIngestion.mockResolvedValue([{ source: 'fred', status: 'error', rows: 0, errors: ['x'] }])
    expect((await GET(req('Bearer secret-de-test'))).status).toBe(502)
  })
})
