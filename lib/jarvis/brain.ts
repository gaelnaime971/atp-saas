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
import { getCurrentJokerContext, JOKER_STEP_LABEL, type JokerContext } from './joker'

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

/**
 * Longueur maximale selon mode (voix ≠ texte) + casquette + demande
 * explicite d'élaboration.
 *
 * voix :
 *   TRADER (session) : 250 car
 *   hors session     : 900 car
 *   "développe"      : max du mode = 900
 * texte (mode Écrire) :
 *   TRADER (session) : 400 car
 *   hors session     : 2 000 car
 *   "développe"      : max du mode = 2 000
 */
export function computeMaxChars(mode: FormatMode, casquette: Casquette, detailRequested: boolean): number {
  if (mode === 'voice') {
    if (detailRequested) return 900
    if (casquette === 'TRADER') return 250
    return 900
  }
  if (detailRequested) return 2000
  if (casquette === 'TRADER') return 400
  return 2000
}

export function detectDetailRequested(text: string): boolean {
  // Détecte une demande explicite d'élaboration dans le dernier
  // message du trader. "développe", "explique", "détaille", avec ou
  // sans "moi", "nous", "ça".
  return /\b(d[ée]veloppe|d[ée]taille|explique)\b/i.test(text)
}

function phraseAllowance(mode: FormatMode, casquette: Casquette, detailRequested: boolean): string {
  if (detailRequested) {
    return mode === 'voice'
      ? '4 à 8 phrases, UNE réponse longue cette fois'
      : 'plusieurs paragraphes autorisés, UNE réponse développée cette fois'
  }
  if (casquette === 'TRADER') {
    return mode === 'voice'
      ? '1 à 3 phrases COURTES — le trader regarde son graphique'
      : '2 à 5 phrases courtes'
  }
  return mode === 'voice' ? 'jusqu\'à 6 phrases' : 'plusieurs phrases, paragraphes OK si besoin'
}

