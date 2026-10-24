import { describe, it, expect } from 'vitest'
import {
  projectToLegacy,
  profitFactor,
  analyzeBy,
  readSingle,
  readMulti,
  readPaired,
  MIN_TRADES_FOR_SIGNAL,
  type BacktestEntry,
  type CriteriaMap,
} from './criteria'

// ─── Helpers ────────────────────────────────────────────────────────────────

function entry(
  overrides: Partial<BacktestEntry> & Pick<BacktestEntry, 'criteria' | 'result' | 'r_result'>,
): BacktestEntry {
  return { id: Math.random().toString(36).slice(2), ...overrides }
}

// ─── readSingle / readMulti / readPaired ────────────────────────────────────

describe('readers — narrowing au runtime', () => {
  const c: CriteriaMap = {
    session: 'preopen',
    fibonacci: ['50', '61.8'],
    zone: [{ element: 'OB', timeframe: 'M5' }],
    bogus: 42 as unknown as never,
  }

  it('readSingle', () => {
    expect(readSingle(c, 'session')).toBe('preopen')
    expect(readSingle(c, 'absent')).toBeNull()
    expect(readSingle(c, 'bogus')).toBeNull()
    expect(readSingle({ x: ['y'] }, 'x')).toBe('y') // tolérance 1-array
  })

  it('readMulti', () => {
    expect(readMulti(c, 'fibonacci')).toEqual(['50', '61.8'])
    expect(readMulti(c, 'absent')).toEqual([])
    expect(readMulti({ x: 'y' }, 'x')).toEqual(['y']) // tolérance single→multi
  })

  it('readPaired', () => {
    expect(readPaired(c, 'zone')).toEqual([{ element: 'OB', timeframe: 'M5' }])
    expect(readPaired(c, 'absent')).toEqual([])
    expect(readPaired({ x: ['bad'] as unknown as never }, 'x')).toEqual([])
  })
})

// ─── projectToLegacy ───────────────────────────────────────────────────────

describe('projectToLegacy — double-écriture setup_types / signals / has_confluence', () => {
  it('zones paired → setup_types ("OB M5"), ordre préservé', () => {
    const r = projectToLegacy({
      zone: [
        { element: 'OB', timeframe: 'M5' },
        { element: 'FVG', timeframe: 'M15' },
      ],
    })
    expect(r.setup_types).toEqual(['OB M5', 'FVG M15'])
    expect(r.signals).toEqual([])
  })

  it('fibonacci → "<v> %" avec virgule française', () => {
    const r = projectToLegacy({ fibonacci: ['50', '61.8', '78.6'] })
    expect(r.setup_types).toEqual(['50 %', '61,8 %', '78,6 %'])
  })

  it('signaux paired → signals ("Hammer M1")', () => {
    const r = projectToLegacy({
      signal: [{ element: 'Hammer', timeframe: 'M1' }],
    })
    expect(r.signals).toEqual(['Hammer M1'])
    expect(r.setup_types).toEqual([])
  })

  it('my_setups → setup_types tels quels', () => {
    const r = projectToLegacy({ my_setups: ['mon-super-setup', 'autre'] })
    expect(r.setup_types).toEqual(['mon-super-setup', 'autre'])
  })

  it('mix : zone + fibonacci + signal + my_setups', () => {
    const r = projectToLegacy({
      zone: [{ element: 'OB', timeframe: 'M5' }],
      fibonacci: ['50'],
      signal: [{ element: 'Hammer', timeframe: 'M1' }],
      my_setups: ['custom-x'],
      session: 'preopen', // ignoré
    })
    expect(r.setup_types).toEqual(['OB M5', '50 %', 'custom-x'])
    expect(r.signals).toEqual(['Hammer M1'])
  })

  it('has_confluence = true si 2+ éléments cumulés zones + fibonacci', () => {
    expect(projectToLegacy({ zone: [{ element: 'OB', timeframe: 'M5' }] }).has_confluence).toBe(false)
    expect(projectToLegacy({ fibonacci: ['50'] }).has_confluence).toBe(false)
    expect(projectToLegacy({
      zone: [{ element: 'OB', timeframe: 'M5' }, { element: 'FVG', timeframe: 'M15' }],
    }).has_confluence).toBe(true)
    expect(projectToLegacy({
      zone: [{ element: 'OB', timeframe: 'M5' }],
      fibonacci: ['50'],
    }).has_confluence).toBe(true)
    expect(projectToLegacy({ fibonacci: ['50', '61.8'] }).has_confluence).toBe(true)
  })

  it('has_confluence : les signaux et my_setups ne comptent PAS', () => {
    expect(projectToLegacy({
      signal: [
        { element: 'Hammer', timeframe: 'M1' },
        { element: 'Engulfing', timeframe: 'M5' },
      ],
      my_setups: ['a', 'b'],
    }).has_confluence).toBe(false)
  })

  it('vide → tout vide', () => {
    const r = projectToLegacy({})
    expect(r).toEqual({ setup_types: [], signals: [], has_confluence: false })
  })
})

