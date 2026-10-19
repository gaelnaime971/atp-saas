/**
 * Cerveau Jarvis — factorisé entre /api/jarvis/chat (texte) et
 * /api/jarvis/voice (voix). Zéro duplication de contexte, de prompt
 * ni d'appel Groq.
 *
 * Deux fonctions publiques :
 *   - prepareContext(userId)     : charge/récupère depuis le cache
 *     routine du jour + stats 30j + isAdmin. Expose aussi la bible
 *     et la casquette du moment. Peut tourner en parallèle d'autres
 *     tâches (quota, transcription Whisper).
 *   - runBrain(ctx, messages, cfg) : envoie bible + contexte +
 *     format + messages à Groq, nettoie la réponse, retourne reply
 *     + usage + timings.
 *
 * Le routine-mentioned-tracking est automatique : si une réponse
 * assistant précédente contient le mot "routine", on instruit le
 * modèle de ne pas re-signaler l'absence (évite la répétition
 * demandée pour la voix).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { computeStats, compactContext, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'
import { buildProviderErrorResponse } from '@/lib/ai/quota'
import { getCasquette, type Casquette } from './casquette'
import {
  DEFAULT_RULES,
  computeSessionState,
  evaluateRules,
  wasAlreadyAnnounced,
  type TraderRules,
  type TradeEvent,
  type RuleKey,
  type SessionState,
  type TriggeredRule,
  type AnnouncedRuleRecord,
} from './rules-engine'

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface RoutineRow {
  confidence: number | null
  mental_note: string | null
  bias: string | null
  news: string | null
  support: string | null
  resistance: string | null
  checks: Record<string, boolean> | null
}

/**
 * Événement brut tel que lu de jarvis_session_events. On garde la
 * discrimination par type dans le payload — les helpers ci-dessous
 * convertissent vers les types forts (TradeEvent, AnnouncedRuleRecord).
 */
export interface SessionEventRow {
  id: string
  type: 'trade' | 'joker_state' | 'rule_triggered' | 'session_end'
  payload: Record<string, unknown>
  created_at: string
}

export interface JarvisContext {
  userId: string
  email: string
  isAdmin: boolean
  routine: RoutineRow | null
  statsCompact: Record<string, unknown>
  rules: TraderRules
  events: SessionEventRow[]
  casquette: ReturnType<typeof getCasquette>
  bibleTxt: string
  now: Date
  cacheHits: string[]
}

// ─── Helpers de conversion événements → types rules-engine ──────────
export function eventsToTrades(events: SessionEventRow[]): TradeEvent[] {
  return events
    .filter(e => e.type === 'trade')
    .map(e => {
      const p = e.payload as {
        result_r?: number | null
        result_usd?: number | null
        instrument?: string
        side?: 'long' | 'short'
        config?: string | null
        pending?: boolean
      }
      return {
        id: e.id,
        at: new Date(e.created_at),
        result_r:   typeof p.result_r   === 'number' ? p.result_r   : null,
        result_usd: typeof p.result_usd === 'number' ? p.result_usd : null,
        instrument: p.instrument,
        side:       p.side,
        config:     p.config ?? null,
        pending:    Boolean(p.pending),
      }
    })
}

export function eventsToAnnounced(events: SessionEventRow[]): AnnouncedRuleRecord[] {
  return events
    .filter(e => e.type === 'rule_triggered')
    .map(e => {
      const p = e.payload as { key?: RuleKey; config?: string }
      return { key: p.key as RuleKey, config: p.config }
    })
    .filter(r => Boolean(r.key))
}

/**
 * Au moins une règle de type "stop" a-t-elle déjà été annoncée aujourd'hui ?
 * Pilote la détection trade_after_stop dans evaluateRules.
 */
const STOP_RULE_KEYS: ReadonlySet<RuleKey> = new Set<RuleKey>([
  'first_win', 'loss_then_win', 'three_losses',
  'target_reached', 'max_trades', 'same_config_hard_stop',
])
export function hasPriorStopAnnounced(announced: AnnouncedRuleRecord[]): boolean {
  return announced.some(a => STOP_RULE_KEYS.has(a.key))
}

