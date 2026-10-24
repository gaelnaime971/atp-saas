import { describe, it, expect } from 'vitest'
import {
  projectToLegacy,
  profitFactor,
  analyzeBy,
  readSingle,
  readMulti,
  readPaired,
  isAtpCategory,
  moveItem,
  validateCategoryDraft,
  isValidCategoryDraft,
  legacyZoneLabel,
  legacySignalLabel,
  legacyFibonacciLabel,
  MIN_TRADES_FOR_SIGNAL,
  type BacktestEntry,
  type CriteriaMap,
  type CategoryDraft,
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

  it('fibonacci → "38.2%", "50%", "61.8%", "78.6%" (point, SANS espace)', () => {
    const r = projectToLegacy({ fibonacci: ['38.2', '50', '61.8', '78.6'] })
    expect(r.setup_types).toEqual(['38.2%', '50%', '61.8%', '78.6%'])
  })

  it('fibonacci avec virgule française en entrée → normalisé point', () => {
    const r = projectToLegacy({ fibonacci: ['61,8'] })
    expect(r.setup_types).toEqual(['61.8%'])
  })

  it('signaux paired → signals ("Hammer M1")', () => {
    const r = projectToLegacy({
      signal: [{ element: 'Hammer', timeframe: 'M1' }],
    })
    expect(r.signals).toEqual(['Hammer M1'])
    expect(r.setup_types).toEqual([])
  })

  it('"Pin Bar" quelle que soit l\'unité → "Pin Bar" sans unité', () => {
    expect(projectToLegacy({ signal: [{ element: 'Pin Bar', timeframe: 'M1' }] }).signals)
      .toEqual(['Pin Bar'])
    expect(projectToLegacy({ signal: [{ element: 'Pin Bar', timeframe: 'M5' }] }).signals)
      .toEqual(['Pin Bar'])
    expect(projectToLegacy({ signal: [{ element: 'Pin Bar', timeframe: '100T' }] }).signals)
      .toEqual(['Pin Bar'])
  })

  it('combinaison non catalogue → fallback "Élément Unité"', () => {
    // Engulfing 100T n'existe pas dans l'ancien catalogue → fallback
    expect(projectToLegacy({ signal: [{ element: 'Engulfing', timeframe: '100T' }] }).signals)
      .toEqual(['Engulfing 100T'])
    // BOS H4 n'existe pas dans l'ancien catalogue → fallback
    expect(projectToLegacy({ zone: [{ element: 'BOS', timeframe: 'H4' }] }).setup_types)
      .toEqual(['BOS H4'])
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
    expect(r.setup_types).toEqual(['OB M5', '50%', 'custom-x'])
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

// ─── labels legacy exposés unitairement ────────────────────────────────────

describe('legacyZoneLabel / legacySignalLabel / legacyFibonacciLabel', () => {
  it('zone : catalogue connu renvoyé à l\'identique, sinon fallback', () => {
    expect(legacyZoneLabel('OB',  'M5')).toBe('OB M5')
    expect(legacyZoneLabel('FVG', 'H4')).toBe('FVG H4')
    expect(legacyZoneLabel('BOS', 'H4')).toBe('BOS H4') // fallback
    expect(legacyZoneLabel('Custom', 'M30')).toBe('Custom M30')
  })

  it('signal : "Pin Bar" ignore toujours la TF, Hammer/Engulfing suivent le catalogue', () => {
    expect(legacySignalLabel('Hammer', '100T')).toBe('Hammer 100T')
    expect(legacySignalLabel('Hammer', 'M1')).toBe('Hammer M1')
    expect(legacySignalLabel('Engulfing', 'M5')).toBe('Engulfing M5')
    expect(legacySignalLabel('Pin Bar', 'M5')).toBe('Pin Bar')
    expect(legacySignalLabel('Pin Bar', '100T')).toBe('Pin Bar')
    expect(legacySignalLabel('CustomSig', 'M5')).toBe('CustomSig M5') // fallback
  })

  it('fibonacci : "38.2%", "50%", "61.8%", "78.6%" ; virgule normalisée en point', () => {
    expect(legacyFibonacciLabel('38.2')).toBe('38.2%')
    expect(legacyFibonacciLabel('50')).toBe('50%')
    expect(legacyFibonacciLabel('61.8')).toBe('61.8%')
    expect(legacyFibonacciLabel('78.6')).toBe('78.6%')
    expect(legacyFibonacciLabel('61,8')).toBe('61.8%')  // tolérance virgule
    expect(legacyFibonacciLabel('42')).toBe('42%')      // fallback
  })
})

// ─── isAtpCategory ─────────────────────────────────────────────────────────

describe('isAtpCategory — les 4 keys semées sont ATP, le reste est Perso', () => {
  it.each(['zone', 'fibonacci', 'signal', 'my_setups'])('ATP : "%s"', (k) => {
    expect(isAtpCategory(k)).toBe(true)
  })
  it.each(['session', 'context', 'management', 'news', 'mindset', 'custom_whatever', ''])(
    'Perso : "%s"', (k) => {
      expect(isAtpCategory(k)).toBe(false)
    },
  )
})

// ─── moveItem ──────────────────────────────────────────────────────────────

describe('moveItem — réordonnancement pur', () => {
  it('déplace from=0 → to=2', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 0, 2)).toEqual(['B', 'C', 'A', 'D'])
  })
  it('déplace from=3 → to=1', () => {
    expect(moveItem(['A', 'B', 'C', 'D'], 3, 1)).toEqual(['A', 'D', 'B', 'C'])
  })
  it('from === to → copie inchangée', () => {
    const src = ['A', 'B', 'C']
    const out = moveItem(src, 1, 1)
    expect(out).toEqual(['A', 'B', 'C'])
    expect(out).not.toBe(src) // nouvelle copie
  })
  it('hors bornes → copie inchangée', () => {
    expect(moveItem(['A', 'B'], -1, 0)).toEqual(['A', 'B'])
    expect(moveItem(['A', 'B'], 0, 5)).toEqual(['A', 'B'])
    expect(moveItem(['A', 'B'], 5, 0)).toEqual(['A', 'B'])
  })
  it('ne mute pas la source', () => {
    const src = [1, 2, 3]
    moveItem(src, 0, 2)
    expect(src).toEqual([1, 2, 3])
  })
  it('array vide → vide', () => {
    expect(moveItem<number>([], 0, 1)).toEqual([])
  })
})

