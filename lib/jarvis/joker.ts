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

/** Détecte CHoCH + unité temporelle. Tolère transcriptions imparfaites
 *  (choche, choc, chock, "une minute", "cinq minutes"). Retourne le
 *  timeframe demandé ("m1" | "m5") ou null. */
function detectChochTimeframe(t: string): 'm1' | 'm5' | null {
  // Variantes orthographiques du mot CHoCH
  const chochRe = /(?<![\p{L}])(choch|choche|choc|chock|cho[-\s]?ch)(?![\p{L}])/iu
  if (!chochRe.test(t)) return null

  // Timeframe M1 ou "une minute" / "1 minute"
  const m1 = /(?<![\p{L}])(m\s?1|une?\s+minute|1\s+minute)(?![\p{L}])/iu.test(t)
  const m5 = /(?<![\p{L}])(m\s?5|cinq\s+minutes|5\s+minutes)(?![\p{L}])/iu.test(t)
  if (m5) return 'm5'
  if (m1) return 'm1'
  return null
}

/** Confirmation : "validé", "j'ai", "je vois", "confirmé", "pris". */
function hasConfirmation(t: string): boolean {
  return /(?<![\p{L}])(valid[ée]|j'ai|je\s+vois|confirm[ée]|pris|c'est bon|cassé)(?![\p{L}])/iu.test(t)
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

  // Depuis armed → attend CHoCH M1
  if (current === 'armed') {
    const tf = detectChochTimeframe(t)
    if (tf === 'm1' && hasConfirmation(t)) return { next: 'choch_m1' }
    if (tf === 'm5') {
      // Hors ordre : il faut M1 d'abord
      return { next: 'armed', outOfOrder: true }
    }
    return { next: 'armed' }
  }

  // Depuis choch_m1 → attend CHoCH M5
  if (current === 'choch_m1') {
    const tf = detectChochTimeframe(t)
    if (tf === 'm5' && hasConfirmation(t)) return { next: 'choch_m5' }
    return { next: 'choch_m1' }
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
