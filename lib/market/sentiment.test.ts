import { describe, expect, it } from 'vitest'
import { orient, sentimentAt, sentimentHistory, zoneOf, type SentimentInputs } from './sentiment'
import { minusDays } from './stats'

const END = '2026-11-20'

// Série hebdomadaire sur 4 ans, valeur = f(i) (i = 0 pour la plus ancienne).
function weekly(f: (i: number, n: number) => number, weeks = 208): { date: string; value: number }[] {
  return Array.from({ length: weeks }, (_, i) => ({ date: minusDays(END, (weeks - 1 - i) * 7), value: f(i, weeks) }))
}
const rising = weekly(i => i)        // dernière valeur = la plus haute → percentile ~100
const falling = weekly((i, n) => n - i) // dernière valeur = la plus basse → percentile ~0
const flat = weekly(() => 1)          // tout égal → 50

function inputs(over: Partial<SentimentInputs> = {}): SentimentInputs {
  return {
    stress: flat, marketRisk: flat, credit: flat, realRate: flat, liquidity: flat, curve: flat,
    positioning: { ES: flat, NQ: flat },
    ...over,
  }
}

describe('orientation : haut = appétit pour le risque', () => {
  it('direction −1 inverse le percentile', () => {
    expect(orient(90, 1)).toBe(90)
    expect(orient(90, -1)).toBe(10)
  })
  it('stress au plus haut sur 3 ans → composante proche de 0 (aversion)', () => {
    const s = sentimentAt(inputs({ stress: rising }), END)
    const stress = s.components.find(c => c.id === 'stress')!
    expect(stress.percentile).toBeGreaterThan(99)
    expect(stress.oriented).toBeLessThan(1)
  })
  it('liquidité au plus haut → composante proche de 100 (appétit)', () => {
    const s = sentimentAt(inputs({ liquidity: rising }), END)
    expect(s.components.find(c => c.id === 'liquidity')!.oriented).toBeGreaterThan(99)
  })
  it('percentile sur 3 ans : les valeurs de plus de 3 ans ne comptent pas', () => {
    // 4 ans de données : une valeur énorme il y a 3,5 ans ne doit pas peser.
    const series = weekly((i, n) => (i === 20 ? 1e9 : i === n - 1 ? 500 : i))
    const s = sentimentAt(inputs({ curve: series }), END)
    expect(s.components.find(c => c.id === 'curve')!.percentile).toBeGreaterThan(99)
  })
})

describe('score', () => {
  it('moyenne des 7 composantes orientées ; tout à 50 → 50, neutre', () => {
    const s = sentimentAt(inputs(), END)
    expect(s.score).toBe(50)
    expect(s.zone).toBe('neutre')
    expect(s.missing).toEqual([])
    expect(s.components.reduce((t, c) => t + (c.contribution ?? 0), 0)).toBeCloseTo(50, 10)
  })
  it('appétit maximal : risques au plus bas, liquidité/courbe/positionnement au plus haut', () => {
    const s = sentimentAt(inputs({ stress: falling, marketRisk: falling, credit: falling, realRate: falling, liquidity: rising, curve: rising, positioning: { ES: rising, NQ: rising } }), END)
    expect(s.score!).toBeGreaterThan(99)
    expect(s.zone).toBe('appetit')
  })
  it('positionnement : moyenne des percentiles ES et NQ', () => {
    const s = sentimentAt(inputs({ positioning: { ES: rising, NQ: falling } }), END)
    expect(s.components.find(c => c.id === 'positioning')!.percentile).toBeCloseTo(50, 0)
  })
  it('composante sans donnée : calculé sans elle, et signalé', () => {
    const s = sentimentAt(inputs({ credit: [], liquidity: rising }), END)
    expect(s.missing).toEqual(['credit'])
    // 5 composantes à 50 + liquidité ~100, sur 6 disponibles.
    expect(s.score!).toBeCloseTo((5 * 50 + 99.76) / 6, 0)
    expect(s.components.find(c => c.id === 'credit')!.contribution).toBeNull()
  })
  it('composante écartée (ex. copyright) : hors du calcul et signalée', () => {
    const s = sentimentAt(inputs(), END, ['positioning'])
    expect(s.missing).toEqual(['positioning'])
    expect(s.components).toHaveLength(6)
  })
  it('aucune donnée : pas de score', () => {
    const empty = inputs({ stress: [], marketRisk: [], credit: [], realRate: [], liquidity: [], curve: [], positioning: { ES: [], NQ: [] } })
    expect(sentimentAt(empty, END).score).toBeNull()
  })
  it('zones : aversion sous 40, neutre de 40 à 60, appétit au-dessus de 60', () => {
    expect(zoneOf(39.9)).toBe('aversion')
    expect(zoneOf(40)).toBe('neutre')
    expect(zoneOf(60)).toBe('neutre')
    expect(zoneOf(60.1)).toBe('appetit')
  })
})

describe('historique', () => {
  it('un point par semaine sur 1 an (53 points, de l’ancien au récent)', () => {
    const h = sentimentHistory(inputs(), END)
    expect(h).toHaveLength(53)
    expect(h[0].date).toBe(minusDays(END, 52 * 7))
    expect(h.at(-1)?.date).toBe(END)
  })
  it('chaque point n’utilise que les données connues à sa date', () => {
    const h = sentimentHistory(inputs({ liquidity: rising }), END, 4)
    // La liquidité monte chaque semaine : chaque point est à son propre plus haut.
    expect(h.every(p => p.value > 50)).toBe(true)
  })
})