// ─── Caches module-level ─────────────────────────────────────────────
let bibleCache: string | null = null
async function loadBible(): Promise<string> {
  if (bibleCache !== null) return bibleCache
  const p = path.join(process.cwd(), 'lib', 'jarvis', 'bible.md')
  bibleCache = await readFile(p, 'utf-8')
  return bibleCache
}

// ─── Caches séparés par type de donnée ──────────────────────────────
//
// TTL calibrés sur la vraie fraîcheur nécessaire :
//   - stats 30j : 30 min — n'évoluent qu'à l'enregistrement d'une
//     nouvelle session. Trader actif = quelques sessions/jour, donc
//     30 min couvrent largement un échange vocal.
//   - routine du jour : 5 min — pouvant être remplie en plusieurs
//     fois le matin, on reste réactif.
//   - profile.role : 30 min — change extrêmement rarement.
//
// Caches module-level, partagés entre invocations warm d'une même
// instance Vercel. Multi-instances : chaque instance a son cache
// propre → si Vercel scale (plusieurs lambdas chaudes en parallèle),
// cache miss plus fréquent qu'attendu. Pour un POC gated à 1 user,
// Vercel garde 1 instance chaude. Si on observe des miss trop
// fréquents en prod → prochaine étape : cache Redis Upstash ou
// Supabase edge cache (partagé entre toutes les instances).
const STATS_TTL_MS   = 30 * 60 * 1000
const ROUTINE_TTL_MS =  5 * 60 * 1000
const PROFILE_TTL_MS = 30 * 60 * 1000
const RULES_TTL_MS   = 30 * 60 * 1000

interface StatsCacheEntry   { at: number; data: Record<string, unknown> }
interface RoutineCacheEntry { at: number; data: RoutineRow | null }
interface ProfileCacheEntry { at: number; isAdmin: boolean }
interface RulesCacheEntry   { at: number; data: TraderRules }

const statsCache   = new Map<string, StatsCacheEntry>()
const routineCache = new Map<string, RoutineCacheEntry>()
const profileCache = new Map<string, ProfileCacheEntry>()
const rulesCache   = new Map<string, RulesCacheEntry>()

function freshStats(userId: string, now: number): StatsCacheEntry | null {
  const e = statsCache.get(userId)
  return e && (now - e.at) < STATS_TTL_MS ? e : null
}
function freshRoutine(userId: string, now: number): RoutineCacheEntry | null {
  const e = routineCache.get(userId)
  return e && (now - e.at) < ROUTINE_TTL_MS ? e : null
}
function freshProfile(userId: string, now: number): ProfileCacheEntry | null {
  const e = profileCache.get(userId)
  return e && (now - e.at) < PROFILE_TTL_MS ? e : null
}
function freshRules(userId: string, now: number): RulesCacheEntry | null {
  const e = rulesCache.get(userId)
  return e && (now - e.at) < RULES_TTL_MS ? e : null
}

/** À appeler après chaque UPDATE côté serveur (RPC update_trader_rules). */
export function invalidateRulesCache(userId: string): void {
  rulesCache.delete(userId)
}

/**
 * Récupère routine + stats + isAdmin pour un user, depuis le cache
 * mémoire si frais (< 5 min), sinon depuis Supabase en Promise.all.
 * Toujours charge la bible (cachée séparément) et calcule la
 * casquette (CPU seul).
 */
