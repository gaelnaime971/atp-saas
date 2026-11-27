import { describe, expect, it, vi } from 'vitest'
import { COT_MARKETS, FRED_SERIES } from './catalog'
import { ingestAll, incrementalStart, OVERLAP_DAYS, shiftDays, yearsAgo, type MarketFetchers } from './ingest'
import { memoryMarketStore } from './store-memory'
import type { CotRow } from './cftc'

const TODAY = '2026-11-27'

// Source simulée : une observation par jour (FRED), un rapport par mardi (COT), jusqu'à `until`.
function fakeFetchers(until: { fred: string; cot: string }, fail: string[] = []) {
  const calls: { kind: 'fred' | 'cot'; id: string; start: string }[] = []
  const fetchers: MarketFetchers = {
    async fred(code, start) {
      calls.push({ kind: 'fred', id: code, start })
      if (fail.includes(code)) throw new Error('HTTP 500')
      const out = []
      for (let d = start; d <= until.fred; d = shiftDays(d, 1)) out.push({ date: d, value: 1 })
      return out
    },
    async cot(market, since) {
      calls.push({ kind: 'cot', id: market, start: since })
      if (fail.includes(market)) throw new Error('HTTP 503')
      const out: CotRow[] = []
      let d = since
      while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 2) d = shiftDays(d, 1)
      for (; d <= until.cot; d = shiftDays(d, 7)) {
        out.push({ market, reportDate: d, cftcCode: 'x', openInterest: 100, assetMgrLong: 1, assetMgrShort: 0, levMoneyLong: 0, levMoneyShort: 0, dealerLong: 0, dealerShort: 0 })
      }
      return out
    },
  }
  return { fetchers, calls }
}

describe('ingestion : date de début', () => {
  it('base vide → début de l’historique', () => {
    expect(incrementalStart(null, '2016-11-27', 14)).toBe('2016-11-27')
  })
  it('sinon dernière date − recouvrement (révisions), jamais avant l’historique', () => {
    expect(incrementalStart('2026-11-25', '2016-11-27', 14)).toBe('2026-11-11')
    expect(incrementalStart('2016-11-28', '2016-11-27', 14)).toBe('2016-11-27')
  })
  it('10 ans pile (29 février compris)', () => {
    expect(yearsAgo('2026-11-27', 10)).toBe('2016-11-27')
    expect(yearsAgo('2028-02-29', 1)).toBe('2027-03-01')
  })
})

describe('ingestion incrémentale et idempotente', () => {
  it('premier passage : tout l’historique ; deuxième passage : seulement depuis la dernière date (avec recouvrement)', async () => {
    const mem = memoryMarketStore()
    const first = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' })
    await ingestAll(mem.store, first.fetchers, { trigger: 'backfill', today: TODAY })
    expect(first.calls.find(c => c.id === 'DGS10')?.start).toBe('2016-11-27')
    expect(first.calls.find(c => c.id === 'NQ')?.start).toBe('2010-01-01')

    const second = fakeFetchers({ fred: '2026-11-26', cot: '2026-11-24' })
    await ingestAll(mem.store, second.fetchers, { trigger: 'cron', today: TODAY })
    expect(second.calls.find(c => c.id === 'DGS10')?.start).toBe(shiftDays('2026-11-25', -OVERLAP_DAYS.fred))
    expect(second.calls.find(c => c.id === 'NQ')?.start).toBe(shiftDays('2026-11-17', -OVERLAP_DAYS.cftc))
    // La nouvelle date est arrivée, aucune perte.
    expect(mem.observations('DGS10').at(-1)?.date).toBe('2026-11-26')
    expect(mem.cotRows().filter(r => r.market === 'NQ').at(-1)?.reportDate).toBe('2026-11-24')
  })

  it('relancer sans nouvelle donnée ne crée aucun doublon', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' })
    await ingestAll(mem.store, src.fetchers, { trigger: 'backfill', today: TODAY })
    const before = { obs: mem.observationCount('DGS10'), cot: mem.cotCount() }
    await ingestAll(mem.store, src.fetchers, { trigger: 'cron', today: TODAY })
    await ingestAll(mem.store, src.fetchers, { trigger: 'cron', today: TODAY })
    expect(mem.observationCount('DGS10')).toBe(before.obs)
    expect(mem.cotCount()).toBe(before.cot)
  })

  it('une source en erreur n’arrête pas les autres : statut « partiel », journal renseigné', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }, ['ICSA', 'ZN'])
    const [fred, cftc] = await ingestAll(mem.store, src.fetchers, { trigger: 'cron', today: TODAY })
    expect(fred.status).toBe('partial')
    expect(fred.errors).toEqual(['ICSA : HTTP 500'])
    expect(cftc.status).toBe('partial')
    expect(mem.observationCount('DGS10')).toBeGreaterThan(0)
    expect(mem.journal.map(j => [j.source, j.trigger, j.status])).toEqual([['fred', 'cron', 'partial'], ['cftc', 'cron', 'partial']])
    expect(mem.journal[0].error).toContain('ICSA')
  })

  it('toutes les séries en erreur → « échec »', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }, [...FRED_SERIES.map(s => s.code), ...COT_MARKETS.map(m => m.code)])
    const results = await ingestAll(mem.store, src.fetchers, { trigger: 'admin', today: TODAY })
    expect(results.map(r => r.status)).toEqual(['error', 'error'])
  })

  it('le catalogue est enregistré à chaque passage FRED', async () => {
    const mem = memoryMarketStore()
    const spy = vi.spyOn(mem.store, 'ensureCatalog')
    await ingestAll(mem.store, fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }).fetchers, { trigger: 'cron', today: TODAY })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
