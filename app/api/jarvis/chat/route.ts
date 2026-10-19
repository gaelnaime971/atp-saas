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
- Ne donne jamais de signal : pas de "prends le trade", pas de niveau d'entrée/TP/SL. Celui qui clique assume.`

/**
 * Coupe proprement un texte à ~300 caractères en terminant à la fin
 * d'une phrase (., !, ?, …) si possible, sinon à la dernière espace,
 * sinon brut. 2A : filet de sécurité si le modèle dépasse.
 */
function clampResponse(raw: string): string {
  const MAX = 300
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim()
  if (stripped.length <= MAX) return stripped
  // 300 premiers chars, puis coupe à la dernière ponctuation forte
  const slice = stripped.slice(0, MAX)
  const lastPunct = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'), slice.lastIndexOf('…'))
  if (lastPunct > 60) return slice.slice(0, lastPunct + 1).trim()
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > 60) return slice.slice(0, lastSpace).trim() + '…'
  return slice.trim() + '…'
}

async function loadBible(): Promise<string> {
  const p = path.join(process.cwd(), 'lib', 'jarvis', 'bible.md')
  return readFile(p, 'utf-8')
}

export async function POST(request: Request) {
  try {
    // ─── 1. Gate POC — 404 pour tout compte hors JARVIS_ALLOWED_EMAILS
    //         ou si JARVIS_ENABLED !== 'true' (même contrôle côté API) ─
    const auth = await requireJarvisAccess()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/jarvis/chat', detail: 'GROQ_API_KEY missing' })

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    // ─── 2. Quota (feature 'jarvis', failMode: 'closed') ───
    const quota = await checkAndCount(user.id, 'jarvis', isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    // ─── 3. Contexte : bible + casquette + routine + stats 30j ───
    const supabase = await createSsrClient()
    const now = new Date()
    const casquette = getCasquette(now)

    const todayISO = now.toISOString().slice(0, 10)
    const from = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10)

    const [bibleTxt, routineRes, sessionsRes, backtestsRes] = await Promise.all([
      loadBible(),
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
    ])

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

    // ─── 4. Messages pour Groq : bible + contexte + format + 10 derniers échanges ───
    const trimmed = body.messages.slice(-10)
    const messages = [
      { role: 'system' as const, content: bibleTxt },
      { role: 'system' as const, content: contextMsg },
      { role: 'system' as const, content: FORMAT },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ]

    // ─── 5. Appel Groq ───
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        max_tokens: 300,
        temperature: 0.4,
        // Reasoning masqué côté serveur ET minimal (gpt-oss-120b).
        reasoning_effort: 'low',
        reasoning_format: 'hidden',
        messages,
      }),
    })
    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, status: r.status, detail: data.error,
      })
    }

    const rawReply: string = data.choices?.[0]?.message?.content || ''
    const reply = clampResponse(rawReply)

    // ─── 6. recordUsage via after() ───
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

    return NextResponse.json({
      reply,
      casquette: casquette.casquette,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
