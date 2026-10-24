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

// ─── Saisie V2 : paires, R, confluence, reset, validation ──────────────────

import {
  addPair, removePair, takenTimeframesForElement,
  computeRFromPoints, countConfluence,
  resetAfterNext, validateSaisie, isSaisieSubmittable, resolveR,
  timeframeLabel, UNSPECIFIED_TIMEFRAME, UNSPECIFIED_TIMEFRAME_LABEL,
  type SaisieDraft,
} from './criteria'

describe('addPair / removePair / takenTimeframesForElement', () => {
  it('addPair ajoute si absent, idempotent sinon', () => {
    const after = addPair([], 'OB', 'M5')
    expect(after).toEqual([{ element: 'OB', timeframe: 'M5' }])
    const again = addPair(after, 'OB', 'M5')
    expect(again).toEqual(after)
    expect(again).not.toBe(after) // copie quand même
  })

  it('addPair : paires avec même élément mais TF différente coexistent', () => {
    const r = addPair(addPair([], 'OB', 'M5'), 'OB', 'M15')
    expect(r).toEqual([
      { element: 'OB', timeframe: 'M5' },
      { element: 'OB', timeframe: 'M15' },
    ])
  })

  it('addPair : paires d\'éléments différents coexistent', () => {
    const r = addPair(addPair([], 'OB', 'M5'), 'FVG', 'M5')
    expect(r).toHaveLength(2)
  })

  it('removePair retire la paire exacte', () => {
    const start = [{ element: 'OB', timeframe: 'M5' }, { element: 'FVG', timeframe: 'M5' }]
    expect(removePair(start, 'OB', 'M5')).toEqual([{ element: 'FVG', timeframe: 'M5' }])
    expect(removePair(start, 'OB', 'M15')).toEqual(start)
  })

  it('takenTimeframesForElement : set des TFs prises par élément', () => {
    const pairs = [
      { element: 'OB',  timeframe: 'M5' },
      { element: 'OB',  timeframe: 'M15' },
      { element: 'FVG', timeframe: 'M5' },
    ]
    expect(Array.from(takenTimeframesForElement(pairs, 'OB')).sort()).toEqual(['M15', 'M5'])
    expect(Array.from(takenTimeframesForElement(pairs, 'FVG'))).toEqual(['M5'])
    expect(takenTimeframesForElement(pairs, 'BOS').size).toBe(0)
  })

  it('addPair accepte la sentinelle "non précisée" (chaîne vide)', () => {
    const r = addPair([], 'Pin Bar', UNSPECIFIED_TIMEFRAME)
    expect(r).toEqual([{ element: 'Pin Bar', timeframe: '' }])
  })
})

describe('computeRFromPoints', () => {
  it('6 / 3 → 2', () => { expect(computeRFromPoints(6, 3)).toBe(2) })
  it('5 / 3 → 1.67', () => { expect(computeRFromPoints(5, 3)).toBe(1.67) })
  it('-3 / 3 → -1', () => { expect(computeRFromPoints(-3, 3)).toBe(-1) })
  it('sl = 0 → null', () => { expect(computeRFromPoints(10, 0)).toBeNull() })
  it('sl < 0 → null (incohérent)', () => { expect(computeRFromPoints(10, -2)).toBeNull() })
  it('NaN → null', () => {
    expect(computeRFromPoints(NaN, 3)).toBeNull()
    expect(computeRFromPoints(3, NaN)).toBeNull()
  })
})

