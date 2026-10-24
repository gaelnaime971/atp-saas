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
 * Ancien catalogue de setups ATP — garder la casse et le format exacts
 * (Backtest.tsx:14-21). Si la paire existe telle quelle dans le catalogue,
 * on la réécrit à l'identique. Sinon, fallback "Élément Unité".
 */
const LEGACY_SETUP_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  OB:    { M1: 'OB M1', M5: 'OB M5', M15: 'OB M15', H1: 'OB H1', H4: 'OB H4' },
  FVG:   { M1: 'FVG M1', M5: 'FVG M5', M15: 'FVG M15', H1: 'FVG H1', H4: 'FVG H4' },
  CHoCH: { M1: 'CHoCH M1', M5: 'CHoCH M5', M15: 'CHoCH M15', H1: 'CHoCH H1' },
  BOS:   { M1: 'BOS M1', M5: 'BOS M5', M15: 'BOS M15', H1: 'BOS H1' },
}

/**
 * Ancien catalogue de signaux. "Pin Bar" est le cas particulier :
 * l'ancien catalogue l'écrit SANS unité, donc projectToLegacy ignore
 * la timeframe pour Pin Bar et écrit toujours "Pin Bar".
 */
const LEGACY_SIGNAL_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Hammer:    { '100T': 'Hammer 100T', M1: 'Hammer M1', M5: 'Hammer M5' },
  Engulfing: { M1: 'Engulfing M1', M5: 'Engulfing M5' },
}
const LEGACY_SIGNAL_NO_TF: ReadonlySet<string> = new Set(['Pin Bar'])

/** Fibonacci : "38.2%", "50%", "61.8%", "78.6%" — point et SANS espace. */
const LEGACY_FIBONACCI: Readonly<Record<string, string>> = {
  '38.2': '38.2%',
  '50':   '50%',
  '61.8': '61.8%',
  '78.6': '78.6%',
}

/** Chaîne legacy pour une paire zone donnée. */
export function legacyZoneLabel(element: string, timeframe: string): string {
  return LEGACY_SETUP_LABELS[element]?.[timeframe] ?? `${element} ${timeframe}`
}

/** Chaîne legacy pour un signal donné. "Pin Bar" sans unité. */
export function legacySignalLabel(element: string, timeframe: string): string {
  if (LEGACY_SIGNAL_NO_TF.has(element)) return element
  return LEGACY_SIGNAL_LABELS[element]?.[timeframe] ?? `${element} ${timeframe}`
}

/** Chaîne legacy pour une valeur Fibonacci. Fallback "<v>%". */
export function legacyFibonacciLabel(value: string): string {
  const normalized = value.replace(',', '.')
  return LEGACY_FIBONACCI[normalized] ?? `${normalized}%`
}

/**
 * Convertit un `criteria` moderne vers les colonnes `setup_types[]`,
 * `signals[]`, `has_confluence` de `backtests`. **Double-écriture
 * EXACTE** du format ancien catalogue (sinon les stats du coach IA et
 * de l'ancienne page se coupent en deux).
 *
 * Règles :
 *   - `zone` (paired)      → setup_types = "OB M5", "FVG M15"... Chaîne de
 *                            l'ancien catalogue quand elle existe (par
 *                            paire), sinon "Élément Unité".
 *   - `fibonacci` (multi)  → setup_types = "38.2%", "50%", "61.8%", "78.6%"
 *                            (point, SANS espace). La virgule française
 *                            n'apparaît QUE dans l'affichage.
 *   - `signal` (paired)    → signals = chaîne de l'ancien catalogue, OU
 *                            cas spécial "Pin Bar" (sans unité, quelle que
 *                            soit la TF), OU fallback "Élément Unité".
 *   - `my_setups` (multi)  → setup_types = valeur telle quelle.
 *   - Autres catégories custom → ignorées (le coach IA ne les lit pas).
 *
 * `has_confluence` : vrai si (zones.length + fibonacci.length) ≥ 2.
 */
