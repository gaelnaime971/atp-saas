import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { image } = await request.json()
    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1500,
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
    if (data.error) {
      console.error('Groq Vision error:', data.error)
      return NextResponse.json({ text: '', error: data.error })
    }
    const text = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ text })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
