import { NextResponse } from 'next/server'

interface Body {
  symbol: string
  technical: unknown
  news: unknown
  macro: unknown
  sentiment: unknown
  correlations: unknown
}

const SYSTEM = `Tu es un coach trading senior SMC/ICT spécialisé futures US (ES, NQ, YM, GC, CL, etc.).
On te donne 5 analyses indépendantes (technique multi-TF, news macro, contexte macro,
sentiment, corrélations/SMT). Tu dois synthétiser tout ça en un VERDICT actionnable et un PLAN DE TRADE concret.

Tu réponds STRICTEMENT en JSON valide, rien d'autre. Tu n'inventes pas de prix : si la
technique ne donne pas une zone, tu mets null.

Règles:
- Verdict ACHETER seulement si bias HTF aligné bullish + entrée LTF identifiée + pas de news high-impact imminente + sentiment pas en extrême greed
- Verdict VENDRE même logique inverse
- Verdict ATTENDRE si setup pas clair / signaux mixtes
- Verdict SKIP si news majeure dans <60min OU signaux fortement contradictoires
- Conviction 0-100, sois honnête : 50 = neutre, 75+ = setup haute qualité
- Risques : énumère 2-4 risques concrets basés sur les data (FOMC, extrême sentiment, divergence corrélés, etc.)`

function buildPrompt(body: Body): string {
  return `SYMBOL: ${body.symbol}

═══ ANALYSE TECHNIQUE ═══
${JSON.stringify(body.technical, null, 2)}

═══ NEWS & CATALYSEURS ═══
${JSON.stringify(body.news, null, 2)}

═══ MACRO ═══
${JSON.stringify(body.macro, null, 2)}

═══ SENTIMENT ═══
${JSON.stringify(body.sentiment, null, 2)}

═══ CORRÉLATIONS / SMT ═══
${JSON.stringify(body.correlations, null, 2)}

Réponds STRICTEMENT en JSON :
{
  "verdict": "ACHETER|VENDRE|ATTENDRE|SKIP",
  "conviction": 0-100,
  "summary": "2-3 phrases qui synthétisent l'état multi-piliers",
  "trade_plan": {
    "direction": "LONG|SHORT|null",
    "entry_zone": { "low": 5820, "high": 5825, "reasoning": "OB H4 mid + FVG M15 confluence" },
    "sl": 5808,
    "tps": [
      { "price": 5860, "rr": 2.5, "reasoning": "external liquidity above H4 swing" },
      { "price": 5895, "rr": 4.8, "reasoning": "D1 previous high" }
    ],
    "horizon": "intraday|24-48h|swing|null",
    "probability_pct": 65
  },
  "risques": ["risque 1 concret", "risque 2", "risque 3"],
  "catalyseurs_a_surveiller": ["catalyseur 1", "catalyseur 2"],
  "pre_entry_checklist": [
    "Bias multi-TF aligné",
    "Pas de news high-impact dans 30 min",
    "Risque par trade respecté (<X% capital)",
    "R:R minimum 2:1",
    "Setup confluence respectée"
  ],
  "key_levels_summary": {
    "support_majeur": "5808",
    "resistance_majeure": "5860",
    "invalidation": "5805"
  }
}

Si le verdict est ATTENDRE ou SKIP, trade_plan peut avoir direction null et entry_zone null.
Adapte les niveaux aux vraies données de la technique. Reste factuel.`
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY non configurée' }, { status: 500 })

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(body) },
        ],
      }),
    })

    const data = await r.json()
    if (data.error) {
      console.error('Synthesis error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'Erreur IA' }, { status: 500 })
    }

    const raw = data.choices?.[0]?.message?.content || '{}'
    let synthesis: unknown
    try { synthesis = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      synthesis = m ? JSON.parse(m[0]) : null
    }
    if (!synthesis) return NextResponse.json({ error: 'Réponse IA invalide', raw }, { status: 500 })

    return NextResponse.json({ synthesis })
  } catch (err) {
    console.error('Synthesis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