export async function prepareContext(userId: string, email: string, now: Date = new Date()): Promise<JarvisContext> {
  const nowMs = now.getTime()
  const cacheHits: string[] = []
  const todayISO = now.toISOString().slice(0, 10)
  const from = new Date(nowMs - 30 * 86400_000).toISOString().slice(0, 10)

  const sHit  = freshStats(userId, nowMs)
  const rHit  = freshRoutine(userId, nowMs)
  const pHit  = freshProfile(userId, nowMs)
  const trHit = freshRules(userId, nowMs)
  if (sHit)  cacheHits.push('stats')
  if (rHit)  cacheHits.push('routine')
  if (pHit)  cacheHits.push('profile')
  if (trHit) cacheHits.push('rules')
  // events = PAS DE CACHE : ils doivent être frais à chaque échange.

  // Toutes les sources vivent dans Supabase sauf la bible — un seul
  // round-trip DB en Promise.all. Les hits renvoient une Promise
  // résolue immédiatement pour ne pas trouer le Promise.all.
  const [bibleTxt, supabase] = await Promise.all([loadBible(), createSsrClient()])
  const noResult = Promise.resolve({ data: null } as const)
  const emptyList = Promise.resolve({ data: [] } as const)

  const [profileRes, routineRes, sessionsRes, backtestsRes, rulesRes, eventsRes] = await Promise.all([
    pHit ? noResult : supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    rHit ? noResult : supabase.from('pre_market_routines')
      .select('confidence,mental_note,bias,news,support,resistance,checks')
      .eq('user_id', userId)
      .eq('routine_date', todayISO)
      .maybeSingle(),
    sHit ? noResult : supabase.from('trading_sessions')
      .select('session_date,pnl,result,trades_count,instrument,setup,notes')
      .eq('trader_id', userId)
      .gte('session_date', from)
      .lte('session_date', todayISO)
      .order('session_date', { ascending: false }),
    sHit ? noResult : supabase.from('backtests')
      .select('date,instrument,direction,setup_types,signals,has_confluence,r_result,result,notes')
      .eq('trader_id', userId)
      .gte('date', from)
      .lte('date', todayISO),
    trHit ? noResult : supabase.from('trader_personal_rules')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    // Events du jour : TOUJOURS frais. On lit par ordre chronologique
    // d'insertion. todayISO est la date UTC ; côté Supabase, la table
    // utilise _atp_today_paris() en défaut → on filtre par la date
    // Paris calculée serveur (todayParis).
    (async () => {
      const todayParis = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
        .toISOString().slice(0, 10)
      return supabase.from('jarvis_session_events')
        .select('id, type, payload, created_at')
        .eq('user_id', userId)
        .eq('session_date', todayParis)
        .order('created_at', { ascending: true })
    })(),
  ])

  const isAdmin: boolean = pHit
    ? pHit.isAdmin
    : ((profileRes.data as { role?: string } | null)?.role === 'admin')
  const routine: RoutineRow | null = rHit
    ? rHit.data
    : (routineRes.data as RoutineRow | null)
  let statsCompact: Record<string, unknown>
  if (sHit) {
    statsCompact = sHit.data
  } else {
    const sessions = (sessionsRes.data as SessionRow[] | null) || []
    const backtests = (backtestsRes.data as BacktestRow[] | null) || []
    const opts: MetricsOptions = {
      from, to: todayISO, periodLabel: '30 derniers jours',
      instrument: null, accountId: null, direction: null,
    }
    const stats = computeStats(sessions, backtests, opts)
    statsCompact = compactContext(stats)
  }
  const rules: TraderRules = trHit
    ? trHit.data
    : rowToRules(rulesRes.data as Partial<TraderRules> | null)
  const events: SessionEventRow[] = (eventsRes.data as SessionEventRow[] | null) || []

  if (!sHit)  statsCache.set(userId,   { at: nowMs, data: statsCompact })
  if (!rHit)  routineCache.set(userId, { at: nowMs, data: routine })
  if (!pHit)  profileCache.set(userId, { at: nowMs, isAdmin })
  if (!trHit) rulesCache.set(userId,   { at: nowMs, data: rules })

  return {
    userId, email, isAdmin,
    routine, statsCompact, rules, events,
    casquette: getCasquette(now),
    bibleTxt, now, cacheHits,
  }
}

