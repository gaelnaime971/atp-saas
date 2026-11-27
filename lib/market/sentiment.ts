/**
 * Sentiment de risque ATP : calcul pur, testé dans sentiment.test.ts.
 *
 * - 7 composantes publiques (DECISIONS.md) : stress financier (STLFSI4),
 *   risque de marché (NFCIRISK), crédit (NFCICREDIT), taux réel 10 ans
 *   (DFII10), liquidité de la Fed, courbe 10 ans − 2 ans (DGS10 − DGS2),
 *   positionnement des asset managers sur ES et NQ (COT, % de l'OI).
 * - Chaque composante devient un percentile sur 3 ans (valeur du jour
 *   parmi les 3 dernières années), ORIENTÉ pour que « haut » signifie
 *   appétit pour le risque : stress, risque, crédit et taux réel élevés
 *   = aversion → 100 − percentile.
 * - Positionnement : moyenne des percentiles ES et NQ.
 * - Score = moyenne des composantes disponibles (0 à 100). Une
 *   composante sans donnée (ou écartée) n'entre pas dans la moyenne, et
 *   la page le dit.
 * - Zones : aversion sous 40, neutre de 40 à 60, appétit au-dessus de 60.
 */
import type { Observation } from '@/lib/market/fred'
import type { CotRow } from '@/lib/market/cftc'
import { minusDays, percentileAt } from '@/lib/market/stats'
import { fedLiquidity, yieldCurve } from '@/lib/market/macro'
import { marketRows, netOf, pctOfOi } from '@/lib/market/cot'

/** Séries FRED du score (lecture partagée : pages Sentiment et Vue d'ensemble). */
export const SENTIMENT_FRED_CODES = ['STLFSI4', 'NFCIRISK', 'NFCICREDIT', 'DFII10', 'WALCL', 'WTREGEN', 'RRPONTSYD', 'DGS10', 'DGS2']

export const SENTIMENT_YEARS = 3

export type SentimentComponentId = 'stress' | 'marketRisk' | 'credit' | 'realRate' | 'liquidity' | 'curve' | 'positioning'

export interface SentimentComponentDef {
  id: SentimentComponentId
  label: string
  hint: string
  /** +1 : valeur haute = appétit ; −1 : valeur haute = aversion. */
  direction: 1 | -1
  unit: 'index' | 'pct' | 'billions' | 'pctOi'
  source: string
}

export const SENTIMENT_COMPONENTS: SentimentComponentDef[] = [
  { id: 'stress', label: 'Stress financier', hint: 'Indice de la Fed de St. Louis · haut = aversion', direction: -1, unit: 'index', source: 'FRED STLFSI4' },
  { id: 'marketRisk', label: 'Risque de marché', hint: 'Sous-indice risque de la Fed de Chicago · haut = aversion', direction: -1, unit: 'index', source: 'FRED NFCIRISK' },
  { id: 'credit', label: 'Conditions de crédit', hint: 'Sous-indice crédit de la Fed de Chicago · haut = crédit tendu', direction: -1, unit: 'index', source: 'FRED NFCICREDIT' },
  { id: 'realRate', label: 'Taux réel à 10 ans', hint: 'TIPS 10 ans · haut = frein pour les actions', direction: -1, unit: 'pct', source: 'FRED DFII10' },
  { id: 'liquidity', label: 'Liquidité de la Fed', hint: 'Bilan − compte du Trésor − reverse repo · haut = appétit', direction: 1, unit: 'billions', source: 'FRED WALCL, WTREGEN, RRPONTSYD' },
  { id: 'curve', label: 'Courbe des taux', hint: 'Écart 10 ans − 2 ans · haut = appétit', direction: 1, unit: 'pct', source: 'FRED DGS10 − DGS2' },
  { id: 'positioning', label: 'Positionnement des institutionnels', hint: 'Asset managers sur ES et NQ, % de l’OI · haut = appétit', direction: 1, unit: 'pctOi', source: 'CFTC (COT)' },
]

/** Séries d'entrée, déjà calculées (liquidité) et triées par date. */
export interface SentimentInputs {
  stress: Observation[]
  marketRisk: Observation[]
  credit: Observation[]
  realRate: Observation[]
  liquidity: Observation[]
  curve: Observation[]
  /** Nette des asset managers en % de l'OI, par marché. */
  positioning: { ES: Observation[]; NQ: Observation[] }
}

