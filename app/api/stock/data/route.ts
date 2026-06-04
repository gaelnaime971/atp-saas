import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

// yahoo-finance2 v3 requires instantiation. Types are partly broken,
// so we cast the instance to a permissive shape that mirrors the runtime.
type YF = {
  quote: (s: string) => Promise<Record<string, unknown>>
  quoteSummary: (s: string, opts: { modules: string[] }) => Promise<Record<string, unknown>>
  chart: (s: string, opts: { period1: Date; period2: Date; interval: '1d' | '1wk' }) => Promise<{
    meta?: Record<string, unknown>
    quotes?: Array<{ date?: Date; close?: number | null; volume?: number | null }>
  }>
  search: (q: string, opts?: { quotesCount?: number; newsCount?: number }) => Promise<{
    news?: Array<{ title?: string; link?: string; publisher?: string; providerPublishTime?: number | Date }>
  }>
  insights: (s: string) => Promise<Record<string, unknown>>
  suppressNotices?: (n: string[]) => void
}
const YFCtor = YahooFinance as unknown as new () => YF
const yahooFinance: YF = new YFCtor()

try {
  yahooFinance.suppressNotices?.(['yahooSurvey', 'ripHistorical'])
} catch { /* ignore */ }

// Yahoo Finance redirects EU IPs to a GDPR consent page (?guccounter=1) which
// breaks yahoo-finance2.quoteSummary(). We bypass it by performing the consent
// dance ourselves and caching the resulting cookie + crumb for 12h.

const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CRUMB_TTL = 12 * 60 * 60_000
let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null

function extractSetCookies(res: Response): string {
  // The Headers.getSetCookie() method exists on Node 20.20+ undici; fallback otherwise.
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const arr = headers.getSetCookie ? headers.getSetCookie() : []
  return arr.map(c => c.split(';')[0]).join('; ')
}

async function fetchCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  // Step 1: hit fc.yahoo.com to trigger A1/A3 cookies. EU IPs will be redirected
  // to consent.yahoo.com — we follow and POST the consent form.
  let cookieJar = ''

  try {
    const r1 = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': UA_BROWSER, Accept: 'text/html' },
      redirect: 'manual',
    })
    cookieJar = extractSetCookies(r1)

    // EU consent flow: GET https://guce.yahoo.com/consent?...
    const location = r1.headers.get('location')
    if (location && location.includes('consent')) {
      // Follow the redirect to consent page to grab GUCS cookie + form
      const r2 = await fetch(location, {
        headers: { 'User-Agent': UA_BROWSER, Accept: 'text/html', Cookie: cookieJar },
        redirect: 'manual',
      })
      const newCookies = extractSetCookies(r2)
      if (newCookies) cookieJar = cookieJar ? `${cookieJar}; ${newCookies}` : newCookies

      // Extract sessionId / csrfToken / brandBid from the HTML form
      const html = await r2.text()
      const csrfToken = html.match(/name="csrfToken"\s+value="([^"]+)"/)?.[1]
      const sessionId = html.match(/name="sessionId"\s+value="([^"]+)"/)?.[1]
      const brandBid = html.match(/name="brandBid"\s+value="([^"]+)"/)?.[1]
      const originalDoneUrl = html.match(/name="originalDoneUrl"\s+value="([^"]+)"/)?.[1]
      const namespace = html.match(/name="namespace"\s+value="([^"]+)"/)?.[1] || 'yahoo'

      if (csrfToken && sessionId) {
        const formBody = new URLSearchParams({
          csrfToken,
          sessionId,
          ...(brandBid ? { brandBid } : {}),
          ...(originalDoneUrl ? { originalDoneUrl } : {}),
          namespace,
          agree: 'agree',
        }).toString()

        const r3 = await fetch(`https://consent.yahoo.com/v2/collectConsent?sessionId=${sessionId}`, {
          method: 'POST',
          headers: {
            'User-Agent': UA_BROWSER,
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookieJar,
            Origin: 'https://consent.yahoo.com',
          },
          body: formBody,
          redirect: 'manual',
        })
        const moreCookies = extractSetCookies(r3)
        if (moreCookies) cookieJar = cookieJar ? `${cookieJar}; ${moreCookies}` : moreCookies
      }
    }

    // Step 2: get the crumb with the (now-consented) cookie jar
    const rc = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA_BROWSER, Accept: 'text/plain', Cookie: cookieJar },
    })
    const crumb = (await rc.text()).trim()
    if (!crumb || crumb.toLowerCase().includes('<html')) return null
    return { crumb, cookie: cookieJar }
  } catch (e) {
    console.warn('fetchCrumb failed:', (e as Error).message)
    return null
  }
}

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < CRUMB_TTL) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie }
  }
  const fresh = await fetchCrumb()
  if (fresh) cachedCrumb = { ...fresh, at: Date.now() }
  return fresh
}

