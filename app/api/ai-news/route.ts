import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import { requireUser, checkAndCount, recordUsage, buildQuotaResponse } from '@/lib/ai/quota'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth

    const { prompt } = await request.json()
    if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

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
    if (data.error) {
      console.error('Groq API error:', data.error)
      return NextResponse.json({ text: '', error: data.error })
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
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
