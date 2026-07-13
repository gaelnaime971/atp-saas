import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

type YF = {
  chart: (s: string, opts: { period1: Date; period2: Date; interval: '1d' | '1wk' | '1h' | '15m' }) => Promise<{
    meta?: Record<string, unknown>
    quotes?: Array<{ date?: Date; close?: number | null; high?: number | null; low?: number | null }>
  }>
  suppressNotices?: (n: string[]) => void
}
const YFCtor = YahooFinance as unknown as new () => YF
const yf: YF = new YFCtor()
try { yf.suppressNotices?.(['yahooSurvey', 'ripHistorical']) } catch { /* ignore */ }

interface Body { symbol: string }

// Manually curated correlations for futures
const CORRELATIONS: Record<string, Array<{ ticker: string; name: string; type: 'direct' | 'inverse' }>> = {
  ES: [
    { ticker: 'NQ=F', name: 'Nasdaq 100', type: 'direct' },
    { ticker: 'YM=F', name: 'Dow Jones', type: 'direct' },
    { ticker: 'RTY=F', name: 'Russell 2000', type: 'direct' },
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
  ],
  NQ: [
    { ticker: 'ES=F', name: 'S&P 500', type: 'direct' },
    { ticker: 'YM=F', name: 'Dow Jones', type: 'direct' },
    { ticker: 'SOXX', name: 'Semiconductors ETF', type: 'direct' },
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
  ],
  YM: [
    { ticker: 'ES=F', name: 'S&P 500', type: 'direct' },
    { ticker: 'NQ=F', name: 'Nasdaq 100', type: 'direct' },
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
  ],
  RTY: [
    { ticker: 'ES=F', name: 'S&P 500', type: 'direct' },
    { ticker: 'NQ=F', name: 'Nasdaq 100', type: 'direct' },
  ],
  GC: [
    { ticker: 'SI=F', name: 'Silver', type: 'direct' },
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
    { ticker: 'TLT', name: 'Long Treasuries', type: 'direct' },
  ],
  SI: [
    { ticker: 'GC=F', name: 'Gold', type: 'direct' },
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
  ],
  CL: [
    { ticker: 'BZ=F', name: 'Brent Crude', type: 'direct' },
    { ticker: 'XLE', name: 'Energy Sector ETF', type: 'direct' },
  ],
  NG: [
    { ticker: 'XLE', name: 'Energy Sector ETF', type: 'direct' },
  ],
  HG: [
    { ticker: 'DX-Y.NYB', name: 'US Dollar', type: 'inverse' },
  ],
}

function normalize(symbol: string): string {
  return symbol.toUpperCase().replace(/=F$|^M(?=[A-Z])/, '') // 'ES=F' → 'ES', 'MNQ' → 'NQ'
}

interface PriceSeries {
  ticker: string
  name: string
  type: 'direct' | 'inverse'
  last: number
  prev: number
  changePct: number
  // Recent swings: HH/HL/LL/LH analysis
  recent_close_5d: number[]
}

async function fetchSeries(ticker: string, name: string, type: 'direct' | 'inverse'): Promise<PriceSeries | null> {
  const now = new Date()
  const from = new Date(now); from.setDate(from.getDate() - 7)
  try {
    const r = await yf.chart(ticker, { period1: from, period2: now, interval: '1d' })
    const closes = (r.quotes || []).filter(q => q.close != null).map(q => Number(q.close))
    if (closes.length < 2) return null
    const last = closes[closes.length - 1]
    const prev = closes[closes.length - 2]
    return {
      ticker, name, type,
      last, prev,
      changePct: prev ? ((last - prev) / prev) * 100 : 0,
      recent_close_5d: closes.slice(-5),
    }
  } catch (e) {
    console.warn('Correlation fetch failed:', ticker, e)
    return null
  }
}

function detectSwingPattern(closes: number[]): 'HH' | 'HL' | 'LL' | 'LH' | 'flat' {
  if (closes.length < 3) return 'flat'
  const last = closes[closes.length - 1]
  const mid = closes[Math.floor(closes.length / 2)]
  const first = closes[0]
  const up = last > mid && mid > first
  const down = last < mid && mid < first
  if (up) return 'HH'
  if (down) return 'LL'
  if (last > first) return 'HL'
  if (last < first) return 'LH'
  return 'flat'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const normalized = normalize(body.symbol)
    const cors = CORRELATIONS[normalized] || []

    if (cors.length === 0) {
      return NextResponse.json({
        correlations: {
          symbol: body.symbol,
          assets: [],
          divergences: [],
          alignment: 'unknown',
          summary: `Pas de corrélations pré-définies pour ${normalized}.`,
        },
      })
    }

    // Fetch primary symbol too
    const primaryTicker = body.symbol.endsWith('=F') || body.symbol.includes('.') ? body.symbol : `${normalized}=F`
    const [primary, ...others] = await Promise.all([
      fetchSeries(primaryTicker, normalized, 'direct'),
      ...cors.map(c => fetchSeries(c.ticker, c.name, c.type)),
    ])

    const assets = others.filter((a): a is PriceSeries => a !== null)

    // Detect divergences vs primary
    const divergences: Array<{ against: string; type: string; reasoning: string }> = []
    if (primary) {
      const primPattern = detectSwingPattern(primary.recent_close_5d)
      for (const a of assets) {
        const otherPattern = detectSwingPattern(a.recent_close_5d)
        const expectedSame = a.type === 'direct'

        // Direct: should move same way. Inverse: should move opposite.
        const primUp = primPattern === 'HH' || primPattern === 'HL'
        const otherUp = otherPattern === 'HH' || otherPattern === 'HL'

        if (expectedSame && primUp !== otherUp) {
          divergences.push({
            against: a.name,
            type: primUp && !otherUp ? 'bearish_smt' : 'bullish_smt',
            reasoning: `${normalized} ${primUp ? 'monte' : 'descend'} alors que ${a.name} ${otherUp ? 'monte' : 'descend'} (corrélation directe attendue) — divergence ${primUp && !otherUp ? 'baissière' : 'haussière'}`,
          })
        } else if (!expectedSame && primUp === otherUp) {
          divergences.push({
            against: a.name,
            type: 'inverse_break',
            reasoning: `${normalized} et ${a.name} bougent dans le même sens — la corrélation inverse habituelle ne s'applique pas`,
          })
        }
      }
    }

    // Alignment summary
    const alignment: 'aligned' | 'mixed' | 'divergent' =
      divergences.length === 0 ? 'aligned'
      : divergences.length >= assets.length / 2 ? 'divergent'
      : 'mixed'

    const summary = alignment === 'aligned'
      ? `${normalized} est aligné avec ses corrélés. Pas de signal SMT contradictoire.`
      : alignment === 'divergent'
      ? `${normalized} montre ${divergences.length} divergence(s) avec ses corrélés. Signal SMT à exploiter ou attention.`
      : `Quelques divergences détectées (${divergences.length}). Marché en transition.`

    return NextResponse.json({
      correlations: {
        symbol: body.symbol,
        primary: primary ? {
          ticker: primary.ticker,
          last: primary.last,
          changePct: primary.changePct,
          pattern: detectSwingPattern(primary.recent_close_5d),
        } : null,
        assets: assets.map(a => ({
          ticker: a.ticker,
          name: a.name,
          type: a.type,
          last: a.last,
          changePct: a.changePct,
          pattern: detectSwingPattern(a.recent_close_5d),
        })),
        divergences,
        alignment,
        summary,
      },
    })
  } catch (err) {
    console.error('Correlations analysis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
