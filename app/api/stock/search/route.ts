import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

// yahoo-finance2 v3 requires instantiation. Types are partly broken,
// so we cast the instance to a permissive shape that mirrors the runtime.
type YF = {
  search: (q: string, opts?: { quotesCount?: number; newsCount?: number }) => Promise<{
    quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; exchDisp?: string; typeDisp?: string; quoteType?: string }>
  }>
  suppressNotices?: (n: string[]) => void
}
const YFCtor = YahooFinance as unknown as new () => YF
const yahooFinance: YF = new YFCtor()

try {
  yahooFinance.suppressNotices?.(['yahooSurvey', 'ripHistorical'])
} catch { /* ignore */ }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ results: [] })

  try {
    const res = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 })
    const results = (res.quotes || [])
      .filter((it: { symbol?: string }) => !!it.symbol)
      .map((it: {
        symbol?: string
        shortname?: string
        longname?: string
        exchange?: string
        exchDisp?: string
        typeDisp?: string
        quoteType?: string
      }) => ({
        symbol: it.symbol,
        name: it.longname || it.shortname || it.symbol,
        exchange: it.exchDisp || it.exchange,
        type: it.typeDisp || it.quoteType,
      }))
    return NextResponse.json({ results })
  } catch (err) {
    console.error('Stock search error:', err)
    return NextResponse.json({ results: [], error: 'Erreur recherche' })
  }
}