describe('countConfluence', () => {
  it('vide → 0', () => { expect(countConfluence({})).toBe(0) })
  it('1 zone → 1', () => {
    expect(countConfluence({ zone: [{ element: 'OB', timeframe: 'M5' }] })).toBe(1)
  })
  it('1 fibo → 1', () => {
    expect(countConfluence({ fibonacci: ['50'] })).toBe(1)
  })
  it('2 zones → 2 (confluence !)', () => {
    expect(countConfluence({
      zone: [
        { element: 'OB',  timeframe: 'M5' },
        { element: 'FVG', timeframe: 'M15' },
      ],
    })).toBe(2)
  })
  it('zones + fibo + signal : signal et my_setups ne comptent PAS', () => {
    expect(countConfluence({
      zone: [{ element: 'OB', timeframe: 'M5' }],
      fibonacci: ['50', '61.8'],
      signal: [{ element: 'Hammer', timeframe: 'M1' }],
      my_setups: ['x', 'y'],
    })).toBe(3)
  })
})

describe('resetAfterNext — garde contexte, reste à la charge du caller', () => {
  it('date / instrument / direction préservés', () => {
    const ctx = { date: '2026-10-25', instrument: 'NQ', direction: 'LONG' as const }
    expect(resetAfterNext(ctx)).toEqual(ctx)
  })
})

describe('timeframeLabel — sentinelle "Non précisée"', () => {
  it('M5 → "M5"', () => { expect(timeframeLabel('M5')).toBe('M5') })
  it('"" → "Non précisée"', () => {
    expect(timeframeLabel(UNSPECIFIED_TIMEFRAME)).toBe(UNSPECIFIED_TIMEFRAME_LABEL)
  })
})

// ─── Validation SaisieDraft ────────────────────────────────────────────────

function sdraft(partial: Partial<SaisieDraft> = {}): SaisieDraft {
  return {
    date: '2026-10-25',
    instrument: 'NQ',
    direction: 'LONG',
    result: 'win',
    mode: 'r',
    rInput: '+1,5',
    pointsInput: '',
    slPointsInput: '',
    criteria: { zone: [{ element: 'OB', timeframe: 'M5' }] },
    ...partial,
  }
}

describe('validateSaisie — bloquants', () => {
  it('tout OK → aucun bloquant', () => {
    const e = validateSaisie(sdraft())
    expect(e.instrument).toBeUndefined()
    expect(e.direction).toBeUndefined()
    expect(e.result).toBeUndefined()
    expect(e.r).toBeUndefined()
    expect(isSaisieSubmittable(sdraft())).toBe(true)
  })
  it('instrument manquant', () => {
    expect(validateSaisie(sdraft({ instrument: '' })).instrument).toBeDefined()
  })
  it('direction manquante', () => {
    expect(validateSaisie(sdraft({ direction: '' })).direction).toBeDefined()
  })
  it('issue manquante', () => {
    expect(validateSaisie(sdraft({ result: '' })).result).toBeDefined()
  })
  it('mode "r" : R vide / invalide → erreur', () => {
    expect(validateSaisie(sdraft({ rInput: '' })).r).toBeDefined()
    expect(validateSaisie(sdraft({ rInput: 'abc' })).r).toBeDefined()
  })
  it('mode "r" : R=0 accepté (BE)', () => {
    expect(validateSaisie(sdraft({ rInput: '0', result: 'be' })).r).toBeUndefined()
  })
  it('mode "r" : virgule française acceptée', () => {
    expect(validateSaisie(sdraft({ rInput: '-0,5' })).r).toBeUndefined()
  })
  it('mode "points" : points et sl requis', () => {
    const base = sdraft({ mode: 'points', rInput: '', pointsInput: '', slPointsInput: '' })
    const e = validateSaisie(base)
    expect(e.points).toBeDefined()
    expect(e.slPoints).toBeDefined()
  })
  it('mode "points" : sl ≤ 0 refusé', () => {
    const e = validateSaisie(sdraft({ mode: 'points', pointsInput: '6', slPointsInput: '0' }))
    expect(e.slPoints).toBeDefined()
  })
  it('mode "points" : OK si points et sl > 0', () => {
    expect(isSaisieSubmittable(sdraft({
      mode: 'points', rInput: '', pointsInput: '6', slPointsInput: '3',
    }))).toBe(true)
  })
})