/** Convertit la ligne trader_personal_rules en TraderRules (défauts si absente). */
function rowToRules(row: Partial<TraderRules> | null): TraderRules {
  if (!row) return DEFAULT_RULES
  return {
    risk_per_trade_usd:          Number(row.risk_per_trade_usd ?? DEFAULT_RULES.risk_per_trade_usd),
    max_trades:                  Number(row.max_trades ?? DEFAULT_RULES.max_trades),
    stop_after_losses:           Number(row.stop_after_losses ?? DEFAULT_RULES.stop_after_losses),
    target_r:                    Number(row.target_r ?? DEFAULT_RULES.target_r),
    stop_after_first_win:        row.stop_after_first_win ?? DEFAULT_RULES.stop_after_first_win,
    stop_after_loss_win:         row.stop_after_loss_win ?? DEFAULT_RULES.stop_after_loss_win,
    same_config_hard_stop_after: Number(row.same_config_hard_stop_after ?? DEFAULT_RULES.same_config_hard_stop_after),
    min_ratio:                   Number(row.min_ratio ?? DEFAULT_RULES.min_ratio),
  }
}

// ─── Prompts FORMAT dynamiques (casquette + detailRequested) ────────
//
// Longueurs par contexte :
//   detailRequested ("développe", "explique", "détaille") → 900 car
//   TRADER (session en cours)                              → 250 car
//   autres casquettes                                      → 600 car
// Le coupe-texte serveur (clampResponse) applique ces mêmes limites.

type FormatMode = 'text' | 'voice'

export function computeMaxChars(casquette: Casquette, detailRequested: boolean): number {
  if (detailRequested) return 900
  if (casquette === 'TRADER') return 250
  return 600
}

export function detectDetailRequested(text: string): boolean {
  // Détecte une demande explicite d'élaboration dans le dernier
  // message du trader. "développe", "explique", "détaille", avec ou
  // sans "moi", "nous", "ça".
  return /\b(d[ée]veloppe|d[ée]taille|explique)\b/i.test(text)
}

function phraseAllowance(casquette: Casquette, detailRequested: boolean): string {
  if (detailRequested) return '4 à 8 phrases, UNE réponse longue cette fois'
  if (casquette === 'TRADER') return '1 à 3 phrases COURTES — le trader regarde son graphique'
  return 'jusqu\'à 5 phrases'
}

export function buildFormatPrompt(mode: FormatMode, casquette: Casquette, detailRequested: boolean): string {
  const maxChars = computeMaxChars(casquette, detailRequested)
  const phrases = phraseAllowance(casquette, detailRequested)

  const voiceExtras = mode === 'voice' ? `

ERREURS DE TRANSCRIPTION — la question du trader arrive d'une
reconnaissance vocale et peut contenir des mots du jargon mal
transcrits : "enderbloc" / "ender bloc" = order block, "ichoche" /
"cho-cho" = CHoCH, "effeveger" / "F V G" = FVG, "ammeur" = hammer,
"mode joueur" = mode Joker, "deux R" / "2R" = ratio 2 R. Comprends
le mot voulu dans le contexte, utilise TOUJOURS l'orthographe
correcte dans ta réponse. Ne répète JAMAIS un mot mal transcrit.` : ''

  return `FORMAT DE SORTIE
- ${phrases}, ${maxChars} caractères MAX.
- Chiffres et symboles autorisés : "0,2 à 0,4 %", "+2 R", "900 $".
  Une couche serveur les convertit en mots pour la voix.
- AUCUN markdown, aucune liste à puces, aucun titre, aucune
  apostrophe typographique. Texte brut.
- Pas d'abréviations lues bizarrement : écris "Order Block" plutôt
  que "OB" à la 1re mention.
- Français, tutoiement, calme et chaleureux.
- Si une donnée du contexte manque, dis-le franchement, n'invente rien.
- Ne donne jamais de signal : pas de "prends le trade", pas de niveau
  d'entrée/TP/SL.
- Varie l'ouverture : ne commence jamais deux réponses de la même
  façon, jamais de "Rappel :".
- UNE SEULE réponse finale. Ne la révise pas, ne la reformule pas.${voiceExtras}`
}