// ─── profitFactor ──────────────────────────────────────────────────────────

describe('profitFactor — null si aucune perte', () => {
  it('vide → null', () => {
    expect(profitFactor([])).toBeNull()
  })

  it('que des gains → null (plus de "++")', () => {
    expect(profitFactor([
      { result: 'win', r_result: 2 },
      { result: 'win', r_result: 1.5 },
    ])).toBeNull()
  })

  it('gains 6 R, pertes 2 R → 3', () => {
    expect(profitFactor([
      { result: 'win',  r_result: 3 },
      { result: 'win',  r_result: 3 },
      { result: 'loss', r_result: -1 },
      { result: 'loss', r_result: -1 },
    ])).toBe(3)
  })

  it('gains 4 R, pertes 5 R → 0,8', () => {
    expect(profitFactor([
      { result: 'win',  r_result: 2 },
      { result: 'win',  r_result: 2 },
      { result: 'loss', r_result: -5 },
    ])).toBe(0.8)
  })

  it('BE ne compte ni en gain ni en perte', () => {
    expect(profitFactor([
      { result: 'win', r_result: 2 },
      { result: 'be',  r_result: 0 },
      { result: 'loss', r_result: -1 },
    ])).toBe(2)
  })

  it('que des BE → null (losses = 0)', () => {
    expect(profitFactor([{ result: 'be', r_result: 0 }])).toBeNull()
  })
})

// ─── analyzeBy ─────────────────────────────────────────────────────────────

describe('analyzeBy — single', () => {
  const base: BacktestEntry[] = [
    entry({ criteria: { session: 'preopen' }, result: 'win',  r_result: 2 }),
    entry({ criteria: { session: 'preopen' }, result: 'loss', r_result: -1 }),
    entry({ criteria: { session: 'open' },    result: 'win',  r_result: 1 }),
  ]
  it('regroupe par valeur string', () => {
    const r = analyzeBy(base, 'session', 'single')
    expect(r).toHaveLength(2)
    const preopen = r.find(x => x.key === 'preopen')!
    expect(preopen.n).toBe(2)
    expect(preopen.wins).toBe(1)
    expect(preopen.winRate).toBe(50)
    expect(preopen.totalR).toBe(1)
    expect(preopen.avgR).toBe(0.5)
  })
})

describe('analyzeBy — multi', () => {
  const data: BacktestEntry[] = [
    entry({ criteria: { fibonacci: ['50', '61.8'] }, result: 'win',  r_result: 2 }),
    entry({ criteria: { fibonacci: ['50'] },         result: 'loss', r_result: -1 }),
    entry({ criteria: { fibonacci: ['61.8'] },       result: 'win',  r_result: 1 }),
  ]
  it('un trade compte dans CHACUNE de ses valeurs', () => {
    const r = analyzeBy(data, 'fibonacci', 'multi')
    const r50 = r.find(x => x.key === '50')!
    const r618 = r.find(x => x.key === '61.8')!
    expect(r50.n).toBe(2); expect(r50.wins).toBe(1)
    expect(r618.n).toBe(2); expect(r618.wins).toBe(2)
  })

  it('déduplication intra-trade (même valeur deux fois dans un trade = 1 compte)', () => {
    const r = analyzeBy(
      [entry({ criteria: { fibonacci: ['50', '50'] }, result: 'win', r_result: 1 })],
      'fibonacci', 'multi',
    )
    expect(r.find(x => x.key === '50')!.n).toBe(1)
  })
})

