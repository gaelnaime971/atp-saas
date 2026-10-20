/**
 * Moteur de règles Jarvis (étape 3F.2).
 *
 * Fonctions PURES, zéro I/O, 100 % testable. Entrées = trades du jour +
 * règles perso. Sorties = état de session + règles déclenchées (avec
 * leur libellé officiel à annoncer MOT POUR MOT par le cerveau).
 *
 * Les règles sont du CODE, pas de l'IA : c'est ici qu'on décide. L'IA
 * se contente d'annoncer ce que ce moteur a déclaré.
 */

export type TradeSide = 'long' | 'short'

export interface TradeEvent {
  /** id de l'event dans jarvis_session_events (optionnel pour les tests). */
  id?: string
  /** Horodatage de la déclaration (ordre chronologique). */
  at: Date
  /** Résultat en R si connu ; `null` si trade déclaré uniquement en $. */
  result_r: number | null
  /** Résultat en $ si connu ; `null` sinon. Au moins l'un des deux doit être présent. */
  result_usd: number | null
  instrument?: string
  side?: TradeSide
  /**
   * "Config" = nom de la configuration du trader (OB M15, FVG H4,
   * CHoCH M1…). Utilisée pour la règle same_config_hard_stop.
   * `null`/undefined si non précisé.
   */
  config?: string | null
  /**
   * `pending=true` → cas flou (le trader n'a pas été clair), le trade
   * n'est PAS compté dans l'état de session. 3F.4 : Jarvis demande.
   */
  pending?: boolean
}

export interface TraderRules {
  /** 0 ou absent = non renseigné. Jarvis compte alors en $, pas en R. */
  risk_per_trade_usd: number
  max_trades: number
  stop_after_losses: number
  target_r: number
  stop_after_first_win: boolean
  stop_after_loss_win: boolean
  same_config_hard_stop_after: number
  min_ratio: number
}

export const DEFAULT_RULES: TraderRules = {
  risk_per_trade_usd: 0,
  max_trades: 3,
  stop_after_losses: 3,
  target_r: 2,
  stop_after_first_win: true,
  stop_after_loss_win: true,
  same_config_hard_stop_after: 2,
  min_ratio: 2,
}

export interface SessionState {
  tradesCount: number
  /** Somme en R des trades comptés. `null` si on ne peut pas calculer de R (pas de risque renseigné et aucun trade en R). */
  rSum: number | null
  /** Somme en $ des trades comptés. */
  usdSum: number
  /** Pertes CONSÉCUTIVES jusqu'au dernier trade comptant (BE ne reset pas). */
  consecutiveLosses: number
  /** true si le TOUT premier trade de la journée a été gagnant. */
  firstTradeWin: boolean
  /** true si on a observé la séquence [Perte, Gain] n'importe où. */
  lossThenWinSeen: boolean
  /** Nombre d'échecs par config (une "config" = clef string). */
  sameConfigFails: Record<string, number>
  /** Timestamp du 1er trade. */
  startedAt: Date | null
  /** Dernier trade comptant (hors pending). */
  lastCountedTrade: TradeEvent | null
}

export type RuleKey =
  | 'first_win'
  | 'loss_then_win'
  | 'three_losses'
  | 'target_reached'
  | 'max_trades'
  | 'same_config_hard_stop'
  | 'trade_after_stop'

/**
 * 3F-CORRECTIF-2 — Priorité d'annonce. Si plusieurs règles tombent au
 * même message, on n'annonce que la principale. Les autres sont
 * enregistrées comme annoncées (pour ne pas retomber), mais SILENT.
 */
const RULE_PRIORITY: ReadonlyArray<RuleKey> = [
  'target_reached',
  'first_win',
  'loss_then_win',
  'three_losses',
  'max_trades',
  'same_config_hard_stop',
  'trade_after_stop',
]

/** Retourne la règle prioritaire parmi les triggers (ou null si vide). */
export function pickPrimaryTrigger(triggers: TriggeredRule[]): TriggeredRule | null {
  if (triggers.length === 0) return null
  for (const key of RULE_PRIORITY) {
    const hit = triggers.find(t => t.key === key)
    if (hit) return hit
  }
  // Si une règle n'est pas dans la priorité (ne devrait pas arriver),
  // on retourne la 1re — jamais rien.
  return triggers[0]
}

export interface TriggeredRule {
  key: RuleKey
  /** Libellé officiel à annoncer MOT POUR MOT. Interpolé si {R}/{N}. */
  message: string
  /** true = la session doit s'arrêter (ou le trade n'aurait pas dû être pris). */
  blocking: boolean
  /** Config concernée (seulement pour same_config_hard_stop). */
  config?: string
}