// ─── Détection "routine déjà mentionnée" ─────────────────────────────
function routineAlreadyFlagged(messages: ChatMessage[]): boolean {
  return messages.some(m =>
    m.role === 'assistant' && /routine/i.test(m.content),
  )
}

/** Construit le system message de contexte pour un ctx + mode */
export function buildContextMessage(ctx: JarvisContext, messages: ChatMessage[]): string {
  const nowParis = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short',
  }).format(ctx.now)

  const casquetteBlock = ctx.casquette.casquette === 'marché-fermé'
    ? `Casquette : marché fermé (week-end NY). Pas de session aujourd'hui.`
    : `Casquette du moment : ${ctx.casquette.casquette}
Open US aujourd'hui : ${ctx.casquette.usOpenParisLabel} heure de Paris (= 09:30 America/New_York)
Minutes jusqu'à l'Open : ${ctx.casquette.minutesToOpen} (négatif = déjà passé)`

  const alreadyFlagged = routineAlreadyFlagged(messages)
  const routineBlock = ctx.routine
    ? `Routine pré-marché remplie aujourd'hui :
- Confiance : ${ctx.routine.confidence ?? 'non renseignée'}/10
- Note mentale : ${ctx.routine.mental_note || 'vide'}
- Biais : ${ctx.routine.bias || 'non renseigné'}
- News : ${ctx.routine.news || 'vide'}
- Support : ${ctx.routine.support || 'vide'}
- Résistance : ${ctx.routine.resistance || 'vide'}
- Checks : ${JSON.stringify(ctx.routine.checks ?? {})}`
    : alreadyFlagged
      ? `AUCUNE routine pré-marché aujourd'hui. L'absence a déjà été signalée au trader plus tôt dans la conversation — NE la re-signale pas, concentre-toi sur sa question actuelle.`
      : `AUCUNE routine pré-marché aujourd'hui. Si c'est pertinent pour sa question, signale-le UNE SEULE fois, puis réponds.`

  // Règles perso du trader
  const r = ctx.rules
  const riskLine = r.risk_per_trade_usd > 0
    ? `${r.risk_per_trade_usd} $/trade`
    : 'non renseigné (demande-le une seule fois si pertinent)'
  const accountLine = (r as unknown as { account_size_usd?: number }).account_size_usd && (r as unknown as { account_size_usd?: number }).account_size_usd! > 0
    ? `${(r as unknown as { account_size_usd?: number }).account_size_usd} $`
    : 'non renseigné'
  const rulesBlock = `RÈGLES PERSO DU TRADER (figées pour aujourd'hui) :
- Capital compte : ${accountLine}
- Risque par trade : ${riskLine}
- Max trades/session : ${r.max_trades}
- Stop après ${r.stop_after_losses} pertes d'affilée
- Objectif : +${r.target_r} R
- Stop après 1er trade gagnant : ${r.stop_after_first_win ? 'oui' : 'non'}
- Stop après "perdant puis gagnant" : ${r.stop_after_loss_win ? 'oui' : 'non'}
- Frein à main après ${r.same_config_hard_stop_after} échecs sur la même config
- Ratio minimum : ${r.min_ratio}
Ces règles sont du CODE : c'est le serveur qui décide ce qui les
déclenche. Toi, tu annonces quand on te le dit, pas de ta propre
initiative.`

  // État de session (calculé par le moteur de règles pur)
  const trades = eventsToTrades(ctx.events)
  const state = computeSessionState(trades, ctx.rules)
  const announced = eventsToAnnounced(ctx.events)
  const stateBlock = state.tradesCount === 0
    ? `ÉTAT DE SESSION : aucun trade déclaré aujourd'hui.`
    : `ÉTAT DE SESSION :
- Trades joués : ${state.tradesCount}
- R du jour : ${state.rSum != null ? state.rSum.toFixed(2) : 'non calculable (pas de risque renseigné)'}
- $ du jour : ${state.usdSum.toFixed(2)}
- Pertes consécutives : ${state.consecutiveLosses}
- 1er trade gagnant : ${state.firstTradeWin ? 'oui' : 'non'}
- Perdant puis gagnant observé : ${state.lossThenWinSeen ? 'oui' : 'non'}
- Échecs par config : ${JSON.stringify(state.sameConfigFails)}
- Règles DÉJÀ annoncées aujourd'hui (ne pas répéter sauf
  trade_after_stop) : ${announced.length ? announced.map(a => a.key + (a.config ? `(${a.config})` : '')).join(', ') : 'aucune'}`

  return `CONTEXTE INSTANT
Heure actuelle (Paris) : ${nowParis}
Compte : ${ctx.email}
${casquetteBlock}

${routineBlock}

${rulesBlock}

${stateBlock}

Statistiques du trader (30 derniers jours) :
${JSON.stringify(ctx.statsCompact, null, 2)}

Règle absolue : si une info ci-dessus manque, dis-le, n'invente rien.`
}

