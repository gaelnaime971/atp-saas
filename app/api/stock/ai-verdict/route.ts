import { NextResponse } from 'next/server'

interface VerdictBody {
  symbol: string
  name?: string
  price?: number | null
  currency?: string | null
  marketCap?: number | null
  pe?: number | null
  forwardPe?: number | null
  eps?: number | null
  dividendYield?: number | null
  beta?: number | null
  weekHigh52?: number | null
  weekLow52?: number | null
  recommendationMean?: number | null  // 1=Strong Buy, 5=Strong Sell (Yahoo)
  recommendationKey?: string | null
  numberOfAnalystOpinions?: number | null
  targetMeanPrice?: number | null
  targetHighPrice?: number | null
  targetLowPrice?: number | null
  revenueGrowth?: number | null
  earningsGrowth?: number | null
  profitMargins?: number | null
  operatingMargins?: number | null
  returnOnEquity?: number | null
  debtToEquity?: number | null
  freeCashflow?: number | null
  // TipRanks
  tipranksSmartScore?: number | null
  tipranksAnalystConsensus?: string | null
  tipranksPriceTarget?: number | null
  tipranksBullish?: number | null
  tipranksBearish?: number | null
  tipranksInsiderSentiment?: string | null
  tipranksHedgeFundSentiment?: string | null
  tipranksNewsSentiment?: number | null
  // Recent news titles
  newsTitles?: string[]
  // Sector / industry
  sector?: string | null
  industry?: string | null
  longBusinessSummary?: string | null
}

const SYSTEM_PROMPT = `Tu es un analyste financier sénior, indépendant, prudent et factuel. Tu rédiges en français pour un trader actif particulier. Tu n'inventes JAMAIS de chiffres : tu n'utilises que les données qui te sont fournies. Tu mentionnes explicitement quand une donnée manque. Tu donnes un avis clair sans clause générique. Tu écris en markdown propre.`

