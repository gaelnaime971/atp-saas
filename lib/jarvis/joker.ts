/**
 * Mode Joker (étape 3F.5) — machine à états pure, pilotée par le
 * CODE à partir de ce que dit le trader. Le cerveau ne modifie
 * JAMAIS l'état : il le reçoit en contexte quand le mode est actif
 * et commente, point.
 *
 * États :
 *   inactive  → armed  → choch_m1  → choch_m5  → ready → inactive
 *                                      ↓            ↓
 *                                      (ou cancelled / timeout 30 min)
 *
 * Armement : flux contre la zone du trader, ou "cas Joker" / "mode
 * Joker" explicite.
 * Avancée : CHoCH M1 puis CHoCH M5 (ordre strict). Les étapes hors
 * ordre sont signalées (outOfOrder) mais ne font PAS avancer l'état.
 * Prêt : retracement sur OB/FVG/Fibo/Breaker + Hammer ou signal
 * validé → annonce officielle via READY_MESSAGE.
 * Retour inactive : trade déclaré (côté caller), "annule le Joker",
 * "finalement je ne le prends pas", ou timeout 30 min.
 */

export type JokerStep = 'inactive' | 'armed' | 'choch_m1' | 'choch_m5' | 'ready'

export const READY_MESSAGE =
  'Ta checklist Joker est complète. C\'est toi qui cliques, et toi seul qui décides.'

/**
 * Annonces officielles pour CHAQUE transition Joker. Reprises MOT POUR
 * MOT par le cerveau en tête de réponse (comme les règles de session).
 * `inactive` n'a pas d'annonce (le trader annule, aucun bruit).
 */
export const JOKER_ANNOUNCE: Record<JokerStep, string | null> = {
  inactive: null,
  armed:    'Flux contre ta zone : mode Joker armé. Pas d\'entrée avant ton CHoCH M1, puis M5.',
  choch_m1: 'CHoCH M1 validé. On attend le M5, pas avant.',
  choch_m5: 'CHoCH M5 validé. Il manque le retracement sur ta zone et ton signal.',
  ready:    'Ta checklist Joker est complète. C\'est toi qui cliques, et toi seul qui décides.',
}

export interface JokerContext {
  step: JokerStep
  /** ISO date de l'entrée dans l'état courant (pour timeout). */
  since?: string
}

export interface JokerTransition {
  /** Prochain état. Si inchangé, next === current.step. */
  next: JokerStep
  /** Une étape plus avancée a été proposée hors ordre — le cerveau
   *  doit le relever au trader. */
  outOfOrder?: boolean
  /** Le trader a explicitement annulé. */
  cancelled?: boolean
  /** Transition vers ready — annonce officielle à faire. */
  reachedReady?: boolean
  /** Transition est due à un timeout 30 min (inactivité). */
  timedOut?: boolean
}

const TIMEOUT_MS = 30 * 60 * 1000

// ─── Détection des phrases ──────────────────────────────────────────

function normalize(input: string): string {
  return input.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
}

/** Armement explicite : "cas Joker", "mode Joker". */
function isJokerKeyword(t: string): boolean {
  return /(?<![\p{L}])(cas|mode)\s+joker(?![\p{L}])/iu.test(t) ||
         /(?<![\p{L}])joker\s+arm[ée](?![\p{L}])/iu.test(t)
}

/** Dict de zones techniques — accepte "order block", "order-block",
 *  "orderblock" (collé), "OB", "FVG", "breaker", "fibo", "support",
 *  "résistance". */
const ZONE_RE = /(?<![\p{L}])(support|r[ée]sistance|order\s*block|orderblock|\bOB\b|fvg|breaker|fibo)(?![\p{L}])/iu

/** Armement implicite : flux CONTRE une zone technique. */
function isCounterFlowOnZone(t: string): boolean {
  const hasFluxAgainst = /(?<![\p{L}])flux\s+(baissier|haussier|contre\s+(moi|ma|mon))(?![\p{L}])/iu.test(t)
  return hasFluxAgainst && ZONE_RE.test(t)
}

