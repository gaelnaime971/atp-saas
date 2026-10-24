/**
 * Backtest V2 — logique PURE autour des critères personnalisés.
 *
 * Trois shapes de valeur selon `category.selection` :
 *   - 'single'  → `string`                                        ex. "preopen"
 *   - 'multi'   → `string[]`                                      ex. ["50","61.8"]
 *   - 'paired'  → `Array<{ element: string; timeframe: string }>` ex. "OB M5 + FVG M15"
 *
 * Le shape du JSONB `backtests.criteria` est un objet dont les clés sont
 * les `categories.key` du trader (ex. 'zone', 'fibonacci', 'signal',
 * 'my_setups', 'session', 'context', …).
 *
 * Zéro I/O ici — les fonctions sont consommées par les routes serveur
 * (projection pour la double-écriture, agrégats pour la page Résultats).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CategorySelection = 'single' | 'multi' | 'paired'
export type OptionOrigin = 'atp' | 'custom'

export interface CriteriaCategory {
  id: string
  trader_id: string
  key: string
  label: string
  selection: CategorySelection
  /** Pour 'paired' : liste des unités de temps proposées (ex. ["M1","M5","M15"]). */
  timeframes: string[]
  position: number
  hidden: boolean
}

export interface CriteriaOption {
  id: string
  category_id: string
  value: string
  label: string
  origin: OptionOrigin
  hidden: boolean
  position: number
}

/** Une paire élément + unité de temps dans un critère 'paired'. */
export interface PairedValue {
  element: string
  timeframe: string
}

export type CriteriaValueFor<S extends CategorySelection> =
  S extends 'single' ? string :
  S extends 'multi'  ? string[] :
  S extends 'paired' ? PairedValue[] :
  never

export type CriteriaValue = string | string[] | PairedValue[]

export type CriteriaMap = Record<string, CriteriaValue>

/** Entrée minimale pour les agrégats. Les colonnes legacy restent
 *  disponibles mais analyzeBy ne lit QUE criteria. */
export interface BacktestEntry {
  id?: string
  criteria: CriteriaMap
  result: 'win' | 'loss' | 'be'
  r_result: number
}

// ─── Garde-fous de type (narrowing au runtime) ──────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString)
}
function isPairedArray(v: unknown): v is PairedValue[] {
  return Array.isArray(v) && v.every(
    (x) => typeof x === 'object' && x !== null
      && isString((x as PairedValue).element)
      && isString((x as PairedValue).timeframe),
  )
}

export function readSingle(criteria: CriteriaMap, key: string): string | null {
  const v = criteria[key]
  if (v == null) return null
  if (isString(v)) return v
  if (isStringArray(v) && v.length === 1) return v[0]  // tolérance
  return null
}

export function readMulti(criteria: CriteriaMap, key: string): string[] {
  const v = criteria[key]
  if (v == null) return []
  if (isStringArray(v)) return v
  if (isString(v)) return [v]
  return []
}

export function readPaired(criteria: CriteriaMap, key: string): PairedValue[] {
  const v = criteria[key]
  if (v == null) return []
  if (isPairedArray(v)) return v
  return []
}

// ─── Projection vers les colonnes legacy (double-écriture) ──────────────────

/**
 * Convertit un `criteria` moderne vers les colonnes `setup_types[]`,
 * `signals[]`, `has_confluence` de `backtests` pour que le coach IA
 * continue de calculer ses stats sans migration simultanée.
 *
 * Règles :
 *   - `zone` (paired)      → setup_types = "<element> <timeframe>"
 *   - `fibonacci` (multi)  → setup_types = "<v> %" ("50 %", "61,8 %")
 *   - `signal` (paired)    → signals    = "<element> <timeframe>"
 *   - `my_setups` (multi)  → setup_types = valeur telle quelle
 *   - Autres catégories custom → ignorées (le coach IA ne les lit pas)
 *
 * `has_confluence` : vrai si (zone.length + fibonacci.length) >= 2.
 *
 * Pur. Formats de sortie identiques à ce qu'écrit l'UI actuelle (ex.
 * "OB M5" en haut de casse, "50 %" avec espace insécable ` `
 * remplacé par un espace standard).
 */
export function projectToLegacy(criteria: CriteriaMap): {
  setup_types: string[]
  signals: string[]
  has_confluence: boolean
} {
  const setup_types: string[] = []
  const signals: string[] = []

  const zones = readPaired(criteria, 'zone')
  for (const p of zones) setup_types.push(`${p.element} ${p.timeframe}`)

  const fibos = readMulti(criteria, 'fibonacci')
  for (const f of fibos) {
    const asFr = f.replace('.', ',')
    setup_types.push(`${asFr} %`)
  }

  const mySetups = readMulti(criteria, 'my_setups')
  for (const s of mySetups) setup_types.push(s)

  const sigs = readPaired(criteria, 'signal')
  for (const p of sigs) signals.push(`${p.element} ${p.timeframe}`)

  // Confluence = 2+ éléments cumulés zones + fibonacci
  const has_confluence = (zones.length + fibos.length) >= 2

  return { setup_types, signals, has_confluence }
}

