import { describe, expect, it } from 'vitest'
import { cotSnapshot, netHistory, pctOfOi, percentileReading, usualPublicationDate } from './cot'
import { percentileRank, valueAt, percentileAt } from './stats'
import type { CotRow } from './cftc'

const row = (reportDate: string, am: [number, number], lev: [number, number], dl: [number, number], oi: number): CotRow => ({
  market: 'NQ', reportDate, cftcCode: '209742', openInterest: oi,
  assetMgrLong: am[0], assetMgrShort: am[1], levMoneyLong: lev[0], levMoneyShort: lev[1], dealerLong: dl[0], dealerShort: dl[1],
})

describe('percentile', () => {
  it('rang moyen : minimum ≈ 0, maximum ≈ 100, médiane 50', () => {
    const values = [1, 2, 3, 4, 5]
    expect(percentileRank(values, 1)).toBe(10)
    expect(percentileRank(values, 5)).toBe(90)
    expect(percentileRank(values, 3)).toBe(50)
    expect(percentileRank([2, 2, 2, 2], 2)).toBe(50)
    expect(percentileRank([], 1)).toBeNull()
  })
  it('valeur à date (dernière observation ≤ date) et percentile sur fenêtre glissante', () => {
    const obs = [{ date: '2020-01-01', value: 10 }, { date: '2024-01-01', value: 1 }, { date: '2025-01-01', value: 2 }, { date: '2026-01-01', value: 3 }]
    expect(valueAt(obs, '2025-06-01')).toBe(2)
    expect(valueAt(obs, '2019-01-01')).toBeNull()
    // Fenêtre 3 ans au 2026-01-01 : 1, 2, 3 (2020 exclu) → 3 est le max.
    expect(percentileAt(obs, '2026-01-01', 3)).toBeCloseTo(83.33, 1)
  })
})

describe('COT : nettes, % OI, variation, percentile 3 ans', () => {
  // Valeurs réelles NQ du 17/11/2026 (futures seuls).
  const last = row('2026-11-17', [112461, 29561], [53394, 64322], [46518, 136196], 296423)
  const prev = row('2026-11-10', [107927, 35142], [58721, 44754], [44896, 144995], 288717)

  it('position nette, % de l’open interest, variation sur la semaine', () => {
    const s = cotSnapshot([prev, last])!
    expect(s.categories.assetMgr.net).toBe(82900)
    expect(s.categories.levMoney.net).toBe(-10928)
    expect(s.categories.dealer.net).toBe(-89678)
    expect(s.categories.assetMgr.pctOi).toBeCloseTo(27.97, 2)
    expect(s.categories.assetMgr.change).toBe(82900 - (107927 - 35142))
    expect(s.categories.levMoney.change).toBe(-10928 - (58721 - 44754))
    expect(s.openInterestChange).toBe(296423 - 288717)
  })
  it('date de publication habituelle : le vendredi qui suit le mardi', () => {
    expect(usualPublicationDate('2026-11-17')).toBe('2026-11-20')
    expect(usualPublicationDate('2026-11-24')).toBe('2026-11-27')
  })
  it('percentile sur 3 ans : les rapports plus anciens sont exclus', () => {
    const rows = [
      row('2022-01-04', [900, 0], [0, 0], [0, 0], 1000), // hors fenêtre (> 3 ans) : ne compte pas
      row('2024-01-02', [100, 0], [0, 0], [0, 0], 1000),
      row('2025-01-07', [200, 0], [0, 0], [0, 0], 1000),
      row('2026-01-06', [300, 0], [0, 0], [0, 0], 1000),
    ]
    const s = cotSnapshot(rows)!
    expect(s.categories.assetMgr.percentile).toBeCloseTo(83.33, 1)
  })
  it('premier rapport : pas de variation, open interest nul : pas de %', () => {
    const s = cotSnapshot([last])!
    expect(s.categories.assetMgr.change).toBeNull()
    expect(pctOfOi(10, 0)).toBeNull()
  })
  it('historique des nettes pour le graphique, à partir d’une date', () => {
    const h = netHistory([prev, last], '2026-11-15')
    expect(h.find(c => c.category === 'levMoney')?.points).toEqual([{ date: '2026-11-17', value: -10928 }])
  })
  it('lecture relative aux 3 ans : seuils 10 / 20 / 80 / 90, extrême à 10 et moins ou 90 et plus', () => {
    expect(percentileReading(8)).toEqual({ label: 'Proche du plus bas sur 3 ans', extreme: true })
    expect(percentileReading(10).extreme).toBe(true)
    expect(percentileReading(18)).toEqual({ label: 'Plus vendeurs que d’habitude', extreme: false })
    expect(percentileReading(50).label).toBe('Dans la norme')
    expect(percentileReading(84)).toEqual({ label: 'Plus acheteurs que d’habitude', extreme: false })
    expect(percentileReading(90)).toEqual({ label: 'Proche du plus haut sur 3 ans', extreme: true })
    // Aucune formulation absolue (« très acheteur ») : une nette vendeuse peut être « plus acheteuse que d'habitude ».
    for (const p of [0, 15, 50, 85, 100]) expect(percentileReading(p).label).not.toMatch(/Très/)
  })
})