describe('validateSaisie — avertissement setup (NON bloquant)', () => {
  it('aucun setup → warning mais submittable', () => {
    const d = sdraft({ criteria: {} })
    const e = validateSaisie(d)
    expect(e.setupWarning).toBeDefined()
    expect(isSaisieSubmittable(d)).toBe(true) // warning ne bloque pas
  })
  it('≥ 1 setup → pas de warning', () => {
    expect(validateSaisie(sdraft()).setupWarning).toBeUndefined()
  })
})

describe('resolveR — R final à écrire selon le mode', () => {
  it('mode "r" : parse direct', () => {
    expect(resolveR(sdraft({ rInput: '+1,5' }))).toBe(1.5)
    expect(resolveR(sdraft({ rInput: '-0.5' }))).toBe(-0.5)
    expect(resolveR(sdraft({ rInput: '' }))).toBeNull()
  })
  it('mode "points" : points / sl', () => {
    expect(resolveR(sdraft({
      mode: 'points', rInput: '', pointsInput: '6', slPointsInput: '3',
    }))).toBe(2)
    expect(resolveR(sdraft({
      mode: 'points', rInput: '', pointsInput: '', slPointsInput: '3',
    }))).toBeNull()
  })
})

// ─── Résultats V2 : parseLegacyEntry, worstLossStreak, cumulativeR, combos ─

import {
  parseLegacyEntry, worstLossStreak, cumulativeR, topCombinations,
  dayOfWeekFr, enrichDerivedDimensions,
} from './criteria'

describe('parseLegacyEntry — ancien backtest sans criteria', () => {
  it('zones ATP × TF → paired zone', () => {
    const r = parseLegacyEntry({ setup_types: ['OB M5', 'FVG M15'], signals: [] })
    expect(r.zone).toEqual([
      { element: 'OB', timeframe: 'M5' },
      { element: 'FVG', timeframe: 'M15' },
    ])
  })

  it('fibonacci : "50%", "61.8%", "78,6%", avec ou sans %', () => {
    const r = parseLegacyEntry({ setup_types: ['50%', '61.8%', '78,6%', '38.2'], signals: [] })
    expect(r.fibonacci).toEqual(['50', '61.8', '78.6', '38.2'])
  })

  it('signaux ATP × TF → paired signal', () => {
    const r = parseLegacyEntry({ setup_types: [], signals: ['Hammer M1', 'Engulfing M5'] })
    expect(r.signal).toEqual([
      { element: 'Hammer', timeframe: 'M1' },
      { element: 'Engulfing', timeframe: 'M5' },
    ])
  })

  it('"Pin Bar" nu → paired { Pin Bar, "" } (sentinelle)', () => {
    const r = parseLegacyEntry({ setup_types: [], signals: ['Pin Bar'] })
    expect(r.signal).toEqual([{ element: 'Pin Bar', timeframe: '' }])
  })

  it('"Pin Bar M5" (incohérent) → Pin Bar sans TF (on ne gobe pas la TF)', () => {
    const r = parseLegacyEntry({ setup_types: [], signals: ['Pin Bar M5'] })
    expect(r.signal).toEqual([{ element: 'Pin Bar', timeframe: '' }])
  })

  it('inconnu → my_setups', () => {
    const r = parseLegacyEntry({ setup_types: ['Mon-super-setup'], signals: ['CustomSig M5'] })
    expect(r.my_setups).toEqual(['Mon-super-setup', 'CustomSig M5'])
  })

  it('déjà peuplé → renvoyé tel quel (idempotence)', () => {
    const criteria: CriteriaMap = { zone: [{ element: 'OB', timeframe: 'M5' }] }
    const r = parseLegacyEntry({ setup_types: ['FVG M15'], signals: [], criteria })
    expect(r).toBe(criteria)
  })

  it('mix complet', () => {
    const r = parseLegacyEntry({
      setup_types: ['OB M5', '50%', 'Mon-super-setup', 'BOS H4'],
      signals: ['Hammer M1', 'Pin Bar'],
    })
    // Tolérance : BOS H4 n'était pas dans l'ancien catalogue d'origine
    // (BOS n'avait pas de H4) mais projectToLegacy l'écrit en fallback
    // "BOS H4". On accepte le round-trip propre : TF ∈ {M1,M5,M15,H1,H4}
    // avec élément zone → paired.
    expect(r.zone).toEqual([
      { element: 'OB', timeframe: 'M5' },
      { element: 'BOS', timeframe: 'H4' },
    ])
    expect(r.fibonacci).toEqual(['50'])
    expect(r.signal).toEqual([
      { element: 'Hammer', timeframe: 'M1' },
      { element: 'Pin Bar', timeframe: '' },
    ])
    expect(r.my_setups).toEqual(['Mon-super-setup'])
  })

  it('vide → {}', () => {
    expect(parseLegacyEntry({})).toEqual({})
    expect(parseLegacyEntry({ setup_types: [], signals: [] })).toEqual({})
  })
})