/** Entrées du score à partir des séries FRED lues et des rapports COT. */
export function buildSentimentInputs(d: Readonly<Record<string, Observation[]>>, cot: readonly CotRow[]): SentimentInputs {
  const positioningOf = (m: 'ES' | 'NQ') => marketRows(cot, m)
    .map(r => ({ date: r.reportDate, value: pctOfOi(netOf(r, 'assetMgr'), r.openInterest) }))
    .filter((o): o is Observation => o.value !== null)
  return {
    stress: d.STLFSI4 ?? [], marketRisk: d.NFCIRISK ?? [], credit: d.NFCICREDIT ?? [], realRate: d.DFII10 ?? [],
    liquidity: fedLiquidity(d.WALCL ?? [], d.WTREGEN ?? [], d.RRPONTSYD ?? []),
    curve: yieldCurve(d.DGS10 ?? [], d.DGS2 ?? []),
    positioning: { ES: positioningOf('ES'), NQ: positioningOf('NQ') },
  }
}

export interface ComponentScore {
  id: SentimentComponentId
  /** Dernière valeur brute à la date (positionnement : moyenne ES/NQ). */
  raw: number | null
  rawDate: string | null
  /** Percentile brut sur 3 ans. */
  percentile: number | null
  /** Percentile orienté (haut = appétit). */
  oriented: number | null
  /** Points apportés au score (oriented / nombre de composantes disponibles). */
  contribution: number | null
}

export type SentimentZone = 'aversion' | 'neutre' | 'appetit'

export interface SentimentScore {
  date: string
  score: number | null
  zone: SentimentZone | null
  components: ComponentScore[]
  missing: SentimentComponentId[]
}

export function orient(percentile: number, direction: 1 | -1): number {
  return direction === 1 ? percentile : 100 - percentile
}

export function zoneOf(score: number): SentimentZone {
  if (score < 40) return 'aversion'
  if (score > 60) return 'appetit'
  return 'neutre'
}

export const ZONE_LABEL: Record<SentimentZone, string> = { aversion: 'Aversion au risque', neutre: 'Neutre', appetit: 'Appétit pour le risque' }

function lastOnOrBefore(obs: readonly Observation[], date: string): Observation | null {
  let found: Observation | null = null
  for (const o of obs) {
    if (o.date <= date) found = o
    else break
  }
  return found
}

function componentAt(def: SentimentComponentDef, inputs: SentimentInputs, date: string): Omit<ComponentScore, 'contribution'> {
  if (def.id === 'positioning') {
    const parts = (['ES', 'NQ'] as const).map(m => {
      const obs = inputs.positioning[m]
      const last = lastOnOrBefore(obs, date)
      return { last, p: percentileAt(obs, date, SENTIMENT_YEARS) }
    }).filter(x => x.last && x.p !== null)
    if (parts.length === 0) return { id: def.id, raw: null, rawDate: null, percentile: null, oriented: null }
    const percentile = parts.reduce((s, x) => s + (x.p as number), 0) / parts.length
    const raw = parts.reduce((s, x) => s + x.last!.value, 0) / parts.length
    const rawDate = parts.map(x => x.last!.date).sort().at(-1) ?? null
    return { id: def.id, raw, rawDate, percentile, oriented: orient(percentile, def.direction) }
  }
  const obs = inputs[def.id]
  const last = lastOnOrBefore(obs, date)
  const percentile = percentileAt(obs, date, SENTIMENT_YEARS)
  if (!last || percentile === null) return { id: def.id, raw: null, rawDate: null, percentile: null, oriented: null }
  return { id: def.id, raw: last.value, rawDate: last.date, percentile, oriented: orient(percentile, def.direction) }
}

export function sentimentAt(inputs: SentimentInputs, date: string, excluded: readonly SentimentComponentId[] = []): SentimentScore {
  const parts = SENTIMENT_COMPONENTS.filter(d => !excluded.includes(d.id)).map(d => componentAt(d, inputs, date))
  const available = parts.filter(p => p.oriented !== null)
  const score = available.length ? available.reduce((s, p) => s + (p.oriented as number), 0) / available.length : null
  return {
    date,
    score,
    zone: score === null ? null : zoneOf(score),
    components: parts.map(p => ({ ...p, contribution: p.oriented === null ? null : (p.oriented as number) / available.length })),
    missing: [...excluded, ...parts.filter(p => p.oriented === null).map(p => p.id)],
  }
}

/** Score chaque semaine (même jour de semaine que `end`) sur `weeks` semaines, du plus ancien au plus récent. */
export function sentimentHistory(inputs: SentimentInputs, end: string, weeks = 52, excluded: readonly SentimentComponentId[] = []): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (let i = weeks; i >= 0; i--) {
    const date = minusDays(end, i * 7)
    const s = sentimentAt(inputs, date, excluded)
    if (s.score !== null) out.push({ date, value: s.score })
  }
  return out
}