/** Armement implicite : le trader décrit qu'il arrive/est sur sa zone.
 *  Garde-fou : refuse si un résultat chiffré est dans la phrase
 *  (c'est un trade déclaré, pas un armement). */
function isApproachingZone(t: string): boolean {
  const approach = /(?<![\p{L}])(j'?arrive|je\s+suis|on\s+arrive|on\s+est|je\s+touche|je\s+teste|j'?approche)[^.!?]{1,60}/iu
  if (!approach.test(t)) return false
  if (!ZONE_RE.test(t)) return false
  // Exclure si résultat chiffré dans la phrase
  if (/[+-]?\d+(?:[,.]\d+)?\s*(R|\$|dollars?|usd|%)/iu.test(t)) return false
  if (/(?<![\p{L}])(stopp[ée]|stop touch[ée]|financ[ée]|BE|break[- ]?even|TP|j'ai\s+(gagn|pris|perdu))/iu.test(t)) return false
  return true
}

/** 3F-CORRECTIF-3 — Détection TOLÉRANTE des étapes CHoCH mentionnées
 *  et confirmées dans un message. Supporte :
 *   - plusieurs étapes dans un même message ("M1 validé et M5 validé")
 *   - mots intercalés entre CHoCH et la TF ("le CHoCH M1")
 *   - mots intercalés entre la TF et la confirmation ("M1 est validé")
 *   - accents facultatifs : "valide" / "validé" / "validée" / "validées"
 *   - synonymes : "confirmé", "ok", "cassé", "coché"
 *   - "aussi"/"également" + CHoCH → confirmation implicite si un
 *     frère est déjà confirmé dans le message
 *   - transcriptions : "choche", "choc", "chock", "cho ch"
 *   - "M un" / "M une" / "une minute" / "1 minute"
 *   - "M cinq" / "cinq minutes" / "5 minutes"
 */
const CHOCH_WORD = '(?:choch|choche|choc|chock|cho[-\\s]?ch)'
const TF_PATTERN = '(m\\s?1|m\\s?une?|une?\\s+minute|1\\s+minute|m\\s?5|m\\s?cinq|cinq\\s+minutes|5\\s+minutes)'
const CONFIRM_RE = /(?<![\p{L}])(valid[eé][eés]*|j'ai|je\s+vois|confirm[eé][eés]*|pris|c'est\s+bon|cass[eé][eés]*|coch[eé][eérsz]*|ok)(?![\p{L}])/iu
const ALSO_RE = /(?<![\p{L}])(aussi|[eé]galement|idem|pareil)(?![\p{L}])/iu

function tfKindOf(raw: string): 'm1' | 'm5' {
  const s = raw.toLowerCase().replace(/\s+/g, '')
  if (/5|cinq/.test(s)) return 'm5'
  return 'm1'
}

/** Mots qui coupent la confirmation : le trader attend l'étape, elle
 *  n'est pas (encore) validée. */
const GATE_RE = /(?<![\p{L}])(j'?attends?|en\s+attente|pas\s+encore|je\s+patiente|il\s+manque)(?![\p{L}])/iu

/** Connecteurs qui enchaînent une TF à la précédente dans la même
 *  phrase ("et", "puis", "ensuite", ","). */
const CONNECTOR_RE = /(?<![\p{L}])(et|puis|ensuite|apr[eè]s|ainsi(?:\s+que)?|comme)(?![\p{L}])|,/iu

/** Scanne le texte et retourne les étapes CHoCH confirmées, dans
 *  l'ordre où elles apparaissent. Gère : CHoCH + une seule TF,
 *  CHoCH + plusieurs TFs chaînées ("CHoCH M1 et M5 validés"), TFs nues
 *  chaînées ("M1 et M5 cassés"), piège "j'attends aussi le CHoCH M5". */
export function detectConfirmedChochSteps(t: string): Array<'m1' | 'm5'> {
  const CHOCH_ANCHOR = new RegExp(`(?<![\\p{L}])${CHOCH_WORD}([\\p{L}\\s'’]{0,20})${TF_PATTERN}`, 'giu')
  const BARE_TF_G   = new RegExp(`(?<![\\p{L}0-9])${TF_PATTERN}(?![\\p{L}0-9])`, 'giu')
  const BARE_TF_1   = new RegExp(`(?<![\\p{L}0-9])${TF_PATTERN}(?![\\p{L}0-9])`, 'iu')

  interface Entry { kind: 'm1' | 'm5'; start: number; end: number; confirmed: boolean; chochAnchored: boolean }
  const entries: Entry[] = []

  // Pass 1 — CHoCH-anchored : "CHoCH M1 (…) M5 validés" ou "CHoCH M1
  // puis M5" : on prolonge chaque ancre par les TFs chaînées via un
  // connecteur, bornées par la ponctuation forte, le mot de gating ou
  // le prochain "CHoCH".
  let m: RegExpExecArray | null
  while ((m = CHOCH_ANCHOR.exec(t)) !== null) {
    const firstTfStart = m.index + m[0].length - m[2].length
    const firstTfEnd = m.index + m[0].length
    entries.push({ kind: tfKindOf(m[2]), start: firstTfStart, end: firstTfEnd, confirmed: false, chochAnchored: true })

    let cursor = firstTfEnd
    while (true) {
      const rest = t.slice(cursor)
      // Borne : prochain "CHoCH", ponctuation forte, gating word, ou 100 chars.
      const nextChochRel = (() => { const n = rest.search(new RegExp(`(?<![\\p{L}])${CHOCH_WORD}`, 'iu')); return n < 0 ? Infinity : n })()
      const nextSentRel  = (() => { const n = rest.search(/[.!?…]/); return n < 0 ? Infinity : n })()
      const nextGateRel  = (() => { const g = rest.match(GATE_RE); return g && g.index !== undefined ? g.index : Infinity })()
      const bound = Math.min(nextChochRel, nextSentRel, nextGateRel, 100)
      const windowText = rest.slice(0, bound)
      const bareMatch = windowText.match(BARE_TF_1)
      if (!bareMatch || bareMatch.index === undefined) break
      const linker = windowText.slice(0, bareMatch.index)
      if (!CONNECTOR_RE.test(linker)) break
      const absStart = cursor + bareMatch.index
      const absEnd = absStart + bareMatch[0].length
      if (entries.some(e => e.start === absStart)) break
      entries.push({ kind: tfKindOf(bareMatch[1]), start: absStart, end: absEnd, confirmed: false, chochAnchored: false })
      cursor = absEnd
    }
  }

  // Pass 2 — TFs nues hors ancrage : "M1 et M5 cassés" (pas de CHoCH
  // explicite, mais un mot de confirmation local).
  const bareOutside: Array<{ kind: 'm1' | 'm5'; start: number; end: number }> = []
  BARE_TF_G.lastIndex = 0
  let bm: RegExpExecArray | null
  while ((bm = BARE_TF_G.exec(t)) !== null) {
    const start = bm.index
    if (entries.some(e => e.start === start)) continue
    bareOutside.push({ kind: tfKindOf(bm[1]), start, end: start + bm[0].length })
  }
  if (bareOutside.length >= 2) {
    // Regrouper par proximité : connecteur entre deux voisins, pas de
    // sentence boundary ni de gating.
    const bareGroups: typeof bareOutside[] = []
    let currentGroup: typeof bareOutside = [bareOutside[0]]
    for (let i = 1; i < bareOutside.length; i++) {
      const prev = bareOutside[i - 1], curr = bareOutside[i]
      const between = t.slice(prev.end, curr.start)
      if (/[.!?…]/.test(between) || GATE_RE.test(between) || !CONNECTOR_RE.test(between)) {
        bareGroups.push(currentGroup); currentGroup = [curr]
      } else currentGroup.push(curr)
    }
    bareGroups.push(currentGroup)
    for (const group of bareGroups) {
      if (group.length < 2) continue
      const first = group[0], last = group[group.length - 1]
      const spanStart = Math.max(0, first.start - 10)
      const spanEnd = Math.min(t.length, last.end + 80)
      const span = t.slice(spanStart, spanEnd)
      if (!CONFIRM_RE.test(span)) continue
      if (GATE_RE.test(t.slice(spanStart, last.end))) continue
      for (const g of group) {
        entries.push({ kind: g.kind, start: g.start, end: g.end, confirmed: true, chochAnchored: false })
      }
    }
  }

  // Trier par position et grouper par ancre CHoCH : chaque chochAnchored
  // ouvre un nouveau groupe, les suivants s'y rattachent.
  entries.sort((a, b) => a.start - b.start)
  const groups: Entry[][] = []
  let current: Entry[] = []
  for (const e of entries) {
    if (e.chochAnchored && current.length > 0) {
      groups.push(current); current = [e]
    } else current.push(e)
  }
  if (current.length > 0) groups.push(current)

  // Pass 3 — confirmation : groupe ≥ 2 TFs → confirmé (le trader
  // énumère) ; groupe de 1 → besoin d'un mot de confirmation dans la
  // fenêtre avant tout gating.
  for (const group of groups) {
    const last = group[group.length - 1]
    const idxInEntries = entries.indexOf(last)
    const nextEntryStart = idxInEntries + 1 < entries.length ? entries[idxInEntries + 1].start : t.length
    const windowRaw = t.slice(last.end, Math.min(nextEntryStart, last.end + 100))
    // Couper au premier gate word s'il existe
    const gateMatch = windowRaw.match(GATE_RE)
    const windowTrim = gateMatch && gateMatch.index !== undefined ? windowRaw.slice(0, gateMatch.index) : windowRaw
    const hasConfirm = CONFIRM_RE.test(windowTrim)
    const multiple = group.length >= 2
    // Déjà confirmé par Pass 2 (bare group) ?
    const alreadyConfirmed = group.every(e => e.confirmed)
    const confirmed = alreadyConfirmed || multiple || hasConfirm
    if (confirmed) for (const e of group) e.confirmed = true
  }

  // Pass 4 — propagation "aussi/également" : une TF non confirmée qui
  // suit une TF confirmée via "aussi" dans le linker (sans gating).
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].confirmed) continue
    const prev = entries[i - 1]
    if (!prev.confirmed) continue
    const linker = t.slice(prev.end, entries[i].start)
    if (ALSO_RE.test(linker) && !GATE_RE.test(linker)) entries[i].confirmed = true
  }

  // Dédoublonnage + ordre
  const seen = new Set<string>()
  const steps: Array<'m1' | 'm5'> = []
  for (const e of entries) {
    if (!e.confirmed) continue
    if (seen.has(e.kind)) continue
    seen.add(e.kind)
    steps.push(e.kind)
  }
  return steps
}

