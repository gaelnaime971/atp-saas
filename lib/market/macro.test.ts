import { describe, expect, it } from 'vitest'
import { fedLiquidity, macroFigure, yieldCurve } from './macro'

describe('courbe 10 ans − 2 ans', () => {
  it('DGS10 − DGS2 à la même date ; date sans l’un des deux taux : ignorée', () => {
    const d10 = [{ date: '2026-11-23', value: 4.92 }, { date: '2026-11-24', value: 4.91 }, { date: '2026-11-25', value: 4.9 }]
    const d2 = [{ date: '2026-11-23', value: 4.63 }, { date: '2026-11-24', value: 4.63 }]
    expect(yieldCurve(d10, d2)).toEqual([{ date: '2026-11-23', value: 0.29 }, { date: '2026-11-24', value: 0.28 }])
  })
})

describe('liquidité de la Fed : unités et fréquences', () => {
  it('bilan et compte du Trésor en millions, reverse repo en milliards → résultat en milliards', () => {
    const walcl = [{ date: '2026-11-18', value: 6_600_000 }]     // 6 600 Md$
    const tga = [{ date: '2026-11-18', value: 800_000 }]         // 800 Md$
    const rrp = [{ date: '2026-11-18', value: 150 }]             // 150 Md$
    expect(fedLiquidity(walcl, tga, rrp)).toEqual([{ date: '2026-11-18', value: 5650 }])
  })
  it('reverse repo quotidien : valeur du mercredi, ou la dernière connue avant', () => {
    const walcl = [{ date: '2026-11-11', value: 6_610_000 }, { date: '2026-11-18', value: 6_600_000 }]
    const tga = [{ date: '2026-11-11', value: 820_000 }, { date: '2026-11-18', value: 800_000 }]
    const rrp = [{ date: '2026-11-10', value: 120 }, { date: '2026-11-17', value: 140 }, { date: '2026-11-19', value: 999 }]
    expect(fedLiquidity(walcl, tga, rrp)).toEqual([
      { date: '2026-11-11', value: 6610 - 820 - 120 },
      { date: '2026-11-18', value: 6600 - 800 - 140 }, // pas la valeur du 19
    ])
  })
  it('date sans compte du Trésor ou sans reverse repo connu : ignorée, rien d’inventé', () => {
    const walcl = [{ date: '2026-11-04', value: 6_620_000 }, { date: '2026-11-11', value: 6_610_000 }]
    const tga = [{ date: '2026-11-11', value: 820_000 }]
    const rrp = [{ date: '2026-11-10', value: 120 }]
    expect(fedLiquidity(walcl, tga, rrp).map(o => o.date)).toEqual(['2026-11-11'])
  })
})

describe('chiffre macro : dernière valeur, variation, 1 an', () => {
  it('variation par rapport à l’observation précédente, et la dernière année', () => {
    const obs = [
      { date: '2025-10-01', value: 4.1 }, { date: '2025-12-01', value: 4.2 },
      { date: '2026-09-01', value: 4.3 }, { date: '2026-10-01', value: 4.4 },
    ]
    const f = macroFigure(obs)
    expect(f.last).toEqual({ date: '2026-10-01', value: 4.4 })
    expect(f.change).toBeCloseTo(0.1, 10)
    expect(f.year.map(o => o.date)).toEqual(['2025-10-01', '2025-12-01', '2026-09-01', '2026-10-01'])
  })
  it('série vide ou à une seule valeur', () => {
    expect(macroFigure([]).last).toBeNull()
    expect(macroFigure([{ date: '2026-01-01', value: 1 }]).change).toBeNull()
  })
})