describe('worstLossStreak', () => {
  it('vide → 0', () => { expect(worstLossStreak([])).toBe(0) })
  it('série de 4 pertes → 4', () => {
    expect(worstLossStreak([
      { result: 'loss' }, { result: 'loss' }, { result: 'loss' }, { result: 'loss' },
    ])).toBe(4)
  })
  it('win casse la série', () => {
    expect(worstLossStreak([
      { result: 'loss' }, { result: 'loss' }, { result: 'win' }, { result: 'loss' },
    ])).toBe(2)
  })
  it('BE casse la série', () => {
    expect(worstLossStreak([
      { result: 'loss' }, { result: 'be' }, { result: 'loss' },
    ])).toBe(1)
  })
  it('la pire série au MILIEU est bien détectée', () => {
    expect(worstLossStreak([
      { result: 'loss' }, { result: 'win' },
      { result: 'loss' }, { result: 'loss' }, { result: 'loss' },
      { result: 'win' }, { result: 'loss' },
    ])).toBe(3)
  })
})

describe('cumulativeR', () => {
  it('vide → []', () => { expect(cumulativeR([])).toEqual([]) })
  it('cumul chrono', () => {
    expect(cumulativeR([
      { r_result: 2 }, { r_result: -1 }, { r_result: 3 }, { r_result: -0.5 },
    ])).toEqual([
      { i: 0, cum: 2 },
      { i: 1, cum: 1 },
      { i: 2, cum: 4 },
      { i: 3, cum: 3.5 },
    ])
  })
})

