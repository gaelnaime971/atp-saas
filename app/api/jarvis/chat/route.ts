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
import { requireJarvisAccess } from '@/lib/jarvis/access'
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

/** Cache module-level — la bible ne change jamais entre requêtes.
 *  Première requête (cold start) : readFile ~5-20ms.
 *  Suivantes : 0ms. Placée en 1er dans messages → bénéficie du
 *  cache de prompt de Groq. */
let bibleCache: string | null = null
async function loadBible(): Promise<string> {
  if (bibleCache !== null) return bibleCache
  const p = path.join(process.cwd(), 'lib', 'jarvis', 'bible.md')
  bibleCache = await readFile(p, 'utf-8')
  return bibleCache
}

/**
 * Nettoie la réponse Groq :
 *  - tags Harmony (<|channel|>, <|message|>, <|end|>…) au cas où ils
 *    fuitent dans content malgré reasoning_format: 'parsed' ;
 *  - blocs <think>...</think> ;
 *  - fences ```...``` ;
 *  - puces en début de ligne ;
 *  - détection de doublon "point/majuscule sans espace" : si on
 *    trouve ".P" (point + majuscule sans espace séparateur), c'est
 *    typiquement 2 réponses collées par gpt-oss — on garde la
 *    première phrase.
 * Puis clamp à 300 car. en coupant à la fin d'une phrase si possible.
 */
function clampResponse(raw: string): string {
  const MAX = 300
  let s = raw
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim()

  // Doublon : point + majuscule accolée (sans espace) → 2 réponses
  // concaténées. Patch côté serveur en gardant la 1re phrase complète.
  const dupMatch = s.match(/^([\s\S]{20,}?[.!?…])([A-ZÉÈÀÇÎÔÛ])/)
  if (dupMatch) s = dupMatch[1]
  s = s.trim()

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

/**
 * Fetch Groq avec timeout ferme + 1 retry rapide sur 429/5xx seulement.
 *  - 7 000 ms max par essai (AbortSignal.timeout)
 *  - 300 ms de pause avant le retry (laisse Groq souffler sans
 *    bloquer le trader, qui attend sa réponse)
 *  - Jamais plus de 2 essais au total → latence worst-case ~14,3 s
 *    au lieu d'attendre 11+ s sur un seul call bloqué par rate limit.
 * Explication du 11s observé : Groq laisse la connexion ouverte en
 * cas de rate limit en attendant le reset de la fenêtre tokens/minute,
 * on n'avait ni timeout ni retry → on subissait toute l'attente.
 */
async function fetchGroqWithRetry(payload: unknown, apiKey: string): Promise<Response> {
  const makeAttempt = () => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(7000),
  })

  let r: Response
  try {
    r = await makeAttempt()
  } catch (err) {
    // Timeout ou réseau — 1 retry rapide
    await new Promise(res => setTimeout(res, 300))
    return makeAttempt().catch(() => {
      throw err
    })
  }
  if (r.ok) return r
  if (r.status === 429 || r.status >= 500) {
    await new Promise(res => setTimeout(res, 300))
    try {
      return await makeAttempt()
    } catch { return r }
  }
  return r
}

export async function POST(request: Request) {
  const t_start = performance.now()
  const timings: Record<string, number> = {}
  try {
    const auth = await requireJarvisAccess()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth
    timings.auth = Math.round(performance.now() - t_start)

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/jarvis/chat', detail: 'GROQ_API_KEY missing' })

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    // ─── Parallélisation : quota + routine + stats data en un seul Promise.all ───
    // Gain : 4 round-trips Supabase (~100-300ms chacun) → 1 seul temps
    // de la plus lente. ~300-900ms économisés en moyenne.
    const supabase = await createSsrClient()
    const now = new Date()
    const todayISO = now.toISOString().slice(0, 10)
    const from = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10)

    const t_dataStart = performance.now()
    const [quotaResult, routineRes, sessionsRes, backtestsRes, bibleTxt] = await Promise.all([
      checkAndCount(user.id, 'jarvis', isAdmin),
      supabase.from('pre_market_routines')
        .select('confidence,mental_note,bias,news,support,resistance,checks')
        .eq('user_id', user.id)
        .eq('routine_date', todayISO)
        .maybeSingle(),
      supabase.from('trading_sessions')
        .select('session_date,pnl,result,trades_count,instrument,setup,notes')
        .eq('trader_id', user.id)
        .gte('session_date', from)
        .lte('session_date', todayISO)
        .order('session_date', { ascending: false }),
      supabase.from('backtests')
        .select('date,instrument,direction,setup_types,signals,has_confluence,r_result,result,notes')
        .eq('trader_id', user.id)
        .gte('date', from)
        .lte('date', todayISO),
      loadBible(),
    ])
    timings.context = Math.round(performance.now() - t_dataStart)

    // Quota refusé → 429 avec compteur, pas d'appel Groq
    if (!quotaResult.allowed) return buildQuotaResponse(quotaResult)

    // ─── Build context ───
    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]
    const opts: MetricsOptions = {
      from, to: todayISO, periodLabel: '30 derniers jours',
      instrument: null, accountId: null, direction: null,
    }
    const stats = computeStats(sessions, backtests, opts)
    const statsCompact = compactContext(stats)

    const routine = routineRes.data as {
      confidence: number | null; mental_note: string | null; bias: string | null;
      news: string | null; support: string | null; resistance: string | null;
      checks: Record<string, boolean> | null;
    } | null

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
${casquetteBlock}

${routineBlock}

Statistiques du trader (30 derniers jours — ${stats.period_from} → ${stats.period_to}) :
${JSON.stringify(statsCompact, null, 2)}

Règle absolue : si une info ci-dessus manque ou dit "vide/non renseigné/aucune", tu le signales au trader, tu n'inventes rien.`

    // Bible en 1re position → cache de prompt Groq honoré sur les
    // requêtes successives de la même conversation.
    const trimmed = body.messages.slice(-10)
    const messages = [
      { role: 'system' as const, content: bibleTxt },
      { role: 'system' as const, content: contextMsg },
      { role: 'system' as const, content: FORMAT },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ]

    // ─── Appel Groq avec timeout + 1 retry rapide ───
    const t_groqStart = performance.now()
    const r = await fetchGroqWithRetry({
      model: GROQ_TEXT_MODEL,
      max_tokens: 300,
      temperature: 0.2,
      reasoning_effort: 'low',
      // 'parsed' met le CoT dans message.reasoning (champ séparé),
      // content ne contient QUE la réponse finale. 'hidden' peut
      // fuiter l'analysis dans content sur gpt-oss et créer des
      // doublons type "fin analysis.début final" (sans espace).
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
        await recordUsage(user.id, 'jarvis', {
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
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