/** Retracement sur zone + signal (Hammer ou "signal validé"). */
function isRetracementReady(t: string): boolean {
  const hasZone = /(?<![\p{L}])(order[-\s]?block|\bOB\b|fvg|breaker|fibo|retracement)(?![\p{L}])/iu.test(t)
  const hasSignal = /(?<![\p{L}])(hammer|signal|signal\s+valid[ée]|retracement\s+valid[ée])(?![\p{L}])/iu.test(t)
  return hasZone && hasSignal
}

/** Annulation explicite. */
function isCancellation(t: string): boolean {
  return /(?<![\p{L}])(annule|annulé|annuler)(\s+le\s+joker)?(?![\p{L}])/iu.test(t) ||
         /(?<![\p{L}])(finalement\s+je\s+ne\s+le\s+prends\s+pas|je\s+l'oublie|j'oublie)(?![\p{L}])/iu.test(t) ||
         /(?<![\p{L}])stop\s+joker(?![\p{L}])/iu.test(t)
}

// ─── Transition pure ────────────────────────────────────────────────

/**
 * Calcule la prochaine étape du mode Joker à partir du texte du
 * trader et de l'état courant. Fonction pure, zéro I/O.
 *
 * now est passé en param pour pouvoir tester le timeout.
 */
export function advanceJokerState(
  ctx: JokerContext,
  input: string,
  now: Date = new Date(),
): JokerTransition {
  const t = normalize(input)
  const current = ctx.step

  // Timeout 30 min sur n'importe quel état actif, prioritaire sur
  // l'analyse du texte.
  if (current !== 'inactive' && ctx.since) {
    const sinceMs = new Date(ctx.since).getTime()
    if (Number.isFinite(sinceMs) && now.getTime() - sinceMs > TIMEOUT_MS) {
      return { next: 'inactive', timedOut: true }
    }
  }

  // Annulation explicite → inactive, quel que soit l'état
  if (current !== 'inactive' && isCancellation(t)) {
    return { next: 'inactive', cancelled: true }
  }

  // Depuis inactive
  if (current === 'inactive') {
    if (isJokerKeyword(t) || isCounterFlowOnZone(t) || isApproachingZone(t)) return { next: 'armed' }
    return { next: 'inactive' }
  }

  // 3F-CORRECTIF-3 — Les étapes confirmées peuvent se cumuler dans un
  // seul message ("CHoCH M1 validé et CHoCH M5 validé" depuis armed →
  // on remonte directement à choch_m5). Le code fait foi : si M5 est
  // annoncé sans M1 depuis armed, c'est outOfOrder, on ne remonte pas.
  const steps = detectConfirmedChochSteps(t)
  const sawM1 = steps.includes('m1')
  const sawM5 = steps.includes('m5')

  // Depuis armed → attend CHoCH M1, puis éventuellement M5 cumulé
  if (current === 'armed') {
    let next: JokerStep = 'armed'
    if (sawM1) next = 'choch_m1'
    if (sawM5 && next === 'choch_m1') next = 'choch_m5'
    if (sawM5 && !sawM1) return { next: 'armed', outOfOrder: true }
    if (next === 'choch_m5' && isRetracementReady(t)) {
      return { next: 'ready', reachedReady: true }
    }
    return { next }
  }

  // Depuis choch_m1 → attend CHoCH M5 (ou retrace+signal si M5 cumulé)
  if (current === 'choch_m1') {
    let next: JokerStep = 'choch_m1'
    if (sawM5) next = 'choch_m5'
    if (next === 'choch_m5' && isRetracementReady(t)) {
      return { next: 'ready', reachedReady: true }
    }
    return { next }
  }

  // Depuis choch_m5 → attend retracement + signal
  if (current === 'choch_m5') {
    if (isRetracementReady(t)) return { next: 'ready', reachedReady: true }
    return { next: 'choch_m5' }
  }

  // Depuis ready → en attente d'un trade (côté caller) ou cancel
  return { next: current }
}