describe('topCombinations — zones + signal exacts, min 10', () => {
  function mk(zones: PairedValue[], signals: PairedValue[], result: 'win'|'loss'|'be', r: number): BacktestEntry {
    return { criteria: { zone: zones, signal: signals }, result, r_result: r }
  }

  it('< 10 trades → aucune combo retournée', () => {
    const data = Array.from({ length: 9 }, () =>
      mk([{ element: 'OB', timeframe: 'M15' }], [{ element: 'Hammer', timeframe: 'M5' }], 'win', 1),
    )
    expect(topCombinations(data)).toEqual([])
  })

  it('>= 10 trades → combo top 1, triée par avgR desc', () => {
    const combo1 = Array.from({ length: 14 }, (_, i) =>
      mk([{ element: 'OB', timeframe: 'M15' }], [{ element: 'Hammer', timeframe: 'M5' }],
         i < 10 ? 'win' : 'loss', i < 10 ? 2 : -1),
    )
    const combo2 = Array.from({ length: 11 }, (_, i) =>
      mk([{ element: 'FVG', timeframe: 'M5' }], [{ element: 'Hammer', timeframe: 'M1' }],
         i < 6 ? 'win' : 'loss', i < 6 ? 1 : -1),
    )
    const r = topCombinations([...combo1, ...combo2])
    expect(r).toHaveLength(2)
    expect(r[0].tags).toContain('OB M15')
    expect(r[0].tags).toContain('Hammer M5')
    expect(r[0].n).toBe(14)
    expect(r[0].avgR).toBeGreaterThan(r[1].avgR)
  })

  it('clé = ensemble ordonné : (OB M5, FVG M5) === (FVG M5, OB M5)', () => {
    const a = mk(
      [{ element: 'OB', timeframe: 'M5' }, { element: 'FVG', timeframe: 'M5' }],
      [{ element: 'Hammer', timeframe: 'M5' }],
      'win', 1,
    )
    const b = mk(
      [{ element: 'FVG', timeframe: 'M5' }, { element: 'OB', timeframe: 'M5' }],
      [{ element: 'Hammer', timeframe: 'M5' }],
      'win', 1,
    )
    // 10 trades identiques (combinées) + autres incomplets pour atteindre minN
    const data = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? a : b))
    const r = topCombinations(data, 10, 3)
    expect(r).toHaveLength(1)
    expect(r[0].n).toBe(10)
  })

  it('un trade sans zone OU sans signal n\'est PAS compté', () => {
    const noSignal = mk([{ element: 'OB', timeframe: 'M5' }], [], 'win', 1)
    const noZone   = mk([], [{ element: 'Hammer', timeframe: 'M5' }], 'win', 1)
    const data = Array.from({ length: 20 }, (_, i) => (i < 10 ? noSignal : noZone))
    expect(topCombinations(data)).toEqual([])
  })

  it('top limité à `limit`', () => {
    // 3 combos distinctes, chacune ≥ 10
    const mkMany = (zone: PairedValue, sig: PairedValue, n: number, r: number) =>
      Array.from({ length: n }, () => mk([zone], [sig], 'win', r))
    const data = [
      ...mkMany({ element: 'OB',  timeframe: 'M15' }, { element: 'Hammer', timeframe: 'M5' }, 10, 2),
      ...mkMany({ element: 'FVG', timeframe: 'M5'  }, { element: 'Hammer', timeframe: 'M1' }, 10, 1),
      ...mkMany({ element: 'BOS', timeframe: 'M1'  }, { element: 'Engulfing', timeframe: 'M5' }, 10, 0.5),
      ...mkMany({ element: 'CHoCH', timeframe: 'H1'}, { element: 'Pin Bar', timeframe: '' }, 10, 0.1),
    ]
    const r = topCombinations(data, 10, 2)
    expect(r).toHaveLength(2)
  })
})

describe('dayOfWeekFr', () => {
  it('samedi 25/10/2026', () => {
    // 25 oct 2026 : vérifions via l'API Date (indépendant TZ grâce au T12:00:00)
    expect(dayOfWeekFr('2026-10-25')).toBe('Dimanche')
    expect(dayOfWeekFr('2026-10-26')).toBe('Lundi')
    expect(dayOfWeekFr('2026-10-27')).toBe('Mardi')
    expect(dayOfWeekFr('2026-10-30')).toBe('Vendredi')
  })
})

describe('enrichDerivedDimensions — _sens / _instrument / _jour', () => {
  it('ajoute les 3 clés dérivées', () => {
    const e = enrichDerivedDimensions({
      criteria: { zone: [{ element: 'OB', timeframe: 'M5' }] },
      result: 'win', r_result: 1,
      date: '2026-10-26', instrument: 'NQ', direction: 'LONG',
    })
    expect(e.criteria._sens).toBe('Achat')
    expect(e.criteria._instrument).toBe('NQ')
    expect(e.criteria._jour).toBe('Lundi')
    expect(e.criteria.zone).toBeDefined() // préservation
  })
  it('n\'ajoute pas si données absentes', () => {
    const e = enrichDerivedDimensions({ criteria: {}, result: 'win', r_result: 1, date: '' })
    expect(e.criteria._sens).toBeUndefined()
    expect(e.criteria._instrument).toBeUndefined()
  })
})