function buildPrompt(d: VerdictBody): string {
  const lines: string[] = []
  lines.push(`Analyse l'action ${d.symbol}${d.name ? ` (${d.name})` : ''}.`)
  lines.push('')
  lines.push('Données disponibles :')
  if (d.sector) lines.push(`- Secteur : ${d.sector}${d.industry ? ` / ${d.industry}` : ''}`)
  if (d.price != null) lines.push(`- Prix actuel : ${d.price} ${d.currency || ''}`)
  if (d.marketCap != null) lines.push(`- Capitalisation : ${(d.marketCap / 1e9).toFixed(2)} Md`)
  if (d.pe != null) lines.push(`- P/E : ${d.pe.toFixed(2)}`)
  if (d.forwardPe != null) lines.push(`- P/E forward : ${d.forwardPe.toFixed(2)}`)
  if (d.eps != null) lines.push(`- EPS : ${d.eps}`)
  if (d.dividendYield != null) lines.push(`- Dividende : ${(d.dividendYield * 100).toFixed(2)}%`)
  if (d.beta != null) lines.push(`- Beta : ${d.beta.toFixed(2)}`)
  if (d.weekHigh52 != null && d.weekLow52 != null) lines.push(`- Plage 52 semaines : ${d.weekLow52} – ${d.weekHigh52}`)
  if (d.revenueGrowth != null) lines.push(`- Croissance revenus : ${(d.revenueGrowth * 100).toFixed(1)}%`)
  if (d.earningsGrowth != null) lines.push(`- Croissance bénéfices : ${(d.earningsGrowth * 100).toFixed(1)}%`)
  if (d.profitMargins != null) lines.push(`- Marge nette : ${(d.profitMargins * 100).toFixed(1)}%`)
  if (d.operatingMargins != null) lines.push(`- Marge opérationnelle : ${(d.operatingMargins * 100).toFixed(1)}%`)
  if (d.returnOnEquity != null) lines.push(`- ROE : ${(d.returnOnEquity * 100).toFixed(1)}%`)
  if (d.debtToEquity != null) lines.push(`- Debt/Equity : ${d.debtToEquity.toFixed(2)}`)
  if (d.freeCashflow != null) lines.push(`- Free cash flow : ${(d.freeCashflow / 1e9).toFixed(2)} Md`)
  lines.push('')
  lines.push('Consensus analystes (Yahoo) :')
  if (d.recommendationKey) lines.push(`- Recommandation : ${d.recommendationKey} (note ${d.recommendationMean?.toFixed(2) ?? 'N/A'} ; 1=Strong Buy, 5=Strong Sell)`)
  if (d.numberOfAnalystOpinions != null) lines.push(`- Nombre d'analystes : ${d.numberOfAnalystOpinions}`)
  if (d.targetMeanPrice != null) lines.push(`- Objectif moyen : ${d.targetMeanPrice} (low ${d.targetLowPrice ?? 'N/A'}, high ${d.targetHighPrice ?? 'N/A'})`)
  lines.push('')
  lines.push('Données TipRanks :')
  if (d.tipranksSmartScore != null) lines.push(`- Smart Score : ${d.tipranksSmartScore}/10`)
  if (d.tipranksAnalystConsensus) lines.push(`- Consensus analystes : ${d.tipranksAnalystConsensus}`)
  if (d.tipranksPriceTarget != null) lines.push(`- Price target TipRanks : ${d.tipranksPriceTarget}`)
  if (d.tipranksBullish != null && d.tipranksBearish != null) lines.push(`- Bloggers : ${d.tipranksBullish}% bullish vs ${d.tipranksBearish}% bearish`)
  if (d.tipranksInsiderSentiment) lines.push(`- Sentiment insiders : ${d.tipranksInsiderSentiment}`)
  if (d.tipranksHedgeFundSentiment) lines.push(`- Sentiment hedge funds : ${d.tipranksHedgeFundSentiment}`)
  if (d.tipranksNewsSentiment != null) lines.push(`- Sentiment news : ${d.tipranksNewsSentiment}`)
  if (d.newsTitles && d.newsTitles.length) {
    lines.push('')
    lines.push('Actualités récentes :')
    d.newsTitles.slice(0, 8).forEach(t => lines.push(`- ${t}`))
  }
  if (d.longBusinessSummary) {
    lines.push('')
    lines.push(`Description : ${d.longBusinessSummary.slice(0, 600)}`)
  }
  lines.push('')
  lines.push(`Réponds STRICTEMENT en JSON valide (pas de markdown autour, juste le JSON), avec cette structure exacte :

{
  "verdict": "ACHETER" | "CONSERVER" | "VENDRE" | "EVITER",
  "confiance": 0-100,
  "score_global": 0-100,
  "horizon": "court_terme" | "moyen_terme" | "long_terme",
  "resume": "2-3 phrases qui résument l'analyse",
  "these_bull": ["3 à 5 arguments d'achat concrets et chiffrés"],
  "these_bear": ["3 à 5 arguments de prudence/risques concrets et chiffrés"],
  "risques_cles": ["2 à 4 risques majeurs"],
  "catalyseurs": ["2 à 4 catalyseurs court/moyen terme"],
  "valorisation": "Une phrase factuelle : action sur-valorisée / correctement valorisée / sous-valorisée + pourquoi",
  "qualite_business": "Une phrase sur la qualité opérationnelle (marges, ROE, croissance)",
  "sante_financiere": "Une phrase sur la santé financière (dette, cash flow)",
  "techniques": "Une phrase sur la dynamique de prix par rapport au range 52 semaines",
  "consensus_global": "Une phrase synthétisant ce que disent analystes + insiders + hedge funds + bloggers",
  "profil_investisseur": "À qui s'adresse cette action : growth / value / dividend / spéculation / éviter"
}

Sois factuel, cite des chiffres précis quand tu as les données. N'invente RIEN. Ne mets aucun texte avant ou après le JSON.`)
  return lines.join('\n')
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerdictBody
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY non configurée' }, { status: 500 })

    const prompt = buildPrompt(body)

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await r.json()
    if (data.error) {
      console.error('Groq verdict error:', data.error)
      return NextResponse.json({ error: data.error?.message || 'Erreur IA' }, { status: 500 })
    }

    const raw = data.choices?.[0]?.message?.content || '{}'
    let verdict: unknown
    try {
      verdict = JSON.parse(raw)
    } catch {
      // Try to extract { ... } from the response
      const match = raw.match(/\{[\s\S]*\}/)
      verdict = match ? JSON.parse(match[0]) : null
    }
    if (!verdict) return NextResponse.json({ error: 'Réponse IA invalide', raw }, { status: 500 })

    return NextResponse.json({ verdict })
  } catch (err) {
    console.error('Stock AI verdict error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