// ─── validateCategoryDraft ─────────────────────────────────────────────────

function draft(partial: Partial<CategoryDraft> = {}): CategoryDraft {
  return {
    label: 'Nouveau critère',
    selection: 'single',
    options: ['A', 'B'],
    timeframes: [],
    ...partial,
  }
}

describe('validateCategoryDraft — nom', () => {
  it('nom vide → erreur', () => {
    const r = validateCategoryDraft(draft({ label: '  ' }), [])
    expect(r.label).toBeDefined()
  })
  it('nom déjà pris → erreur insensible à la casse', () => {
    const r = validateCategoryDraft(draft({ label: 'Zones' }), ['Fibonacci', 'ZONES'])
    expect(r.label).toContain('déjà')
  })
  it('nom libre → pas d\'erreur de nom', () => {
    const r = validateCategoryDraft(draft({ label: 'Nouveau' }), ['Zones', 'Fibonacci'])
    expect(r.label).toBeUndefined()
  })
})

describe('validateCategoryDraft — options (single/multi : ≥ 2)', () => {
  it('0 option → erreur', () => {
    const r = validateCategoryDraft(draft({ options: [] }), [])
    expect(r.options).toContain('2')
  })
  it('1 option → erreur', () => {
    const r = validateCategoryDraft(draft({ options: ['X'] }), [])
    expect(r.options).toContain('2')
  })
  it('2 options → OK', () => {
    const r = validateCategoryDraft(draft({ options: ['X', 'Y'] }), [])
    expect(r.options).toBeUndefined()
  })
  it('doublons comptent une fois (case-insensitive)', () => {
    const r = validateCategoryDraft(draft({ options: ['X', 'x', 'X '] }), [])
    expect(r.options).toContain('2')
  })
})

describe('validateCategoryDraft — paired (≥ 1 élément + ≥ 1 unité)', () => {
  it('1 élément + 1 unité → OK', () => {
    const r = validateCategoryDraft(
      draft({ selection: 'paired', options: ['OB'], timeframes: ['M5'] }), [],
    )
    expect(r.options).toBeUndefined()
    expect(r.timeframes).toBeUndefined()
  })
  it('0 élément → erreur options', () => {
    const r = validateCategoryDraft(
      draft({ selection: 'paired', options: [], timeframes: ['M5'] }), [],
    )
    expect(r.options).toContain('1 élément')
  })
  it('0 unité → erreur timeframes', () => {
    const r = validateCategoryDraft(
      draft({ selection: 'paired', options: ['OB'], timeframes: [] }), [],
    )
    expect(r.timeframes).toContain('1 unité')
  })
  it('whitespace-only timeframe → compté comme vide', () => {
    const r = validateCategoryDraft(
      draft({ selection: 'paired', options: ['OB'], timeframes: ['  '] }), [],
    )
    expect(r.timeframes).toContain('1 unité')
  })
})

describe('isValidCategoryDraft — raccourci booléen', () => {
  it('cas OK', () => {
    expect(isValidCategoryDraft(draft(), [])).toBe(true)
  })
  it('cas KO', () => {
    expect(isValidCategoryDraft(draft({ options: [] }), [])).toBe(false)
  })
})