// ─── Helper evaluate (utilisé par les routes voice/chat en 3F.4) ────
export interface SessionSnapshot {
  state: SessionState
  freshTriggers: TriggeredRule[]
  alreadyAnnounced: AnnouncedRuleRecord[]
}
/**
 * Calcule l'état + les règles à annoncer MAINTENANT (celles qui
 * ne l'ont pas déjà été). Entrée = events bruts du jour.
 */
export function snapshotSession(events: SessionEventRow[], rules: TraderRules): SessionSnapshot {
  const trades = eventsToTrades(events)
  const announced = eventsToAnnounced(events)
  const state = computeSessionState(trades, rules)
  const priorStop = hasPriorStopAnnounced(announced)
  const all = evaluateRules(state, rules, priorStop)
  const freshTriggers = all.filter(t => !wasAlreadyAnnounced(t, announced))
  return { state, freshTriggers, alreadyAnnounced: announced }
}

// ─── Clamp réponse (reasoning strip + anti-doublon intelligent) ─────
export function clampResponse(raw: string, maxChars: number): string {
  let s = raw
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim()

  const boundaryRe = /([.!?…])([A-ZÉÈÀÇÎÔÛ])/g
  let m: RegExpExecArray | null
  const splits: number[] = []
  while ((m = boundaryRe.exec(s)) !== null) splits.push(m.index + 1)

  for (const pos of splits) {
    const left = s.slice(0, pos)
    const right = s.slice(pos)
    if (right.length < 40) continue
    if (isAbbreviationBoundary(left)) continue
    const sim = jaccardWords(left, right)
    if (sim >= 0.5) {
      console.warn('[jarvis] doublon-coupé', {
        sim: Number(sim.toFixed(2)),
        leftLen: left.length,
        rightLen: right.length,
        leftTail: left.slice(-40),
        rightHead: right.slice(0, 40),
      })
      s = left.trim()
      break
    }
  }

  if (s.length <= maxChars) return s
  const slice = s.slice(0, maxChars)
  const lastPunct = Math.max(
    slice.lastIndexOf('.'), slice.lastIndexOf('!'),
    slice.lastIndexOf('?'), slice.lastIndexOf('…'),
  )
  if (lastPunct > 60) return slice.slice(0, lastPunct + 1).trim()
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > 60) return slice.slice(0, lastSpace).trim() + '…'
  return slice.trim() + '…'
}

function isAbbreviationBoundary(left: string): boolean {
  if (/(?:^|[\s(])(?:[A-Z]\.){1,}$/.test(left)) return true
  if (/\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|Prof|M|Mme|Mlle)\.$/.test(left)) return true
  if (/\b(?:etc|cf|ex|p\.ex|i\.e|e\.g|chap|éd|ed|ill|vol|réf|ref)\.$/i.test(left)) return true
  return false
}