/**
 * Libellés officiels — reprendre MOT POUR MOT. Placeholders :
 *  - {R} : total R du jour (arrondi à 1 décimale)
 *  - {N} : nombre de trades joués
 */
export const RULE_MESSAGES: Record<RuleKey, string> = {
  first_win:             'Premier trade gagnant : mission du jour accomplie. On coupe, rendez-vous demain.',
  loss_then_win:         'Perdant puis gagnant : la règle dit stop. Belle gestion, on coupe les écrans.',
  three_losses:          'Trois pertes d\'affilée : stop pour aujourd\'hui. Ce n\'est pas ton jour, et ce n\'est pas grave.',
  target_reached:        'Plus {R} R : objectif atteint. Mission du jour accomplie, on coupe.',
  max_trades:            '{N} trades joués, c\'est ton maximum. On s\'arrête là pour aujourd\'hui.',
  same_config_hard_stop: 'Deux échecs sur la même config : frein à main. Pas de troisième essai.',
  trade_after_stop:      'Ce trade est en dehors de ta règle du jour. On s\'arrête là, on en reparle au débrief.',
}

function formatR(x: number): string {
  // "2", "2.5", "-0.5", "9"
  const rounded = Math.round(x * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

function fillMessage(key: RuleKey, state: SessionState): string {
  const template = RULE_MESSAGES[key]
  return template
    .replace('{R}', state.rSum != null ? formatR(state.rSum) : '0')
    .replace('{N}', String(state.tradesCount))
}

// ─── Classification d'un trade ──────────────────────────────────────
type Outcome = 'win' | 'loss' | 'be'

function classify(trade: TradeEvent): Outcome {
  if (trade.result_r != null) {
    if (trade.result_r > 0) return 'win'
    if (trade.result_r < 0) return 'loss'
    return 'be'
  }
  if (trade.result_usd != null) {
    if (trade.result_usd > 0) return 'win'
    if (trade.result_usd < 0) return 'loss'
    return 'be'
  }
  // Trade compté mais sans valeur chiffrée → neutre (ne peut pas arriver
  // en pratique, l'extraction impose au moins l'un des deux).
  return 'be'
}

// ─── computeSessionState ────────────────────────────────────────────

/**
 * Agrège l'état de session à partir des trades déclarés du jour.
 * Les trades `pending` sont IGNORÉS (3F.4 : Jarvis a posé la question,
 * ils entrent au moment où le trader confirme).
 */
export function computeSessionState(
  trades: TradeEvent[],
  rules: TraderRules = DEFAULT_RULES,
): SessionState {
  const counted = trades
    .filter(t => !t.pending)
    .slice()
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  const state: SessionState = {
    tradesCount: 0,
    rSum: 0,
    usdSum: 0,
    consecutiveLosses: 0,
    firstTradeWin: false,
    lossThenWinSeen: false,
    sameConfigFails: {},
    startedAt: null,
    lastCountedTrade: null,
  }

  let haveAnyR = false
  let prevOutcome: Outcome | null = null

  counted.forEach((t, idx) => {
    const outcome = classify(t)
    state.tradesCount += 1
    if (state.startedAt === null) state.startedAt = t.at
    state.lastCountedTrade = t

    if (t.result_r != null) {
      state.rSum = (state.rSum ?? 0) + t.result_r
      haveAnyR = true
    }
    if (t.result_usd != null) {
      state.usdSum += t.result_usd
    }

    if (idx === 0 && outcome === 'win') state.firstTradeWin = true

    // consecutive_losses :
    //  - loss  → +1
    //  - win   → reset à 0
    //  - be    → inchangé (BE ne casse pas la série)
    if (outcome === 'loss') state.consecutiveLosses += 1
    else if (outcome === 'win') state.consecutiveLosses = 0

    // lossThenWin : séquence [perte directement suivie par un gain],
    // BE au milieu n'invalide pas la séquence (ni gain ni perte).
    if (outcome === 'win') {
      // Chercher le dernier outcome non-BE précédent
      for (let i = idx - 1; i >= 0; i--) {
        const prev = classify(counted[i])
        if (prev === 'be') continue
        if (prev === 'loss') state.lossThenWinSeen = true
        break
      }
    }

    // same_config_fails : clé = config normalisée. Les BE ne comptent
    // pas comme un "échec" sur la config.
    if (outcome === 'loss' && t.config) {
      const k = t.config.trim().toLowerCase()
      if (k) state.sameConfigFails[k] = (state.sameConfigFails[k] ?? 0) + 1
    }

    prevOutcome = outcome
  })
  // Variable utilisée par le typage mais pas lue ailleurs
  void prevOutcome

  // Si aucun trade en R n'a été vu ET pas de risk_per_trade_usd pour
  // convertir, on ne peut pas déduire de rSum fiable.
  if (!haveAnyR) {
    if (rules.risk_per_trade_usd > 0 && state.usdSum !== 0) {
      state.rSum = state.usdSum / rules.risk_per_trade_usd
    } else {
      state.rSum = null
    }
  }

  return state
}

// ─── wasAlreadyAnnounced ────────────────────────────────────────────

export interface AnnouncedRuleRecord {
  key: RuleKey
  config?: string
}

/**
 * Vérifie si une règle a déjà été annoncée dans la journée (via la
 * table jarvis_session_events, type 'rule_triggered'). Pour
 * same_config_hard_stop, l'unicité est par (key, config).
 * trade_after_stop est TOUJOURS re-déclenché à chaque nouveau trade
 * post-stop (par design) → cette fonction retourne false pour cette clé.
 */
export function wasAlreadyAnnounced(
  rule: TriggeredRule,
  announced: AnnouncedRuleRecord[],
): boolean {
  if (rule.key === 'trade_after_stop') return false
  if (rule.key === 'same_config_hard_stop') {
    return announced.some(a => a.key === rule.key && (a.config ?? '') === (rule.config ?? ''))
  }
  return announced.some(a => a.key === rule.key)
}

// ─── evaluateRules ─────────────────────────────────────────────────

/**
 * Évalue l'état courant contre les règles et retourne TOUTES les règles
 * qui s'appliquent MAINTENANT. L'appelant filtrera avec
 * wasAlreadyAnnounced pour éviter la double-annonce.
 *
 * `priorStopAnnounced` : au moins une règle "stop" déjà annoncée dans
 * la journée. Si vrai ET un nouveau trade a été noté depuis, on émet
 * `trade_after_stop`.
 */
export function evaluateRules(
  state: SessionState,
  rules: TraderRules = DEFAULT_RULES,
  priorStopAnnounced = false,
): TriggeredRule[] {
  const triggered: TriggeredRule[] = []

  if (state.tradesCount === 0) return triggered

  // 1. first_win : 1er trade gagnant ET stop_after_first_win actif
  if (state.tradesCount >= 1 && state.firstTradeWin && rules.stop_after_first_win) {
    triggered.push({
      key: 'first_win',
      message: fillMessage('first_win', state),
      blocking: true,
    })
  }

  // 2. loss_then_win : perte puis gain observés ET stop_after_loss_win actif
  if (state.lossThenWinSeen && rules.stop_after_loss_win) {
    triggered.push({
      key: 'loss_then_win',
      message: fillMessage('loss_then_win', state),
      blocking: true,
    })
  }

  // 3. three_losses : N pertes consécutives atteintes
  if (state.consecutiveLosses >= rules.stop_after_losses) {
    triggered.push({
      key: 'three_losses',
      message: fillMessage('three_losses', state),
      blocking: true,
    })
  }

  // 4. target_reached : rSum ≥ target_r (si rSum calculable)
  if (state.rSum != null && state.rSum >= rules.target_r) {
    triggered.push({
      key: 'target_reached',
      message: fillMessage('target_reached', state),
      blocking: true,
    })
  }

  // 5. max_trades : plafond atteint
  if (state.tradesCount >= rules.max_trades) {
    triggered.push({
      key: 'max_trades',
      message: fillMessage('max_trades', state),
      blocking: true,
    })
  }

  // 6. same_config_hard_stop : N échecs sur la MÊME config
  for (const [cfg, n] of Object.entries(state.sameConfigFails)) {
    if (n >= rules.same_config_hard_stop_after) {
      triggered.push({
        key: 'same_config_hard_stop',
        message: fillMessage('same_config_hard_stop', state),
        blocking: true,
        config: cfg,
      })
    }
  }

  // 7. trade_after_stop : un trade a été noté après qu'une règle de
  //    stop ait déjà été annoncée dans la journée. Toujours re-émise
  //    (voir wasAlreadyAnnounced).
  if (priorStopAnnounced && state.tradesCount > 0) {
    triggered.push({
      key: 'trade_after_stop',
      message: fillMessage('trade_after_stop', state),
      blocking: true,
    })
  }

  return triggered
}
