/**
 * Écritures côté serveur dans jarvis_session_events (étape 3F.4).
 * Service_role uniquement — appelé depuis les route handlers, jamais
 * depuis le client. Les erreurs sont loggées + propagées sous forme
 * d'exception (le caller décide quoi en faire).
 */

import { createClient } from '@supabase/supabase-js'
import type { DetectedTrade } from './event-detection'
import {
  computeSessionState,
  evaluateRules,
  type RuleKey,
  type TraderRules,
} from './rules-engine'
import {
  eventsToTrades,
  type SessionEventRow,
} from './brain'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[jarvis-session-write] Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Insère un trade dans jarvis_session_events (type='trade').
 * Retourne la row persistée pour permettre au caller de l'ajouter à
 * ctx.events localement et de refaire un snapshotSession sans
 * refetch complet.
 */
export async function insertTrade(userId: string, trade: DetectedTrade): Promise<SessionEventRow> {
  const supabase = serviceClient()
  const payload = {
    result_r:   trade.result_r,
    result_usd: trade.result_usd,
    instrument: trade.instrument ?? null,
    side:       trade.side ?? null,
    config:     trade.config ?? null,
    pending:    false,
    source:     'declared' as const,
  }
  const { data, error } = await supabase
    .from('jarvis_session_events')
    .insert({ user_id: userId, type: 'trade', payload })
    .select('id, type, payload, created_at')
    .single()
  if (error || !data) {
    console.error('[jarvis-session-write] insertTrade failed', { userId, error })
    throw new Error('insertTrade failed')
  }
  return data as SessionEventRow
}

/**
 * Insère un marqueur rule_triggered pour empêcher la ré-annonce de
 * la même règle plus tard (hors trade_after_stop qui ré-émet
 * volontairement, cf. rules-engine).
 */
export async function insertRuleTriggered(
  userId: string,
  key: RuleKey,
  config?: string,
): Promise<SessionEventRow> {
  const supabase = serviceClient()
  const payload: Record<string, unknown> = { key }
  if (config) payload.config = config
  const { data, error } = await supabase
    .from('jarvis_session_events')
    .insert({ user_id: userId, type: 'rule_triggered', payload })
    .select('id, type, payload, created_at')
    .single()
  if (error || !data) {
    console.error('[jarvis-session-write] insertRuleTriggered failed', { userId, key, error })
    throw new Error('insertRuleTriggered failed')
  }
  return data as SessionEventRow
}

/**
 * Après une correction / suppression de trade, les règles
 * rule_triggered déjà enregistrées peuvent ne plus être justifiées
 * (ex: le trade qui a déclenché first_win a été corrigé en perte).
 * Cette fonction :
 *   1. Recharge les events du jour
 *   2. Recalcule l'état et évalue les règles encore vraies
 *   3. Supprime les rule_triggered events dont la clé n'apparaît
 *      plus dans l'évaluation (same_config_hard_stop comparée aussi
 *      sur la config)
 * Retourne le nouvel état + les règles toujours valides.
 */
export interface ReconciledSnapshot {
  state: {
    tradesCount: number
    rSum: number | null
    usdSum: number
    consecutiveLosses: number
  }
  triggered: Array<{ key: RuleKey; message: string; config?: string }>
  events: SessionEventRow[]
}

export async function reconcileRuleTriggered(
  userId: string,
  rules: TraderRules,
): Promise<ReconciledSnapshot> {
  const supabase = serviceClient()
  const todayParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    .toISOString().slice(0, 10)

  const { data: eventsRaw } = await supabase
    .from('jarvis_session_events')
    .select('id, type, payload, created_at')
    .eq('user_id', userId)
    .eq('session_date', todayParis)
    .order('created_at', { ascending: true })
  const events = (eventsRaw as SessionEventRow[] | null) || []

  const trades = eventsToTrades(events)
  const state = computeSessionState(trades, rules)

  // On ré-évalue SANS priorStop (on va retirer les rule_triggered caducs)
  const currentlyValid = evaluateRules(state, rules, false)
  const validKeys = new Set(currentlyValid.map(t => `${t.key}::${t.config ?? ''}`))

  // Identifie les rule_triggered events qui ne sont plus justifiés
  const toDelete: string[] = []
  for (const ev of events) {
    if (ev.type !== 'rule_triggered') continue
    const p = ev.payload as { key?: RuleKey; config?: string }
    if (!p.key) { toDelete.push(ev.id); continue }
    const sig = `${p.key}::${p.config ?? ''}`
    if (!validKeys.has(sig)) toDelete.push(ev.id)
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from('jarvis_session_events')
      .delete().in('id', toDelete)
    if (error) console.error('[jarvis-session-write] reconcile delete failed', error)
  }

  return {
    state: {
      tradesCount: state.tradesCount,
      rSum: state.rSum,
      usdSum: state.usdSum,
      consecutiveLosses: state.consecutiveLosses,
    },
    triggered: currentlyValid.map(t => ({ key: t.key, message: t.message, config: t.config })),
    events: events.filter(e => !toDelete.includes(e.id)),
  }
}

/**
 * Supprime tous les événements de session du jour (date Paris) pour
 * un user — appelé par /api/jarvis/reset-session (3F.7).
 */
export async function resetTodaySession(userId: string): Promise<number> {
  const supabase = serviceClient()
  const todayParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    .toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('jarvis_session_events')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('session_date', todayParis)
  if (error) {
    console.error('[jarvis-session-write] resetTodaySession failed', { userId, error })
    throw new Error('resetTodaySession failed')
  }
  return count ?? 0
}
