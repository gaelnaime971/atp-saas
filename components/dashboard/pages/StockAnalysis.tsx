'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// ─────────── Types ───────────

interface SearchResult {
  symbol: string
  name: string
  exchange?: string
  type?: string
}

interface ChartPoint { t: string; c: number; v: number | null }

interface StockData {
  symbol: string
  quote: {
    symbol?: string
    shortName?: string
    longName?: string
    currency?: string
    exchange?: string
    fullExchangeName?: string
    regularMarketPrice?: number | null
    regularMarketPreviousClose?: number | null
    regularMarketChange?: number | null
    regularMarketChangePercent?: number | null
    regularMarketDayHigh?: number
    regularMarketDayLow?: number
    regularMarketVolume?: number
    marketCap?: number
    fiftyTwoWeekHigh?: number
    fiftyTwoWeekLow?: number
  } | null
  summary: {
    summaryDetail?: {
      trailingPE?: number; forwardPE?: number; beta?: number; dividendYield?: number; payoutRatio?: number;
      marketCap?: number; priceToSalesTrailing12Months?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
      averageVolume?: number; fiftyDayAverage?: number; twoHundredDayAverage?: number; currency?: string;
    }
    defaultKeyStatistics?: {
      trailingEps?: number; forwardEps?: number; priceToBook?: number; pegRatio?: number;
      enterpriseValue?: number; enterpriseToRevenue?: number; enterpriseToEbitda?: number;
      profitMargins?: number; sharesOutstanding?: number; floatShares?: number;
      heldPercentInsiders?: number; heldPercentInstitutions?: number; bookValue?: number;
    }
    financialData?: {
      currentPrice?: number; targetMeanPrice?: number; targetHighPrice?: number; targetLowPrice?: number;
      targetMedianPrice?: number; recommendationMean?: number; recommendationKey?: string;
      numberOfAnalystOpinions?: number; totalCash?: number; totalDebt?: number; totalRevenue?: number;
      debtToEquity?: number; currentRatio?: number; quickRatio?: number;
      returnOnAssets?: number; returnOnEquity?: number; freeCashflow?: number; operatingCashflow?: number;
      earningsGrowth?: number; revenueGrowth?: number; grossMargins?: number;
      ebitdaMargins?: number; operatingMargins?: number; profitMargins?: number;
    }
    summaryProfile?: { sector?: string; industry?: string; longBusinessSummary?: string; website?: string; country?: string; city?: string; fullTimeEmployees?: number }
    assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string; website?: string; country?: string }
    recommendationTrend?: { trend?: Array<{ period?: string; strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number }> }
    upgradeDowngradeHistory?: { history?: Array<{ epochGradeDate?: number | Date; firm?: string; toGrade?: string; fromGrade?: string; action?: string }> }
    earnings?: { financialsChart?: { yearly?: Array<{ date?: number | string; revenue?: number; earnings?: number }> } }
    earningsTrend?: { trend?: Array<{ period?: string; growth?: number; earningsEstimate?: { avg?: number; numberOfAnalysts?: number } }> }
    incomeStatementHistory?: { incomeStatementHistory?: Array<{ endDate?: Date | number; totalRevenue?: number; grossProfit?: number; operatingIncome?: number; netIncome?: number; ebit?: number }> }
    balanceSheetHistory?: { balanceSheetStatements?: Array<{ endDate?: Date | number; totalAssets?: number; totalLiab?: number; totalStockholderEquity?: number; cash?: number; longTermDebt?: number }> }
    cashflowStatementHistory?: { cashflowStatements?: Array<{ endDate?: Date | number; totalCashFromOperatingActivities?: number; capitalExpenditures?: number; freeCashFlow?: number; netIncome?: number }> }
    majorHoldersBreakdown?: { insidersPercentHeld?: number; institutionsPercentHeld?: number; institutionsCount?: number }
    institutionOwnership?: { ownershipList?: Array<{ organization?: string; pctHeld?: number; position?: number; value?: number }> }
    insiderTransactions?: { transactions?: Array<{ filerName?: string; transactionText?: string; startDate?: Date | number; shares?: number; value?: number }> }
  } | null
  chart: ChartPoint[]
  news: Array<{ title?: string; link?: string; publisher?: string; date?: string | null }>
  extras?: {
    peers?: string[] | null
    earnings?: Array<{ date?: string; epsActual?: number; epsEstimate?: number; revenueActual?: number; revenueEstimate?: number; quarter?: number; year?: number }> | null
    recommendations?: Array<{ buy?: number; hold?: number; period?: string; sell?: number; strongBuy?: number; strongSell?: number; symbol?: string }> | null
    finnhubMetrics?: Record<string, number> | null
  }
}

interface AiScores {
  fondamentaux?: number | null
  valorisation?: number | null
  croissance?: number | null
  profitabilite?: number | null
  sante_financiere?: number | null
  consensus?: number | null
  commentaire_fondamentaux?: string
  commentaire_valorisation?: string
  commentaire_croissance?: string
  commentaire_profitabilite?: string
  commentaire_sante_financiere?: string
  commentaire_consensus?: string
}

interface Verdict {
  verdict?: 'ACHETER' | 'CONSERVER' | 'VENDRE' | 'EVITER'
  confiance?: number
  score_global?: number
  horizon?: string
  resume?: string
  these_bull?: string[]
  these_bear?: string[]
  risques_cles?: string[]
  catalyseurs?: string[]
  valorisation?: string
  qualite_business?: string
  sante_financiere?: string
  techniques?: string
  consensus_global?: string
  profil_investisseur?: string
}

type Period = '1mo' | '3mo' | '6mo' | '1y' | '5y'
type Tab = 'synthese' | 'graphique' | 'fondamentaux' | 'valorisation' | 'consensus' | 'insiders' | 'news' | 'ai'

// ─────────── Helpers ───────────

const GREEN = '#22c55e'
const RED = '#ef4444'
const YELLOW = '#f59e0b'
const BLUE = '#3b82f6'
const PURPLE = '#a855f7'
const GREY = '#6b7280'

const fmtMoney = (n: number | null | undefined, ccy = 'USD'): string =>
  n == null || isNaN(n) ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 2 }).format(n)
const fmtBig = (n: number | null | undefined, ccy = ''): string => {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}${ccy ? ' ' + ccy : ''} T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}${ccy ? ' ' + ccy : ''} Md`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}${ccy ? ' ' + ccy : ''} M`
  return new Intl.NumberFormat('fr-FR').format(n) + (ccy ? ' ' + ccy : '')
}
const fmtPct = (n: number | null | undefined, decimals = 1): string =>
  n == null || isNaN(n) ? '—' : `${(n * 100).toFixed(decimals)}%`
const fmtNum = (n: number | null | undefined, decimals = 2): string =>
  n == null || isNaN(n) ? '—' : n.toFixed(decimals)