// Recursively flatten { raw, fmt, longFmt } leaf objects to their raw numeric value.
// Yahoo's raw API wraps numbers in objects; yahoo-finance2 normally normalizes them.
function flatten(v: unknown): unknown {
  if (v === null || v === undefined) return v
  if (Array.isArray(v)) return v.map(flatten)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('raw' in o && (typeof o.raw === 'number' || o.raw === null)) {
      return o.raw
    }
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(o)) out[k] = flatten(val)
    return out
  }
  return v
}

async function rawQuoteSummary(symbol: string, modules: string[]): Promise<Record<string, unknown> | null> {
  const auth = await getCrumb()
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}&lang=en-US&region=US${auth?.crumb ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA_BROWSER,
        Accept: 'application/json',
        ...(auth?.cookie ? { Cookie: auth.cookie } : {}),
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      console.warn('rawQuoteSummary http', res.status, await res.text().catch(() => ''))
      return null
    }
    const body = await res.json() as { quoteSummary?: { result?: Array<Record<string, unknown>>; error?: { description?: string } } }
    if (body.quoteSummary?.error) {
      console.warn('rawQuoteSummary api error:', body.quoteSummary.error.description)
      // Invalidate crumb to force re-fetch on next call
      if ((body.quoteSummary.error.description || '').toLowerCase().includes('crumb')) cachedCrumb = null
      return null
    }
    const result = body.quoteSummary?.result?.[0] || null
    return result ? (flatten(result) as Record<string, unknown>) : null
  } catch (e) {
    console.warn('rawQuoteSummary failed:', (e as Error).message)
    return null
  }
}

type Period = '1mo' | '3mo' | '6mo' | '1y' | '5y'

// ─── Finnhub free tier (optional — needs FINNHUB_API_KEY env var) ───────
// Sign up at https://finnhub.io — 60 calls/min on free.

interface FinnhubBundle {
  profile?: Record<string, unknown> | null
  quote?: { c?: number; h?: number; l?: number; o?: number; pc?: number; d?: number; dp?: number } | null
  metrics?: Record<string, unknown> | null
  recommendations?: Array<{ buy?: number; hold?: number; period?: string; sell?: number; strongBuy?: number; strongSell?: number; symbol?: string }> | null
  priceTarget?: { targetHigh?: number; targetLow?: number; targetMean?: number; targetMedian?: number; numberOfAnalysts?: number; lastUpdated?: string } | null
  insiders?: { data?: Array<{ name?: string; share?: number; change?: number; filingDate?: string; transactionDate?: string; transactionCode?: string; transactionPrice?: number }> } | null
  peers?: string[] | null
  earningsCal?: { earningsCalendar?: Array<{ date?: string; epsActual?: number; epsEstimate?: number; revenueActual?: number; revenueEstimate?: number; quarter?: number; year?: number }> } | null
}