export function buildFormatPrompt(mode: FormatMode, casquette: Casquette, detailRequested: boolean): string {
  const maxChars = computeMaxChars(mode, casquette, detailRequested)
  const phrases = phraseAllowance(mode, casquette, detailRequested)

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

  // Mode Joker — bloc injecté uniquement si actif
  const joker = getCurrentJokerContext(ctx.events, ctx.now)
  const jokerBlock = joker.step === 'inactive'
    ? ''
    : `\nMODE JOKER ACTIF : étape "${JOKER_STEP_LABEL[joker.step]}". C'est le CODE qui pilote cet état ; toi tu rappelles sobrement où on en est, pas de signal. Si l'étape est "ready", l'annonce officielle a déjà été faite dans l'extraSystem, ne la répète pas.\n`

  return `CONTEXTE INSTANT
Heure actuelle (Paris) : ${nowParis}
Compte : ${ctx.email}
${casquetteBlock}

${routineBlock}

${rulesBlock}

${stateBlock}
${jokerBlock}
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

export interface SessionDirective {
  /** Si une règle doit être annoncée, le message officiel à placer en
   *  tête de réponse MOT POUR MOT. null = pas d'annonce. */
  announce: string | null
  /** Instruction additionnelle pour le cerveau (ambigu, trade $ sans
   *  risque, règle déclenchée…). Peut être combinée. */
  systemAddendum: string
  /** Les règles déclenchées qu'on veut renvoyer à l'UI. */
  triggered: TriggeredRule[]
}

/**
 * Construit le system message additionnel à injecter dans runBrain
 * selon le résultat de la détection + de l'évaluation.
 *
 * - "trade"     + 1 règle   → force l'annonce mot pour mot en tête + max 1 phrase
 * - "trade"     + 0 règle   → confirmation discrète ("j'ai noté… ")
 * - "ambiguous"             → demande le résultat en R ou $
 * - "trade" en $ sans risk  → demande UNE FOIS le risque dans la journée
 */
export function buildSessionDirective(
  detectionKind: 'trade' | 'ambiguous' | 'none',
  snapshot: SessionSnapshot,
  rules: TraderRules,
  tradeDeclaredInUsdOnly: boolean,
  riskAlreadyAskedToday: boolean,
): SessionDirective {
  const parts: string[] = []
  const triggered = snapshot.freshTriggers

  if (triggered.length > 0) {
    const announce = triggered.map(t => t.message).join(' ')
    parts.push(
`RÈGLE DÉCLENCHÉE PAR LE CODE — tu DOIS commencer ta réponse par exactement cette phrase, telle quelle, sans la modifier ni la paraphraser :

${announce}

Puis au plus UNE phrase courte (empathique ou de contexte), sans contredire la règle, sans relancer un trade, sans questionner la décision.`)
  }

  if (detectionKind === 'trade' && triggered.length === 0) {
    parts.push('Le trader vient de déclarer un trade (déjà enregistré par le code). Confirme brièvement ce que tu as noté en 1 phrase, en langage naturel.')
  }

  if (detectionKind === 'ambiguous') {
    parts.push('Le trader semble avoir parlé d\'un trade mais SANS en donner le résultat. Demande-lui UNE FOIS, en une phrase courte, le résultat précis en R ou en $.')
  }

  if (detectionKind === 'trade' && tradeDeclaredInUsdOnly && rules.risk_per_trade_usd <= 0 && !riskAlreadyAskedToday) {
    parts.push('Le trader a déclaré un trade en $ sans que son risque par trade soit renseigné. Demande-lui UNE SEULE FOIS aujourd\'hui son risque par trade en $ (une phrase, après ta confirmation du trade).')
  }

  return {
    announce: triggered.length > 0 ? triggered.map(t => t.message).join(' ') : null,
    systemAddendum: parts.join('\n\n'),
    triggered,
  }
}
/**
 * Calcule l'état + les règles à annoncer MAINTENANT (celles qui
 * ne l'ont pas déjà été). Entrée = events bruts du jour.
 *
 * ⚠ trade_after_stop N'EST ÉMISE que si un trade vient d'être
 * déclaré DANS CE message (option.tradeJustAdded=true). Sans ce
 * flag, les questions hors trading (ex: "Explique-moi la Fed")
 * ne doivent déclencher aucune règle, même si la session est
 * déjà stoppée.
 */
export function snapshotSession(
  events: SessionEventRow[],
  rules: TraderRules,
  options?: { tradeJustAdded?: boolean },
): SessionSnapshot {
  const trades = eventsToTrades(events)
  const announced = eventsToAnnounced(events)
  const state = computeSessionState(trades, rules)
  // priorStop → trade_after_stop seulement si un trade vient d'être posé
  const priorStop = (options?.tradeJustAdded ?? false) && hasPriorStopAnnounced(announced)
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

// ─── Fetch cerveau budgeté (6s max) — OpenRouter → fallback Groq ────
//
// 3F-ter : le cerveau passe sur OpenRouter en 1er (API compatible
// OpenAI, modèle choisi par JARVIS_BRAIN_MODEL, défaut
// anthropic/claude-sonnet-4.6). Si l'appel échoue (clé, crédits, 5xx,
// timeout), on retombe sur Groq gpt-oss-120b (comportement d'avant).
// Transcription (Whisper) et voix (ElevenLabs) : inchangées.
//
// Budget total ≤ 6 s = 2800 ms OpenRouter + 300 ms pause + 2800 ms
// Groq. Si OpenRouter répond rapidement, Groq n'est jamais appelé.

const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.6'

export function getBrainModel(): string {
  const v = (process.env.JARVIS_BRAIN_MODEL || '').trim()
  return v || DEFAULT_OPENROUTER_MODEL
}

interface FetchBudgetedResult {
  response: Response
  attempts: number
  provider: 'openrouter' | 'groq'
  model: string
  usedFallback: boolean
  openrouterError?: { status: number; detail: unknown }
}

async function tryOpenRouter(
  basePayload: Record<string, unknown>,
  casquette: Casquette,
): Promise<Response | null> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  const model = getBrainModel()
  // Reasoning adaptatif : court en TRADER (session active), plus poussé
  // hors session. Format OpenAI-compatible — OpenRouter ignore
  // silencieusement sur les modèles qui ne supportent pas.
  const reasoningEffort = casquette === 'TRADER' ? 'low' : 'medium'

  // Retire reasoning_effort/reasoning_format spécifiques Groq, pousse
  // les variantes OpenRouter.
  const payload = {
    ...basePayload,
    model,
    reasoning: { effort: reasoningEffort },
  }
  delete (payload as Record<string, unknown>).reasoning_effort
  delete (payload as Record<string, unknown>).reasoning_format

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://atp.gaelnaime.com',
      'X-Title': 'ATP Jarvis',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2800),
  })
}

async function tryGroq(basePayload: Record<string, unknown>): Promise<Response | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  const payload = {
    ...basePayload,
    model: GROQ_TEXT_MODEL,
    reasoning_effort: 'low',
    reasoning_format: 'parsed',
  }
  delete (payload as Record<string, unknown>).reasoning
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2800),
  })
}

async function fetchBrainBudgeted(
  basePayload: Record<string, unknown>,
  casquette: Casquette,
): Promise<FetchBudgetedResult> {
  const PAUSE = 300

  // 1) OpenRouter en 1er
  let orError: { status: number; detail: unknown } | undefined
  try {
    const r = await tryOpenRouter(basePayload, casquette)
    if (r && r.ok) {
      return { response: r, attempts: 1, provider: 'openrouter', model: getBrainModel(), usedFallback: false }
    }
    if (r && !r.ok) {
      // Clone pour pouvoir lire le body et logger même après le fallback
      let detail: unknown = null
      try {
        detail = await r.clone().json()
      } catch {
        try { detail = await r.clone().text() } catch { /* ignore */ }
      }
      orError = { status: r.status, detail }
      console.error('[jarvis-brain] OpenRouter error, fallback to Groq', { status: r.status, detail })
    }
  } catch (err) {
    orError = { status: 0, detail: err instanceof Error ? err.message : 'network/timeout' }
    console.error('[jarvis-brain] OpenRouter exception, fallback to Groq', err)
  }

  // 2) Fallback Groq
  await new Promise(res => setTimeout(res, PAUSE))
  try {
    const r = await tryGroq(basePayload)
    if (r && r.ok) {
      return { response: r, attempts: 2, provider: 'groq', model: GROQ_TEXT_MODEL, usedFallback: true, openrouterError: orError }
    }
    if (r) {
      return { response: r, attempts: 2, provider: 'groq', model: GROQ_TEXT_MODEL, usedFallback: true, openrouterError: orError }
    }
  } catch (err) {
    console.error('[jarvis-brain] Groq fallback exception', err)
    throw err
  }
  throw new Error('[jarvis-brain] both providers unavailable')
}

// ─── runBrain : contexte → Groq → clamp ─────────────────────────────
export interface BrainRunConfig {
  format: 'text' | 'voice'
  /** Casquette active côté serveur — pilote la longueur et le ton. */
  casquette: Casquette
  /** Détecté dans le dernier message du trader. */
  detailRequested: boolean
  /** System message additionnel à injecter juste avant le format
   *  (annonce de règle, demande de clarification, etc. — cf. 3F.4
   *  buildSessionDirective). */
  extraSystem?: string
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
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY)
  const hasGroq = Boolean(process.env.GROQ_API_KEY)
  if (!hasOpenRouter && !hasGroq) {
    return { ok: false, response: buildProviderErrorResponse({ route: '/api/jarvis/brain', detail: 'OPENROUTER_API_KEY and GROQ_API_KEY both missing' }) }
  }

  const contextMsg = buildContextMessage(ctx, messages)
  const formatMsg = buildFormatPrompt(cfg.format, cfg.casquette, cfg.detailRequested)
  const maxChars = computeMaxChars(cfg.format, cfg.casquette, cfg.detailRequested)
  const maxTokens = Math.max(150, Math.ceil(maxChars / 2.3) + 50)

  // 3F-ter : budget tokens de l'historique — pas uniquement nb d'échanges.
  // Approximation 1 tok ≈ 2.5 chars FR + marge. 2 500 tokens max pour
  // l'historique → une longue conversation ne fait jamais exploser l'appel.
  const trimmed = trimHistoryByBudget(messages, 2500)

  const brainMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: ctx.bibleTxt },
    { role: 'system', content: contextMsg },
  ]
  if (cfg.extraSystem && cfg.extraSystem.trim()) {
    brainMessages.push({ role: 'system', content: cfg.extraSystem })
  }
  brainMessages.push({ role: 'system', content: formatMsg })
  for (const m of trimmed) brainMessages.push({ role: m.role, content: m.content })

  const basePayload: Record<string, unknown> = {
    max_tokens: maxTokens,
    temperature: 0.7,
    messages: brainMessages,
  }

  const t0 = performance.now()
  let fetched: FetchBudgetedResult
  try {
    fetched = await fetchBrainBudgeted(basePayload, cfg.casquette)
  } catch (err) {
    return {
      ok: false,
      response: buildProviderErrorResponse({ route: '/api/jarvis/brain', detail: err }),
    }
  }
  const groqMs = Math.round(performance.now() - t0)
  const r = fetched.response

  const data = await r.json().catch(() => null)
  if (!r.ok || !data || data.error) {
    // Si on avait aussi une erreur OpenRouter avant le fallback, on
    // enrichit le log pour alerte email (classifyProviderFailure saura
    // déduire kind=invalid_api_key / insufficient_credits via provider).
    return {
      ok: false,
      response: buildProviderErrorResponse({
        route: '/api/jarvis/brain',
        model: fetched.model,
        status: r.status,
        detail: {
          provider: fetched.provider,
          error: data?.error,
          openrouterError: fetched.openrouterError,
        },
      }),
    }
  }

  const rawReply: string = data.choices?.[0]?.message?.content || ''
  const reply = clampResponse(rawReply, maxChars)
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

  return { ok: true, reply, usage, groqMs, attempts: fetched.attempts, casquette: ctx.casquette.casquette }
}

/** Plafonne l'historique à un budget approximé en tokens (FR : 1 tok
 *  ≈ 2.5 chars). Garde les plus récents, retire les plus anciens. */
export function trimHistoryByBudget(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const budget = maxTokens
  let used = 0
  const kept: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const tok = Math.ceil((m.content?.length ?? 0) / 2.5) + 4 // +4 marge rôle/formatage
    if (used + tok > budget) break
    used += tok
    kept.unshift(m)
  }
  // Toujours garder au moins le dernier message user si possible, sinon
  // on envoie quelque chose au cerveau.
  if (kept.length === 0 && messages.length > 0) kept.push(messages[messages.length - 1])
  return kept
}
