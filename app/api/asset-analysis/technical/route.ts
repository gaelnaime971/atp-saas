import { NextResponse, after } from 'next/server'
import { GROQ_VISION_MODEL } from '@/lib/ai/groq-models'
import { requireUser, checkAndCount, recordUsage, buildQuotaResponse, buildProviderErrorResponse } from '@/lib/ai/quota'

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
    const auth = await requireUser()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth

    const body = (await request.json()) as Body
    if (!body?.symbol || !Array.isArray(body.charts) || body.charts.length === 0) {
      return NextResponse.json({ error: 'symbol et charts requis' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/asset-analysis/technical', detail: 'GROQ_API_KEY missing' })

    const quota = await checkAndCount(user.id, 'asset-technical', isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    // Build multi-modal content: text + each chart image
    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: buildPrompt(body) }]
    for (const c of body.charts) {
      userContent.push({ type: 'image_url', image_url: { url: c.image } })
    }

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        max_tokens: 3500,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        // Qwen 3.6 mode thinking — masque le raisonnement côté API
        reasoning_format: 'hidden',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    })

    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/asset-analysis/technical', model: GROQ_VISION_MODEL, status: r.status, detail: data.error,
      })
    }

    // Filet anti-thinking Qwen : strip tout bloc <think>...</think> AVANT parse
    const raw = (data.choices?.[0]?.message?.content || '{}')
      .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
      .trim()
    let result: unknown
    try { result = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : null
    }
    if (!result) return buildProviderErrorResponse({ route: '/api/asset-analysis/technical', model: GROQ_VISION_MODEL, detail: 'invalid-json' })

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      after(async () => {
        await recordUsage(user.id, 'asset-technical', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: GROQ_VISION_MODEL,
        })
      })
    }

    return NextResponse.json({ technical: result })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/asset-analysis/technical', model: GROQ_VISION_MODEL, detail: err })
  }
}
