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
    async calendar(from, to) {
      calls.push({ kind: 'cot', id: 'calendar', start: from })
      if (fail.includes('calendar')) throw new Error('HTTP 502')
      return [
        { id: 'release:10:2026-12-10', kind: 'release', title: 'IPC', agency: 'BLS', at: 0, date: '2026-12-10', impact: 'high', timeOfficial: false },
        { id: 'release:50:2026-12-04', kind: 'release', title: 'Emploi', agency: 'BLS', at: 0, date: '2026-12-04', impact: 'high', timeOfficial: false },
      ].filter(e => e.date >= from && e.date <= to) as Awaited<ReturnType<MarketFetchers['calendar']>>
    },
    async ecb(code, start) {
      calls.push({ kind: 'fred', id: code, start })
      if (fail.includes(code)) throw new Error('HTTP 500')
      return [{ date: start, value: 2.5 }]
    },
    async news() {
      if (fail.includes('news')) throw new Error('HTTP 503')
      const item = { id: 'fed:https://www.federalreserve.gov/a.htm', source: 'fed' as const, kind: 'press' as const, title: 'A', summary: null, url: 'https://www.federalreserve.gov/a.htm', category: null, impact: 'low' as const, publishedAt: 1 }
      return { items: [item, item], errors: fail.includes('news-partial') ? ['BCE : HTTP 500'] : [] }
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
    expect(mem.journal.map(j => [j.source, j.trigger, j.status])).toEqual([
      ['fred', 'cron', 'partial'], ['cftc', 'cron', 'partial'], ['ecb', 'cron', 'ok'], ['calendar', 'cron', 'ok'], ['news', 'cron', 'ok'],
    ])
    expect(mem.journal[0].error).toContain('ICSA')
  })

  it('toutes les séries en erreur → « échec »', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }, [...FRED_SERIES.map(s => s.code), ...COT_MARKETS.map(m => m.code), 'ECB_DFR', 'ECB_MRO', 'calendar', 'news'])
    const results = await ingestAll(mem.store, src.fetchers, { trigger: 'admin', today: TODAY })
    expect(results.map(r => r.status)).toEqual(['error', 'error', 'error', 'error', 'error'])
  })

  it('actus : sans doublon (même clé deux fois = une ligne), relance idempotente, flux en panne = partiel', async () => {
    const mem = memoryMarketStore()
    await ingestAll(mem.store, fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }).fetchers, { trigger: 'cron', today: TODAY })
    await ingestAll(mem.store, fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }).fetchers, { trigger: 'cron', today: TODAY })
    expect(mem.news()).toHaveLength(1)
    const partial = await ingestAll(memoryMarketStore().store, fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }, ['news-partial']).fetchers, { trigger: 'cron', today: TODAY })
    expect(partial.at(-1)).toMatchObject({ source: 'news', status: 'partial', errors: ['BCE : HTTP 500'] })
  })

  it('le catalogue est enregistré à chaque passage FRED', async () => {
    const mem = memoryMarketStore()
    const spy = vi.spyOn(mem.store, 'ensureCatalog')
    await ingestAll(mem.store, fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' }).fetchers, { trigger: 'cron', today: TODAY })
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it('calendrier : remplace la fenêtre (un événement déplacé disparaît), idempotent', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' })
    await ingestAll(mem.store, src.fetchers, { trigger: 'cron', today: TODAY })
    expect(mem.calendarEvents().map(e => e.id)).toEqual(['release:10:2026-12-10', 'release:50:2026-12-04'])
    // La source ne renvoie plus l'emploi du 4 déc. (date déplacée) : retiré.
    await mem.store.replaceCalendarEvents('2026-08-29', [mem.calendarEvents()[0]])
    expect(mem.calendarEvents().map(e => e.id)).toEqual(['release:10:2026-12-10'])
    await mem.store.replaceCalendarEvents('2026-08-29', [mem.calendarEvents()[0]])
    expect(mem.calendarEvents()).toHaveLength(1)
  })
  it('BCE : historique depuis 2016, puis incrémental', async () => {
    const mem = memoryMarketStore()
    const src = fakeFetchers({ fred: '2026-11-25', cot: '2026-11-17' })
    await ingestAll(mem.store, src.fetchers, { trigger: 'backfill', today: TODAY })
    expect(src.calls.find(c => c.id === 'ECB_DFR')?.start).toBe('2016-01-01')
  })
})
