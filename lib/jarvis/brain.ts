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

export interface JarvisContext {
  userId: string
  email: string
  isAdmin: boolean
  routine: RoutineRow | null
  statsCompact: Record<string, unknown>
  casquette: ReturnType<typeof getCasquette>
  bibleTxt: string
  now: Date
  cacheHits: string[]
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

interface StatsCacheEntry   { at: number; data: Record<string, unknown> }
interface RoutineCacheEntry { at: number; data: RoutineRow | null }
interface ProfileCacheEntry { at: number; isAdmin: boolean }

const statsCache   = new Map<string, StatsCacheEntry>()
const routineCache = new Map<string, RoutineCacheEntry>()
const profileCache = new Map<string, ProfileCacheEntry>()

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

  const sHit = freshStats(userId, nowMs)
  const rHit = freshRoutine(userId, nowMs)
  const pHit = freshProfile(userId, nowMs)
  if (sHit) cacheHits.push('stats')
  if (rHit) cacheHits.push('routine')
  if (pHit) cacheHits.push('profile')

  // Bail-out rapide : tout en cache → zéro appel Supabase.
  if (sHit && rHit && pHit) {
    const bibleTxt = await loadBible()
    return {
      userId, email, isAdmin: pHit.isAdmin,
      routine: rHit.data, statsCompact: sHit.data,
      casquette: getCasquette(now),
      bibleTxt, now, cacheHits,
    }
  }

  // Au moins un miss → 1 round-trip Supabase. Les queries manquantes
  // partent en parallèle ; les hits renvoient une Promise résolue
  // immédiatement pour ne pas trouer le Promise.all.
  const [bibleTxt, supabase] = await Promise.all([loadBible(), createSsrClient()])

  const noResult = Promise.resolve({ data: null } as const)
  const [profileRes, routineRes, sessionsRes, backtestsRes] = await Promise.all([
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

  if (!sHit) statsCache.set(userId, { at: nowMs, data: statsCompact })
  if (!rHit) routineCache.set(userId, { at: nowMs, data: routine })
  if (!pHit) profileCache.set(userId, { at: nowMs, isAdmin })

  return {
    userId, email, isAdmin,
    routine, statsCompact,
    casquette: getCasquette(now),
    bibleTxt, now, cacheHits,
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

  return `CONTEXTE INSTANT
Heure actuelle (Paris) : ${nowParis}
Compte : ${ctx.email}
${casquetteBlock}

${routineBlock}

Statistiques du trader (30 derniers jours) :
${JSON.stringify(ctx.statsCompact, null, 2)}

Règle absolue : si une info ci-dessus manque, dis-le, n'invente rien.`
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
