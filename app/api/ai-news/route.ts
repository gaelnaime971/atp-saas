import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import { requireUser, checkAndCount, recordUsage, buildQuotaResponse, buildProviderErrorResponse } from '@/lib/ai/quota'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth

    const { prompt } = await request.json()
    if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/ai-news', detail: 'GROQ_API_KEY missing' })

    const quota = await checkAndCount(user.id, 'news', isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/ai-news', model: GROQ_TEXT_MODEL, status: r.status, detail: data.error,
      })
    }

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      after(async () => {
        await recordUsage(user.id, 'news', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: GROQ_TEXT_MODEL,
        })
      })
    }

    const text = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ text })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/ai-news', model: GROQ_TEXT_MODEL, detail: err })
  }
}