const fmtDate = (v: string | number | Date | null | undefined): string => {
  if (!v) return '—'
  try {
    const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function recoLabel(mean: number | null | undefined): { label: string; color: string; bg: string } {
  if (mean == null) return { label: '—', color: 'var(--text3)', bg: 'var(--bg3)' }
  if (mean < 1.7) return { label: 'STRONG BUY', color: GREEN, bg: 'rgba(34,197,94,0.18)' }
  if (mean < 2.4) return { label: 'BUY', color: GREEN, bg: 'rgba(34,197,94,0.12)' }
  if (mean < 3.4) return { label: 'HOLD', color: YELLOW, bg: 'rgba(245,158,11,0.12)' }
  if (mean < 4.4) return { label: 'SELL', color: RED, bg: 'rgba(239,68,68,0.12)' }
  return { label: 'STRONG SELL', color: RED, bg: 'rgba(239,68,68,0.18)' }
}

function verdictStyle(v?: Verdict['verdict']): { color: string; bg: string; border: string } {
  switch (v) {
    case 'ACHETER': return { color: GREEN, bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.45)' }
    case 'CONSERVER': return { color: YELLOW, bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.45)' }
    case 'VENDRE': return { color: RED, bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)' }
    case 'EVITER': return { color: RED, bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.6)' }
    default: return { color: 'var(--text3)', bg: 'var(--bg3)', border: 'var(--border)' }
  }
}

function scoreColor(s: number | null | undefined): string {
  if (s == null) return GREY
  if (s >= 75) return GREEN
  if (s >= 50) return YELLOW
  return RED
}

function computePerformance(chart: ChartPoint[]): Record<'1d' | '1w' | '1mo' | '3mo' | '6mo' | 'ytd' | '1y' | '5y', number | null> {
  if (!chart.length) return { '1d': null, '1w': null, '1mo': null, '3mo': null, '6mo': null, ytd: null, '1y': null, '5y': null }
  const last = chart[chart.length - 1]
  const lastDate = new Date(last.t)
  const findClosest = (target: Date) => {
    let best: ChartPoint | null = null
    let bestDiff = Infinity
    for (const p of chart) {
      const diff = Math.abs(new Date(p.t).getTime() - target.getTime())
      if (diff < bestDiff) { bestDiff = diff; best = p }
    }
    return best
  }
  const ago = (days: number) => {
    const d = new Date(lastDate)
    d.setDate(d.getDate() - days)
    return findClosest(d)
  }
  const ytdStart = findClosest(new Date(lastDate.getFullYear(), 0, 1))
  const pct = (p: ChartPoint | null) => p && p.c ? ((last.c - p.c) / p.c) * 100 : null
  return {
    '1d': chart.length >= 2 ? pct(chart[chart.length - 2]) : null,
    '1w': pct(ago(7)),
    '1mo': pct(ago(30)),
    '3mo': pct(ago(91)),
    '6mo': pct(ago(182)),
    ytd: pct(ytdStart),
    '1y': pct(ago(365)),
    '5y': pct(ago(1825)),
  }
}

function rangeFrom(chart: ChartPoint[], days: number): { lo: number; hi: number; current: number; pct: number } | null {
  if (!chart.length) return null
  const cutoff = new Date(chart[chart.length - 1].t).getTime() - days * 86400_000
  const slice = chart.filter(p => new Date(p.t).getTime() >= cutoff)
  if (!slice.length) return null
  const closes = slice.map(p => p.c)
  const lo = Math.min(...closes)
  const hi = Math.max(...closes)
  const current = chart[chart.length - 1].c
  const pct = hi === lo ? 50 : ((current - lo) / (hi - lo)) * 100
  return { lo, hi, current, pct: Math.max(0, Math.min(100, pct)) }
}

function sma(chart: ChartPoint[], n: number): Array<ChartPoint & { sma: number | null }> {
  return chart.map((p, i) => {
    if (i < n - 1) return { ...p, sma: null }
    const sum = chart.slice(i - n + 1, i + 1).reduce((a, b) => a + b.c, 0)
    return { ...p, sma: sum / n }
  })
}

// ─────────── Component ───────────

export default function StockAnalysis() {
  const [symbol, setSymbol] = useState<string | null>(null)
  const [symbolName, setSymbolName] = useState<string | null>(null)
  const [data, setData] = useState<StockData | null>(null)
  const [longChart, setLongChart] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<Period>('6mo')
  const [tab, setTab] = useState<Tab>('synthese')

  // AI states
  const [scores, setScores] = useState<AiScores | null>(null)
  const [loadingScores, setLoadingScores] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [loadingVerdict, setLoadingVerdict] = useState(false)
  const [verdictError, setVerdictError] = useState<string | null>(null)

  const loadSymbol = useCallback(async (sym: string, name?: string) => {
    setSymbol(sym)
    setSymbolName(name || null)
    setData(null)
    setLongChart([])
    setScores(null)
    setVerdict(null)
    setVerdictError(null)
    setLoading(true)
    setTab('synthese')
    setPeriod('6mo')
    try {
      const [d, long] = await Promise.all([
        fetch(`/api/stock/data?symbol=${encodeURIComponent(sym)}&period=6mo`).then(r => r.json()),
        fetch(`/api/stock/data?symbol=${encodeURIComponent(sym)}&period=5y`).then(r => r.json()),
      ])
      setData(d)
      setLongChart(long?.chart || [])
    } catch (e) {
      console.error('Load symbol failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload chart on period change (but keep long chart for performance calc)
  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    fetch(`/api/stock/data?symbol=${encodeURIComponent(symbol)}&period=${period}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [period, symbol])

  // Auto-fetch AI scores once data is available
  useEffect(() => {
    if (!data?.summary || scores || loadingScores) return
    setLoadingScores(true)
    const fin = data.summary.financialData
    const detail = data.summary.summaryDetail
    const ks = data.summary.defaultKeyStatistics
    const profile = data.summary.summaryProfile || data.summary.assetProfile
    fetch('/api/stock/ai-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: data.symbol,
        name: data.quote?.longName,
        pe: detail?.trailingPE,
        forwardPe: detail?.forwardPE,
        pb: ks?.priceToBook,
        ps: detail?.priceToSalesTrailing12Months,
        pegRatio: ks?.pegRatio,
        evEbitda: ks?.enterpriseToEbitda,
        revenueGrowth: fin?.revenueGrowth,
        earningsGrowth: fin?.earningsGrowth,
        grossMargins: fin?.grossMargins,
        operatingMargins: fin?.operatingMargins,
        ebitdaMargins: fin?.ebitdaMargins,
        profitMargins: fin?.profitMargins,
        roe: fin?.returnOnEquity,
        roa: fin?.returnOnAssets,
        debtToEquity: fin?.debtToEquity,
        currentRatio: fin?.currentRatio,
        freeCashflow: fin?.freeCashflow,
        totalCash: fin?.totalCash,
        totalDebt: fin?.totalDebt,
        recommendationMean: fin?.recommendationMean,
        recommendationKey: fin?.recommendationKey,
        numAnalysts: fin?.numberOfAnalystOpinions,
        marketCap: detail?.marketCap,
        beta: detail?.beta,
        dividendYield: detail?.dividendYield,
        sector: profile?.sector,
      }),
    })
      .then(r => r.json())
      .then(r => setScores(r.scores || null))
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingScores(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const handleGenerateVerdict = useCallback(async () => {
    if (!data?.summary) return
    setLoadingVerdict(true)
    setVerdictError(null)
    setVerdict(null)
    const fin = data.summary.financialData
    const detail = data.summary.summaryDetail
    const ks = data.summary.defaultKeyStatistics
    const profile = data.summary.summaryProfile || data.summary.assetProfile
    try {
      const r = await fetch('/api/stock/ai-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: data.symbol,
          name: data.quote?.longName || symbolName,
          price: data.quote?.regularMarketPrice,
          currency: data.quote?.currency,
          marketCap: detail?.marketCap,
          pe: detail?.trailingPE,
          forwardPe: detail?.forwardPE,
          eps: ks?.trailingEps,
          dividendYield: detail?.dividendYield,
          beta: detail?.beta,
          weekHigh52: detail?.fiftyTwoWeekHigh ?? data.quote?.fiftyTwoWeekHigh,
          weekLow52: detail?.fiftyTwoWeekLow ?? data.quote?.fiftyTwoWeekLow,
          recommendationMean: fin?.recommendationMean,
          recommendationKey: fin?.recommendationKey,
          numberOfAnalystOpinions: fin?.numberOfAnalystOpinions,
          targetMeanPrice: fin?.targetMeanPrice,
          targetHighPrice: fin?.targetHighPrice,
          targetLowPrice: fin?.targetLowPrice,
          revenueGrowth: fin?.revenueGrowth,
          earningsGrowth: fin?.earningsGrowth,
          profitMargins: fin?.profitMargins,
          operatingMargins: fin?.operatingMargins,
          returnOnEquity: fin?.returnOnEquity,
          debtToEquity: fin?.debtToEquity,
          freeCashflow: fin?.freeCashflow,
          newsTitles: (data.news || []).slice(0, 8).map(n => n.title).filter(Boolean) as string[],
          sector: profile?.sector,
          industry: profile?.industry,
          longBusinessSummary: profile?.longBusinessSummary,
        }),
      })
      const d = await r.json()
      if (!r.ok) setVerdictError(d.error || `Erreur (${r.status})`)
      else setVerdict(d.verdict || null)
    } catch (e) {
      setVerdictError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoadingVerdict(false)
    }
  }, [data, symbolName])

  useEffect(() => {
    if (tab === 'ai' && !verdict && !loadingVerdict && !verdictError && data) {
      handleGenerateVerdict()
    }
  }, [tab, data, verdict, loadingVerdict, verdictError, handleGenerateVerdict])

  return (
    <div className="space-y-2.5">
      <SearchBar onSelect={(s) => loadSymbol(s.symbol, s.name)} />

      {!symbol && <EmptyState onPick={(s, n) => loadSymbol(s, n)} />}

      {symbol && (
        <>
          <Header
            symbol={symbol}
            symbolName={symbolName}
            data={data}
            loading={loading && !data}
          />

          <TabsNav tab={tab} setTab={setTab} />

          {tab === 'synthese' && (
            <SyntheseTab
              data={data}
              longChart={longChart}
              period={period}
              setPeriod={setPeriod}
              scores={scores}
              loadingScores={loadingScores}
            />
          )}
          {tab === 'graphique' && <GraphiqueTab data={data} longChart={longChart} period={period} setPeriod={setPeriod} />}
          {tab === 'fondamentaux' && <FondamentauxTab data={data} />}
          {tab === 'valorisation' && <ValorisationTab data={data} scores={scores} />}
          {tab === 'consensus' && <ConsensusTab data={data} />}
          {tab === 'insiders' && <InsidersTab data={data} />}
          {tab === 'news' && <NewsTab data={data} />}
          {tab === 'ai' && (
            <AiTab
              verdict={verdict}
              loading={loadingVerdict}
              error={verdictError}
              onRegenerate={handleGenerateVerdict}
              hasData={!!data}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─────────── Search bar ───────────

function SearchBar({ onSelect }: { onSelect: (s: SearchResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/stock/search?q=${encodeURIComponent(query.trim())}`)
        const d = await r.json()
        setResults(d.results || [])
      } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const submitDirect = () => {
    const q = query.trim().toUpperCase()
    if (!q) return
    onSelect({ symbol: q, name: q })
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) { onSelect(results[0]); setOpen(false) } else submitDirect() } }}
          placeholder="Rechercher (AAPL, Apple, MC.PA, ASML.AS…) — Entrée pour valider"
          className="flex-1 bg-transparent outline-none text-xs"
          style={{ color: 'var(--text)' }}
        />
        {searching && <span className="text-[10px]" style={{ color: 'var(--text3)' }}>…</span>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-30 max-h-[420px] overflow-y-auto"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {results.map(r => (
            <button
              key={r.symbol}
              onClick={() => { onSelect(r); setOpen(false) }}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:opacity-80 transition-all text-left"
              style={{ background: 'transparent', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  {r.symbol} <span className="text-xs font-medium" style={{ color: 'var(--text3)' }}>· {r.exchange || '—'}</span>
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>{r.name}</div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>{r.type || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (sym: string, name: string) => void }) {
  const groups = [
    { label: 'US Tech', items: [['AAPL', 'Apple'], ['NVDA', 'Nvidia'], ['MSFT', 'Microsoft'], ['GOOGL', 'Alphabet'], ['META', 'Meta'], ['AMZN', 'Amazon']] },
    { label: 'France', items: [['MC.PA', 'LVMH'], ['OR.PA', "L'Oréal"], ['AIR.PA', 'Airbus'], ['SAN.PA', 'Sanofi'], ['BNP.PA', 'BNP Paribas'], ['TTE.PA', 'TotalEnergies']] },
    { label: 'Europe', items: [['ASML.AS', 'ASML'], ['SAP.DE', 'SAP'], ['SIE.DE', 'Siemens'], ['ADYEN.AS', 'Adyen'], ['NESN.SW', 'Nestlé'], ['NOVN.SW', 'Novartis']] },
  ]
  return (
    <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="text-4xl mb-3">📊</div>
      <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Analyse fondamentale d&apos;une action</h2>
      <p className="text-xs max-w-md mx-auto mb-6" style={{ color: 'var(--text3)' }}>
        Recherche un ticker pour obtenir prix, fondamentaux complets, ratings analystes,
        transactions insiders, valorisation et verdict IA.
      </p>
      <div className="space-y-3 max-w-2xl mx-auto">
        {groups.map(g => (
          <div key={g.label}>
            <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text3)' }}>{g.label}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {g.items.map(([s, n]) => (
                <button key={s} onClick={() => onPick(s, n)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
                  <span style={{ color: 'var(--text)' }}>{s}</span> · {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────── Header ───────────

function Header({ symbol, symbolName, data, loading }: { symbol: string; symbolName: string | null; data: StockData | null; loading: boolean }) {
  const quote = data?.quote
  const sum = data?.summary
  const profile = sum?.summaryProfile || sum?.assetProfile
  const ccy = quote?.currency || sum?.summaryDetail?.currency || 'USD'
  const price = quote?.regularMarketPrice ?? sum?.financialData?.currentPrice ?? null
  const change = quote?.regularMarketChange ?? null
  const changePct = quote?.regularMarketChangePercent ?? null
  const positive = (change ?? 0) >= 0
  const name = quote?.longName || quote?.shortName || symbolName || symbol
  const initial = (name || symbol).trim().charAt(0).toUpperCase()

  return (
    <div className="rounded-lg px-3 py-2 sticky top-0 z-20" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)' }}>
      {loading ? (
        <div className="text-center py-2 text-xs" style={{ color: 'var(--text3)' }}>Chargement…</div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-extrabold shrink-0"
              style={{ background: 'rgba(34,197,94,0.12)', color: GREEN, border: '1px solid rgba(34,197,94,0.3)' }}>
              {initial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                <span className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>{symbol}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                  {quote?.fullExchangeName || quote?.exchange || '—'}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>{ccy}</span>
              </div>
              <div className="text-xs font-medium leading-tight" style={{ color: 'var(--text2)' }}>
                {name}
                {profile?.sector && (
                  <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
                    · {profile.sector}{profile.industry ? ` · ${profile.industry}` : ''}{profile.country ? ` · ${profile.country}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: price + KPIs */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <div className="text-2xl font-extrabold leading-none" style={{ color: 'var(--text)' }}>{fmtMoney(price, ccy)}</div>
              <div className="text-xs font-bold leading-tight mt-0.5" style={{ color: positive ? GREEN : RED }}>
                {positive ? '▲' : '▼'} {fmtMoney(Math.abs(change ?? 0), ccy)} ({changePct != null ? `${positive ? '+' : ''}${changePct.toFixed(2)}%` : '—'})
              </div>
            </div>
            <InlineKpi label="Cap" value={fmtBig(sum?.summaryDetail?.marketCap ?? quote?.marketCap, ccy)} />
            <InlineKpi label="P/E" value={fmtNum(sum?.summaryDetail?.trailingPE)} />
            <InlineKpi label="Divid." value={fmtPct(sum?.summaryDetail?.dividendYield)} />
            <InlineKpi label="Beta" value={fmtNum(sum?.summaryDetail?.beta)} />
            <InlineKpi label="EPS" value={fmtNum(sum?.defaultKeyStatistics?.trailingEps)} />
            <InlineKpi label="52w" value={`${fmtNum(quote?.fiftyTwoWeekLow, 0)} / ${fmtNum(quote?.fiftyTwoWeekHigh, 0)}`} />
          </div>
        </div>
      )}
    </div>
  )
}

function InlineKpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="text-[9px] uppercase tracking-wider font-bold leading-tight" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-xs font-extrabold leading-tight" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

// ─────────── Tabs ───────────

function TabsNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'synthese', label: 'Synthèse', icon: '📊' },
    { id: 'graphique', label: 'Graphique', icon: '📈' },
    { id: 'fondamentaux', label: 'Fondamentaux', icon: '💼' },
    { id: 'valorisation', label: 'Valorisation', icon: '⚖️' },
    { id: 'consensus', label: 'Consensus', icon: '🎯' },
    { id: 'insiders', label: 'Insiders', icon: '👥' },
    { id: 'news', label: 'Actualités', icon: '📰' },
    { id: 'ai', label: 'Verdict IA', icon: '🤖' },
  ]
  return (
    <div className="flex gap-0.5 p-0.5 rounded-md overflow-x-auto sticky top-[5rem] z-10"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)', backdropFilter: 'blur(10px)' }}>
      {tabs.map(t => {
        const active = tab === t.id
        return (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold transition-all whitespace-nowrap"
            style={{
              background: active ? 'var(--bg)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
              border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
            }}>
            <span className="text-[10px]">{t.icon}</span>{t.label}
          </button>
        )
      })}
    </div>
  )
}

// ─────────── Reusable ───────────

function Section({ title, right, children, padding = true, dense = false }: { title?: string; right?: React.ReactNode; children: React.ReactNode; padding?: boolean; dense?: boolean }) {
  return (
    <div className="rounded-lg" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text)' }}>{title}</h3>
          {right}
        </div>
      )}
      <div className={padding ? (dense ? 'p-2' : 'p-2.5') : ''}>{children}</div>
    </div>
  )
}

function Stat({ label, value, sub, color = 'var(--text)' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="text-[9px] uppercase tracking-wider font-bold leading-tight" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-xs font-extrabold leading-tight mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] leading-tight" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

function MarginBar({ label, value, max = 1 }: { label: string; value: number | null | undefined; max?: number }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value / max))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider w-24 shrink-0" style={{ color: 'var(--text3)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg3)' }}>
        <div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: value != null && value > 0 ? GREEN : RED }} />
      </div>
      <span className="text-[11px] font-extrabold tabular-nums w-12 text-right" style={{ color: value != null && value > 0 ? GREEN : value != null && value < 0 ? RED : 'var(--text)' }}>
        {fmtPct(value, 0)}
      </span>
    </div>
  )
}

// Recharts ContentProps types are complex generics — keep this loose.
type TooltipEntry = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown }
function ChartTooltip(props: { active?: boolean; payload?: ReadonlyArray<TooltipEntry>; label?: unknown; ccy?: string } & Record<string, unknown>) {
  const { active, payload, label, ccy = 'USD' } = props
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
      <div className="text-[10px] mb-1" style={{ color: 'var(--text3)' }}>{String(label ?? '')}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{String(p.name ?? '')}:</span>
          <span className="font-bold" style={{ color: 'var(--text)' }}>
            {typeof p.value === 'number' ? fmtMoney(p.value, ccy) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}
// Loose alias to satisfy Recharts' generic Tooltip `content` prop.
const ChartTooltipAny = ChartTooltip as unknown as (props: object) => React.JSX.Element | null

// ─────────── Synthèse tab ───────────

function SyntheseTab({
  data, longChart, period, setPeriod, scores, loadingScores,
}: {
  data: StockData | null; longChart: ChartPoint[]
  period: Period; setPeriod: (p: Period) => void
  scores: AiScores | null; loadingScores: boolean
}) {
  const ccy = data?.quote?.currency || data?.summary?.summaryDetail?.currency || 'USD'
  const chart = data?.chart || []
  const sum = data?.summary
  const detail = sum?.summaryDetail
  const ks = sum?.defaultKeyStatistics
  const fin = sum?.financialData
  const positive = (data?.quote?.regularMarketChange ?? 0) >= 0
  const profile = sum?.summaryProfile || sum?.assetProfile

  const perf = useMemo(() => computePerformance(longChart.length ? longChart : chart), [longChart, chart])
  const ranges = useMemo(() => {
    const src = longChart.length ? longChart : chart
    return {
      '1sem': rangeFrom(src, 7),
      '1mo': rangeFrom(src, 30),
      'ytd': (() => {
        if (!src.length) return null
        const yearStart = new Date(new Date(src[src.length - 1].t).getFullYear(), 0, 1).getTime()
        const slice = src.filter(p => new Date(p.t).getTime() >= yearStart)
        if (!slice.length) return null
        const closes = slice.map(p => p.c)
        const lo = Math.min(...closes), hi = Math.max(...closes)
        const current = src[src.length - 1].c
        return { lo, hi, current, pct: hi === lo ? 50 : Math.max(0, Math.min(100, ((current - lo) / (hi - lo)) * 100)) }
      })(),
      '1y': rangeFrom(src, 365),
      '3y': rangeFrom(src, 365 * 3),
    }
  }, [longChart, chart])

  const reco = recoLabel(fin?.recommendationMean)

  return (
    <div className="space-y-2.5">
      {/* Row 1: chart (3 cols) + consensus express + 4 KPI compact (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2.5">
        <div className="lg:col-span-3">
          <Section
            title={`Cours · ${period}`}
            right={
              <div className="flex gap-0.5 p-0.5 rounded" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                {(['1mo', '3mo', '6mo', '1y', '5y'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold transition-all"
                    style={{
                      background: period === p ? 'var(--bg)' : 'transparent',
                      color: period === p ? 'var(--text)' : 'var(--text3)',
                      cursor: 'pointer',
                    }}>{p}</button>
                ))}
              </div>
            }
          >
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={positive ? GREEN : RED} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={positive ? GREEN : RED} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} domain={['auto', 'auto']} width={45} />
                  <Tooltip content={ChartTooltipAny as never} />
                  <Area type="monotone" dataKey="c" stroke={positive ? GREEN : RED} strokeWidth={1.5} fill="url(#priceGrad)" name="Prix" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        <Section title="Consensus" padding={false}>
          <div className="p-2 space-y-1.5">
            <div className="text-center rounded p-2" style={{ background: reco.bg, border: `1px solid ${reco.color}33` }}>
              <div className="text-base font-extrabold" style={{ color: reco.color }}>{reco.label}</div>
              <div className="text-[9px]" style={{ color: 'var(--text3)' }}>
                {fin?.recommendationMean != null ? `${fin.recommendationMean.toFixed(2)}/5` : '—'} · {fin?.numberOfAnalystOpinions ?? 0} analystes
              </div>
            </div>
            {fin?.targetMeanPrice != null && (
              <div className="rounded p-1.5 text-center" style={{ background: 'var(--bg3)' }}>
                <div className="text-[9px] uppercase tracking-wider leading-tight" style={{ color: 'var(--text3)' }}>Objectif moyen</div>
                <div className="text-sm font-extrabold leading-tight" style={{ color: GREEN }}>{fmtMoney(fin.targetMeanPrice, ccy)}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1">
              <Stat label="ROE" value={fmtPct(fin?.returnOnEquity)} color={(fin?.returnOnEquity ?? 0) > 0.15 ? GREEN : 'var(--text)'} />
              <Stat label="Marge nette" value={fmtPct(fin?.profitMargins)} color={(fin?.profitMargins ?? 0) > 0.1 ? GREEN : 'var(--text)'} />
              <Stat label="Croiss. rev." value={fmtPct(fin?.revenueGrowth)} color={(fin?.revenueGrowth ?? 0) > 0 ? GREEN : RED} />
              <Stat label="Croiss. EPS" value={fmtPct(fin?.earningsGrowth)} color={(fin?.earningsGrowth ?? 0) > 0 ? GREEN : RED} />
            </div>
          </div>
        </Section>
      </div>

      {/* Row 2: KPI strip — 8 columns */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
        <Stat label="Cap" value={fmtBig(detail?.marketCap, ccy)} />
        <Stat label="P/E" value={fmtNum(detail?.trailingPE)} />
        <Stat label="P/E fwd" value={fmtNum(detail?.forwardPE)} />
        <Stat label="P/B" value={fmtNum(ks?.priceToBook)} />
        <Stat label="P/S" value={fmtNum(detail?.priceToSalesTrailing12Months)} />
        <Stat label="PEG" value={fmtNum(ks?.pegRatio)} />
        <Stat label="EV/EBITDA" value={fmtNum(ks?.enterpriseToEbitda)} />
        <Stat label="EPS" value={fmtNum(ks?.trailingEps)} />
        <Stat label="Dividende" value={fmtPct(detail?.dividendYield)} />
        <Stat label="Beta" value={fmtNum(detail?.beta)} />
        <Stat label="ROE" value={fmtPct(fin?.returnOnEquity)} color={(fin?.returnOnEquity ?? 0) > 0.15 ? GREEN : 'var(--text)'} />
        <Stat label="ROA" value={fmtPct(fin?.returnOnAssets)} color={(fin?.returnOnAssets ?? 0) > 0.05 ? GREEN : 'var(--text)'} />
        <Stat label="Marge brute" value={fmtPct(fin?.grossMargins)} />
        <Stat label="Marge op." value={fmtPct(fin?.operatingMargins)} />
        <Stat label="Marge nette" value={fmtPct(fin?.profitMargins)} color={(fin?.profitMargins ?? 0) > 0.1 ? GREEN : 'var(--text)'} />
        <Stat label="Vol. moy." value={fmtBig(detail?.averageVolume)} />
      </div>

      {/* Row 3: Performances + Range bars (compact) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <Section title="Performances">
          <div className="space-y-1">
            {([['1d', '1 jour'], ['1w', '1 semaine'], ['1mo', '1 mois'], ['3mo', '3 mois'], ['6mo', '6 mois'], ['ytd', 'YTD'], ['1y', '1 an'], ['5y', '5 ans']] as const).map(([k, label]) => {
              const v = perf[k]
              const pct = v == null ? 0 : Math.max(-100, Math.min(100, v))
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold w-16 shrink-0" style={{ color: 'var(--text2)' }}>{label}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden relative" style={{ background: 'var(--bg3)' }}>
                    {v != null && (
                      <div className="absolute top-0 h-full"
                        style={{
                          width: `${Math.abs(pct) / 2}%`,
                          background: v >= 0 ? GREEN : RED,
                          left: v >= 0 ? '50%' : `${50 - Math.abs(pct) / 2}%`,
                        }} />
                    )}
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--border)' }} />
                  </div>
                  <span className="text-[10px] font-bold w-14 text-right tabular-nums" style={{ color: v == null ? 'var(--text3)' : v >= 0 ? GREEN : RED }}>
                    {v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Extrêmes de cours">
          <div className="space-y-1.5">
            {([['1sem', '1 semaine'], ['1mo', '1 mois'], ['ytd', 'YTD'], ['1y', '1 an'], ['3y', '3 ans']] as const).map(([k, label]) => {
              const r = ranges[k]
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold w-16 shrink-0" style={{ color: 'var(--text2)' }}>{label}</span>
                  {!r ? (
                    <span className="text-[10px] flex-1" style={{ color: 'var(--text3)' }}>—</span>
                  ) : (
                    <>
                      <span className="text-[10px] tabular-nums shrink-0" style={{ color: RED }}>{fmtNum(r.lo, 0)}</span>
                      <div className="flex-1 h-2 rounded-full relative" style={{ background: 'var(--bg3)' }}>
                        <div className="absolute h-full rounded-full" style={{ width: '100%', background: 'linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)', opacity: 0.35 }} />
                        <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full -translate-y-1/2 -translate-x-1/2"
                          style={{ left: `${r.pct}%`, background: '#fff', border: `2px solid ${GREEN}`, boxShadow: `0 0 4px rgba(34,197,94,0.5)` }} />
                      </div>
                      <span className="text-[10px] tabular-nums shrink-0" style={{ color: GREEN }}>{fmtNum(r.hi, 0)}</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      {/* Row 4: Radar IA + commentaires (compact 2-col layout) */}
      <Section title="Notation IA · 6 axes" right={loadingScores ? <span className="text-[10px]" style={{ color: 'var(--text3)' }}>…</span> : null}>
        {scores ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="md:col-span-2" style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={[
                  { axis: 'Fonda.', value: scores.fondamentaux ?? 0 },
                  { axis: 'Valo.', value: scores.valorisation ?? 0 },
                  { axis: 'Croiss.', value: scores.croissance ?? 0 },
                  { axis: 'Profit.', value: scores.profitabilite ?? 0 },
                  { axis: 'Santé', value: scores.sante_financiere ?? 0 },
                  { axis: 'Cons.', value: scores.consensus ?? 0 },
                ]} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'var(--text2)' }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fill: 'var(--text3)' }} />
                  <Radar dataKey="value" stroke={GREEN} fill={GREEN} fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {([
                ['fondamentaux', 'Fondamentaux', scores.commentaire_fondamentaux],
                ['valorisation', 'Valorisation', scores.commentaire_valorisation],
                ['croissance', 'Croissance', scores.commentaire_croissance],
                ['profitabilite', 'Profitabilité', scores.commentaire_profitabilite],
                ['sante_financiere', 'Santé financière', scores.commentaire_sante_financiere],
                ['consensus', 'Consensus', scores.commentaire_consensus],
              ] as const).map(([k, label, comment]) => {
                const v = scores[k] as number | null | undefined
                return (
                  <div key={k} className="rounded px-2 py-1.5" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[9px] uppercase tracking-wider font-bold leading-tight" style={{ color: 'var(--text2)' }}>{label}</span>
                      <span className="text-sm font-extrabold leading-tight" style={{ color: scoreColor(v) }}>
                        {v != null ? `${Math.round(v)}` : '—'}<span className="text-[9px]" style={{ color: 'var(--text3)' }}>/100</span>
                      </span>
                    </div>
                    {comment && <div className="text-[10px] leading-snug" style={{ color: 'var(--text3)' }}>{comment}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ) : loadingScores ? (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--text3)' }}>L&apos;IA analyse les données…</div>
        ) : (
          <div className="text-center py-8 text-xs italic" style={{ color: 'var(--text3)' }}>Notation indisponible</div>
        )}
      </Section>

      {/* About — compact */}
      {profile?.longBusinessSummary && profile.longBusinessSummary.length > 30 && (
        <Section title="À propos">
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text2)' }}>{profile.longBusinessSummary}</p>
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noopener noreferrer"
              className="text-[10px] mt-1 inline-block" style={{ color: GREEN }}>{profile.website} ↗</a>
          )}
        </Section>
      )}
    </div>
  )
}

// ─────────── Graphique tab ───────────

function GraphiqueTab({ data, longChart, period, setPeriod }: { data: StockData | null; longChart: ChartPoint[]; period: Period; setPeriod: (p: Period) => void }) {
  const ccy = data?.quote?.currency || 'USD'
  const chart = data?.chart || []
  const [showSma20, setShowSma20] = useState(false)
  const [showSma50, setShowSma50] = useState(true)
  const [showSma200, setShowSma200] = useState(false)

  const withSma = useMemo(() => {
    let series: Array<ChartPoint & { sma20?: number | null; sma50?: number | null; sma200?: number | null }> = chart.map(p => ({ ...p }))
    if (showSma20) series = sma(series, 20).map((p, i) => ({ ...series[i], sma20: p.sma }))
    if (showSma50) series = sma(series, 50).map((p, i) => ({ ...series[i], sma50: p.sma }))
    if (showSma200) {
      const src = longChart.length > chart.length ? longChart : chart
      const longSma = sma(src, 200)
      const map = new Map(longSma.map(p => [p.t, p.sma]))
      series = series.map(p => ({ ...p, sma200: map.get(p.t) ?? null }))
    }
    return series
  }, [chart, showSma20, showSma50, showSma200, longChart])

  return (
    <div className="space-y-2.5">
      <Section
        title={`Graphique · ${period}`}
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <SmaToggle label="SMA 20" color={BLUE} on={showSma20} set={setShowSma20} />
              <SmaToggle label="SMA 50" color={YELLOW} on={showSma50} set={setShowSma50} />
              <SmaToggle label="SMA 200" color={PURPLE} on={showSma200} set={setShowSma200} />
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              {(['1mo', '3mo', '6mo', '1y', '5y'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className="px-2 py-1 rounded-md text-[10px] font-bold transition-all"
                  style={{ background: period === p ? 'var(--bg)' : 'transparent', color: period === p ? 'var(--text)' : 'var(--text3)', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          </div>
        }
      >
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={withSma}>
              <defs>
                <linearGradient id="priceGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--text3)' }} tickFormatter={v => v.slice(5)} />
              <YAxis yAxisId="price" tick={{ fontSize: 10, fill: 'var(--text3)' }} domain={['auto', 'auto']} />
              <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
              <Tooltip content={ChartTooltipAny as never} />
              <Bar yAxisId="vol" dataKey="v" fill={GREY} opacity={0.25} name="Volume" />
              <Area yAxisId="price" type="monotone" dataKey="c" stroke={GREEN} strokeWidth={2} fill="url(#priceGrad2)" name="Prix" />
              {showSma20 && <Line yAxisId="price" type="monotone" dataKey="sma20" stroke={BLUE} strokeWidth={1.5} dot={false} name="SMA 20" />}
              {showSma50 && <Line yAxisId="price" type="monotone" dataKey="sma50" stroke={YELLOW} strokeWidth={1.5} dot={false} name="SMA 50" />}
              {showSma200 && <Line yAxisId="price" type="monotone" dataKey="sma200" stroke={PURPLE} strokeWidth={1.5} dot={false} name="SMA 200" />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[10px] mt-3" style={{ color: 'var(--text3)' }}>
          Vue technique avancée :{' '}
          <a href={`https://www.tradingview.com/symbols/${encodeURIComponent(data?.symbol || '')}/`} target="_blank" rel="noopener noreferrer" style={{ color: GREEN }}>TradingView ↗</a>
        </div>
      </Section>
    </div>
  )
}

function SmaToggle({ label, color, on, set }: { label: string; color: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)}
      className="px-2 py-1 rounded text-[10px] font-bold transition-all"
      style={{
        background: on ? `${color}22` : 'transparent',
        color: on ? color : 'var(--text3)',
        border: `1px solid ${on ? color : 'var(--border)'}`,
        cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}

// ─────────── Fondamentaux tab ───────────

function FondamentauxTab({ data }: { data: StockData | null }) {
  const ccy = data?.quote?.currency || 'USD'
  const sum = data?.summary
  const fin = sum?.financialData
  const detail = sum?.summaryDetail
  const ks = sum?.defaultKeyStatistics
  const income = sum?.incomeStatementHistory?.incomeStatementHistory || []
  const balance = sum?.balanceSheetHistory?.balanceSheetStatements || []
  const cashflow = sum?.cashflowStatementHistory?.cashflowStatements || []
  const earnings = sum?.earnings?.financialsChart?.yearly || []

  return (
    <div className="space-y-2.5">
      {/* Top row: profitability (bars) + croissance + rentabilité */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <Section title="Profitabilité">
          <div className="space-y-2">
            <MarginBar label="Brute" value={fin?.grossMargins} />
            <MarginBar label="Opérationnelle" value={fin?.operatingMargins} />
            <MarginBar label="EBITDA" value={fin?.ebitdaMargins} />
            <MarginBar label="Nette" value={fin?.profitMargins} />
          </div>
        </Section>

        <Section title="Croissance">
          <div className="grid grid-cols-2 gap-2">
            <GaugeStat label="Revenus YoY" value={fin?.revenueGrowth} />
            <GaugeStat label="Bénéfices YoY" value={fin?.earningsGrowth} />
          </div>
        </Section>

        <Section title="Rentabilité">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="ROE" value={fmtPct(fin?.returnOnEquity)} color={(fin?.returnOnEquity ?? 0) > 0.15 ? GREEN : 'var(--text)'} />
            <Stat label="ROA" value={fmtPct(fin?.returnOnAssets)} color={(fin?.returnOnAssets ?? 0) > 0.05 ? GREEN : 'var(--text)'} />
          </div>
        </Section>
      </div>

      {/* Middle row: endettement + trésorerie + valorisation entreprise */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <Section title="Endettement">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Debt / Equity" value={fmtNum(fin?.debtToEquity)} color={(fin?.debtToEquity ?? 0) > 200 ? RED : (fin?.debtToEquity ?? 0) > 100 ? YELLOW : GREEN} />
            <Stat label="Current ratio" value={fmtNum(fin?.currentRatio)} color={(fin?.currentRatio ?? 0) > 1.5 ? GREEN : (fin?.currentRatio ?? 0) > 1 ? YELLOW : RED} />
            <Stat label="Quick ratio" value={fmtNum(fin?.quickRatio)} />
            <Stat label="Dette totale" value={fmtBig(fin?.totalDebt, ccy)} />
          </div>
        </Section>

        <Section title="Trésorerie">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Trésorerie" value={fmtBig(fin?.totalCash, ccy)} />
            <Stat label="Free Cash Flow" value={fmtBig(fin?.freeCashflow, ccy)} />
            <Stat label="Cash flow op." value={fmtBig(fin?.operatingCashflow, ccy)} />
            <Stat label="Revenus totaux" value={fmtBig(fin?.totalRevenue, ccy)} />
          </div>
        </Section>

        <Section title="Valorisation entreprise">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Enterprise Value" value={fmtBig(ks?.enterpriseValue, ccy)} />
            <Stat label="EV / EBITDA" value={fmtNum(ks?.enterpriseToEbitda)} />
            <Stat label="EV / Sales" value={fmtNum(ks?.enterpriseToRevenue)} />
            <Stat label="P/B" value={fmtNum(ks?.priceToBook)} />
            <Stat label="Book value" value={fmtNum(ks?.bookValue)} />
            <Stat label="PEG" value={fmtNum(ks?.pegRatio)} />
          </div>
        </Section>
      </div>

      {/* Revenue & Earnings chart */}
      {earnings.length > 0 && (
        <Section title="Revenus & Bénéfices par année">
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnings.map(e => ({ year: String(e.date), revenue: e.revenue, earnings: e.earnings }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={v => `${(v / 1e9).toFixed(0)}Md`} width={45} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const n = typeof value === 'number' ? value : Number(value)
                    return [fmtBig(n, ccy), name === 'revenue' ? 'Revenus' : 'Bénéfices']
                  }}
                  contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="revenue" fill={GREEN} name="Revenus" />
                <Bar dataKey="earnings" fill={BLUE} name="Bénéfices" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Financial statements — 3 columns */}
      {(income.length > 0 || balance.length > 0 || cashflow.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          {income.length > 0 && (
            <Section title="Compte de résultat">
              <FinancialTable ccy={ccy} rows={[
                { k: 'Revenus', f: (y: typeof income[number]) => y.totalRevenue },
                { k: 'Bénéf. brut', f: (y) => y.grossProfit },
                { k: 'EBIT', f: (y) => y.ebit },
                { k: 'Rés. op.', f: (y) => y.operatingIncome },
                { k: 'Rés. net', f: (y) => y.netIncome },
              ]} data={income.slice(0, 4)} />
            </Section>
          )}
          {balance.length > 0 && (
            <Section title="Bilan">
              <FinancialTable ccy={ccy} rows={[
                { k: 'Actifs', f: (b: typeof balance[number]) => b.totalAssets },
                { k: 'Trésorerie', f: (b) => b.cash },
                { k: 'Passif', f: (b) => b.totalLiab },
                { k: 'Dette LT', f: (b) => b.longTermDebt },
                { k: 'Capit. propres', f: (b) => b.totalStockholderEquity },
              ]} data={balance.slice(0, 4)} />
            </Section>
          )}
          {cashflow.length > 0 && (
            <Section title="Cash flow">
              <FinancialTable ccy={ccy} rows={[
                { k: 'CF op.', f: (c: typeof cashflow[number]) => c.totalCashFromOperatingActivities },
                { k: 'CapEx', f: (c) => c.capitalExpenditures },
                { k: 'FCF', f: (c) => c.freeCashFlow },
                { k: 'Rés. net', f: (c) => c.netIncome },
              ]} data={cashflow.slice(0, 4)} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function GaugeStat({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value == null ? 0 : value * 100
  const positive = v >= 0
  return (
    <div className="rounded-md px-2 py-1.5 text-center" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
      <div className="text-[9px] uppercase tracking-wider font-bold leading-tight" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-lg font-extrabold leading-tight mt-0.5" style={{ color: value == null ? 'var(--text3)' : positive ? GREEN : RED }}>
        {value == null ? '—' : `${positive ? '+' : ''}${v.toFixed(1)}%`}
      </div>
      {value != null && (
        <div className="mt-1 h-1 rounded-full overflow-hidden relative" style={{ background: 'var(--bg2)' }}>
          <div className="absolute top-0 h-full"
            style={{
              width: `${Math.min(50, Math.abs(v) / 2)}%`,
              background: positive ? GREEN : RED,
              left: positive ? '50%' : `${50 - Math.min(50, Math.abs(v) / 2)}%`,
            }} />
          <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--border)' }} />
        </div>
      )}
    </div>
  )
}

interface FinTableRow<T> { k: string; f: (y: T) => number | undefined }
function FinancialTable<T extends { endDate?: Date | number }>({ rows, data, ccy }: { rows: FinTableRow<T>[]; data: T[]; ccy: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ color: 'var(--text3)' }}>
            <th className="text-left py-1 font-bold text-[9px] uppercase tracking-wider"></th>
            {data.map((y, i) => {
              const d = y.endDate instanceof Date ? y.endDate : (typeof y.endDate === 'number' ? new Date(y.endDate * 1000) : null)
              return (
                <th key={i} className="text-right py-1 font-bold text-[9px] uppercase tracking-wider">{d ? d.getFullYear() : '—'}</th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td className="py-1 font-semibold" style={{ color: 'var(--text2)' }}>{row.k}</td>
              {data.map((y, j) => (
                <td key={j} className="text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmtBig(row.f(y), ccy)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────── Valorisation tab ───────────

function ValorisationTab({ data, scores }: { data: StockData | null; scores: AiScores | null }) {
  const ccy = data?.quote?.currency || 'USD'
  const sum = data?.summary
  const detail = sum?.summaryDetail
  const ks = sum?.defaultKeyStatistics
  const fin = sum?.financialData

  const valoScore = scores?.valorisation
  const gaugeColor = valoScore == null ? GREY : valoScore >= 70 ? GREEN : valoScore >= 40 ? YELLOW : RED
  const gaugeLabel = valoScore == null ? '—' : valoScore >= 70 ? 'Sous-valorisée' : valoScore >= 40 ? 'Correctement valorisée' : 'Sur-valorisée'

  return (
    <div className="space-y-2.5">
      <Section title="Ratios de valorisation">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="P/E trailing" value={fmtNum(detail?.trailingPE)} />
          <Stat label="P/E forward" value={fmtNum(detail?.forwardPE)} />
          <Stat label="PEG" value={fmtNum(ks?.pegRatio)} />
          <Stat label="P/B" value={fmtNum(ks?.priceToBook)} />
          <Stat label="P/S" value={fmtNum(detail?.priceToSalesTrailing12Months)} />
          <Stat label="EV / EBITDA" value={fmtNum(ks?.enterpriseToEbitda)} />
          <Stat label="EV / Sales" value={fmtNum(ks?.enterpriseToRevenue)} />
          <Stat label="Book value" value={fmtNum(ks?.bookValue)} />
        </div>
      </Section>

      <Section title="Verdict de valorisation IA">
        <div className="text-center py-4">
          <div className="text-3xl font-extrabold mb-2" style={{ color: gaugeColor }}>{gaugeLabel}</div>
          <div className="text-sm" style={{ color: 'var(--text3)' }}>Score de valorisation : <strong style={{ color: gaugeColor }}>{valoScore != null ? `${Math.round(valoScore)}/100` : '—'}</strong></div>
          {scores?.commentaire_valorisation && (
            <p className="text-xs mt-3 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--text2)' }}>{scores.commentaire_valorisation}</p>
          )}
        </div>
      </Section>

      <Section title="Objectifs analystes">
        {fin?.targetMeanPrice != null ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Objectif bas" value={fmtMoney(fin.targetLowPrice, ccy)} color={RED} />
            <Stat label="Objectif médian" value={fmtMoney(fin.targetMedianPrice, ccy)} />
            <Stat label="Objectif moyen" value={fmtMoney(fin.targetMeanPrice, ccy)} color={GREEN} />
            <Stat label="Objectif haut" value={fmtMoney(fin.targetHighPrice, ccy)} color={GREEN} />
          </div>
        ) : (
          <div className="text-xs italic text-center py-4" style={{ color: 'var(--text3)' }}>
            Objectifs de cours indisponibles (requiert Finnhub Premium).
          </div>
        )}
      </Section>
    </div>
  )
}

// ─────────── Consensus tab ───────────

function ConsensusTab({ data }: { data: StockData | null }) {
  const fin = data?.summary?.financialData
  const trend = data?.extras?.recommendations || data?.summary?.recommendationTrend?.trend || []
  const history = data?.summary?.upgradeDowngradeHistory?.history || []
  const earningsTrend = data?.summary?.earningsTrend?.trend || []
  const reco = recoLabel(fin?.recommendationMean)

  // Donut data from latest period
  const latest = trend[0] || {}
  const donutData = [
    { name: 'Strong Buy', value: latest.strongBuy ?? 0, color: '#16a34a' },
    { name: 'Buy', value: latest.buy ?? 0, color: GREEN },
    { name: 'Hold', value: latest.hold ?? 0, color: YELLOW },
    { name: 'Sell', value: latest.sell ?? 0, color: RED },
    { name: 'Strong Sell', value: latest.strongSell ?? 0, color: '#b91c1c' },
  ].filter(d => d.value > 0)

  const totalLatest = donutData.reduce((s, d) => s + d.value, 0)

  // Evolution stacked area (reverse so oldest is left)
  const evoData = [...trend].slice(0, 6).reverse().map(t => ({
    period: t.period === '0m' ? 'Mois' : t.period === '-1m' ? '-1m' : t.period === '-2m' ? '-2m' : t.period === '-3m' ? '-3m' : (t.period || ''),
    'Strong Buy': t.strongBuy ?? 0,
    'Buy': t.buy ?? 0,
    'Hold': t.hold ?? 0,
    'Sell': t.sell ?? 0,
    'Strong Sell': t.strongSell ?? 0,
  }))

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <div className="md:col-span-2">
          <Section title="Répartition des recommandations">
            {donutData.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 items-center">
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={75} paddingAngle={2}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                        <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                      </div>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>
                        {d.value} <span className="text-[9px]" style={{ color: 'var(--text3)' }}>({((d.value / totalLatest) * 100).toFixed(0)}%)</span>
                      </span>
                    </div>
                  ))}
                  <div className="pt-1.5 mt-1.5 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
                    <div style={{ color: 'var(--text3)' }}>Total <strong style={{ color: 'var(--text)' }}>{totalLatest}</strong> analystes</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs italic text-center py-6" style={{ color: 'var(--text3)' }}>Aucune donnée de recommandation</div>
            )}
          </Section>
        </div>

        <Section title="Recommandation globale">
          <div className="text-center py-2">
            <div className="text-base font-extrabold py-1.5 px-2.5 rounded inline-block mb-2" style={{ background: reco.bg, color: reco.color }}>
              {reco.label}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Note moyenne</div>
            <div className="text-2xl font-extrabold leading-none" style={{ color: reco.color }}>
              {fin?.recommendationMean != null ? fin.recommendationMean.toFixed(2) : '—'}
              <span className="text-sm" style={{ color: 'var(--text3)' }}>/5</span>
            </div>
            <div className="text-[9px] mt-1.5" style={{ color: 'var(--text3)' }}>1=Strong Buy · 5=Strong Sell</div>
          </div>
        </Section>
      </div>

      {/* Evolution stacked */}
      {evoData.length > 1 && (
        <Section title="Évolution du consensus (4 derniers mois)">
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="Strong Buy" stackId="1" stroke="#16a34a" fill="#16a34a" />
                <Area type="monotone" dataKey="Buy" stackId="1" stroke={GREEN} fill={GREEN} />
                <Area type="monotone" dataKey="Hold" stackId="1" stroke={YELLOW} fill={YELLOW} />
                <Area type="monotone" dataKey="Sell" stackId="1" stroke={RED} fill={RED} />
                <Area type="monotone" dataKey="Strong Sell" stackId="1" stroke="#b91c1c" fill="#b91c1c" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* EPS estimates */}
      {earningsTrend.length > 0 && (
        <Section title="Prévisions de résultats (EPS)">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--text3)' }}>
                <th className="text-left py-1.5">Période</th>
                <th className="text-right py-1.5">EPS estimé</th>
                <th className="text-right py-1.5">Croissance</th>
                <th className="text-right py-1.5">Analystes</th>
              </tr>
            </thead>
            <tbody>
              {earningsTrend.slice(0, 4).map((t, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="py-2 font-semibold" style={{ color: 'var(--text2)' }}>
                    {t.period === '0q' ? 'T en cours' : t.period === '+1q' ? 'T+1' : t.period === '0y' ? 'Année en cours' : t.period === '+1y' ? 'Année +1' : t.period}
                  </td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{t.earningsEstimate?.avg?.toFixed(2) ?? '—'}</td>
                  <td className="text-right font-bold" style={{ color: (t.growth ?? 0) > 0 ? GREEN : (t.growth ?? 0) < 0 ? RED : 'var(--text3)' }}>
                    {t.growth != null ? `${(t.growth * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="text-right" style={{ color: 'var(--text3)' }}>{t.earningsEstimate?.numberOfAnalysts ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Upgrades/downgrades */}
      {history.length > 0 && (
        <Section title="Mouvements récents">
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {history
              .sort((a, b) => {
                const ea = a.epochGradeDate instanceof Date ? a.epochGradeDate.getTime() : (typeof a.epochGradeDate === 'number' ? a.epochGradeDate * 1000 : 0)
                const eb = b.epochGradeDate instanceof Date ? b.epochGradeDate.getTime() : (typeof b.epochGradeDate === 'number' ? b.epochGradeDate * 1000 : 0)
                return eb - ea
              })
              .slice(0, 15)
              .map((h, i) => {
                const up = h.action === 'up' || h.action === 'init'
                const dn = h.action === 'down'
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded" style={{ background: 'var(--bg3)' }}>
                    <span className="text-[10px] font-bold w-16 shrink-0" style={{ color: 'var(--text3)' }}>
                      {fmtDate(h.epochGradeDate as Date | number)}
                    </span>
                    <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--text2)' }}>{h.firm}</span>
                    {h.fromGrade && <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{h.fromGrade} →</span>}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: up ? 'rgba(34,197,94,0.12)' : dn ? 'rgba(239,68,68,0.12)' : 'var(--bg)',
                        color: up ? GREEN : dn ? RED : 'var(--text2)',
                      }}>
                      {h.toGrade || '—'}
                    </span>
                  </div>
                )
              })}
          </div>
        </Section>
      )}
    </div>
  )
}

// ─────────── Insiders tab ───────────

function InsidersTab({ data }: { data: StockData | null }) {
  const insiders = data?.summary?.insiderTransactions?.transactions || []
  const major = data?.summary?.majorHoldersBreakdown
  const institutions = data?.summary?.institutionOwnership?.ownershipList || []

  const buyCount = insiders.filter(t => (t.transactionText || '').toLowerCase().includes('achat') || (t.transactionText || '').toLowerCase().includes('buy')).length
  const sellCount = insiders.length - buyCount

  return (
    <div className="space-y-2.5">
      {major && (
        <Section title="Répartition du capital">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Insiders" value={fmtPct(major.insidersPercentHeld)} />
            <Stat label="Institutionnels" value={fmtPct(major.institutionsPercentHeld)} />
            <Stat label="Nb institutions" value={major.institutionsCount ?? '—'} />
          </div>
        </Section>
      )}

      {insiders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="md:col-span-1">
            <Section title="Activité insiders">
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ name: 'Achats', value: buyCount, color: GREEN }, { name: 'Ventes', value: sellCount, color: RED }]}
                      dataKey="value" cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={2}
                    >
                      <Cell fill={GREEN} />
                      <Cell fill={RED} />
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center text-[11px]" style={{ color: 'var(--text3)' }}>
                <strong style={{ color: GREEN }}>{buyCount}</strong> achats / <strong style={{ color: RED }}>{sellCount}</strong> ventes
              </div>
            </Section>
          </div>
          <div className="md:col-span-2">
            <Section title="Transactions insiders récentes">
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {insiders.slice(0, 25).map((t, i) => {
                  const buy = (t.transactionText || '').toLowerCase().includes('achat') || (t.transactionText || '').toLowerCase().includes('buy')
                  return (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: 'var(--bg3)' }}>
                      <span className="text-[10px] font-bold w-16 shrink-0 tabular-nums" style={{ color: 'var(--text3)' }}>{fmtDate(t.startDate as Date | number)}</span>
                      <span className="flex-1 text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.filerName}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: buy ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: buy ? GREEN : RED }}>
                        {buy ? 'Achat' : 'Vente'}
                      </span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text2)' }}>{fmtBig(t.value, '$')}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          </div>
        </div>
      )}

      {institutions.length > 0 && (
        <Section title="Principaux institutionnels">
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {institutions.slice(0, 20).map((o, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: 'var(--bg3)' }}>
                <span className="flex-1 text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{o.organization}</span>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text3)' }}>{fmtPct(o.pctHeld)}</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text2)' }}>{fmtBig(o.value, '$')}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {insiders.length === 0 && institutions.length === 0 && !major && (
        <div className="rounded-xl p-8 text-center text-xs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
          Aucune donnée d&apos;insider disponible pour ce ticker.
        </div>
      )}
    </div>
  )
}

// ─────────── News tab ───────────

function NewsTab({ data }: { data: StockData | null }) {
  const news = data?.news || []
  return (
    <Section title={`Actualités · ${news.length}`}>
      {news.length === 0 ? (
        <div className="text-xs italic text-center py-3" style={{ color: 'var(--text3)' }}>Aucune actualité trouvée</div>
      ) : (
        <div className="space-y-1 max-h-[560px] overflow-y-auto">
          {news.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
              className="block px-2 py-1.5 rounded transition-all hover:opacity-90"
              style={{ background: 'var(--bg3)', borderLeft: `2px solid ${GREEN}` }}>
              <div className="text-[11px] font-semibold leading-snug mb-0.5" style={{ color: 'var(--text)' }}>{n.title}</div>
              <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text3)' }}>
                <span>{n.publisher}</span>
                {n.date && <span>· {fmtDate(n.date)}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─────────── AI verdict tab ───────────

function AiTab({ verdict, loading, error, onRegenerate, hasData }: { verdict: Verdict | null; loading: boolean; error: string | null; onRegenerate: () => void; hasData: boolean }) {
  if (!hasData) return <div className="rounded-xl p-8 text-center text-xs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>Charge d&apos;abord les données.</div>

  if (loading) return (
    <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="inline-block w-10 h-10 rounded-full border-4 border-t-transparent animate-spin mb-3" style={{ borderColor: 'rgba(34,197,94,0.3)', borderTopColor: GREEN }} />
      <div className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>L&apos;IA analyse toutes les données…</div>
      <div className="text-xs" style={{ color: 'var(--text3)' }}>Lecture des fondamentaux, ratings, news</div>
    </div>
  )

  if (error) return (
    <div className="rounded-xl p-5 text-center" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.3)' }}>
      <div className="text-sm font-bold mb-2" style={{ color: RED }}>⚠ Erreur</div>
      <div className="text-xs mb-3" style={{ color: 'var(--text3)' }}>{error}</div>
      <button onClick={onRegenerate} className="px-3 py-2 rounded text-xs font-bold" style={{ background: GREEN, color: '#000', cursor: 'pointer' }}>Réessayer</button>
    </div>
  )

  if (!verdict) return (
    <div className="rounded-xl p-5 text-center" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <button onClick={onRegenerate} className="px-4 py-2 rounded text-xs font-bold" style={{ background: GREEN, color: '#000', cursor: 'pointer' }}>🤖 Générer l&apos;analyse IA</button>
    </div>
  )

  const vs = verdictStyle(verdict.verdict)
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg p-3" style={{ background: vs.bg, border: `1px solid ${vs.border}` }}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: vs.color }}>Verdict IA</div>
            <div className="text-2xl font-extrabold leading-none" style={{ color: vs.color }}>{verdict.verdict || '—'}</div>
            {verdict.horizon && <div className="text-[9px] mt-1" style={{ color: 'var(--text3)' }}>Horizon : <strong>{verdict.horizon.replaceAll('_', ' ')}</strong></div>}
          </div>
          <div className="flex gap-3">
            {verdict.confiance != null && (
              <div className="text-center">
                <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>Confiance</div>
                <div className="text-lg font-extrabold leading-none" style={{ color: 'var(--text)' }}>{verdict.confiance}%</div>
              </div>
            )}
            {verdict.score_global != null && (
              <div className="text-center">
                <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>Score</div>
                <div className="text-lg font-extrabold leading-none" style={{ color: scoreColor(verdict.score_global) }}>{verdict.score_global}<span className="text-xs" style={{ color: 'var(--text3)' }}>/100</span></div>
              </div>
            )}
          </div>
        </div>
        {verdict.resume && <p className="text-xs leading-snug" style={{ color: 'var(--text)' }}>{verdict.resume}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {verdict.these_bull && verdict.these_bull.length > 0 && (
          <Section title="🐂 Thèse bull">
            <ul className="space-y-1">{verdict.these_bull.map((b, i) => <li key={i} className="text-[11px] flex gap-1.5 leading-snug" style={{ color: 'var(--text2)' }}><span style={{ color: GREEN }}>+</span>{b}</li>)}</ul>
          </Section>
        )}
        {verdict.these_bear && verdict.these_bear.length > 0 && (
          <Section title="🐻 Thèse bear">
            <ul className="space-y-1">{verdict.these_bear.map((b, i) => <li key={i} className="text-[11px] flex gap-1.5 leading-snug" style={{ color: 'var(--text2)' }}><span style={{ color: RED }}>−</span>{b}</li>)}</ul>
          </Section>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {verdict.risques_cles && verdict.risques_cles.length > 0 && (
          <Section title="⚠ Risques clés"><ul className="space-y-1">{verdict.risques_cles.map((r, i) => <li key={i} className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>• {r}</li>)}</ul></Section>
        )}
        {verdict.catalyseurs && verdict.catalyseurs.length > 0 && (
          <Section title="🚀 Catalyseurs"><ul className="space-y-1">{verdict.catalyseurs.map((c, i) => <li key={i} className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>• {c}</li>)}</ul></Section>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {verdict.valorisation && <Section title="Valorisation"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.valorisation}</p></Section>}
        {verdict.qualite_business && <Section title="Qualité business"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.qualite_business}</p></Section>}
        {verdict.sante_financiere && <Section title="Santé financière"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.sante_financiere}</p></Section>}
        {verdict.techniques && <Section title="Technique"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.techniques}</p></Section>}
        {verdict.consensus_global && <Section title="Consensus global"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.consensus_global}</p></Section>}
        {verdict.profil_investisseur && <Section title="Profil investisseur"><p className="text-[11px] leading-snug" style={{ color: 'var(--text2)' }}>{verdict.profil_investisseur}</p></Section>}
      </div>

      <div className="text-center">
        <button onClick={onRegenerate} disabled={loading} className="px-3 py-2 rounded text-xs font-semibold" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>↻ Régénérer l&apos;analyse</button>
      </div>

      <div className="text-[10px] text-center" style={{ color: 'var(--text3)' }}>
        Analyse générée par IA · informative uniquement, non un conseil en investissement. Vérifie toujours les données auprès de sources officielles.
      </div>
    </div>
  )
}

// Silence unused import warnings for components we keep for future polish
void ReferenceLine
void LineChart
