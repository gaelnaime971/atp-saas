import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import {
  prepareContext, runBrain, detectDetailRequested,
  snapshotSession, buildSessionDirective,
  type ChatMessage, type SessionEventRow,
} from '@/lib/jarvis/brain'
import { detectTradeEvent } from '@/lib/jarvis/event-detection'
import { insertTrade, insertRuleTriggered } from '@/lib/jarvis/session-write'

export const runtime = 'nodejs'

interface RequestBody { messages: ChatMessage[] }

export async function POST(request: Request) {
  const t_start = performance.now()
  const timings: Record<string, number> = {}
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth
    timings.auth = Math.round(performance.now() - t_start)

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    const t_ctxStart = performance.now()
    const ctx = await prepareContext(userId, email)
    timings.context = Math.round(performance.now() - t_ctxStart)

    const lastUser = [...body.messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const detailRequested = detectDetailRequested(lastUser)

    // ─── Détection event déterministe AVANT cerveau ───
    const detection = detectTradeEvent(lastUser)
    let notedEvent: SessionEventRow | null = null
    if (detection.kind === 'trade') {
      try {
        notedEvent = await insertTrade(userId, detection.trade)
        ctx.events.push(notedEvent)
      } catch (err) {
        console.error('[jarvis-chat] insertTrade failed', err)
      }
    }
    const snapshot = snapshotSession(ctx.events, ctx.rules)
    const riskAlreadyAsked = body.messages.some(m =>
      m.role === 'assistant' && /risque\s+par\s+trade/i.test(m.content))
    const tradeUsdOnly = detection.kind === 'trade'
      && detection.trade.result_r == null
      && detection.trade.result_usd != null
    const directive = buildSessionDirective(
      detection.kind, snapshot, ctx.rules, tradeUsdOnly, riskAlreadyAsked,
    )
    if (directive.triggered.length > 0) {
      after(async () => {
        for (const t of directive.triggered) {
          try { await insertRuleTriggered(userId, t.key, t.config) } catch (err) {
            console.error('[jarvis-chat] insertRuleTriggered failed', { key: t.key, err })
          }
        }
      })
    }

    // Quota en parallèle de l'appel Groq cerveau. Si refus, on jette
    // le résultat Groq et on retourne 429.
    const t_runStart = performance.now()
    const quotaPromise = checkAndCount(userId, 'jarvis', ctx.isAdmin)
    const brainPromise = runBrain(ctx, body.messages, {
      format: 'text',
      casquette: ctx.casquette.casquette,
      detailRequested,
      extraSystem: directive.systemAddendum || undefined,
    })
    const [quota, brainOutcome] = await Promise.all([quotaPromise, brainPromise])

    if (!quota.allowed) return buildQuotaResponse(quota)
    if (!brainOutcome.ok) return brainOutcome.response

    timings.quota = Math.round((performance.now() - t_runStart) - brainOutcome.groqMs)
    if (timings.quota < 0) timings.quota = 0
    timings.groq = brainOutcome.groqMs

    if (brainOutcome.usage) {
      const usage = brainOutcome.usage
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
      reply: brainOutcome.reply,
      casquette: brainOutcome.casquette,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
      timings,
      cacheHits: ctx.cacheHits,
      session: {
        state: {
          tradesCount: snapshot.state.tradesCount,
          rSum: snapshot.state.rSum,
          usdSum: snapshot.state.usdSum,
        },
        notedEvent,
        triggered: directive.triggered.map(t => ({ key: t.key, message: t.message, config: t.config })),
        detection: detection.kind,
      },
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
