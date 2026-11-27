/**
 * Macro US : calculs de la page Marchés › Macro US. Pur, testé dans
 * macro.test.ts.
 *
 * Liquidité de la Fed = bilan (WALCL) − compte du Trésor (WTREGEN) −
 * reverse repo (RRPONTSYD), en milliards de dollars.
 *   - WALCL et WTREGEN : millions de $, hebdomadaires (mercredi) → ÷ 1 000.
 *   - RRPONTSYD : milliards de $, quotidien → valeur du jour, ou la
 *     dernière connue avant (jours sans opération).
 * Une valeur par mercredi du bilan ; date sans compte du Trésor ou sans
 * reverse repo connu → ignorée (pas de valeur inventée).
 */
import type { Observation } from '@/lib/market/fred'
import { minusYears, valueAt } from '@/lib/market/stats'

export function fedLiquidity(walcl: readonly Observation[], tga: readonly Observation[], rrp: readonly Observation[]): Observation[] {
  const out: Observation[] = []
  for (const w of walcl) {
    const t = valueAt(tga, w.date)
    const r = valueAt(rrp, w.date)
    if (t === null || r === null) continue
    out.push({ date: w.date, value: w.value / 1000 - t / 1000 - r })
  }
  return out
}

/**
 * Courbe 10 ans − 2 ans calculée à partir des deux taux affichés
 * (DGS10 − DGS2), seulement aux dates où les deux existent. Remplace la
 * série T10Y2Y : même définition, mais toujours cohérente avec les
 * deux cartes de taux de la page.
 */
export function yieldCurve(dgs10: readonly Observation[], dgs2: readonly Observation[]): Observation[] {
  const two = new Map(dgs2.map(o => [o.date, o.value]))
  const out: Observation[] = []
  for (const o of dgs10) {
    const v = two.get(o.date)
    if (v !== undefined) out.push({ date: o.date, value: Math.round((o.value - v) * 1e6) / 1e6 })
  }
  return out
}

export interface MacroFigure {
  last: Observation | null
  previous: Observation | null
  change: number | null
  /** Observations de la dernière année (mini-graphique). */
  year: Observation[]
}

export function macroFigure(obs: readonly Observation[]): MacroFigure {
  const last = obs.length ? obs[obs.length - 1] : null
  const previous = obs.length > 1 ? obs[obs.length - 2] : null
  const from = last ? minusYears(last.date, 1) : ''
  return {
    last,
    previous,
    change: last && previous ? last.value - previous.value : null,
    year: last ? obs.filter(o => o.date >= from) : [],
  }
}
