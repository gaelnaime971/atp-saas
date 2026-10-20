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

/** Scanne le texte et retourne l'ordre des étapes CHoCH confirmées. */
export function detectConfirmedChochSteps(t: string): Array<'m1' | 'm5'> {
  // Jusqu'à 20 caractères (lettres, espaces, apostrophes, articles)
  // entre CHoCH et la TF.
  const re = new RegExp(`(?<![\\p{L}])${CHOCH_WORD}([\\p{L}\\s'’]{0,20})${TF_PATTERN}`, 'giu')
  const results: Array<{ kind: 'm1' | 'm5'; idx: number; end: number; confirmed: boolean }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const kind = tfKindOf(m[2])
    const idx = m.index
    const end = idx + m[0].length
    // Window FORWARD : jusqu'au prochain CHoCH ou jusqu'à 150 chars.
    const nextCh = (() => {
      const rest = t.slice(end)
      const nextRe = new RegExp(`(?<![\\p{L}])${CHOCH_WORD}`, 'iu')
      const nm = rest.match(nextRe)
      return nm && nm.index !== undefined ? end + nm.index : Math.min(end + 150, t.length)
    })()
    const forward = t.slice(end, nextCh)
    const confirmed = CONFIRM_RE.test(forward)
    results.push({ kind, idx, end, confirmed })
  }
  // Confirmation implicite via "aussi"/"également" + CHoCH frère confirmé
  for (let i = 1; i < results.length; i++) {
    if (results[i].confirmed) continue
    const prev = results[i - 1]
    if (!prev.confirmed) continue
    const linker = t.slice(prev.end, results[i].idx)
    if (ALSO_RE.test(linker)) results[i].confirmed = true
  }
  // Garder l'ordre chronologique dans le texte, dédoublonner (si un
  // M1 confirmé apparaît deux fois, on le compte une fois).
  const seen = new Set<string>()
  const steps: Array<'m1' | 'm5'> = []
  for (const r of results) {
    if (!r.confirmed) continue
    if (seen.has(r.kind)) continue
    seen.add(r.kind)
    steps.push(r.kind)
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
