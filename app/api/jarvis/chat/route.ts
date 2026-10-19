import { NextResponse, after } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { computeStats, compactContext, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { getCasquette } from '@/lib/jarvis/casquette'

export const runtime = 'nodejs'

interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface RequestBody { messages: ChatMessage[] }

const FORMAT = `FORMAT DE SORTIE
- Réponds en français, tutoiement, direct, exigeant mais bienveillant.
- 2 à 3 phrases MAX, 300 caractères MAX.
- Les montants s'écrivent en $ (dollars), jamais en €.
- AUCUN markdown, AUCUNE liste à puces, AUCUN titre. Texte brut uniquement — ta réponse sera lue à voix haute.
- Si une donnée du contexte manque, dis-le franchement, n'invente jamais.
- Ne donne jamais de signal : pas de "prends le trade", pas de niveau d'entrée/TP/SL. Celui qui clique assume.
- Écris UNE SEULE réponse finale. Ne la révise pas, ne la reformule pas, ne la répète pas sous une autre forme.`

// ─── Cache bible (ne change jamais entre requêtes) ───
let bibleCache: string | null = null
async function loadBible(): Promise<string> {
  if (bibleCache !== null) return bibleCache
  const p = path.join(process.cwd(), 'lib', 'jarvis', 'bible.md')
  bibleCache = await readFile(p, 'utf-8')
  return bibleCache
}

// ─── Cache 5 min par user : routine + stats + isAdmin ───
//
// Les 3 ne changent pas pendant une conversation :
//   - routine pré-marché du jour : écrite 1x le matin
//   - stats 30 jours : agrégats stables sur quelques minutes
//   - isAdmin : stable à l'échelle d'une session
//
// Clé = user_id. TTL = 5 min. Partagé entre invocations warm d'une
// instance Vercel. Si l'instance se recycle (idle > ~10 min), cache
// perdu — pas grave, 1 miss côté 1re requête.
const CACHE_TTL_MS = 5 * 60 * 1000
interface JarvisCacheEntry {
  at: number
  routine: RoutineRow | null
  statsCompact: Record<string, unknown>
  isAdmin: boolean
}
const userCache = new Map<string, JarvisCacheEntry>()

interface RoutineRow {
  confidence: number | null
  mental_note: string | null
  bias: string | null
  news: string | null
  support: string | null
  resistance: string | null
  checks: Record<string, boolean> | null
}

/**
 * Nettoie la réponse Groq.
 *  - strip tags Harmony/think/fences/bullets
 *  - Doublon : si point/! /? collé à une majuscule, teste si c'est
 *    un VRAI doublon (répétition) ou juste une abréviation (U.S.,
 *    Dr., etc., i.e., P.M., ...).
 *  - Log [jarvis] doublon-coupé quand le filet se déclenche.
 */
function clampResponse(raw: string): string {
  const MAX = 300
  let s = raw
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim()

  // ─── Détection de doublons intelligente ───
  // Cherche TOUS les "point/! /? suivi d'une majuscule sans espace"
  // et teste chaque position comme un split potentiel. On garde la
  // 1re partie seulement si c'est un VRAI doublon (répétition).
  const boundaryRe = /([.!?…])([A-ZÉÈÀÇÎÔÛ])/g
  let m: RegExpExecArray | null
  const splits: number[] = []
  while ((m = boundaryRe.exec(s)) !== null) splits.push(m.index + 1)

  for (const pos of splits) {
    const left = s.slice(0, pos)
    const right = s.slice(pos)
    if (right.length < 40) continue             // trop court pour être un doublon
    if (isAbbreviationBoundary(left)) continue  // U.S., Dr., etc.
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

  if (s.length <= MAX) return s
  const slice = s.slice(0, MAX)
  const lastPunct = Math.max(
    slice.lastIndexOf('.'), slice.lastIndexOf('!'),
    slice.lastIndexOf('?'), slice.lastIndexOf('…'),
  )
  if (lastPunct > 60) return slice.slice(0, lastPunct + 1).trim()
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > 60) return slice.slice(0, lastSpace).trim() + '…'
  return slice.trim() + '…'
}

/** La fin de `left` est-elle une abréviation plutôt qu'une vraie
 *  fin de phrase ? U., U.S., U.S.A., Dr., Mr., Mrs., Ms., St., Jr.,
 *  Prof., etc., cf., ex., i.e., e.g., p.ex., chap., éd., vol. */
function isAbbreviationBoundary(left: string): boolean {
  if (/(?:^|[\s(])(?:[A-Z]\.){1,}$/.test(left)) return true
  if (/\b(?:Dr|Mr|Mrs|Ms|St|Jr|Sr|Prof|M|Mme|Mlle)\.$/.test(left)) return true
  if (/\b(?:etc|cf|ex|p\.ex|i\.e|e\.g|chap|éd|ed|ill|vol|réf|ref)\.$/i.test(left)) return true
  return false
}

/** Similarité Jaccard sur les mots (lettres uniquement, lowercase). */
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

/**
 * Appel Groq avec budget TOTAL ≤ 6 s (retry inclus).
 *   - Essai 1 : AbortSignal.timeout(2800 ms)
 *   - Pause 300 ms sur 429/5xx ou timeout
 *   - Essai 2 : AbortSignal.timeout(2800 ms)
 *   - Total max : 2800 + 300 + 2800 = 5900 ms ≤ 6000 ms.
 * Au-delà, buildProviderErrorResponse (502) → le client voit une
 * erreur propre immédiate.
 */
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

export async function POST(request: Request) {
  const t_start = performance.now()
  const timings: Record<string, number> = {}
  const cacheHits: string[] = []
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth
    timings.auth = Math.round(performance.now() - t_start)

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/jarvis/chat', detail: 'GROQ_API_KEY missing' })

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    const now = new Date()
    const todayISO = now.toISOString().slice(0, 10)
    const from = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10)

    // ─── Cache 5 min par user : routine + stats + isAdmin ───
    const t_dataStart = performance.now()
    const cached = userCache.get(userId)
    const cacheFresh = cached && (now.getTime() - cached.at) < CACHE_TTL_MS

    let routine: RoutineRow | null
    let statsCompact: Record<string, unknown>
    let isAdmin: boolean
    let bibleTxt: string

    if (cacheFresh) {
      // Cache hit : on ne refetch QUE la bible (cheap, elle-même cachée) et on
      // relance checkAndCount en parallèle.
      cacheHits.push('routine', 'stats', 'profile')
      ;[bibleTxt] = await Promise.all([loadBible()])
      routine = cached!.routine
      statsCompact = cached!.statsCompact
      isAdmin = cached!.isAdmin
    } else {
      // Cache miss : Promise.all massif.
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
    timings.context = Math.round(performance.now() - t_dataStart)

    // ─── Quota (toujours en live, jamais caché) ───
    const t_quotaStart = performance.now()
    const quotaResult = await checkAndCount(userId, 'jarvis', isAdmin)
    timings.quota = Math.round(performance.now() - t_quotaStart)

    if (!quotaResult.allowed) return buildQuotaResponse(quotaResult)

    // ─── Build context ───
    const casquette = getCasquette(now)
    const nowParis = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short',
    }).format(now)

    const casquetteBlock = casquette.casquette === 'marché-fermé'
      ? `Casquette : marché fermé (week-end NY). Pas de session aujourd'hui.`
      : `Casquette du moment : ${casquette.casquette}
Open US aujourd'hui : ${casquette.usOpenParisLabel} heure de Paris (= 09:30 America/New_York)
Minutes jusqu'à l'Open : ${casquette.minutesToOpen} (négatif = déjà passé)`

    const routineBlock = routine
      ? `Routine pré-marché remplie aujourd'hui :
- Confiance : ${routine.confidence ?? 'non renseignée'}/10
- Note mentale : ${routine.mental_note || 'vide'}
- Biais : ${routine.bias || 'non renseigné'}
- News : ${routine.news || 'vide'}
- Support : ${routine.support || 'vide'}
- Résistance : ${routine.resistance || 'vide'}
- Checks : ${JSON.stringify(routine.checks ?? {})}`
      : `AUCUNE routine pré-marché remplie aujourd'hui. Si tu dois pousser le trader à préparer sa session, dis-le-lui franchement.`

    const contextMsg = `CONTEXTE INSTANT
Heure actuelle (Paris) : ${nowParis}
Compte : ${email}
${casquetteBlock}

${routineBlock}

Statistiques du trader (30 derniers jours) :
${JSON.stringify(statsCompact, null, 2)}

Règle absolue : si une info ci-dessus manque ou dit "vide/non renseigné/aucune", tu le signales au trader, tu n'inventes rien.`

    const trimmed = body.messages.slice(-10)
    const messages = [
      { role: 'system' as const, content: bibleTxt },
      { role: 'system' as const, content: contextMsg },
      { role: 'system' as const, content: FORMAT },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ]

    // ─── Groq avec budget 6s total ───
    const t_groqStart = performance.now()
    const r = await fetchGroqBudgeted({
      model: GROQ_TEXT_MODEL,
      max_tokens: 300,
      temperature: 0.2,
      reasoning_effort: 'low',
      reasoning_format: 'parsed',
      messages,
    }, apiKey)
    timings.groq = Math.round(performance.now() - t_groqStart)

    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, status: r.status, detail: data.error,
      })
    }

    const rawReply: string = data.choices?.[0]?.message?.content || ''
    const reply = clampResponse(rawReply)

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      after(async () => {
        await recordUsage(userId, 'jarvis', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: GROQ_TEXT_MODEL,
        })
      })
    }

    timings.total = Math.round(performance.now() - t_start)

    return NextResponse.json({
      reply,
      casquette: casquette.casquette,
      callsToday: quotaResult.callsToday,
      callsLimit: quotaResult.callsLimit,
      timings,
      cacheHits,
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