async function finnhubFetch<T>(path: string): Promise<T | null> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`https://finnhub.io/api/v1${path}${path.includes('?') ? '&' : '?'}token=${key}`, {
      headers: { 'User-Agent': 'ATP-SaaS/1.0' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

async function fetchFinnhubBundle(symbol: string): Promise<FinnhubBundle | null> {
  if (!process.env.FINNHUB_API_KEY) return null
  const s = symbol.split('.')[0] // Finnhub uses bare US tickers
  const [profile, quote, metrics, recommendations, priceTarget, insiders, peers, earningsCal] = await Promise.all([
    finnhubFetch<Record<string, unknown>>(`/stock/profile2?symbol=${s}`),
    finnhubFetch<FinnhubBundle['quote']>(`/quote?symbol=${s}`),
    finnhubFetch<Record<string, unknown>>(`/stock/metric?symbol=${s}&metric=all`),
    finnhubFetch<FinnhubBundle['recommendations']>(`/stock/recommendation?symbol=${s}`),
    finnhubFetch<FinnhubBundle['priceTarget']>(`/stock/price-target?symbol=${s}`),
    finnhubFetch<FinnhubBundle['insiders']>(`/stock/insider-transactions?symbol=${s}`),
    finnhubFetch<string[]>(`/stock/peers?symbol=${s}`),
    finnhubFetch<{ earningsCalendar?: Array<{ date?: string; epsActual?: number; epsEstimate?: number; revenueActual?: number; revenueEstimate?: number; quarter?: number; year?: number }> }>(`/calendar/earnings?symbol=${s}&from=2020-01-01&to=2030-01-01`),
  ])
  return { profile, quote, metrics, recommendations, priceTarget, insiders, peers, earningsCal }
}

// Merge Yahoo quoteSummary (which often fails) with Finnhub data shaped to look the same.
function mergeSummary(
  yahooSummary: Record<string, unknown> | null,
  finnhub: FinnhubBundle | null,
  insights: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const base: Record<string, unknown> = yahooSummary ? { ...yahooSummary } : {}

  if (finnhub) {
    const metrics = (finnhub.metrics as { metric?: Record<string, number> } | null)?.metric || {}
    const profile = finnhub.profile as Record<string, unknown> | null
    const pt = finnhub.priceTarget
    const lastReco = finnhub.recommendations?.[0]
    const totalReco = lastReco ? (lastReco.strongBuy || 0) + (lastReco.buy || 0) + (lastReco.hold || 0) + (lastReco.sell || 0) + (lastReco.strongSell || 0) : 0
    const recoMean = totalReco
      ? (((lastReco?.strongBuy || 0) * 1) + ((lastReco?.buy || 0) * 2) + ((lastReco?.hold || 0) * 3) + ((lastReco?.sell || 0) * 4) + ((lastReco?.strongSell || 0) * 5)) / totalReco
      : undefined
    const recoKey = recoMean == null ? undefined
      : recoMean < 1.7 ? 'strong_buy'
      : recoMean < 2.4 ? 'buy'
      : recoMean < 3.4 ? 'hold'
      : recoMean < 4.4 ? 'sell'
      : 'strong_sell'

    // financialData fallback
    base.financialData = {
      ...(base.financialData as Record<string, unknown> || {}),
      currentPrice: (base.financialData as { currentPrice?: number } | undefined)?.currentPrice ?? finnhub.quote?.c,
      targetMeanPrice: (base.financialData as { targetMeanPrice?: number } | undefined)?.targetMeanPrice ?? pt?.targetMean,
      targetMedianPrice: (base.financialData as { targetMedianPrice?: number } | undefined)?.targetMedianPrice ?? pt?.targetMedian,
      targetHighPrice: (base.financialData as { targetHighPrice?: number } | undefined)?.targetHighPrice ?? pt?.targetHigh,
      targetLowPrice: (base.financialData as { targetLowPrice?: number } | undefined)?.targetLowPrice ?? pt?.targetLow,
      numberOfAnalystOpinions: (base.financialData as { numberOfAnalystOpinions?: number } | undefined)?.numberOfAnalystOpinions ?? pt?.numberOfAnalysts,
      recommendationMean: (base.financialData as { recommendationMean?: number } | undefined)?.recommendationMean ?? recoMean,
      recommendationKey: (base.financialData as { recommendationKey?: string } | undefined)?.recommendationKey ?? recoKey,
      profitMargins: (base.financialData as { profitMargins?: number } | undefined)?.profitMargins ?? (metrics.netProfitMarginTTM != null ? metrics.netProfitMarginTTM / 100 : undefined),
      operatingMargins: (base.financialData as { operatingMargins?: number } | undefined)?.operatingMargins ?? (metrics.operatingMarginTTM != null ? metrics.operatingMarginTTM / 100 : undefined),
      ebitdaMargins: (base.financialData as { ebitdaMargins?: number } | undefined)?.ebitdaMargins ?? (metrics.ebitdaMargin5Y != null ? metrics.ebitdaMargin5Y / 100 : undefined),
      grossMargins: (base.financialData as { grossMargins?: number } | undefined)?.grossMargins ?? (metrics.grossMarginTTM != null ? metrics.grossMarginTTM / 100 : undefined),
      revenueGrowth: (base.financialData as { revenueGrowth?: number } | undefined)?.revenueGrowth ?? (metrics.revenueGrowthTTMYoy != null ? metrics.revenueGrowthTTMYoy / 100 : undefined),
      earningsGrowth: (base.financialData as { earningsGrowth?: number } | undefined)?.earningsGrowth ?? (metrics.epsGrowthTTMYoy != null ? metrics.epsGrowthTTMYoy / 100 : undefined),
      returnOnEquity: (base.financialData as { returnOnEquity?: number } | undefined)?.returnOnEquity ?? (metrics.roeTTM != null ? metrics.roeTTM / 100 : undefined),
      returnOnAssets: (base.financialData as { returnOnAssets?: number } | undefined)?.returnOnAssets ?? (metrics.roaTTM != null ? metrics.roaTTM / 100 : undefined),
      debtToEquity: (base.financialData as { debtToEquity?: number } | undefined)?.debtToEquity ?? (metrics['totalDebt/totalEquityQuarterly'] as number | undefined) ?? (metrics['totalDebt/totalEquityAnnual'] as number | undefined),
      currentRatio: (base.financialData as { currentRatio?: number } | undefined)?.currentRatio ?? (metrics.currentRatioQuarterly as number | undefined) ?? (metrics.currentRatioAnnual as number | undefined),
      quickRatio: (base.financialData as { quickRatio?: number } | undefined)?.quickRatio ?? (metrics.quickRatioQuarterly as number | undefined) ?? (metrics.quickRatioAnnual as number | undefined),
      totalRevenue: (base.financialData as { totalRevenue?: number } | undefined)?.totalRevenue ?? (metrics.revenueTTM as number | undefined),
      totalDebt: (base.financialData as { totalDebt?: number } | undefined)?.totalDebt,
      totalCash: (base.financialData as { totalCash?: number } | undefined)?.totalCash,
      freeCashflow: (base.financialData as { freeCashflow?: number } | undefined)?.freeCashflow ?? (metrics.freeCashFlowTTM as number | undefined),
    }

    base.summaryDetail = {
      ...(base.summaryDetail as Record<string, unknown> || {}),
      trailingPE: (base.summaryDetail as { trailingPE?: number } | undefined)?.trailingPE ?? metrics.peTTM,
      forwardPE: (base.summaryDetail as { forwardPE?: number } | undefined)?.forwardPE ?? metrics.peForward,
      beta: (base.summaryDetail as { beta?: number } | undefined)?.beta ?? metrics.beta,
      dividendYield: (base.summaryDetail as { dividendYield?: number } | undefined)?.dividendYield ?? (metrics.dividendYieldIndicatedAnnual != null ? metrics.dividendYieldIndicatedAnnual / 100 : undefined),
      priceToSalesTrailing12Months: (base.summaryDetail as { priceToSalesTrailing12Months?: number } | undefined)?.priceToSalesTrailing12Months ?? metrics.psTTM,
      marketCap: (base.summaryDetail as { marketCap?: number } | undefined)?.marketCap ?? (profile?.marketCapitalization != null ? (profile.marketCapitalization as number) * 1e6 : undefined),
      fiftyTwoWeekHigh: (base.summaryDetail as { fiftyTwoWeekHigh?: number } | undefined)?.fiftyTwoWeekHigh ?? metrics['52WeekHigh'],
      fiftyTwoWeekLow: (base.summaryDetail as { fiftyTwoWeekLow?: number } | undefined)?.fiftyTwoWeekLow ?? metrics['52WeekLow'],
      currency: (base.summaryDetail as { currency?: string } | undefined)?.currency ?? (profile?.currency as string | undefined),
    }

    base.defaultKeyStatistics = {
      ...(base.defaultKeyStatistics as Record<string, unknown> || {}),
      trailingEps: (base.defaultKeyStatistics as { trailingEps?: number } | undefined)?.trailingEps ?? metrics.epsTTM,
      forwardEps: (base.defaultKeyStatistics as { forwardEps?: number } | undefined)?.forwardEps ?? metrics.epsForward,
      priceToBook: (base.defaultKeyStatistics as { priceToBook?: number } | undefined)?.priceToBook ?? metrics.pbAnnual ?? metrics.pbQuarterly,
      pegRatio: (base.defaultKeyStatistics as { pegRatio?: number } | undefined)?.pegRatio ?? metrics.pegRatio5y,
      bookValue: (base.defaultKeyStatistics as { bookValue?: number } | undefined)?.bookValue ?? metrics.bookValuePerShareAnnual,
      enterpriseToEbitda: (base.defaultKeyStatistics as { enterpriseToEbitda?: number } | undefined)?.enterpriseToEbitda ?? metrics.evToEbitdaTTM,
      enterpriseToRevenue: (base.defaultKeyStatistics as { enterpriseToRevenue?: number } | undefined)?.enterpriseToRevenue ?? metrics.evToSalesAnnual,
    }

    if (!base.summaryProfile && profile) {
      base.summaryProfile = {
        sector: profile.finnhubIndustry as string | undefined,
        industry: profile.finnhubIndustry as string | undefined,
        country: profile.country as string | undefined,
        website: profile.weburl as string | undefined,
        longBusinessSummary: profile.name as string | undefined,
        fullTimeEmployees: profile.employeeTotal as number | undefined,
      }
    }

    // insider transactions from Finnhub
    if (finnhub.insiders?.data?.length) {
      const yahooInsiders = (base.insiderTransactions as { transactions?: unknown[] } | undefined)?.transactions || []
      if (yahooInsiders.length === 0) {
        base.insiderTransactions = {
          transactions: finnhub.insiders.data.slice(0, 20).map(i => ({
            filerName: i.name,
            transactionText: `${i.transactionCode || ''} ${i.change && i.change > 0 ? 'Achat' : 'Vente'}`,
            startDate: i.transactionDate ? new Date(i.transactionDate).getTime() / 1000 : undefined,
            shares: Math.abs(i.change || 0),
            value: Math.abs((i.change || 0) * (i.transactionPrice || 0)),
          })),
        }
      }
    }

    // recommendationTrend
    if (finnhub.recommendations?.length && !base.recommendationTrend) {
      base.recommendationTrend = {
        trend: finnhub.recommendations.slice(0, 4).map(r => ({
          period: r.period,
          strongBuy: r.strongBuy,
          buy: r.buy,
          hold: r.hold,
          sell: r.sell,
          strongSell: r.strongSell,
        })),
      }
    }
  }

  // Insights (Yahoo) — populate a basic recommendationKey if we still don't have one
  if (insights) {
    const reco = (insights as { recommendation?: { rating?: string; targetPrice?: number } }).recommendation
    if (reco?.rating && !(base.financialData as { recommendationKey?: string } | undefined)?.recommendationKey) {
      base.financialData = {
        ...(base.financialData as Record<string, unknown> || {}),
        recommendationKey: reco.rating.toLowerCase().replace(/\s/g, '_'),
      }
    }
  }

  if (!yahooSummary && !finnhub && !insights) return null
  return base
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase()
  const period = (searchParams.get('period') || '6mo') as Period
  if (!symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

  try {
    const periodDays: Record<Period, number> = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 1825 }
    const days = periodDays[period] ?? 180
    const interval: '1d' | '1wk' = days > 700 ? '1wk' : '1d'

    // Fetch in parallel. quoteSummary may fail (EU consent + rate limits) — we have
    // chart.meta + insights + optional Finnhub as fallbacks for the core data.
    const [summary, chartRaw, insightsRaw, finnhubData] = await Promise.all([
      rawQuoteSummary(symbol, [
        'price',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
        'summaryProfile',
        'assetProfile',
        'recommendationTrend',
        'upgradeDowngradeHistory',
        'earnings',
        'earningsTrend',
        'calendarEvents',
        'incomeStatementHistory',
        'balanceSheetHistory',
        'cashflowStatementHistory',
        'majorHoldersBreakdown',
        'institutionOwnership',
        'insiderHolders',
        'insiderTransactions',
      ]),
      yahooFinance
        .chart(symbol, {
          period1: new Date(Date.now() - days * 86400_000),
          period2: new Date(),
          interval,
        })
        .catch(e => { console.warn('chart() failed:', e?.message || e); return null }),
      yahooFinance.insights(symbol).catch(e => { console.warn('insights() failed:', e?.message || e); return null }),
      fetchFinnhubBundle(symbol),
    ])

    // Merge summary from Yahoo quoteSummary (if it worked) with Finnhub fundamentals (always free).
    const mergedSummary = mergeSummary(summary, finnhubData, insightsRaw)

    const chartMeta = (chartRaw?.meta || {}) as Record<string, unknown>
    const priceMod = (mergedSummary?.price as Record<string, unknown> | undefined)
    const detailMod = (mergedSummary?.summaryDetail as Record<string, unknown> | undefined)
    const finData = (mergedSummary?.financialData as Record<string, unknown> | undefined)
    const chartQuotes = chartRaw && Array.isArray(chartRaw.quotes) ? chartRaw.quotes : []
    const lastClose = [...chartQuotes].reverse().find(q => q.close != null)?.close ?? null
    const prevClose = chartQuotes.length > 1 ? chartQuotes[chartQuotes.length - 2]?.close ?? null : null

    const quote = {
      symbol,
      shortName: (priceMod?.shortName as string) || (chartMeta.shortName as string) || (finnhubData?.profile?.name as string) || undefined,
      longName: (priceMod?.longName as string) || (chartMeta.longName as string) || (finnhubData?.profile?.name as string) || undefined,
      currency: (priceMod?.currency as string) || (detailMod?.currency as string) || (chartMeta.currency as string) || (finnhubData?.profile?.currency as string) || 'USD',
      exchange: (priceMod?.exchange as string) || (chartMeta.exchangeName as string) || (finnhubData?.profile?.exchange as string) || undefined,
      fullExchangeName: (priceMod?.exchangeName as string) || (chartMeta.fullExchangeName as string) || undefined,
      regularMarketPrice:
        (priceMod?.regularMarketPrice as number | undefined) ??
        (finData?.currentPrice as number | undefined) ??
        (chartMeta.regularMarketPrice as number | undefined) ??
        (finnhubData?.quote?.c as number | undefined) ??
        lastClose ?? null,
      regularMarketPreviousClose:
        (priceMod?.regularMarketPreviousClose as number | undefined) ??
        (chartMeta.chartPreviousClose as number | undefined) ??
        (finnhubData?.quote?.pc as number | undefined) ??
        prevClose ?? null,
      regularMarketChange:
        (priceMod?.regularMarketChange as number | undefined) ??
        (finnhubData?.quote?.d as number | undefined) ??
        (lastClose != null && prevClose != null ? lastClose - prevClose : null),
      regularMarketChangePercent:
        (priceMod?.regularMarketChangePercent as number | undefined) ??
        (finnhubData?.quote?.dp as number | undefined) ??
        (lastClose != null && prevClose != null && prevClose !== 0 ? ((lastClose - prevClose) / prevClose) * 100 : null),
      regularMarketDayHigh:
        (priceMod?.regularMarketDayHigh as number | undefined) ??
        (chartMeta.regularMarketDayHigh as number | undefined) ??
        (finnhubData?.quote?.h as number | undefined),
      regularMarketDayLow:
        (priceMod?.regularMarketDayLow as number | undefined) ??
        (chartMeta.regularMarketDayLow as number | undefined) ??
        (finnhubData?.quote?.l as number | undefined),
      regularMarketVolume:
        (priceMod?.regularMarketVolume as number | undefined) ??
        (chartMeta.regularMarketVolume as number | undefined),
      marketCap: (() => {
        const mc = (priceMod?.marketCap as number | undefined) ?? (detailMod?.marketCap as number | undefined)
        if (mc != null) return mc
        const fmc = finnhubData?.profile?.marketCapitalization as number | undefined
        return fmc != null ? fmc * 1e6 : undefined
      })(),
      fiftyTwoWeekHigh:
        (detailMod?.fiftyTwoWeekHigh as number | undefined) ??
        (chartMeta.fiftyTwoWeekHigh as number | undefined),
      fiftyTwoWeekLow:
        (detailMod?.fiftyTwoWeekLow as number | undefined) ??
        (chartMeta.fiftyTwoWeekLow as number | undefined),
    }

    const news = await yahooFinance
      .search(symbol, { quotesCount: 0, newsCount: 12 })
      .then(r => (r.news || []).map(n => ({
        title: n.title,
        link: n.link,
        publisher: n.publisher,
        date: n.providerPublishTime instanceof Date ? n.providerPublishTime.toISOString() : (n.providerPublishTime ? new Date((n.providerPublishTime as number) * 1000).toISOString() : null),
      })))
      .catch(() => [])

    const chart = chartRaw && Array.isArray(chartRaw.quotes)
      ? chartRaw.quotes
          .filter(q => q.close != null && q.date)
          .map(q => ({
            t: q.date instanceof Date ? q.date.toISOString().slice(0, 10) : String(q.date),
            c: q.close,
            v: q.volume ?? null,
          }))
      : []

    const extras = {
      peers: finnhubData?.peers || null,
      earnings: finnhubData?.earningsCal?.earningsCalendar || null,
      recommendations: finnhubData?.recommendations || null,
      finnhubMetrics: ((finnhubData?.metrics as { metric?: Record<string, number> } | null)?.metric) || null,
    }

    return NextResponse.json({ symbol, quote, summary: mergedSummary, chart, news, extras })
  } catch (err) {
    console.error('Stock data error:', err)
    return NextResponse.json({ error: 'Erreur récupération données' }, { status: 500 })
  }
}
