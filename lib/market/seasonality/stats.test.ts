import { describe, expect, it } from 'vitest'
import { monthlyReturns, parseShillerCsv } from './shiller'
import {
  JOURNAL_MIN_SESSIONS, JOURNAL_MIN_TIMED_TRADES, cumulativePath, cycleMonthlyMeans, cycleStats, cycleYear,
  journalFromRows, journalSeasonality, monthlyStats, seriesStats, weekdayIndex, yearReturn,
} from './stats'
import { SP500_MONTHLY_RETURNS, SP500_SOURCE } from './sp500-returns'

describe('Shiller : lecture du CSV et rendements', () => {
  const csv = [
    'Stock Market Data Used in "Irrational Exuberance"',
    'Date,P,D',
    '2025.11,100,1',
    '2025.12,110,1',
    '2026.01,99,1',
    '2026.09,100,1',
    '2026.1,105,1',
    '2026.11,"1,000.5",1',
    ',Nov price is Nov 12th close',
  ].join('\n')
  it('dates de Shiller (2026.1 = octobre), en-têtes et notes ignorés', () => {
    expect(parseShillerCsv(csv).map(p => p.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-09', '2026-10'])
  })
  it('rendement = variation de la moyenne mensuelle ; mois partiel exclu ; trou = null', () => {
    const r = monthlyReturns(parseShillerCsv(csv), 2025, '2026-10')
    expect(r[2025][11]).toBe(10)
    expect(r[2026][0]).toBe(-10)
    expect(r[2026][1]).toBeNull() // février absent
    expect(r[2026][9]).toBe(5)
    expect(r[2026][10]).toBeNull() // novembre : après le dernier mois complet
  })
})

describe('statistiques d’une série', () => {
  const xs = [{ year: 2001, value: 2 }, { year: 2002, value: -4 }, { year: 2003, value: 6 }, { year: 2004, value: 0 }]
  it('moyenne, médiane, part en hausse, volatilité, extrêmes', () => {
    const s = seriesStats(xs)!
    expect(s.mean).toBe(1)
    expect(s.median).toBe(1)
    expect(s.upCount).toBe(2)
    expect(s.upShare).toBe(50)
    expect(s.volatility).toBeCloseTo(Math.sqrt((1 + 25 + 25 + 1) / 3), 10)
    expect(s.best).toEqual({ year: 2003, value: 6 })
    expect(s.worst).toEqual({ year: 2002, value: -4 })
    expect(seriesStats([])).toBeNull()
  })
  it('par mois, sur la fenêtre demandée seulement', () => {
    const data = { 2020: [1, ...Array(11).fill(0)], 2021: [3, ...Array(11).fill(0)], 2022: [-10, ...Array(11).fill(0)] }
    expect(monthlyStats(data, 2020, 2021)[0]?.mean).toBe(2)
    expect(monthlyStats(data, 2020, 2022)[0]?.worst).toEqual({ year: 2022, value: -10 })
  })
  it('année : 12 mois composés, null si un mois manque', () => {
    expect(yearReturn([10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(21, 10)
    expect(yearReturn([10, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
  it('trajectoire cumulée, arrêtée au dernier mois connu', () => {
    const p = cumulativePath([10, -10, null, 5])
    expect(p).toHaveLength(3)
    expect(p[2]).toBeCloseTo(-1, 10)
  })
})

describe('cycle présidentiel', () => {
  it('2026 = mi-mandat, 2028 = élection, 1950 = mi-mandat', () => {
    expect(cycleYear(2025)).toBe(1)
    expect(cycleYear(2026)).toBe(2)
    expect(cycleYear(2027)).toBe(3)
    expect(cycleYear(2028)).toBe(4)
    expect(cycleYear(1950)).toBe(2)
    expect(cycleYear(1952)).toBe(4)
  })
  it('statistiques annuelles regroupées par année du cycle', () => {
    const flat = (v: number) => [v, ...Array(11).fill(0)]
    const data = { 2021: flat(10), 2022: flat(-20), 2023: flat(5), 2024: flat(1), 2025: flat(3), 2026: flat(4) }
    const s = cycleStats(data, 2021, 2025)
    expect(s[1]?.n).toBe(2) // 2021, 2025
    expect(s[1]?.mean).toBeCloseTo(6.5, 10)
    expect(s[2]?.worst.year).toBe(2022)
    expect(s[4]?.mean).toBeCloseTo(1, 10)
    expect(cycleMonthlyMeans(data, 2, 2021, 2026)[0]).toBeCloseTo(-8, 10) // 2022 et 2026
  })
})

describe('données Shiller figées dans le repo', () => {
  it('source datée, 1950 → année en cours, rien après le dernier mois complet', () => {
    expect(SP500_SOURCE.url).toBe('https://shillerdata.com/')
    expect(SP500_MONTHLY_RETURNS[1950]).toHaveLength(12)
    const [y, m] = SP500_SOURCE.lastMonth.split('-').map(Number)
    expect(SP500_MONTHLY_RETURNS[y][m - 1]).not.toBeNull()
    expect(SP500_MONTHLY_RETURNS[y].slice(m).every(v => v === null)).toBe(true)
  })
  it('recoupement : octobre 2008 ≈ −20,4 % (moyennes mensuelles)', () => {
    expect(SP500_MONTHLY_RETURNS[2008][9]).toBeCloseTo(-20.39, 1)
  })
})

describe('journal du membre', () => {
  const day = (i: number) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(5 + (i % 5)).padStart(2, '0')}`
  it(`seuil : ${JOURNAL_MIN_SESSIONS} sessions minimum`, () => {
    const few = Array.from({ length: JOURNAL_MIN_SESSIONS - 1 }, (_, i) => ({ date: day(i), pnl: 100 }))
    expect(journalSeasonality(few).enough).toBe(false)
    expect(journalSeasonality([...few, { date: '2026-03-02', pnl: -50 }]).enough).toBe(true)
  })
  it('P&L et taux de réussite par mois et par jour de la semaine', () => {
    const j = journalSeasonality([
      { date: '2026-03-02', pnl: 200 }, // lundi
      { date: '2026-03-03', pnl: -100 }, // mardi
      { date: '2026-03-09', pnl: 50 }, // lundi
      { date: '2026-04-06', pnl: 0 }, // lundi
    ])
    expect(j.byMonth[2]).toMatchObject({ count: 3, pnl: 150, wins: 2 })
    expect(j.byMonth[2].winRate).toBeCloseTo(66.667, 2)
    expect(j.byWeekday).toHaveLength(5)
    expect(j.byWeekday[0]).toMatchObject({ label: 'lundi', count: 3, pnl: 250, wins: 2 })
    expect(j.byWeekday[1].winRate).toBe(0)
    expect(j.byWeekday[4].winRate).toBeNull()
  })
  it(`par heure : trades horodatés seulement, ${JOURNAL_MIN_TIMED_TRADES} minimum`, () => {
    const trades = Array.from({ length: JOURNAL_MIN_TIMED_TRADES }, (_, i) => ({ time: i % 2 ? '15:31:02' : '16:05:00', pnl: i % 2 ? 10 : -5 }))
    const j = journalSeasonality([{ date: '2026-03-02', pnl: 50, trades }])
    expect(j.byHour?.map(b => [b.label, b.count, b.pnl])).toEqual([['15h', 10, 100], ['16h', 10, -50]])
    expect(journalSeasonality([{ date: '2026-03-02', pnl: 50, trades: trades.slice(1) }]).byHour).toBeNull()
  })
  it('lignes du journal : setup JSON avec trades_detail, setup invalide toléré', () => {
    const rows = journalFromRows([
      { session_date: '2026-03-02', pnl: '120.50', setup: JSON.stringify({ trades_detail: [{ time: '15:40:00', pnl: 120.5, inst: 'NQ' }] }) },
      { session_date: '2026-03-03', pnl: null, setup: 'pas du JSON' },
      { session_date: null, pnl: 10, setup: null },
    ])
    expect(rows).toEqual([
      { date: '2026-03-02', pnl: 120.5, trades: [{ time: '15:40:00', pnl: 120.5 }] },
      { date: '2026-03-03', pnl: 0, trades: undefined },
    ])
  })
  it('jour de la semaine indépendant du fuseau du serveur', () => {
    expect(weekdayIndex('2026-11-27')).toBe(4) // vendredi
    expect(weekdayIndex('2026-11-29')).toBe(6) // dimanche
  })
})

describe('lecture de la saisonnalité (règles)', () => {
  // 20 années complètes 2006-2025 : novembre toujours en hausse (+2), mars toujours en baisse (−1), le reste à +0,5.
  const data: Record<number, (number | null)[]> = {}
  for (let y = 1950; y <= 2025; y++) data[y] = Array.from({ length: 12 }, (_, m) => (m === 10 ? 2 : m === 2 ? -1 : 0.5))
  data[2026] = [1, 1, 1, null, null, null, null, null, null, null, null, null]
  it('fenêtre : 20 années complètes, année en cours partielle', async () => {
    const { seasonalitySummary } = await import('./summary')
    const sum = seasonalitySummary(data, '2026-03', 2026)
    expect([sum.window.from, sum.window.to, sum.window.partialYear]).toEqual([2006, 2025, 2026])
    expect(sum.currentCycle).toBe(2)
    expect(sum.partialPath).toHaveLength(4)
  })
  it('mois régulier, comparaison à une année moyenne, cycle, avertissement', async () => {
    const { seasonalitySummary, seasonalityReading } = await import('./summary')
    const sum = seasonalitySummary(data, '2026-03', 2026)
    const r = seasonalityReading(sum, 10)
    expect(r[0]).toBe('Novembre : S&P 500 en hausse 20 années sur 20, +2,00 % en moyenne : l’un des mois les plus réguliers de 2006 à 2025.')
    expect(r[1]).toMatch(/^2026 fait mieux qu’une année moyenne : \+3,0 % fin mars, contre /)
    expect(r[2]).toMatch(/^Mi-mandat : .* depuis 1950, en hausse 19 années sur 19\.$/)
    expect(r.at(-1)).toBe('La saisonnalité donne un vent de fond, jamais un signal d’entrée.')
    expect(seasonalityReading(sum, 2)[0]).toMatch(/en hausse 0 année sur 20.*les moins réguliers/)
  })
})
