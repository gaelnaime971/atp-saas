'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Card from '@/components/ui/Card'

// ─── Types ──────────────────────────────────────────────────

type SlotKey = 'HTF' | 'MTF' | 'LTF' | 'Exec'
type Bias = 'bullish' | 'bearish' | 'range' | null

interface SMCAnnotations {
  ob?: boolean; fvg?: boolean; ifvg?: boolean
  bos?: boolean; choch?: boolean
  fiboOTE?: boolean; liquiditySweep?: boolean
  smtDivergence?: boolean; confluence?: boolean
  keyLevels?: string
}

interface ChartSlot {
  slot: SlotKey
  timeframe: string
  bias: Bias
  image: string | null // base64 data URL
  fileName: string | null
  annotations: SMCAnnotations
}

interface PriceInfo {
  symbol: string
  price: number | null
  prev: number | null
  change: number | null
  changePct: number | null
  high: number | null
  low: number | null
  week52High: number | null
  week52Low: number | null
  currency: string
  exchange: string
  longName: string
}

interface TechnicalResult {
  bias_per_tf?: Partial<Record<SlotKey, string>>
  zones?: Array<{ type: string; tf: string; price: string; status: string; direction: string; confluence?: string[]; notes?: string }>
  liquidity?: {
    targets_long?: Array<{ price: string; reasoning: string }>
    targets_short?: Array<{ price: string; reasoning: string }>
    risk_levels?: Array<{ price: string; reasoning: string }>
  }
  confluence_multi_tf?: { aligned?: boolean; reasoning?: string }
  key_observations?: string[]
  validation_annotations?: string
  best_entry_zone?: { tf?: string; price?: string; direction?: string; reasoning?: string }
}

interface NewsResult {
  events?: Array<{ title: string; currency: string; impact: string; datetime: string; minutesUntil: number; forecast: string | null; previous: string | null }>
  high_impact_count?: number
  next_high_impact?: { title: string; datetime: string; minutesUntil: number } | null
  implication?: string
}

interface MacroResult {
  dxy?: { price: number; changePct: number; name: string } | null
  vix?: { price: number; changePct: number; name: string } | null
  tnx?: { price: number; changePct: number; name: string } | null
  sp?: { price: number; changePct: number } | null
  nq?: { price: number; changePct: number } | null
  yield_10y_pct?: number | null
  risk_regime?: 'risk_on' | 'risk_off' | 'neutral'
  reasoning?: string
}

interface SentimentResult {
  primary?: { source: string; score: number; label: string; contrarian: { triggered: boolean; direction: string | null; reasoning: string } } | null
  cnn?: { score: number; rating: string; previous_close: number | null; previous_1_week: number | null; previous_1_month: number | null } | null
  crypto?: { score: number; rating: string } | null
}

interface CorrelationsResult {
  symbol?: string
  primary?: { ticker: string; last: number; changePct: number; pattern: string } | null
  assets?: Array<{ ticker: string; name: string; type: 'direct' | 'inverse'; last: number; changePct: number; pattern: string }>
  divergences?: Array<{ against: string; type: string; reasoning: string }>
  alignment?: 'aligned' | 'mixed' | 'divergent' | 'unknown'
  summary?: string
}

interface Synthesis {
  verdict?: 'ACHETER' | 'VENDRE' | 'ATTENDRE' | 'SKIP'
  conviction?: number
  summary?: string
  trade_plan?: {
    direction?: 'LONG' | 'SHORT' | null
    entry_zone?: { low?: number | string; high?: number | string; reasoning?: string } | null
    sl?: number | string
    tps?: Array<{ price: number | string; rr?: number; reasoning?: string }>
    horizon?: string
    probability_pct?: number
  }
  risques?: string[]
  catalyseurs_a_surveiller?: string[]
  pre_entry_checklist?: string[]
  key_levels_summary?: { support_majeur?: string; resistance_majeure?: string; invalidation?: string }
}

interface PillarState<T> { data: T | null; loading: boolean; error: string | null }

// ─── Constants ───────────────────────────────────────────────

const FUTURES_QUICK_PICKS = [
  { sym: 'ES', name: 'S&P 500 mini', yahoo: 'ES=F' },
  { sym: 'NQ', name: 'Nasdaq 100 mini', yahoo: 'NQ=F' },
  { sym: 'YM', name: 'Dow Jones mini', yahoo: 'YM=F' },
  { sym: 'RTY', name: 'Russell 2000', yahoo: 'RTY=F' },
  { sym: 'GC', name: 'Gold', yahoo: 'GC=F' },
  { sym: 'SI', name: 'Silver', yahoo: 'SI=F' },
  { sym: 'CL', name: 'Crude Oil WTI', yahoo: 'CL=F' },
  { sym: 'NG', name: 'Natural Gas', yahoo: 'NG=F' },
  { sym: 'HG', name: 'Copper', yahoo: 'HG=F' },
  { sym: 'MES', name: 'Micro S&P 500', yahoo: 'MES=F' },
  { sym: 'MNQ', name: 'Micro Nasdaq', yahoo: 'MNQ=F' },
  { sym: 'MGC', name: 'Micro Gold', yahoo: 'MGC=F' },
]

const TIMEFRAMES_BY_SLOT: Record<SlotKey, string[]> = {
  HTF: ['W1', 'D1'],
  MTF: ['H4', 'H1'],
  LTF: ['M30', 'M15', 'M5'],
  Exec: ['M1', '100T', 'Tick'],
}