describe('analyzeBy — paired : mode élément / unité / paire', () => {
  const data: BacktestEntry[] = [
    entry({ criteria: { zone: [{ element: 'OB',  timeframe: 'M5'  }, { element: 'FVG', timeframe: 'M15' }] }, result: 'win',  r_result: 2 }),
    entry({ criteria: { zone: [{ element: 'OB',  timeframe: 'M15' }] },                                        result: 'loss', r_result: -1 }),
    entry({ criteria: { zone: [{ element: 'FVG', timeframe: 'M5'  }] },                                        result: 'win',  r_result: 1 }),
  ]

  it('mode "element" : groupe par .element', () => {
    const r = analyzeBy(data, 'zone', 'paired', 'element')
    const ob = r.find(x => x.key === 'OB')!
    const fvg = r.find(x => x.key === 'FVG')!
    expect(ob.n).toBe(2);  expect(ob.wins).toBe(1)
    expect(fvg.n).toBe(2); expect(fvg.wins).toBe(2)
  })

  it('mode "timeframe" : groupe par .timeframe', () => {
    const r = analyzeBy(data, 'zone', 'paired', 'timeframe')
    const m5 = r.find(x => x.key === 'M5')!
    const m15 = r.find(x => x.key === 'M15')!
    expect(m5.n).toBe(2);  expect(m5.wins).toBe(2)
    expect(m15.n).toBe(2); expect(m15.wins).toBe(1)
  })

  it('mode "pair" : groupe par couple, label avec séparateur ·', () => {
    const r = analyzeBy(data, 'zone', 'paired', 'pair')
    const obM5 = r.find(x => x.key === 'OB M5')!
    expect(obM5.n).toBe(1)
    expect(obM5.label).toBe('OB · M5')
    expect(r.map(x => x.key).sort()).toEqual(['FVG M15', 'FVG M5', 'OB M15', 'OB M5'])
  })

  it('mode "element" : dédoublonne un trade qui a 2 paires du même élément', () => {
    const r = analyzeBy(
      [entry({
        criteria: { zone: [{ element: 'OB', timeframe: 'M5' }, { element: 'OB', timeframe: 'M15' }] },
        result: 'win', r_result: 1,
      })],
      'zone', 'paired', 'element',
    )
    expect(r.find(x => x.key === 'OB')!.n).toBe(1)
  })
})

describe('analyzeBy — alerte échantillon insuffisant', () => {
  it(`n < ${MIN_TRADES_FOR_SIGNAL} → insufficient=true`, () => {
    const data: BacktestEntry[] = Array.from({ length: 9 }, (_, i) =>
      entry({ criteria: { session: 'preopen' }, result: i < 5 ? 'win' : 'loss', r_result: i < 5 ? 1 : -1 }),
    )
    const r = analyzeBy(data, 'session', 'single')
    expect(r[0].insufficient).toBe(true)
    expect(r[0].n).toBe(9)
  })

  it(`n = ${MIN_TRADES_FOR_SIGNAL} → insufficient=false`, () => {
    const data: BacktestEntry[] = Array.from({ length: MIN_TRADES_FOR_SIGNAL }, () =>
      entry({ criteria: { session: 'preopen' }, result: 'win', r_result: 1 }),
    )
    const r = analyzeBy(data, 'session', 'single')
    expect(r[0].insufficient).toBe(false)
  })
})

describe('analyzeBy — tri', () => {
  it('par totalR desc, puis n desc, puis key asc', () => {
    const data: BacktestEntry[] = [
      // option 'B' : totalR = 3
      entry({ criteria: { x: 'B' }, result: 'win', r_result: 3 }),
      // option 'A' : totalR = 5
      entry({ criteria: { x: 'A' }, result: 'win', r_result: 5 }),
      // option 'C' : totalR = 5 mais n = 2
      entry({ criteria: { x: 'C' }, result: 'win', r_result: 3 }),
      entry({ criteria: { x: 'C' }, result: 'win', r_result: 2 }),
    ]
    const r = analyzeBy(data, 'x', 'single').map(x => x.key)
    // C: totalR=5, n=2 → avant A (totalR=5, n=1), puis B
    expect(r).toEqual(['C', 'A', 'B'])
  })
})

describe('analyzeBy — vide / absent', () => {
  it('entrées sans la catégorie → aucune ligne', () => {
    const r = analyzeBy(
      [entry({ criteria: {}, result: 'win', r_result: 1 })],
      'absent', 'single',
    )
    expect(r).toEqual([])
  })
})
