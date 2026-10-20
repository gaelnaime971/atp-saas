import { NextResponse, after } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { checkAndCount, recordUsage, buildQuotaResponse, buildProviderErrorResponse } from '@/lib/ai/quota'
import { JARVIS_COMPARE_MODELS } from '@/lib/ai/quota-limits'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import {
  prepareContext, detectDetailRequested, snapshotSession,
  buildContextMessage, buildFormatPrompt, computeMaxChars,
  trimHistoryByBudget, clampResponse,
  type ChatMessage,
} from '@/lib/jarvis/brain'

export const runtime = 'nodejs'

/** Testeur ? Même parsing que /api/jarvis/reset-session. */
function isTester(email: string): boolean {
  const raw = (process.env.JARVIS_TESTERS || '').trim().replace(/^["']+|["']+$/g, '')
  const list = raw.split(',').map(s => s.trim().replace(/^["']+|["']+$/g, '').toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

interface RequestBody { messages: ChatMessage[] }

/**
 * POST /api/jarvis/compare — Mode comparaison testeurs uniquement.
 *
 * Même question envoyée aux 3 modèles (Claude, GPT, Gemini) via
 * OpenRouter en parallèle. Pas de voix, pas d'INSERT d'event
 * session. Un seul appel au quota 'jarvis' (compte comme un échange).
 * Les noms des modèles sont cachés côté UI (A/B/C) jusqu'au clic
 * sur "Révéler".
 */
export async function POST(request: Request) {
  const t0 = performance.now()
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth

    if (!isTester(email)) return new NextResponse(null, { status: 404 })

    const key = process.env.OPENROUTER_API_KEY
    if (!key) return buildProviderErrorResponse({ route: '/api/jarvis/compare', detail: 'OPENROUTER_API_KEY missing' })

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    const ctx = await prepareContext(userId, email)
    const lastUser = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const detailRequested = detectDetailRequested(lastUser)
    const snapshot = snapshotSession(ctx.events, ctx.rules, { tradeJustAdded: false })

    const quota = await checkAndCount(userId, 'jarvis', ctx.isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    // Prompt partagé (format TEXTE, pas de voix en comparaison)
    const contextMsg = buildContextMessage(ctx, body.messages)
    const formatMsg = buildFormatPrompt('text', ctx.casquette.casquette, detailRequested)
    const maxChars = computeMaxChars('text', ctx.casquette.casquette, detailRequested)
    const maxTokens = Math.max(150, Math.ceil(maxChars / 2.3) + 50)
    const trimmed = trimHistoryByBudget(body.messages, 2500)

    const commonMessages = [
      { role: 'system' as const, content: ctx.bibleTxt },
      { role: 'system' as const, content: contextMsg },
      { role: 'system' as const, content: formatMsg },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ]

    const results = await Promise.all(JARVIS_COMPARE_MODELS.map(async (model) => {
      const t_m = performance.now()
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': 'https://atp.gaelnaime.com',
            'X-Title': 'ATP Jarvis Compare',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: 0.7,
            messages: commonMessages,
          }),
          signal: AbortSignal.timeout(10000),
        })
        const data = await r.json().catch(() => null)
        if (!r.ok || !data) {
          return { model, ok: false as const, error: `HTTP ${r.status}`, ms: Math.round(performance.now() - t_m) }
        }
        const raw: string = data.choices?.[0]?.message?.content || ''
        const reply = clampResponse(raw, maxChars)
        const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
        return {
          model, ok: true as const, reply, ms: Math.round(performance.now() - t_m),
          usage,
        }
      } catch (err) {
        return { model, ok: false as const, error: err instanceof Error ? err.message : 'timeout', ms: Math.round(performance.now() - t_m) }
      }
    }))

    // Record usage agrégé sur jarvis (1 appel = 3 modèles)
    after(async () => {
      for (const r of results) {
        if (r.ok && r.usage) {
          try {
            await recordUsage(userId, 'jarvis', {
              tokensIn:  r.usage.prompt_tokens ?? 0,
              tokensOut: r.usage.completion_tokens ?? 0,
              model: r.model,
            })
          } catch (err) { console.error('[jarvis-compare] recordUsage failed', { model: r.model, err }) }
        }
      }
    })

    const totalMs = Math.round(performance.now() - t0)
    return NextResponse.json({
      ok: true,
      snapshot: {
        tradesCount: snapshot.state.tradesCount,
        rSum: snapshot.state.rSum,
      },
      results,
      totalMs,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/compare', detail: err })
  }
}

/** GET → est-ce que l'utilisateur est testeur ? (pour le toggle UI). */
export async function GET() {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  if (!user || !email) return new NextResponse(null, { status: 404 })
  if (!isTester(email)) return new NextResponse(null, { status: 404 })
  return NextResponse.json({ ok: true, tester: true })
}