const DEFAULT_TF_PER_SLOT: Record<SlotKey, string> = {
  HTF: 'D1', MTF: 'H4', LTF: 'M15', Exec: '100T',
}

const SLOT_LABELS: Record<SlotKey, { label: string; sub: string; color: string }> = {
  HTF: { label: 'HTF', sub: 'Bias macro', color: '#a855f7' },
  MTF: { label: 'MTF', sub: 'Structure', color: '#3b82f6' },
  LTF: { label: 'LTF', sub: 'Zone d\'entrée', color: '#22c55e' },
  Exec: { label: 'EXEC', sub: 'Trigger', color: '#f59e0b' },
}

const BIAS_OPTIONS: { id: Bias; label: string; color: string }[] = [
  { id: 'bullish', label: '▲ Bull', color: '#22c55e' },
  { id: 'range', label: '→ Range', color: '#f59e0b' },
  { id: 'bearish', label: '▼ Bear', color: '#ef4444' },
]

const SMC_ANNOTATION_LABELS: Array<{ key: keyof SMCAnnotations; label: string }> = [
  { key: 'ob', label: 'OB (Order Block)' },
  { key: 'fvg', label: 'FVG' },
  { key: 'ifvg', label: 'IFVG / Breaker' },
  { key: 'bos', label: 'BOS confirmé' },
  { key: 'choch', label: 'CHoCH (change struct)' },
  { key: 'fiboOTE', label: 'Fibo OTE 62–78%' },
  { key: 'liquiditySweep', label: 'Liquidité sweepée' },
  { key: 'smtDivergence', label: 'SMT divergence' },
  { key: 'confluence', label: 'Confluence multi-TF' },
]

// ─── Helpers ─────────────────────────────────────────────────

const fmt = (n: number | null | undefined, dec = 2) =>
  n == null || isNaN(n) ? '—' : n.toFixed(dec)
const fmtPct = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function biasColor(b: Bias) {
  if (b === 'bullish') return '#22c55e'
  if (b === 'bearish') return '#ef4444'
  if (b === 'range') return '#f59e0b'
  return 'var(--text3)'
}

function impactColor(impact: string) {
  const i = (impact || '').toLowerCase()
  if (i === 'high') return '#ef4444'
  if (i === 'medium' || i === 'med') return '#f59e0b'
  if (i === 'holiday') return '#a855f7'
  return '#6b7280'
}

function verdictStyle(v?: Synthesis['verdict']) {
  switch (v) {
    case 'ACHETER': return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.45)' }
    case 'VENDRE': return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.45)' }
    case 'ATTENDRE': return { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.45)' }
    case 'SKIP': return { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.45)' }
    default: return { color: 'var(--text3)', bg: 'var(--bg3)', border: 'var(--border)' }
  }
}

const defaultSlot = (slot: SlotKey): ChartSlot => ({
  slot,
  timeframe: DEFAULT_TF_PER_SLOT[slot],
  bias: null,
  image: null,
  fileName: null,
  annotations: { keyLevels: '' },
})

// ─── Main Component ───────────────────────────────────────────

