import { NextResponse } from 'next/server'

interface ScoresBody {
  symbol: string
  name?: string
  // Valorisation
  pe?: number | null
  forwardPe?: number | null
  pb?: number | null
  ps?: number | null
  pegRatio?: number | null
  evEbitda?: number | null
  // Croissance
  revenueGrowth?: number | null
  earningsGrowth?: number | null
  // Profitabilité
  grossMargins?: number | null
  operatingMargins?: number | null
  ebitdaMargins?: number | null
  profitMargins?: number | null
  roe?: number | null
  roa?: number | null
  // Santé financière
  debtToEquity?: number | null
  currentRatio?: number | null
  freeCashflow?: number | null
  totalCash?: number | null
  totalDebt?: number | null
  // Consensus
  recommendationMean?: number | null
  recommendationKey?: string | null
  numAnalysts?: number | null
  // Fondamentaux
  marketCap?: number | null
  beta?: number | null
  dividendYield?: number | null
  sector?: string | null
}

const SYSTEM = `Tu es un analyste financier. Tu notes une action sur 6 axes 0-100, basée uniquement sur les données fournies. Tu n'inventes RIEN. Tu ne renvoies QUE du JSON valide, rien d'autre.`

function prompt(d: ScoresBody): string {
  return `Note l'action ${d.symbol}${d.name ? ` (${d.name})` : ''} sur 6 axes, 0 = mauvais, 100 = excellent.

Données :
- Secteur : ${d.sector || 'N/A'}
- Cap : ${d.marketCap != null ? (d.marketCap / 1e9).toFixed(2) + ' Md' : 'N/A'}
- Beta : ${d.beta?.toFixed(2) ?? 'N/A'}
- Dividende : ${d.dividendYield != null ? (d.dividendYield * 100).toFixed(2) + '%' : 'N/A'}

Valorisation :
- P/E : ${d.pe?.toFixed(2) ?? 'N/A'} (forward ${d.forwardPe?.toFixed(2) ?? 'N/A'})
- P/B : ${d.pb?.toFixed(2) ?? 'N/A'} · P/S : ${d.ps?.toFixed(2) ?? 'N/A'} · PEG : ${d.pegRatio?.toFixed(2) ?? 'N/A'} · EV/EBITDA : ${d.evEbitda?.toFixed(2) ?? 'N/A'}

Croissance :
- Revenus YoY : ${d.revenueGrowth != null ? (d.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- EPS YoY : ${d.earningsGrowth != null ? (d.earningsGrowth * 100).toFixed(1) + '%' : 'N/A'}

Profitabilité :
- Marge brute : ${d.grossMargins != null ? (d.grossMargins * 100).toFixed(1) + '%' : 'N/A'}
- Marge op : ${d.operatingMargins != null ? (d.operatingMargins * 100).toFixed(1) + '%' : 'N/A'}
- Marge EBITDA : ${d.ebitdaMargins != null ? (d.ebitdaMargins * 100).toFixed(1) + '%' : 'N/A'}
- Marge nette : ${d.profitMargins != null ? (d.profitMargins * 100).toFixed(1) + '%' : 'N/A'}
- ROE : ${d.roe != null ? (d.roe * 100).toFixed(1) + '%' : 'N/A'}
- ROA : ${d.roa != null ? (d.roa * 100).toFixed(1) + '%' : 'N/A'}

Santé financière :
- Debt/Equity : ${d.debtToEquity?.toFixed(2) ?? 'N/A'}
- Current ratio : ${d.currentRatio?.toFixed(2) ?? 'N/A'}
- Free cash flow : ${d.freeCashflow != null ? (d.freeCashflow / 1e9).toFixed(2) + ' Md' : 'N/A'}
- Trésorerie / Dette : ${d.totalCash != null ? (d.totalCash / 1e9).toFixed(2) + ' Md' : 'N/A'} / ${d.totalDebt != null ? (d.totalDebt / 1e9).toFixed(2) + ' Md' : 'N/A'}

Consensus analystes :
- Recommandation : ${d.recommendationKey || 'N/A'} (note ${d.recommendationMean?.toFixed(2) ?? 'N/A'} ; 1=Strong Buy, 5=Strong Sell)
- Nb analystes : ${d.numAnalysts ?? 'N/A'}

Réponds STRICTEMENT en JSON :
{
  "fondamentaux": 0-100,
  "valorisation": 0-100,
  "croissance": 0-100,
  "profitabilite": 0-100,
  "sante_financiere": 0-100,
  "consensus": 0-100,
  "commentaire_fondamentaux": "1 phrase",
  "commentaire_valorisation": "1 phrase",
  "commentaire_croissance": "1 phrase",
  "commentaire_profitabilite": "1 phrase",
  "commentaire_sante_financiere": "1 phrase",
  "commentaire_consensus": "1 phrase"
}

Règle : si une donnée est N/A sur un axe entier, mets le score à null (pas 0) pour ne pas pénaliser. Sois rigoureux et factuel.`
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScoresBody
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY non configurée' }, { status: 500 })

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt(body) },
        ],
      }),
    })

    const data = await r.json()
    if (data.error) return NextResponse.json({ error: data.error?.message || 'Erreur IA' }, { status: 500 })

    const raw = data.choices?.[0]?.message?.content || '{}'
    let scores: unknown
    try { scores = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      scores = m ? JSON.parse(m[0]) : null
    }
    if (!scores) return NextResponse.json({ error: 'Réponse IA invalide', raw }, { status: 500 })

    return NextResponse.json({ scores })
  } catch (err) {
    console.error('Stock AI scores error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
