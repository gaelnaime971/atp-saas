import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { prepareContext, runBrain, type ChatMessage } from '@/lib/jarvis/brain'

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

    // Quota en parallèle de l'appel Groq cerveau — sa réponse est
    // connue avant l'étape coûteuse. Si refus, on jette le résultat
    // Groq et on retourne 429.
    const t_runStart = performance.now()
    const quotaPromise = checkAndCount(userId, 'jarvis', ctx.isAdmin)
    const brainPromise = runBrain(ctx, body.messages, { format: 'text', maxChars: 300 })
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
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/chat', model: GROQ_TEXT_MODEL, detail: err })
  }
}
