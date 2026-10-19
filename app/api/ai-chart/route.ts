import { NextResponse, after } from 'next/server'
import { GROQ_VISION_MODEL } from '@/lib/ai/groq-models'
import { requireUser, checkAndCount, recordUsage, buildQuotaResponse, buildProviderErrorResponse } from '@/lib/ai/quota'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth

    const { image } = await request.json()
    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/ai-chart', detail: 'GROQ_API_KEY missing' })

    const quota = await checkAndCount(user.id, 'chart', isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        // Qwen 3.6 mode thinking — masque le raisonnement côté API
        reasoning_format: 'hidden',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Tu es un analyste Smart Money Concepts (SMC) / ICT expert sur les futures US (YM, NQ, ES). Analyse ce graphique de trading en utilisant EXCLUSIVEMENT les concepts SMC.

Identifie sur le graphique :
- Structure de marché : BOS (Break of Structure) et CHoCH (Change of Character)
- Order Blocks (OB) : zones institutionnelles d'accumulation/distribution, bullish OB et bearish OB
- Fair Value Gaps (FVG) : déséquilibres de prix non comblés, zones de discount/premium
- Liquidity : equal highs/lows, buy-side/sell-side liquidity, liquidity sweeps
- Points of Interest (POI) : zones de confluence OB+FVG, mitigation blocks
- Premium/Discount : zones par rapport au dernier swing (Fibo 50%/61.8%/78.6%)
- Inducement / Manipulation : faux breakouts, stop hunts visibles

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "tendance": "HAUSSIÈRE ou BAISSIÈRE ou RANGE",
  "structure": "description de la structure de marché actuelle (BOS/CHoCH identifiés)",
  "niveaux": [
    {"type": "OB ou FVG ou BOS ou CHoCH ou LIQUIDITY ou POI ou FIBO", "prix": "niveau approximatif", "description": "explication SMC courte"}
  ],
  "confluences": ["liste des zones de confluence OB+FVG, OB+Fibo, etc."],
  "premium_discount": "le prix est-il en zone premium ou discount par rapport au dernier swing",
  "liquidity": "où se trouve la liquidité à cibler (buy-side/sell-side)",
  "biais": "LONG ou SHORT ou NEUTRE",
  "analyse": "plan d'action SMC en 2-3 phrases : où attendre un entry, quel OB/FVG viser, où placer le SL et TP"
}`
              },
              {
                type: 'image_url',
                image_url: { url: image }
              }
            ]
          }
        ],
      }),
    })

    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/ai-chart', model: GROQ_VISION_MODEL, status: r.status, detail: data.error,
      })
    }

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      after(async () => {
        await recordUsage(user.id, 'chart', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: GROQ_VISION_MODEL,
        })
      })
    }

    // Filet anti-thinking Qwen : strip tout bloc <think>...</think> au cas où
    // reasoning_format n'aurait pas été respecté (nouveau modèle, variations).
    const rawText = data.choices?.[0]?.message?.content || ''
    const text = rawText.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim()
    return NextResponse.json({ text })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/ai-chart', model: GROQ_VISION_MODEL, detail: err })
  }
}
