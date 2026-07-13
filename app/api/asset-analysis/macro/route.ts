import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

type YF = {
  chart: (s: string, opts: { period1: Date; period2: Date; interval: '1d' | '1wk' }) => Promise<{
    meta?: Record<string, unknown>
    quotes?: Array<{ date?: Date; close?: number | null }>
  }>
  suppressNotices?: (n: string[]) => void
}
const YFCtor = YahooFinance as unknown as new () => YF
const yf: YF = new YFCtor()
try { yf.suppressNotices?.(['yahooSurvey', 'ripHistorical']) } catch { /* ignore */ }

interface Body { symbol: string }

async function fetchMacro(ticker: string) {
  const now = new Date()
  const fromD = new Date(now); fromD.setDate(fromD.getDate() - 7)
  try {
    const r = await yf.chart(ticker, { period1: fromD, period2: now, interval: '1d' })
    const closes = (r.quotes || []).filter(q => q.close != null).map(q => Number(q.close))
    if (!closes.length) return null
    const last = closes[closes.length - 1]
    const prev = closes.length > 1 ? closes[closes.length - 2] : last
    const meta = r.meta || {}
    return {
      price: last,
      previous: prev,
      change: last - prev,
      changePct: prev ? ((last - prev) / prev) * 100 : 0,
      name: (meta.longName as string) || (meta.shortName as string) || ticker,
    }
  } catch (e) {
    console.warn('Macro fetch failed:', ticker, e)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const [dxy, vix, tnx, sp, nq] = await Promise.all([
      fetchMacro('DX-Y.NYB'),  // US Dollar Index
      fetchMacro('^VIX'),       // CBOE Volatility Index
      fetchMacro('^TNX'),       // 10-Year US Treasury Yield (×10)
      fetchMacro('ES=F'),       // E-mini S&P 500
      fetchMacro('NQ=F'),       // E-mini Nasdaq 100
    ])

    // Risk regime heuristic
    let riskRegime: 'risk_on' | 'risk_off' | 'neutral' = 'neutral'
    const reasons: string[] = []
    if (dxy && vix && tnx) {
      const vixHigh = vix.price > 22
      const vixLow = vix.price < 15
      const dxyUp = dxy.changePct > 0.4
      const dxyDown = dxy.changePct < -0.4
      const indicesUp = (sp?.changePct ?? 0) > 0.3 && (nq?.changePct ?? 0) > 0.3
      const indicesDown = (sp?.changePct ?? 0) < -0.3 && (nq?.changePct ?? 0) < -0.3

      let onScore = 0, offScore = 0
      if (vixLow) { onScore++; reasons.push(`VIX bas (${vix.price.toFixed(1)})`) }
      if (vixHigh) { offScore++; reasons.push(`VIX élevé (${vix.price.toFixed(1)})`) }
      if (dxyDown) { onScore++; reasons.push('DXY en baisse') }
      if (dxyUp) { offScore++; reasons.push('DXY en hausse') }
      if (indicesUp) { onScore++; reasons.push('indices US en hausse') }
      if (indicesDown) { offScore++; reasons.push('indices US en baisse') }

      if (onScore - offScore >= 2) riskRegime = 'risk_on'
      else if (offScore - onScore >= 2) riskRegime = 'risk_off'
    }

    return NextResponse.json({
      macro: {
        dxy, vix, tnx, sp, nq,
        // Note: TNX is the 10-year yield ×10, so price 42 = 4.2% yield
        yield_10y_pct: tnx ? tnx.price / 10 : null,
        risk_regime: riskRegime,
        reasoning: reasons.length ? reasons.join(' · ') : 'Signaux mixtes, pas de régime clair',
      },
    })
  } catch (err) {
    console.error('Macro analysis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
