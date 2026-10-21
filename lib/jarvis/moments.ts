/**
 * Jarvis 3G — Les moments.
 *
 * Fonctions PURES qui décident de l'ambiance visuelle à partir de
 * l'état déjà calculé par les étapes précédentes (règles, Joker,
 * casquette, trades). Zéro I/O, 100 % testable.
 *
 * Un seul "moment carte" à la fois, par priorité :
 *   Joker actif > stop du jour > mission accomplie > avant l'Open > session > none
 *
 * La priorité Joker ne produit AUCUNE carte "moment" (le mode Joker
 * a son propre stepper) : elle "éteint" juste les autres cartes.
 */

import type { RuleKey } from './rules-engine'
import type { JokerStep } from './joker'
import type { Casquette } from './casquette'

export type MomentKind = 'none' | 'avant_open' | 'stop' | 'mission' | 'session'

/** Clés "stop du jour" (session fermée par le moteur de règles). */
export const STOP_KEYS: ReadonlyArray<RuleKey> = [
  'three_losses', 'max_trades', 'same_config_hard_stop', 'trade_after_stop',
]

/** Clés "mission accomplie" (objectif atteint, on coupe serein). */
export const MISSION_KEYS: ReadonlyArray<RuleKey> = [
  'first_win', 'loss_then_win', 'target_reached',
]

export interface MomentInput {
  casquette: Casquette
  minutesToOpen: number | null
  jokerStep: JokerStep
  announced: ReadonlyArray<RuleKey>
  tradesCount: number
}

/**
 * Choisit le moment visuel courant. Pur, pas d'I/O.
 *
 * - Joker actif → 'none' (Joker a son propre affichage) même s'il y a
 *   un stop ou une mission par ailleurs : on ne montre pas deux
 *   choses opposées en même temps.
 * - Stop (règle hard enregistrée) prime sur mission (symétrie
 *   "sécurité > plaisir").
 * - Avant l'Open : fenêtre T-45 → T-0 ; nécessite un minutesToOpen
 *   positif et ≤ 45 (donc Open pas encore passé).
 * - Session : au moins un trade joué, et aucun des précédents.
 */
export function pickMoment(input: MomentInput): MomentKind {
  if (input.jokerStep !== 'inactive') return 'none'
  if (input.announced.some(k => STOP_KEYS.includes(k))) return 'stop'
  if (input.announced.some(k => MISSION_KEYS.includes(k))) return 'mission'
  if (input.minutesToOpen != null && input.minutesToOpen > 0 && input.minutesToOpen <= 45) {
    return 'avant_open'
  }
  if (input.tradesCount > 0) return 'session'
  return 'none'
}

/**
 * Détermine quel titre afficher pour la carte "Stop du jour".
 * "Frein à main" pour same_config_hard_stop, sinon "Stop du jour".
 */
export function stopTitleFor(announced: ReadonlyArray<RuleKey>): 'Frein à main' | 'Stop du jour' {
  return announced.includes('same_config_hard_stop') ? 'Frein à main' : 'Stop du jour'
}

// ─── Session en orbite ────────────────────────────────────────────────

/**
 * Un tour complet d'orbite = 2 h = 7 200 000 ms après l'Open.
 * +6 min  → 18°    (6/120 × 360)
 * +24 min → 72°
 * +60 min → 180°
 * +2 h    → 360° (butée)
 * Avant l'Open ou après 2 h → butée au repère le plus proche.
 */
export const ORBIT_FULL_MS = 2 * 60 * 60 * 1000

/**
 * Angle en degrés (0 = haut, 360 = haut, sens horaire) pour un
 * timestamp donné par rapport à l'Open. Butées :
 *   - avant l'Open → 0
 *   - après 2 h    → 360 (= revient au repère "Open")
 */
export function computeTradeAngle(tradeAt: Date | string, openAt: Date | string): number {
  const t = typeof tradeAt === 'string' ? new Date(tradeAt).getTime() : tradeAt.getTime()
  const o = typeof openAt === 'string' ? new Date(openAt).getTime() : openAt.getTime()
  if (!Number.isFinite(t) || !Number.isFinite(o)) return 0
  const delta = t - o
  if (delta <= 0) return 0
  if (delta >= ORBIT_FULL_MS) return 360
  return Number(((delta / ORBIT_FULL_MS) * 360).toFixed(2))
}

/** Les 4 repères de l'orbite (Open, +30, +1h, +1h30). Angles fixes. */
export const ORBIT_MARKERS: ReadonlyArray<{ label: string; angle: number }> = [
  { label: 'Open', angle: 0 },
  { label: '+30',  angle: 90 },
  { label: '+1h',  angle: 180 },
  { label: '+1h30', angle: 270 },
]
