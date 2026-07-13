import { NextResponse } from 'next/server'

interface ChartInput {
  slot: 'HTF' | 'MTF' | 'LTF' | 'Exec'
  timeframe: string // 'D1', 'H4', 'M15', etc.
  bias?: 'bullish' | 'bearish' | 'range' | null
  image: string // data URL (base64)
  annotations?: {
    ob?: boolean
    fvg?: boolean
    ifvg?: boolean
    bos?: boolean
    choch?: boolean
    fiboOTE?: boolean
    liquiditySweep?: boolean
    smtDivergence?: boolean
    confluence?: boolean
    keyLevels?: string
  }
}

interface Body {
  symbol: string
  charts: ChartInput[]
}

const SYSTEM = `Tu es un analyste SMC/ICT expert sur les futures US (ES, NQ, YM, GC, CL, etc.).
Tu analyses des charts multi-timeframe en lisant les images uploadées par le trader.
Tu utilises EXCLUSIVEMENT les concepts SMC : Order Blocks (OB), Fair Value Gaps (FVG),
Inverse FVG (IFVG), Break of Structure (BOS), Change of Character (CHoCH),
Fibonacci OTE 62-78.6%, liquidité externe (equal highs/lows, swing highs/lows),
SMT divergence, premium/discount.

Tu réponds STRICTEMENT en JSON valide, sans markdown autour. N'invente pas de niveaux
de prix précis si tu ne les lis pas sur le chart — donne des ranges approximatifs.`

function buildPrompt(body: Body): string {
  const tfList = body.charts.map(c => `${c.slot} (${c.timeframe})`).join(', ')
  const annotationsText = body.charts.map(c => {
    const ann = c.annotations || {}
    const flags: string[] = []
    if (ann.ob) flags.push('OB')
    if (ann.fvg) flags.push('FVG')
    if (ann.ifvg) flags.push('IFVG')
    if (ann.bos) flags.push('BOS')
    if (ann.choch) flags.push('CHoCH')
    if (ann.fiboOTE) flags.push('Fibo OTE')
    if (ann.liquiditySweep) flags.push('Liquidité sweepée')
    if (ann.smtDivergence) flags.push('SMT divergence')
    if (ann.confluence) flags.push('Confluence')
    return `${c.slot} (${c.timeframe}): bias=${c.bias || 'NA'} | trader-marked: ${flags.join(', ') || 'aucun'} | levels: ${ann.keyLevels || 'NA'}`
  }).join('\n')

  return `SYMBOL: ${body.symbol}
TFs uploadés: ${tfList}

Annotations du trader par chart :
${annotationsText}

Analyse chaque chart selon SMC/ICT et retourne STRICTEMENT ce JSON :
{
  "bias_per_tf": { "HTF": "BULLISH|BEARISH|RANGE", "MTF": "...", "LTF": "...", "Exec": "..." },
  "zones": [
    { "type": "OB|FVG|IFVG|LIQ|FIBO", "tf": "H4", "price": "5820-5825", "status": "NON_MITIGÉ|MITIGÉ|RESPECTÉ", "direction": "bullish|bearish", "confluence": ["OB","FVG"], "notes": "1 phrase courte" }
  ],
  "liquidity": {
    "targets_long": [{ "price": "5860", "reasoning": "external liquidity above swing high H4" }],
    "targets_short": [{ "price": "5810", "reasoning": "..." }],
    "risk_levels": [{ "price": "5808", "reasoning": "below previous low — stop-hunt zone" }]
  },
  "confluence_multi_tf": {
    "aligned": true,
    "reasoning": "HTF bullish, MTF respects OB, LTF range — entrée attendue après cassure haussière LTF"
  },
  "key_observations": ["phrase 1 courte et factuelle", "phrase 2", "phrase 3"],
  "validation_annotations": "1 phrase qui valide ou nuance les éléments marqués par le trader",
  "best_entry_zone": { "tf": "M15", "price": "5820-5825", "direction": "long", "reasoning": "OB H4 + FVG M15 confluence" }
}

Ne mets QUE les TFs présents (ne mets pas Exec si pas uploadé). Si une donnée manque, mets "" ou null.`
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol || !Array.isArray(body.charts) || body.charts.length === 0) {
      return NextResponse.json({ error: 'symbol et charts requis' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY non configurée' }, { status: 500 })

    // Build multi-modal content: text + each chart image
    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: buildPrompt(body) }]
    for (const c of body.charts) {
      userContent.push({ type: 'image_url', image_url: { url: c.image } })
    }

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 3500,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    })

    const data = await r.json()
    if (data.error) {
      console.error('Technical vision error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'Erreur IA vision' }, { status: 500 })
    }

    const raw = data.choices?.[0]?.message?.content || '{}'
    let result: unknown
    try { result = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : null
    }
    if (!result) return NextResponse.json({ error: 'Réponse IA invalide', raw }, { status: 500 })

    return NextResponse.json({ technical: result })
  } catch (err) {
    console.error('Technical analysis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