function jaccardWords(a: string, b: string): number {
  const words = (s: string): Set<string> => {
    const matches = s.toLowerCase().match(/\p{L}+/gu) || []
    return new Set(matches.filter(w => w.length >= 3))
  }
  const wa = words(a), wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

// ─── Fetch Groq budgeté (6s max) ────────────────────────────────────
interface FetchBudgetedResult { response: Response; attempts: number }
async function fetchGroqBudgeted(payload: unknown, apiKey: string): Promise<FetchBudgetedResult> {
  const PER = 2800
  const PAUSE = 300
  const makeAttempt = () => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PER),
  })

  let r1: Response
  try {
    r1 = await makeAttempt()
  } catch (err) {
    await new Promise(res => setTimeout(res, PAUSE))
    try {
      const r2 = await makeAttempt()
      return { response: r2, attempts: 2 }
    } catch { throw err }
  }
  if (r1.ok) return { response: r1, attempts: 1 }
  if (r1.status !== 429 && r1.status < 500) return { response: r1, attempts: 1 }
  await new Promise(res => setTimeout(res, PAUSE))
  try {
    const r2 = await makeAttempt()
    return { response: r2, attempts: 2 }
  } catch { return { response: r1, attempts: 2 } }
}

// ─── runBrain : contexte → Groq → clamp ─────────────────────────────
export interface BrainRunConfig {
  format: 'text' | 'voice'
  /** Casquette active côté serveur — pilote la longueur et le ton. */
  casquette: Casquette
  /** Détecté dans le dernier message du trader. */
  detailRequested: boolean
}

export interface BrainOk {
  ok: true
  reply: string
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  groqMs: number
  attempts: number
  casquette: Casquette
}

export interface BrainErr {
  ok: false
  response: Response
}

export async function runBrain(
  ctx: JarvisContext,
  messages: ChatMessage[],
  cfg: BrainRunConfig,
): Promise<BrainOk | BrainErr> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return { ok: false, response: buildProviderErrorResponse({ route: '/api/jarvis/brain', detail: 'GROQ_API_KEY missing' }) }
  }

  const contextMsg = buildContextMessage(ctx, messages)
  const formatMsg = buildFormatPrompt(cfg.format, cfg.casquette, cfg.detailRequested)
  const maxChars = computeMaxChars(cfg.casquette, cfg.detailRequested)
  // ~2.5 chars par token (FR, ponctuation), + marge pour que le modèle
  // termine proprement avant le clamp. Jamais inférieur à 150.
  const maxTokens = Math.max(150, Math.ceil(maxChars / 2.3) + 50)
  const trimmed = messages.slice(-10)

  const payload = {
    model: GROQ_TEXT_MODEL,
    max_tokens: maxTokens,
    temperature: 0.7,                   // ↑ 0.2 → 0.7 : variété (le filet
                                        // anti-doublon depuis 2A-FIX gère les
                                        // dérives occasionnelles de gpt-oss).
    reasoning_effort: 'low',
    reasoning_format: 'parsed',
    messages: [
      { role: 'system' as const, content: ctx.bibleTxt },
      { role: 'system' as const, content: contextMsg },
      { role: 'system' as const, content: formatMsg },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ],
  }

  const t0 = performance.now()
  const { response: r, attempts } = await fetchGroqBudgeted(payload, apiKey)
  const groqMs = Math.round(performance.now() - t0)

  const data = await r.json().catch(() => null)
  if (!r.ok || !data || data.error) {
    return {
      ok: false,
      response: buildProviderErrorResponse({
        route: '/api/jarvis/brain', model: GROQ_TEXT_MODEL,
        status: r.status, detail: data?.error,
      }),
    }
  }

  const rawReply: string = data.choices?.[0]?.message?.content || ''
  const reply = clampResponse(rawReply, maxChars)
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

  return { ok: true, reply, usage, groqMs, attempts, casquette: ctx.casquette.casquette }
}