export default function AnalyseGraphique() {
  const [symbol, setSymbol] = useState('ES')
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null)
  const [loadingPrice, setLoadingPrice] = useState(false)

  const [slots, setSlots] = useState<ChartSlot[]>([
    defaultSlot('HTF'), defaultSlot('MTF'), defaultSlot('LTF'), defaultSlot('Exec'),
  ])

  // Pillar states
  const [technical, setTechnical] = useState<PillarState<TechnicalResult>>({ data: null, loading: false, error: null })
  const [news, setNews] = useState<PillarState<NewsResult>>({ data: null, loading: false, error: null })
  const [macro, setMacro] = useState<PillarState<MacroResult>>({ data: null, loading: false, error: null })
  const [sentiment, setSentiment] = useState<PillarState<SentimentResult>>({ data: null, loading: false, error: null })
  const [correlations, setCorrelations] = useState<PillarState<CorrelationsResult>>({ data: null, loading: false, error: null })
  const [synthesis, setSynthesis] = useState<PillarState<Synthesis>>({ data: null, loading: false, error: null })

  const fileInputs = useRef<Record<SlotKey, HTMLInputElement | null>>({ HTF: null, MTF: null, LTF: null, Exec: null })

  // ─── Symbol → fetch price ───
  useEffect(() => {
    if (!symbol.trim()) return
    let cancelled = false
    setLoadingPrice(true)
    const yahooSym = symbol.includes('=F') ? symbol : `${symbol.toUpperCase()}=F`
    fetch(`/api/stock/data?symbol=${encodeURIComponent(yahooSym)}&period=1mo`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const q = d?.quote
        if (!q) { setPriceInfo(null); return }
        setPriceInfo({
          symbol,
          price: q.regularMarketPrice ?? null,
          prev: q.regularMarketPreviousClose ?? null,
          change: q.regularMarketChange ?? null,
          changePct: q.regularMarketChangePercent ?? null,
          high: q.regularMarketDayHigh ?? null,
          low: q.regularMarketDayLow ?? null,
          week52High: q.fiftyTwoWeekHigh ?? null,
          week52Low: q.fiftyTwoWeekLow ?? null,
          currency: q.currency || 'USD',
          exchange: q.fullExchangeName || q.exchange || '',
          longName: q.longName || q.shortName || symbol,
        })
      })
      .catch(() => { if (!cancelled) setPriceInfo(null) })
      .finally(() => { if (!cancelled) setLoadingPrice(false) })
    return () => { cancelled = true }
  }, [symbol])

  // ─── Upload handlers ───
  const handleFile = useCallback(async (slot: SlotKey, file: File) => {
    if (!file.type.startsWith('image/')) { alert('Image uniquement (JPG/PNG/WebP).'); return }
    if (file.size > 8 * 1024 * 1024) { alert('Image trop lourde (max 8 MB).'); return }
    const dataUrl = await fileToDataUrl(file)
    setSlots(prev => prev.map(s => s.slot === slot ? { ...s, image: dataUrl, fileName: file.name } : s))
  }, [])

  const handleDrop = useCallback((slot: SlotKey, e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(slot, f)
  }, [handleFile])

  const removeImage = useCallback((slot: SlotKey) => {
    setSlots(prev => prev.map(s => s.slot === slot ? { ...s, image: null, fileName: null } : s))
  }, [])

  const updateSlot = useCallback((slot: SlotKey, patch: Partial<ChartSlot>) => {
    setSlots(prev => prev.map(s => s.slot === slot ? { ...s, ...patch } : s))
  }, [])

  const updateAnnotation = useCallback((slot: SlotKey, patch: Partial<SMCAnnotations>) => {
    setSlots(prev => prev.map(s => s.slot === slot ? { ...s, annotations: { ...s.annotations, ...patch } } : s))
  }, [])

  // ─── Run analysis ───
  const uploadedCharts = useMemo(() => slots.filter(s => s.image), [slots])
  const canRun = uploadedCharts.length >= 1 && symbol.trim().length > 0

  const runAnalysis = useCallback(async () => {
    if (!canRun) return

    // Reset all pillars
    setTechnical({ data: null, loading: true, error: null })
    setNews({ data: null, loading: true, error: null })
    setMacro({ data: null, loading: true, error: null })
    setSentiment({ data: null, loading: true, error: null })
    setCorrelations({ data: null, loading: true, error: null })
    setSynthesis({ data: null, loading: false, error: null })

    const technicalBody = {
      symbol,
      charts: uploadedCharts.map(s => ({
        slot: s.slot, timeframe: s.timeframe, bias: s.bias,
        image: s.image, annotations: s.annotations,
      })),
    }
    const simpleBody = JSON.stringify({ symbol })

    const post = async <T,>(path: string, body: string, setter: (st: PillarState<T>) => void): Promise<T | null> => {
      try {
        const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        const d = await r.json()
        if (!r.ok) { setter({ data: null, loading: false, error: d.error || `Erreur (${r.status})` }); return null }
        return d as T
      } catch (e) {
        setter({ data: null, loading: false, error: e instanceof Error ? e.message : 'Erreur réseau' })
        return null
      }
    }

    const [techRes, newsRes, macroRes, sentRes, corrRes] = await Promise.all([
      post<{ technical: TechnicalResult; error?: string }>('/api/asset-analysis/technical', JSON.stringify(technicalBody), v => setTechnical(v as PillarState<TechnicalResult>)),
      post<{ news: NewsResult; error?: string }>('/api/asset-analysis/news', simpleBody, v => setNews(v as PillarState<NewsResult>)),
      post<{ macro: MacroResult; error?: string }>('/api/asset-analysis/macro', simpleBody, v => setMacro(v as PillarState<MacroResult>)),
      post<{ sentiment: SentimentResult; error?: string }>('/api/asset-analysis/sentiment', simpleBody, v => setSentiment(v as PillarState<SentimentResult>)),
      post<{ correlations: CorrelationsResult; error?: string }>('/api/asset-analysis/correlations', simpleBody, v => setCorrelations(v as PillarState<CorrelationsResult>)),
    ])

    if (techRes?.technical) setTechnical({ data: techRes.technical, loading: false, error: null })
    if (newsRes?.news) setNews({ data: newsRes.news, loading: false, error: null })
    if (macroRes?.macro) setMacro({ data: macroRes.macro, loading: false, error: null })
    if (sentRes?.sentiment) setSentiment({ data: sentRes.sentiment, loading: false, error: null })
    if (corrRes?.correlations) setCorrelations({ data: corrRes.correlations, loading: false, error: null })

    // Now synthesis (needs at least technical)
    if (techRes?.technical) {
      setSynthesis({ data: null, loading: true, error: null })
      try {
        const r = await fetch('/api/asset-analysis/synthesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            technical: techRes?.technical ?? null,
            news: newsRes?.news ?? null,
            macro: macroRes?.macro ?? null,
            sentiment: sentRes?.sentiment ?? null,
            correlations: corrRes?.correlations ?? null,
          }),
        })
        const d = await r.json()
        if (!r.ok) setSynthesis({ data: null, loading: false, error: d.error || `Erreur (${r.status})` })
        else setSynthesis({ data: d.synthesis, loading: false, error: null })
      } catch (e) {
        setSynthesis({ data: null, loading: false, error: e instanceof Error ? e.message : 'Erreur réseau' })
      }
    }
  }, [canRun, symbol, uploadedCharts])

  // ─── Prefill session ───
  const prefillSession = useCallback(() => {
    if (!synthesis.data?.trade_plan) return
    const tp = synthesis.data.trade_plan
    const payload = {
      instrument: symbol.replace(/=F$|^M(?=[A-Z])/, ''),
      direction: tp.direction || null,
      notes: [
        synthesis.data.summary,
        tp.entry_zone?.reasoning ? `Entry: ${tp.entry_zone?.low}-${tp.entry_zone?.high} · ${tp.entry_zone.reasoning}` : '',
        tp.sl != null ? `SL: ${tp.sl}` : '',
        tp.tps?.length ? `TPs: ${tp.tps.map(t => `${t.price} (R:R ${t.rr})`).join(' / ')}` : '',
        (synthesis.data.risques || []).map(r => `Risque: ${r}`).join('\n'),
      ].filter(Boolean).join('\n'),
      technical_analysis: [
        technical.data?.confluence_multi_tf?.reasoning,
        ...(technical.data?.key_observations || []),
      ].filter(Boolean).join('\n'),
    }
    try {
      window.sessionStorage.setItem('atp_session_prefill', JSON.stringify(payload))
      window.location.href = '/dashboard?prefill=1#session'
    } catch {
      alert('Impossible de pré-remplir la session.')
    }
  }, [synthesis, symbol, technical])

  // ─── Render ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .ag-cta-btn{position:relative;overflow:hidden;transition:all .2s}
        .ag-cta-btn:hover{transform:translateY(-1px);box-shadow:0 0 22px rgba(34,197,94,0.5)}
      `}</style>

      {/* ── 1. Header + Symbol picker ── */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>🎯</span> Analyse multi-piliers
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0', lineHeight: 1.4 }}>
              Upload tes charts multi-TF, l&apos;IA analyse les 5 piliers en parallèle et te livre un plan de trade actionnable.
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={!canRun || technical.loading}
            className={canRun && !technical.loading ? 'ag-cta-btn' : ''}
            style={{
              padding: '12px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: !canRun || technical.loading ? 'not-allowed' : 'pointer',
              background: !canRun || technical.loading ? 'var(--bg2)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: !canRun || technical.loading ? 'var(--text3)' : '#09090b',
              border: 'none', whiteSpace: 'nowrap',
              boxShadow: !canRun || technical.loading ? 'none' : '0 0 14px rgba(34,197,94,0.35)',
            }}>
            {technical.loading ? '⏳ Analyse en cours…' : '▶ LANCER L\'ANALYSE COMPLÈTE'}
          </button>
        </div>

        {/* Symbol input + quick picks */}
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Symbol :</label>
          <input
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="ES"
            style={{
              padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              outline: 'none', width: 90, textAlign: 'center',
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {FUTURES_QUICK_PICKS.map(p => (
              <button key={p.sym} onClick={() => setSymbol(p.sym)} title={p.name}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'monospace',
                  background: symbol === p.sym ? 'rgba(34,197,94,0.15)' : 'var(--bg3)',
                  color: symbol === p.sym ? '#22c55e' : 'var(--text2)',
                  border: `1px solid ${symbol === p.sym ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                }}>
                {p.sym}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── 2. Context (live price) ── */}
      {(priceInfo || loadingPrice) && (
        <Card style={{ padding: 12 }}>
          {loadingPrice && !priceInfo ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>Chargement du prix…</div>
          ) : priceInfo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{priceInfo.longName}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{priceInfo.exchange} · {priceInfo.currency}</div>
              </div>
              <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1 }}>
                  {fmt(priceInfo.price, 2)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: (priceInfo.change ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {(priceInfo.change ?? 0) >= 0 ? '▲' : '▼'} {fmt(Math.abs(priceInfo.change ?? 0), 2)} ({fmtPct(priceInfo.changePct)})
                </div>
              </div>
              {priceInfo.high != null && priceInfo.low != null && (
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  Range jour: <strong style={{ color: 'var(--text2)' }}>{fmt(priceInfo.low)}</strong> – <strong style={{ color: 'var(--text2)' }}>{fmt(priceInfo.high)}</strong>
                </div>
              )}
              {priceInfo.week52High != null && priceInfo.week52Low != null && (
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  52w: <strong style={{ color: '#ef4444' }}>{fmt(priceInfo.week52Low)}</strong> – <strong style={{ color: '#22c55e' }}>{fmt(priceInfo.week52High)}</strong>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* ── 3. 4-slot chart upload grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {slots.map(slot => (
          <SlotCard
            key={slot.slot}
            slot={slot}
            onFile={f => handleFile(slot.slot, f)}
            onDrop={e => handleDrop(slot.slot, e)}
            onRemove={() => removeImage(slot.slot)}
            onUpdate={patch => updateSlot(slot.slot, patch)}
            onAnnotate={patch => updateAnnotation(slot.slot, patch)}
            fileRef={el => { fileInputs.current[slot.slot] = el }}
          />
        ))}
      </div>

      {/* ── 4. Pillar results ── */}
      {(technical.loading || technical.data || technical.error) && (
        <>
          <SectionHeader icon="📊" label="Résultats de l'analyse" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
            <PillarCard
              icon="⚡" title="Technique SMC" color="#22c55e"
              state={technical}
              renderData={d => <TechnicalView data={d} />}
              minHeight={220}
            />
            <PillarCard
              icon="📰" title="News & Catalyseurs" color="#3b82f6"
              state={news}
              renderData={d => <NewsView data={d} />}
              minHeight={220}
            />
            <PillarCard
              icon="🌐" title="Macro" color="#a855f7"
              state={macro}
              renderData={d => <MacroView data={d} />}
              minHeight={220}
            />
            <PillarCard
              icon="🎭" title="Sentiment" color="#f59e0b"
              state={sentiment}
              renderData={d => <SentimentView data={d} />}
              minHeight={220}
            />
            <PillarCard
              icon="🔗" title="SMT / Corrélations" color="#ec4899"
              state={correlations}
              renderData={d => <CorrelationsView data={d} />}
              minHeight={220}
            />
          </div>
        </>
      )}

      {/* ── 5. Synthesis & trade plan ── */}
      {(synthesis.loading || synthesis.data || synthesis.error) && (
        <>
          <SectionHeader icon="🎯" label="Synthèse & plan de trade" />
          <SynthesisView state={synthesis} onPrefill={prefillSession} hasTradePlan={!!synthesis.data?.trade_plan?.direction} />
        </>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginTop: 6 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</h2>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function SlotCard({
  slot, onFile, onDrop, onRemove, onUpdate, onAnnotate, fileRef,
}: {
  slot: ChartSlot
  onFile: (f: File) => void
  onDrop: (e: React.DragEvent) => void
  onRemove: () => void
  onUpdate: (patch: Partial<ChartSlot>) => void
  onAnnotate: (patch: Partial<SMCAnnotations>) => void
  fileRef: (el: HTMLInputElement | null) => void
}) {
  const [showAnnotations, setShowAnnotations] = useState(false)
  const meta = SLOT_LABELS[slot.slot]

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
      borderTop: `3px solid ${meta.color}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: meta.color, letterSpacing: '0.06em' }}>{meta.label}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>{meta.sub}</div>
        </div>
        <select
          value={slot.timeframe}
          onChange={e => onUpdate({ timeframe: e.target.value })}
          style={{
            padding: '3px 8px', background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 5, color: 'var(--text)', fontSize: 10, fontFamily: 'monospace', cursor: 'pointer', outline: 'none',
          }}>
          {TIMEFRAMES_BY_SLOT[slot.slot].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Image drop zone */}
      {slot.image ? (
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.image} alt={slot.slot} style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'contain' }} />
          <button
            onClick={onRemove}
            style={{
              position: 'absolute', top: 4, right: 4, padding: '2px 8px',
              background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            }}>
            ✕
          </button>
        </div>
      ) : (
        <div
          onClick={() => document.getElementById(`file-${slot.slot}`)?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            padding: '22px 10px', borderRadius: 8, border: '2px dashed var(--border)',
            background: 'var(--bg3)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
          }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>📊</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Cliquer ou drop un chart</div>
          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>JPG / PNG · max 8 MB</div>
        </div>
      )}
      <input
        id={`file-${slot.slot}`}
        ref={fileRef}
        type="file" accept="image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />

      {/* Bias chips */}
      <div style={{ display: 'flex', gap: 4 }}>
        {BIAS_OPTIONS.map(b => {
          const active = slot.bias === b.id
          return (
            <button key={b.id ?? 'none'} onClick={() => onUpdate({ bias: active ? null : b.id })}
              style={{
                flex: 1, padding: '4px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: active ? `${b.color}25` : 'var(--bg3)',
                color: active ? b.color : 'var(--text3)',
                border: `1px solid ${active ? `${b.color}60` : 'var(--border)'}`,
              }}>
              {b.label}
            </button>
          )
        })}
      </div>

      {/* SMC annotations (collapsible) */}
      <button
        onClick={() => setShowAnnotations(s => !s)}
        style={{
          padding: '5px 8px', background: 'transparent', color: 'var(--text3)',
          border: '1px solid var(--border)', borderRadius: 5, fontSize: 10, cursor: 'pointer',
        }}>
        {showAnnotations ? '▼' : '▶'} Annotations SMC{Object.values(slot.annotations).some(v => v === true) ? ` (${Object.values(slot.annotations).filter(v => v === true).length})` : ''}
      </button>
      {showAnnotations && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: 'var(--bg3)', borderRadius: 6 }}>
          {SMC_ANNOTATION_LABELS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, cursor: 'pointer', color: 'var(--text2)' }}>
              <input
                type="checkbox"
                checked={!!slot.annotations[key]}
                onChange={e => onAnnotate({ [key]: e.target.checked })}
                style={{ accentColor: '#22c55e' }}
              />
              {label}
            </label>
          ))}
          <input
            type="text"
            value={slot.annotations.keyLevels || ''}
            onChange={e => onAnnotate({ keyLevels: e.target.value })}
            placeholder="Niveaux clés (ex: 5820, 5860)"
            style={{
              marginTop: 4, padding: '4px 6px', background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 5, color: 'var(--text)', fontSize: 10, fontFamily: 'monospace', outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}

function PillarCard<T>({
  icon, title, color, state, renderData, minHeight,
}: {
  icon: string; title: string; color: string
  state: PillarState<T>
  renderData: (d: T) => React.ReactNode
  minHeight?: number
}) {
  return (
    <Card style={{ padding: 12, borderTop: `3px solid ${color}`, minHeight, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <h3 style={{ fontSize: 12, fontWeight: 800, color, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
        </div>
        {state.loading && (
          <div style={{ width: 12, height: 12, border: `2px solid var(--bg3)`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        )}
      </div>
      {state.loading && !state.data ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', padding: '20px 0', textAlign: 'center' }}>Analyse en cours…</div>
      ) : state.error ? (
        <div style={{ fontSize: 11, color: '#ef4444', padding: '10px 0' }}>⚠ {state.error}</div>
      ) : state.data ? (
        renderData(state.data)
      ) : null}
    </Card>
  )
}

// ─── Pillar views ────────────────────────────────────────────

function TechnicalView({ data }: { data: TechnicalResult }) {
  const biasEntries = Object.entries(data.bias_per_tf || {})
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {biasEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Bias multi-TF</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {biasEntries.map(([tf, b]) => {
              const isBull = (b || '').includes('BULL')
              const isBear = (b || '').includes('BEAR')
              const col = isBull ? '#22c55e' : isBear ? '#ef4444' : '#f59e0b'
              return (
                <div key={tf} style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                  background: `${col}15`, color: col, border: `1px solid ${col}30`,
                }}>
                  {tf}: {isBull ? '▲' : isBear ? '▼' : '→'} {b}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {data.confluence_multi_tf?.reasoning && (
        <div style={{
          padding: '8px 10px', background: data.confluence_multi_tf.aligned ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${data.confluence_multi_tf.aligned ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
          borderRadius: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
        }}>
          <strong style={{ color: data.confluence_multi_tf.aligned ? '#22c55e' : '#f59e0b' }}>
            {data.confluence_multi_tf.aligned ? '✓ Confluence' : '⚠ Mixte'}
          </strong> {data.confluence_multi_tf.reasoning}
        </div>
      )}

      {data.zones && data.zones.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Zones identifiées</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.zones.slice(0, 8).map((z, i) => {
              const col = z.direction === 'bullish' ? '#22c55e' : z.direction === 'bearish' ? '#ef4444' : 'var(--text2)'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 8px', background: 'var(--bg3)', borderRadius: 5 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: `${col}20`, color: col }}>{z.type} {z.tf}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{z.price}</span>
                  <span style={{ fontSize: 9, color: 'var(--text3)' }}>· {z.status}</span>
                  {z.notes && <span style={{ flex: 1, fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.notes}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {data.liquidity && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Liquidité</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5 }}>
            {(data.liquidity.targets_long || []).map((t, i) => (
              <div key={`tl-${i}`} style={{ color: '#22c55e' }}>→ Long target <strong style={{ fontFamily: 'monospace' }}>{t.price}</strong> <span style={{ color: 'var(--text3)' }}>{t.reasoning}</span></div>
            ))}
            {(data.liquidity.targets_short || []).map((t, i) => (
              <div key={`ts-${i}`} style={{ color: '#ef4444' }}>← Short target <strong style={{ fontFamily: 'monospace' }}>{t.price}</strong> <span style={{ color: 'var(--text3)' }}>{t.reasoning}</span></div>
            ))}
            {(data.liquidity.risk_levels || []).map((t, i) => (
              <div key={`rl-${i}`} style={{ color: '#f59e0b' }}>⚠ Risk <strong style={{ fontFamily: 'monospace' }}>{t.price}</strong> <span style={{ color: 'var(--text3)' }}>{t.reasoning}</span></div>
            ))}
          </div>
        </div>
      )}

      {data.best_entry_zone?.price && (
        <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6 }}>
          <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase' }}>🎯 Zone d&apos;entrée optimale</div>
          <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 3, fontFamily: 'monospace' }}>
            {data.best_entry_zone.direction?.toUpperCase()} @ {data.best_entry_zone.price} ({data.best_entry_zone.tf})
          </div>
          {data.best_entry_zone.reasoning && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{data.best_entry_zone.reasoning}</div>
          )}
        </div>
      )}

      {data.key_observations && data.key_observations.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Observations clés</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
            {data.key_observations.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}

      {data.validation_annotations && (
        <div style={{ fontSize: 10.5, color: 'var(--text3)', fontStyle: 'italic', padding: '6px 8px', background: 'var(--bg3)', borderRadius: 5 }}>
          💡 {data.validation_annotations}
        </div>
      )}
    </div>
  )
}

function NewsView({ data }: { data: NewsResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {data.implication && (
        <div style={{
          padding: '8px 10px',
          background: data.next_high_impact ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
          border: `1px solid ${data.next_high_impact ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          borderRadius: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
        }}>
          {data.implication}
        </div>
      )}
      {(data.events || []).length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 10 }}>Aucun event détecté</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
          {(data.events || []).slice(0, 12).map((e, i) => {
            const col = impactColor(e.impact)
            const dt = new Date(e.datetime)
            const past = e.minutesUntil < 0
            const soon = e.minutesUntil >= 0 && e.minutesUntil < 24 * 60
            const dateLabel = past
              ? 'passé'
              : soon
              ? e.minutesUntil < 60 ? `${e.minutesUntil} min` : `${Math.round(e.minutesUntil / 60)}h`
              : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                background: 'var(--bg3)', borderRadius: 5, borderLeft: `3px solid ${col}`,
                opacity: past ? 0.5 : 1,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: `${col}20`, color: col, textTransform: 'uppercase', minWidth: 50, textAlign: 'center' }}>{e.impact}</span>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}
                </div>
                <div style={{ fontSize: 9, color: soon ? '#f59e0b' : 'var(--text3)', fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{dateLabel}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MacroView({ data }: { data: MacroResult }) {
  const items = [
    { label: 'DXY', d: data.dxy },
    { label: 'VIX', d: data.vix },
    { label: '10Y', d: data.tnx, valFormatter: (n: number) => (n / 10).toFixed(2) + '%' },
    { label: 'S&P', d: data.sp },
    { label: 'NQ', d: data.nq },
  ]
  const regimeMeta: Record<'risk_on' | 'risk_off' | 'neutral', { label: string; color: string; bg: string }> = {
    risk_on: { label: 'RISK ON', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    risk_off: { label: 'RISK OFF', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    neutral: { label: 'NEUTRAL', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  }
  const regime = data.risk_regime ? regimeMeta[data.risk_regime] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {regime && (
        <div style={{
          padding: '10px 12px', background: regime.bg, border: `1px solid ${regime.color}40`,
          borderRadius: 6, textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.08em' }}>RÉGIME</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: regime.color, marginTop: 2 }}>{regime.label}</div>
          {data.reasoning && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{data.reasoning}</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
        {items.map(({ label, d, valFormatter }) => (
          <div key={label} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', marginTop: 2 }}>
              {d ? (valFormatter ? valFormatter(d.price) : fmt(d.price)) : '—'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: !d ? 'var(--text3)' : d.changePct >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
              {d ? `${d.changePct >= 0 ? '▲' : '▼'} ${fmtPct(d.changePct)}` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SentimentView({ data }: { data: SentimentResult }) {
  const score = data.primary?.score ?? null
  const col = score == null ? 'var(--text3)' : score >= 75 ? '#22c55e' : score >= 55 ? '#84cc16' : score >= 45 ? '#f59e0b' : score >= 25 ? '#ef4444' : '#dc2626'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {score != null && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em' }}>
            FEAR & GREED {data.primary?.source && <>· {data.primary.source}</>}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: col, lineHeight: 1, marginTop: 4, fontFamily: 'monospace' }}>{score}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: col, marginTop: 4 }}>{data.primary?.label}</div>
          {/* Mini gauge bar */}
          <div style={{ marginTop: 8, position: 'relative', height: 6, borderRadius: 3, background: 'linear-gradient(90deg, #dc2626, #ef4444, #f59e0b, #84cc16, #22c55e)' }}>
            <div style={{
              position: 'absolute', top: -3, left: `${score}%`, transform: 'translateX(-50%)',
              width: 2, height: 12, background: '#fff', borderRadius: 1, boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            }} />
          </div>
        </div>
      )}
      {data.primary?.contrarian.triggered && (
        <div style={{
          padding: '8px 10px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
        }}>
          ⚠️ {data.primary.contrarian.reasoning}
        </div>
      )}
      {data.cnn?.previous_close != null && data.cnn?.previous_1_week != null && data.cnn?.previous_1_month != null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 10 }}>
          {([['J-1', data.cnn.previous_close], ['S-1', data.cnn.previous_1_week], ['M-1', data.cnn.previous_1_month]] as const).map(([lbl, v]) => (
            <div key={lbl} style={{ padding: '5px 6px', background: 'var(--bg3)', borderRadius: 5, textAlign: 'center' }}>
              <div style={{ color: 'var(--text3)' }}>{lbl}</div>
              <div style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CorrelationsView({ data }: { data: CorrelationsResult }) {
  const alignMeta: Record<string, { label: string; color: string }> = {
    aligned: { label: 'ALIGNÉ', color: '#22c55e' },
    mixed: { label: 'MIXTE', color: '#f59e0b' },
    divergent: { label: 'DIVERGENT', color: '#ef4444' },
    unknown: { label: 'INCONNU', color: '#6b7280' },
  }
  const meta = alignMeta[data.alignment || 'unknown'] || alignMeta.unknown

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 6 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700 }}>ALIGNEMENT</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: meta.color, marginTop: 2 }}>{meta.label}</div>
        </div>
        {data.divergences && data.divergences.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{data.divergences.length} divergence(s)</div>
        )}
      </div>

      {(data.assets || []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(data.assets || []).map(a => (
            <div key={a.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg3)', borderRadius: 5, fontSize: 11 }}>
              <span style={{ fontSize: 9, color: a.type === 'inverse' ? '#ec4899' : 'var(--text3)', fontWeight: 700 }}>{a.type === 'inverse' ? '↺' : '↔'}</span>
              <span style={{ flex: 1, color: 'var(--text2)' }}>{a.name} <span style={{ color: 'var(--text3)', fontSize: 9 }}>({a.ticker})</span></span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{a.pattern}</span>
              <span style={{ fontSize: 10, color: a.changePct >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontFamily: 'monospace' }}>{fmtPct(a.changePct)}</span>
            </div>
          ))}
        </div>
      )}

      {(data.divergences || []).length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Divergences SMT détectées</div>
          {(data.divergences || []).map((d, i) => {
            const bull = d.type.includes('bullish')
            const bear = d.type.includes('bearish')
            const col = bull ? '#22c55e' : bear ? '#ef4444' : '#f59e0b'
            return (
              <div key={i} style={{ padding: '6px 8px', background: `${col}10`, border: `1px solid ${col}30`, borderRadius: 5, fontSize: 10.5, color: 'var(--text2)', marginBottom: 4 }}>
                <strong style={{ color: col }}>{bull ? '▲ Bull SMT' : bear ? '▼ Bear SMT' : '⚠ Break'}</strong> {d.reasoning}
              </div>
            )
          })}
        </div>
      )}

      {data.summary && (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' }}>{data.summary}</div>
      )}
    </div>
  )
}

function SynthesisView({ state, onPrefill, hasTradePlan }: { state: PillarState<Synthesis>; onPrefill: () => void; hasTradePlan: boolean }) {
  if (state.loading) {
    return (
      <Card style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid var(--bg3)', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>L&apos;IA synthétise les 5 piliers…</div>
      </Card>
    )
  }
  if (state.error) {
    return <Card style={{ padding: 14, border: '1px solid rgba(239,68,68,0.3)' }}><div style={{ fontSize: 12, color: '#ef4444' }}>⚠ {state.error}</div></Card>
  }
  if (!state.data) return null
  const v = state.data
  const vs = verdictStyle(v.verdict)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Verdict + conviction */}
      <Card style={{ padding: 16, background: vs.bg, border: `1px solid ${vs.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: vs.color, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Verdict IA</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: vs.color, lineHeight: 1, marginTop: 4 }}>{v.verdict}</div>
            {v.conviction != null && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                Conviction : <strong style={{ color: vs.color }}>{v.conviction}%</strong>
                {v.trade_plan?.horizon && <> · Horizon : <strong style={{ color: 'var(--text)' }}>{v.trade_plan.horizon}</strong></>}
              </div>
            )}
          </div>
          {hasTradePlan && (
            <button onClick={onPrefill}
              style={{
                padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#09090b', border: 'none',
                boxShadow: '0 0 12px rgba(34,197,94,0.3)',
              }}>
              📝 Pré-remplir une saisie de session
            </button>
          )}
        </div>
        {v.summary && <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '12px 0 0' }}>{v.summary}</p>}
      </Card>

      {/* Trade plan */}
      {v.trade_plan?.direction && (
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plan de trade</h3>
            <span style={{ fontSize: 11, fontWeight: 700, color: v.trade_plan.direction === 'LONG' ? '#22c55e' : '#ef4444', padding: '2px 8px', borderRadius: 5, background: v.trade_plan.direction === 'LONG' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>{v.trade_plan.direction}</span>
            {v.trade_plan.probability_pct != null && (
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>Probabilité : <strong style={{ color: 'var(--text2)' }}>{v.trade_plan.probability_pct}%</strong></span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, fontSize: 11 }}>
            {v.trade_plan.entry_zone && (
              <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase' }}>Entry</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', marginTop: 2 }}>
                  {v.trade_plan.entry_zone.low}{v.trade_plan.entry_zone.high && v.trade_plan.entry_zone.low !== v.trade_plan.entry_zone.high ? ` – ${v.trade_plan.entry_zone.high}` : ''}
                </div>
                {v.trade_plan.entry_zone.reasoning && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{v.trade_plan.entry_zone.reasoning}</div>}
              </div>
            )}
            {v.trade_plan.sl != null && (
              <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>Stop Loss</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', marginTop: 2 }}>{v.trade_plan.sl}</div>
              </div>
            )}
            {(v.trade_plan.tps || []).map((tp, i) => (
              <div key={i} style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase' }}>TP {i + 1}{tp.rr ? ` · R:R ${tp.rr}` : ''}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', marginTop: 2 }}>{tp.price}</div>
                {tp.reasoning && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{tp.reasoning}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risks + catalysts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {v.risques && v.risques.length > 0 && (
          <Card style={{ padding: 12, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Risques</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              {v.risques.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </Card>
        )}
        {v.catalyseurs_a_surveiller && v.catalyseurs_a_surveiller.length > 0 && (
          <Card style={{ padding: 12, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🎯 Catalyseurs à surveiller</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
              {v.catalyseurs_a_surveiller.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </Card>
        )}
      </div>

      {/* Pre-entry checklist + key levels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {v.pre_entry_checklist && v.pre_entry_checklist.length > 0 && (
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✅ Checklist pré-entrée</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {v.pre_entry_checklist.map((c, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11.5, color: 'var(--text2)' }}>
                  <input type="checkbox" style={{ accentColor: '#22c55e' }} />
                  {c}
                </label>
              ))}
            </div>
          </Card>
        )}
        {v.key_levels_summary && (
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 Niveaux clés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
              {v.key_levels_summary.support_majeur && (
                <div style={{ color: 'var(--text2)' }}>Support : <strong style={{ color: '#22c55e', fontFamily: 'monospace' }}>{v.key_levels_summary.support_majeur}</strong></div>
              )}
              {v.key_levels_summary.resistance_majeure && (
                <div style={{ color: 'var(--text2)' }}>Résistance : <strong style={{ color: '#ef4444', fontFamily: 'monospace' }}>{v.key_levels_summary.resistance_majeure}</strong></div>
              )}
              {v.key_levels_summary.invalidation && (
                <div style={{ color: 'var(--text2)' }}>Invalidation : <strong style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{v.key_levels_summary.invalidation}</strong></div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