// ─── Profit factor ──────────────────────────────────────────────────────────

/**
 * Profit factor = somme des R gagnants / abs(somme des R perdants).
 * Retourne `null` si aucun trade perdant (ancien comportement "++",
 * ambigu, remplacé par un null explicite — l'UI décide quoi afficher).
 * Retourne 0 s'il n'y a NI gain NI perte (ou tableau vide).
 */
export function profitFactor(entries: Array<Pick<BacktestEntry, 'result' | 'r_result'>>): number | null {
  let gains = 0
  let losses = 0
  for (const e of entries) {
    if (e.result === 'win') gains += Number(e.r_result) || 0
    else if (e.result === 'loss') losses += Math.abs(Number(e.r_result) || 0)
  }
  if (losses === 0) return null
  return Math.round((gains / losses) * 100) / 100
}

// ─── analyzeBy ──────────────────────────────────────────────────────────────

/** Seuil minimal de trades pour que le signal soit considéré fiable. */
export const MIN_TRADES_FOR_SIGNAL = 10

export type AnalyzeMode = 'element' | 'timeframe' | 'pair'

export interface AnalyzeRow {
  /** Valeur sous forme de clé stable (ex. 'OB', 'M5', 'OB M5'). */
  key: string
  /** Libellé formaté pour l'UI (ex. 'OB', 'M5', 'OB · M5'). */
  label: string
  n: number
  wins: number
  winRate: number       // 0..100, arrondi entier
  avgR: number          // arrondi 2 décimales
  totalR: number        // arrondi 2 décimales
  /** true si n < MIN_TRADES_FOR_SIGNAL — l'UI doit afficher l'avertissement. */
  insufficient: boolean
}

/**
 * Regroupe les trades par option d'une catégorie et calcule les stats.
 * - 'single'           : `mode` ignoré, regroupe par la valeur string.
 * - 'multi'            : `mode` ignoré, un trade compte dans chacune de
 *                        ses valeurs (ex. ["50","61.8"] → 2 lignes).
 * - 'paired' + mode    :
 *     'element'  → regroupe par .element (OB, FVG…).
 *     'timeframe'→ regroupe par .timeframe (M5, M15…).
 *     'pair'     → regroupe par couple "element timeframe".
 *
 * Les lignes sans valeur sur la catégorie demandée sont ignorées.
 * Tri par totalR desc, puis par n desc, puis par key asc.
 */
export function analyzeBy(
  entries: BacktestEntry[],
  categoryKey: string,
  selection: CategorySelection,
  mode: AnalyzeMode = 'element',
): AnalyzeRow[] {
  const bucket = new Map<string, { label: string; n: number; wins: number; sumR: number }>()
  const push = (key: string, label: string, e: BacktestEntry) => {
    let b = bucket.get(key)
    if (!b) {
      b = { label, n: 0, wins: 0, sumR: 0 }
      bucket.set(key, b)
    }
    b.n += 1
    if (e.result === 'win') b.wins += 1
    b.sumR += Number(e.r_result) || 0
  }

  for (const e of entries) {
    if (selection === 'single') {
      const v = readSingle(e.criteria, categoryKey)
      if (!v) continue
      push(v, v, e)
    } else if (selection === 'multi') {
      const arr = readMulti(e.criteria, categoryKey)
      // Dédup intra-trade pour qu'un même trade ne compte pas 2× dans la même option
      const seen = new Set<string>()
      for (const v of arr) {
        if (seen.has(v)) continue
        seen.add(v)
        push(v, v, e)
      }
    } else {
      // paired
      const arr = readPaired(e.criteria, categoryKey)
      const seen = new Set<string>()
      for (const p of arr) {
        let key: string
        let label: string
        if (mode === 'element') { key = p.element;              label = p.element }
        else if (mode === 'timeframe') { key = p.timeframe;      label = p.timeframe }
        else { key = `${p.element} ${p.timeframe}`; label = `${p.element} · ${p.timeframe}` }
        if (seen.has(key)) continue
        seen.add(key)
        push(key, label, e)
      }
    }
  }

  const rows: AnalyzeRow[] = []
  for (const [key, b] of bucket) {
    const winRate = b.n > 0 ? Math.round((b.wins / b.n) * 100) : 0
    const avgR    = b.n > 0 ? Math.round((b.sumR / b.n) * 100) / 100 : 0
    const totalR  = Math.round(b.sumR * 100) / 100
    rows.push({
      key, label: b.label, n: b.n, wins: b.wins, winRate, avgR, totalR,
      insufficient: b.n < MIN_TRADES_FOR_SIGNAL,
    })
  }
  rows.sort((a, b) => (b.totalR - a.totalR) || (b.n - a.n) || a.key.localeCompare(b.key))
  return rows
}