export function projectToLegacy(criteria: CriteriaMap): {
  setup_types: string[]
  signals: string[]
  has_confluence: boolean
} {
  const setup_types: string[] = []
  const signals: string[] = []

  const zones = readPaired(criteria, 'zone')
  for (const p of zones) setup_types.push(legacyZoneLabel(p.element, p.timeframe))

  const fibos = readMulti(criteria, 'fibonacci')
  for (const f of fibos) setup_types.push(legacyFibonacciLabel(f))

  const mySetups = readMulti(criteria, 'my_setups')
  for (const s of mySetups) setup_types.push(s)

  const sigs = readPaired(criteria, 'signal')
  for (const p of sigs) signals.push(legacySignalLabel(p.element, p.timeframe))

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

// ─── Catégories ATP figées ──────────────────────────────────────────────────

/** Clés des 4 catégories semées par `seed_trader_criteria` — elles ne sont
 *  ni modifiables de type, ni supprimables. Toute autre clé (templates et
 *  critères vierges créés par le trader) est "Perso". */
export const ATP_CATEGORY_KEYS: ReadonlySet<string> = new Set([
  'zone', 'fibonacci', 'signal', 'my_setups',
])

export function isAtpCategory(key: string): boolean {
  return ATP_CATEGORY_KEYS.has(key)
}

// ─── Réordonnancement ───────────────────────────────────────────────────────

/** Déplace un élément de `from` à `to` dans un tableau. Pur, hors-bornes
 *  renvoie une copie inchangée. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const n = items.length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) {
    return items.slice()
  }
  const copy = items.slice()
  const [removed] = copy.splice(from, 1)
  copy.splice(to, 0, removed)
  return copy
}

// ─── Validation de la saisie "Nouveau critère" ──────────────────────────────

export interface CategoryDraft {
  label: string
  selection: CategorySelection
  /** Labels des options saisies (dédoublonnage insensible à la casse côté
   *  validation ; la casse d'origine est conservée côté stockage). */
  options: string[]
  /** Pour selection='paired'. Ignoré sinon. */
  timeframes: string[]
}

export interface ValidationErrors {
  label?: string
  options?: string
  timeframes?: string
}

/** Nom unique = aucune catégorie existante n'a ce label (insensible casse). */
export function validateCategoryDraft(
  draft: CategoryDraft,
  existingLabels: ReadonlyArray<string>,
): ValidationErrors {
  const errors: ValidationErrors = {}
  const label = draft.label.trim()
  if (!label) {
    errors.label = 'Donne un nom au critère.'
  } else if (existingLabels.some((l) => l.trim().toLowerCase() === label.toLowerCase())) {
    errors.label = 'Un critère porte déjà ce nom.'
  }

  const uniqueOpts = Array.from(new Set(
    draft.options.map((o) => o.trim()).filter(Boolean).map((o) => o.toLowerCase()),
  ))

  if (draft.selection === 'paired') {
    if (uniqueOpts.length < 1) {
      errors.options = 'Il faut au moins 1 élément.'
    }
    if (draft.timeframes.filter((t) => t.trim()).length < 1) {
      errors.timeframes = 'Il faut au moins 1 unité de temps.'
    }
  } else {
    if (uniqueOpts.length < 2) {
      errors.options = 'Il faut au moins 2 options.'
    }
  }

  return errors
}

/** Vrai si le draft passe la validation. */
export function isValidCategoryDraft(
  draft: CategoryDraft,
  existingLabels: ReadonlyArray<string>,
): boolean {
  const e = validateCategoryDraft(draft, existingLabels)
  return !e.label && !e.options && !e.timeframes
}

// ─── Timeframe sentinelle "non précisée" ────────────────────────────────────

/** Chaîne vide = TF non précisée (cas "Pin Bar" repris du backfill, ou
 *  option paired saisie sans unité). Les stats par unité de temps
 *  utilisent ce libellé pour afficher la ligne. */
export const UNSPECIFIED_TIMEFRAME = '' as const
export const UNSPECIFIED_TIMEFRAME_LABEL = 'Non précisée'

/** Libellé d'une TF pour l'UI. Chaîne vide → "Non précisée". */
export function timeframeLabel(tf: string): string {
  return tf === UNSPECIFIED_TIMEFRAME ? UNSPECIFIED_TIMEFRAME_LABEL : tf
}

// ─── Mutations immuables sur une liste de paires (saisie V2) ────────────────

function pairEq(a: PairedValue, b: PairedValue): boolean {
  return a.element === b.element && a.timeframe === b.timeframe
}

/** Ajoute `{element, timeframe}` à `current` si la paire exacte n'est
 *  pas déjà présente. Pur, retourne une nouvelle liste. */
export function addPair(current: PairedValue[], element: string, timeframe: string): PairedValue[] {
  const next: PairedValue = { element, timeframe }
  if (current.some((p) => pairEq(p, next))) return current.slice()
  return [...current, next]
}

/** Retire la paire exacte `{element, timeframe}`. Pur. */
export function removePair(current: PairedValue[], element: string, timeframe: string): PairedValue[] {
  return current.filter((p) => !pairEq(p, { element, timeframe }))
}

/** Set des TFs déjà prises pour un élément donné (utile pour griser
 *  les boutons "unité" déjà consommés par cet élément dans la saisie). */
export function takenTimeframesForElement(current: PairedValue[], element: string): Set<string> {
  const set = new Set<string>()
  for (const p of current) if (p.element === element) set.add(p.timeframe)
  return set
}

// ─── Calcul du R depuis points / stop (saisie V2) ───────────────────────────

