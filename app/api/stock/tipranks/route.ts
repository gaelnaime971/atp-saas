import { NextResponse } from 'next/server'

// Unofficial TipRanks JSON endpoints used by their own public website.
// No API key required; treated as best-effort and may break.
// Cached for 5 min in-memory per ticker.

const CACHE = new Map<string, { at: number; data: unknown }>()
const TTL = 5 * 60_000

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.tipranks.com/',
      },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    // Cloudflare returns HTML challenge pages with 200 OK — bail on non-JSON
    if (!ct.includes('json')) return null
    return (await res.json()) as T
  } catch (e) {
    console.warn('TipRanks fetch failed:', url, e)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawTicker = (searchParams.get('ticker') || '').trim().toUpperCase()
  if (!rawTicker) return NextResponse.json({ error: 'ticker requis' }, { status: 400 })

  // TipRanks doesn't accept Yahoo-style suffixes (e.g. .PA, .DE).
  // Strip everything after the dot — if nothing comes back, the UI will show a graceful empty state.
  const ticker = rawTicker.split('.')[0]

  const cacheKey = ticker
  const hit = CACHE.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json(hit.data)
  }

  // Run the 4 endpoints in parallel
  const [main, insiders, hedge, news] = await Promise.all([
    safeFetch<{
      ticker?: string
      companyName?: string
      portfolioHoldingData?: {
        bestAnalystConsensus?: { consensus?: string; nB?: number; nH?: number; nS?: number; rating?: number; priceTarget?: number }
        analystConsensus?: { consensus?: string; nB?: number; nH?: number; nS?: number; rating?: number; priceTarget?: number }
        priceTarget?: number
        priceTargetCurrency?: string
        bloggerSentiment?: { bullishCount?: number; bearishCount?: number; avg?: number; bullishPercent?: number }
        insiderSentiment?: { insidersBuyingCount?: number; insidersSellingCount?: number; transactionType?: number }
        hedgeFundData?: { rating?: number; trendValue?: number; sentiment?: number }
        newsSentiment?: { buzz?: { score?: number }; sentiment?: { polarity?: number; score?: number } }
      }
      smartScore?: number
      smartScoreUpdateDate?: string
      sectorScore?: number
      ratings?: Array<{ analystId?: string; ratingDate?: string; ratingSnapshot?: string; expert?: { firmId?: string; firmName?: string; name?: string }; priceTarget?: number; numOfStars?: number }>
      experts?: Array<{ name?: string; firm?: string; numOfStars?: number; rankings?: Array<{ priceTarget?: number; ratingDate?: string; rating?: number; action?: string }> }>
    }>(`https://www.tipranks.com/api/stocks/getData/?name=${encodeURIComponent(ticker)}`),
    safeFetch<{
      insiderTransactionItems?: Array<{
        insiderName?: string; isOfficer?: boolean; isDirector?: boolean; transactionType?: string;
        amount?: number; shares?: number; date?: string; expertUid?: string;
      }>
      transactionItems?: Array<{ insiderName?: string; transactionType?: string; amount?: number; shares?: number; date?: string }>
    }>(`https://www.tipranks.com/api/stocks/getInsiders/?ticker=${encodeURIComponent(ticker)}&benchmark=hedge`),
    safeFetch<{
      activity?: Array<{ holderName?: string; value?: number; sharesChange?: number; sharesChangePercent?: number; action?: string; date?: string }>
      hedgeFundData?: { sentiment?: number; activity?: Array<{ date?: string; total?: number }> }
    }>(`https://www.tipranks.com/api/stocks/getHedgeFundActivity/?ticker=${encodeURIComponent(ticker)}`),
    safeFetch<{
      news?: Array<{ articleId?: string; title?: string; sourceName?: string; url?: string; date?: string; sentiment?: number; categoryName?: string }>
    }>(`https://www.tipranks.com/api/stocks/getNews/?ticker=${encodeURIComponent(ticker)}`),
  ])

  const data = {
    ticker,
    main,
    insiders,
    hedge,
    news,
    fetchedAt: new Date().toISOString(),
  }

  CACHE.set(cacheKey, { at: Date.now(), data })
  return NextResponse.json(data)
}
