import { NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface CNNFG {
  fear_and_greed?: {
    score: number
    rating: string
    timestamp: string
    previous_close?: number
    previous_1_week?: number
    previous_1_month?: number
    previous_1_year?: number
  }
}

interface AltFG {
  data?: Array<{
    value: string
    value_classification: string
    timestamp: string
  }>
}

interface Body { symbol: string }

async function fetchCNN(): Promise<CNNFG | null> {
  try {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Origin: 'https://www.cnn.com',
        Referer: 'https://www.cnn.com/markets/fear-and-greed',
      },
      next: { revalidate: 1800 },
    })
    if (!r.ok) return null
    return (await r.json()) as CNNFG
  } catch (e) {
    console.warn('CNN F&G failed:', e)
    return null
  }
}

async function fetchAlt(): Promise<AltFG | null> {
  try {
    const r = await fetch('https://api.alternative.me/fng/', { next: { revalidate: 1800 } })
    if (!r.ok) return null
    return (await r.json()) as AltFG
  } catch (e) {
    console.warn('Alternative.me F&G failed:', e)
    return null
  }
}

function ratingLabel(score: number): string {
  if (score >= 75) return 'Extreme Greed'
  if (score >= 55) return 'Greed'
  if (score >= 45) return 'Neutral'
  if (score >= 25) return 'Fear'
  return 'Extreme Fear'
}

function contrarianAlert(score: number): { triggered: boolean; direction: 'caution_long' | 'caution_short' | null; reasoning: string } {
  if (score >= 75) return { triggered: true, direction: 'caution_long', reasoning: 'Marché en extrême greed — risque de retournement, prudence sur les achats euphoriques.' }
  if (score <= 25) return { triggered: true, direction: 'caution_short', reasoning: 'Marché en extrême fear — opportunité contrarian acheteur, prudence sur les ventes paniques.' }
  return { triggered: false, direction: null, reasoning: 'Sentiment neutre, pas de signal contrarian fort.' }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const [cnn, alt] = await Promise.all([fetchCNN(), fetchAlt()])

    const cnnScore = cnn?.fear_and_greed?.score != null ? Math.round(cnn.fear_and_greed.score) : null
    const altScore = alt?.data?.[0]?.value ? parseInt(alt.data[0].value, 10) : null

    const primaryScore = cnnScore ?? altScore // CNN better for futures, alt as fallback
    const primary = primaryScore != null ? {
      source: cnnScore != null ? 'CNN' : 'Alternative.me',
      score: primaryScore,
      label: ratingLabel(primaryScore),
      contrarian: contrarianAlert(primaryScore),
    } : null

    return NextResponse.json({
      sentiment: {
        primary,
        cnn: cnn?.fear_and_greed ? {
          score: Math.round(cnn.fear_and_greed.score),
          rating: cnn.fear_and_greed.rating,
          previous_close: cnn.fear_and_greed.previous_close != null ? Math.round(cnn.fear_and_greed.previous_close) : null,
          previous_1_week: cnn.fear_and_greed.previous_1_week != null ? Math.round(cnn.fear_and_greed.previous_1_week) : null,
          previous_1_month: cnn.fear_and_greed.previous_1_month != null ? Math.round(cnn.fear_and_greed.previous_1_month) : null,
        } : null,
        crypto: alt?.data?.[0] ? {
          score: parseInt(alt.data[0].value, 10),
          rating: alt.data[0].value_classification,
        } : null,
      },
    })
  } catch (err) {
    console.error('Sentiment analysis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