/** Libellé human-readable pour une étape (UI + prompt cerveau). */
export const JOKER_STEP_LABEL: Record<JokerStep, string> = {
  inactive:  'inactif',
  armed:     'armé — en attente du CHoCH M1',
  choch_m1:  'CHoCH M1 validé — en attente du CHoCH M5',
  choch_m5:  'CHoCH M5 validé — en attente du retracement + signal',
  ready:     'prêt — checklist Joker complète',
}

/** Récupère l'état Joker courant à partir des events du jour.
 *  Prend le dernier joker_state event. Applique le timeout 30 min
 *  (inactive si rien d'actif ou si trop vieux). */
export function getCurrentJokerContext(
  events: Array<{ type: string; payload: unknown; created_at: string }>,
  now: Date = new Date(),
): JokerContext {
  // Dernier joker_state event
  const last = [...events].reverse().find(e => e.type === 'joker_state')
  if (!last) return { step: 'inactive' }
  const payload = last.payload as { step?: JokerStep }
  const step = payload.step ?? 'inactive'
  if (step === 'inactive') return { step: 'inactive' }
  // Timeout check
  const sinceMs = new Date(last.created_at).getTime()
  if (Number.isFinite(sinceMs) && now.getTime() - sinceMs > TIMEOUT_MS) {
    return { step: 'inactive' }
  }
  return { step, since: last.created_at }
}
