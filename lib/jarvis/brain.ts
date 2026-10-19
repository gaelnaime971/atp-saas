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

const USER_CACHE_TTL_MS = 5 * 60 * 1000
interface UserCacheEntry {
  at: number
  routine: RoutineRow | null
  statsCompact: Record<string, unknown>
  isAdmin: boolean
}
const userCache = new Map<string, UserCacheEntry>()

/**
 * Récupère routine + stats + isAdmin pour un user, depuis le cache
 * mémoire si frais (< 5 min), sinon depuis Supabase en Promise.all.
 * Toujours charge la bible (cachée séparément) et calcule la
 * casquette (CPU seul).
 */
export async function prepareContext(userId: string, email: string, now: Date = new Date()): Promise<JarvisContext> {
  const cacheHits: string[] = []
  const todayISO = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10)

  const cached = userCache.get(userId)
  const cacheFresh = cached && (now.getTime() - cached.at) < USER_CACHE_TTL_MS

  let routine: RoutineRow | null
  let statsCompact: Record<string, unknown>
  let isAdmin: boolean
  let bibleTxt: string

  if (cacheFresh) {
    cacheHits.push('routine', 'stats', 'profile')
    bibleTxt = await loadBible()
    routine = cached!.routine
    statsCompact = cached!.statsCompact
    isAdmin = cached!.isAdmin
  } else {
    const supabase = await createSsrClient()
    const [profileRes, routineRes, sessionsRes, backtestsRes, loadedBible] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.from('pre_market_routines')
        .select('confidence,mental_note,bias,news,support,resistance,checks')
        .eq('user_id', userId)
        .eq('routine_date', todayISO)
        .maybeSingle(),
      supabase.from('trading_sessions')
        .select('session_date,pnl,result,trades_count,instrument,setup,notes')
        .eq('trader_id', userId)
        .gte('session_date', from)
        .lte('session_date', todayISO)
        .order('session_date', { ascending: false }),
      supabase.from('backtests')
        .select('date,instrument,direction,setup_types,signals,has_confluence,r_result,result,notes')
        .eq('trader_id', userId)
        .gte('date', from)
        .lte('date', todayISO),
      loadBible(),
    ])

    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]
    const opts: MetricsOptions = {
      from, to: todayISO, periodLabel: '30 derniers jours',
      instrument: null, accountId: null, direction: null,
    }
    const stats = computeStats(sessions, backtests, opts)
    statsCompact = compactContext(stats)
    routine = routineRes.data as RoutineRow | null
    isAdmin = (profileRes.data as { role?: string } | null)?.role === 'admin'
    bibleTxt = loadedBible

    userCache.set(userId, { at: now.getTime(), routine, statsCompact, isAdmin })
  }

  return {
    userId, email, isAdmin,
    routine, statsCompact,
    casquette: getCasquette(now),
    bibleTxt, now, cacheHits,
  }
}

// ─── Prompts FORMAT ─────────────────────────────────────────────────
export const FORMAT_TEXT = `FORMAT DE SORTIE (TEXTE)
- Réponds en français, tutoiement, calme et posé.
- 2 à 3 phrases MAX, 300 caractères MAX.
- Les montants s'écrivent en $ (dollars), jamais en €.
- AUCUN markdown, AUCUNE liste à puces, AUCUN titre. Texte brut.
- Si une donnée du contexte manque, dis-le franchement, n'invente jamais.
- Ne donne jamais de signal : pas de "prends le trade", pas de niveau d'entrée/TP/SL.
- Écris UNE SEULE réponse finale. Ne la révise pas, ne la reformule pas.`

export const FORMAT_VOICE = `FORMAT DE SORTIE (VOIX)
Ta réponse sera lue à voix haute. Écris exactement comme on parle.

RÈGLES ABSOLUES :
- 2 phrases courtes, 200 caractères MAX.
- AUCUN symbole : jamais de ≥, +, /, $, %, &, ×. Écris en toutes lettres :
  "au moins 2", "0,2 à 0,4 pour cent", "plus 2 R", "200 dollars",
  "sur le dollar/yen" devient "sur le dollar yen".
- Nombres : écrits comme on les dit ("deux R", "deux pour cent"
  si ça sonne mieux). Pour les ratios courants, "R" seul se dit "R".
- AUCUN markdown, aucune liste, aucun titre.
- Pas d'abréviations lues bizarrement : écris "Order Block" plutôt
  que "OB" quand c'est la 1re mention.
- Français, tutoiement, calme et posé.
- Si donnée absente, dis-le une seule fois dans la conversation.
- Jamais de signal : pas de "prends le trade", pas de niveau.
- UNE SEULE réponse finale.`

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
async function fetchGroqBudgeted(payload: unknown, apiKey: string): Promise<Response> {
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
    return makeAttempt().catch(() => { throw err })
  }
  if (r1.ok) return r1
  if (r1.status !== 429 && r1.status < 500) return r1
  await new Promise(res => setTimeout(res, PAUSE))
  try { return await makeAttempt() } catch { return r1 }
}

// ─── runBrain : contexte → Groq → clamp ─────────────────────────────
export interface BrainRunConfig {
  format: 'text' | 'voice'
  maxChars: number
}

export interface BrainOk {
  ok: true
  reply: string
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  groqMs: number
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
  const formatMsg = cfg.format === 'voice' ? FORMAT_VOICE : FORMAT_TEXT
  const trimmed = messages.slice(-10)

  const payload = {
    model: GROQ_TEXT_MODEL,
    max_tokens: cfg.format === 'voice' ? 200 : 300,
    temperature: 0.2,
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
  const r = await fetchGroqBudgeted(payload, apiKey)
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
  const reply = clampResponse(rawReply, cfg.maxChars)
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined

  return { ok: true, reply, usage, groqMs, casquette: ctx.casquette.casquette }
}