/**
 * R = points / sl_points, arrondi à 2 décimales. Retourne `null` si
 * sl_points est 0, NaN ou négatif (le trader n'a pas (encore) renseigné
 * un stop valide — l'UI affiche un placeholder plutôt qu'un faux 0).
 */
export function computeRFromPoints(points: number, slPoints: number): number | null {
  if (!Number.isFinite(points) || !Number.isFinite(slPoints)) return null
  if (slPoints <= 0) return null
  return Math.round((points / slPoints) * 100) / 100
}

// ─── Confluence (saisie V2) ─────────────────────────────────────────────────

/**
 * Nombre d'éléments cumulés zones (paired) + fibonacci (multi) dans le
 * criteria courant. Un badge "Confluence détectée : N éléments" s'affiche
 * en haut du bloc Setup si N ≥ 2 (= has_confluence côté projectToLegacy).
 */
export function countConfluence(criteria: CriteriaMap): number {
  return readPaired(criteria, 'zone').length + readMulti(criteria, 'fibonacci').length
}

// ─── Reset du formulaire après "Enregistrer et saisir le suivant" ───────────

/**
 * Contexte conservé entre deux saisies rapides : date, instrument, sens.
 * Pur — l'UI n'a qu'à appeler cette fn pour obtenir le prochain état.
 */
export interface SaisieContext {
  date: string
  instrument: string
  direction: 'LONG' | 'SHORT'
}

/** Garde `date`, `instrument`, `direction` tels quels et considère
 *  TOUT le reste (criteria + résultat + notes + image) comme reset
 *  par le caller. Retourne juste la part conservée. */
export function resetAfterNext(ctx: SaisieContext): SaisieContext {
  return { date: ctx.date, instrument: ctx.instrument, direction: ctx.direction }
}

// ─── Validation de la saisie V2 ─────────────────────────────────────────────

/** Mode de saisie du résultat : "En R" (saisie directe) ou "En points"
 *  (points + stop → R calculé). */
export type ResultMode = 'r' | 'points'

export interface SaisieDraft {
  date: string
  instrument: string
  direction: 'LONG' | 'SHORT' | ''
  result: 'win' | 'loss' | 'be' | ''
  mode: ResultMode
  rInput: string          // string pour tolérer "+1,5" / "-0,5"
  pointsInput: string
  slPointsInput: string
  criteria: CriteriaMap
}

export interface SaisieErrors {
  instrument?: string
  direction?: string
  result?: string
  r?: string
  points?: string
  slPoints?: string
  setupWarning?: string   // avertissement léger — n'empêche PAS de sauver
}

function parseFrNumber(s: string): number | null {
  if (!s) return null
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

/** Validation stricte sauf `setupWarning` (= message indicatif). */
export function validateSaisie(draft: SaisieDraft): SaisieErrors {
  const e: SaisieErrors = {}
  if (!draft.instrument) e.instrument = 'Choisis un instrument.'
  if (!draft.direction) e.direction = 'Choisis le sens (Achat ou Vente).'
  if (!draft.result) e.result = 'Choisis l\'issue : Gagnant, Perdant ou BE.'
  if (draft.mode === 'r') {
    const r = parseFrNumber(draft.rInput)
    if (r == null) e.r = 'Renseigne le R (en nombre, ex. +1,5).'
  } else {
    const p = parseFrNumber(draft.pointsInput)
    const sl = parseFrNumber(draft.slPointsInput)
    if (p == null) e.points = 'Renseigne les points gagnés.'
    if (sl == null) e.slPoints = 'Renseigne le stop (en points).'
    else if (sl <= 0) e.slPoints = 'Le stop doit être supérieur à 0.'
  }
  // Setup = avertissement léger
  const totalSetups =
    readPaired(draft.criteria, 'zone').length +
    readMulti(draft.criteria, 'fibonacci').length +
    readPaired(draft.criteria, 'signal').length +
    readMulti(draft.criteria, 'my_setups').length
  if (totalSetups === 0) {
    e.setupWarning = 'Aucun setup choisi — tu peux quand même enregistrer.'
  }
  return e
}

/** Vrai si la saisie est enregistrable (= aucune erreur bloquante). */
export function isSaisieSubmittable(draft: SaisieDraft): boolean {
  const e = validateSaisie(draft)
  return !e.instrument && !e.direction && !e.result && !e.r && !e.points && !e.slPoints
}

/** Calcule le R final à écrire en base selon le mode. Retourne `null`
 *  si pas valide. Appel par l'UI juste avant le POST. */
export function resolveR(draft: SaisieDraft): number | null {
  if (draft.mode === 'r') return parseFrNumber(draft.rInput)
  const p = parseFrNumber(draft.pointsInput)
  const sl = parseFrNumber(draft.slPointsInput)
  if (p == null || sl == null) return null
  return computeRFromPoints(p, sl)
}

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
