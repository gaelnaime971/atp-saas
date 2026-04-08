'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

// ── Constants ──────────────────────────────────────────────

const INSTRUMENTS = ['ES', 'NQ', 'YM', 'MYM', 'MNQ', 'GC', 'MGC']

const SETUP_GROUPS: Record<string, string[]> = {
  'Order Block': ['OB M1', 'OB M5', 'OB M15', 'OB H1', 'OB H4'],
  'FVG': ['FVG M1', 'FVG M5', 'FVG M15', 'FVG H1', 'FVG H4'],
  'Fibonacci': ['38.2%', '50%', '61.8%', '78.6%'],
  'Structure': ['CHoCH M1', 'CHoCH M5', 'CHoCH M15', 'CHoCH H1', 'BOS M1', 'BOS M5', 'BOS M15', 'BOS H1'],
}

const SIGNALS = ['Hammer 100T', 'Hammer M1', 'Hammer M5', 'Engulfing M1', 'Engulfing M5', 'Pin Bar']

const ALL_SETUPS = Object.values(SETUP_GROUPS).flat()

// ── Types ──────────────────────────────────────────────────

interface BacktestEntry {
  id: string
  trader_id: string
  created_at: string
  date: string
  instrument: string
  direction: string
  setup_types: string[]
  signals: string[]
  has_confluence: boolean
  points: number
  sl_points: number
  r_result: number
  result: 'win' | 'loss' | 'be'
  notes: string | null
  image_url: string | null
}

// ── Helpers ────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function resultColor(r: string) {
  if (r === 'win') return '#22c55e'
  if (r === 'loss') return '#ef4444'
  return '#fbbf24'
}

function resultBg(r: string) {
  if (r === 'win') return 'rgba(34,197,94,0.12)'
  if (r === 'loss') return 'rgba(239,68,68,0.12)'
  return 'rgba(251,191,36,0.12)'
}

function winRateColor(wr: number) {
  if (wr >= 60) return '#22c55e'
  if (wr >= 40) return '#fbbf24'
  return '#ef4444'
}

function winRateBg(wr: number) {
  if (wr >= 60) return 'rgba(34,197,94,0.10)'
  if (wr >= 40) return 'rgba(251,191,36,0.10)'
  return 'rgba(239,68,68,0.10)'
}

// ── Styles ─────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg3)',
  border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text3)', display: 'block', marginBottom: 6, fontSize: 11,
  fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
}

const chipBase: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
  cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)',
}

const chipActive: React.CSSProperties = {
  ...chipBase,
  background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)',
}

const kpiCardStyle: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '20px 24px', flex: 1, minWidth: 0,
}

// ── Component ──────────────────────────────────────────────

export default function Backtest() {
  const [tab, setTab] = useState<'saisie' | 'resultats'>('saisie')
  const [entries, setEntries] = useState<BacktestEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Form state
  const [date, setDate] = useState(todayISO())
  const [instrument, setInstrument] = useState('ES')
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [setupTypes, setSetupTypes] = useState<string[]>([])
  const [signals, setSignals] = useState<string[]>([])
  const [hasConfluence, setHasConfluence] = useState(false)
  const [points, setPoints] = useState('')
  const [slPoints, setSlPoints] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | 'be'>('win')
  const [notes, setNotes] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterInstrument, setFilterInstrument] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Image viewer
  const [viewImage, setViewImage] = useState<string | null>(null)

  const supabase = createClient()

  const rResult = useMemo(() => {
    const p = parseFloat(points)
    const s = parseFloat(slPoints)
    if (!s || isNaN(p) || isNaN(s) || s === 0) return 0
    return Math.round((p / s) * 100) / 100
  }, [points, slPoints])

  // ── Data fetching ──

  async function fetchEntries(uid: string) {
    const { data } = await supabase
      .from('backtests')
      .select('*')
      .eq('trader_id', uid)
      .order('date', { ascending: false })
    if (data) setEntries(data as BacktestEntry[])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchEntries(user.id)
      setLoading(false)
    }
    init()
  }, [])

  // ── Actions ──

  function toggleChip(value: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value])
  }

  async function uploadImage(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `backtests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('chat-images').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      setImagePreview(URL.createObjectURL(file))
    }
    setUploading(false)
  }

  function resetForm() {
    setDate(todayISO())
    setInstrument('ES')
    setDirection('LONG')
    setSetupTypes([])
    setSignals([])
    setHasConfluence(false)
    setPoints('')
    setSlPoints('')
    setResult('win')
    setNotes('')
    setImagePreview(null)
    setImageUrl(null)
  }

  async function handleSave() {
    if (!userId || setupTypes.length === 0) return
    setSaving(true)
    const p = parseFloat(points) || 0
    const s = parseFloat(slPoints) || 0
    await supabase.from('backtests').insert({
      trader_id: userId,
      date,
      instrument,
      direction,
      setup_types: setupTypes,
      signals,
      has_confluence: hasConfluence,
      points: p,
      sl_points: s,
      r_result: s > 0 ? Math.round((p / s) * 100) / 100 : 0,
      result,
      notes: notes.trim() || null,
      image_url: imageUrl,
    })
    setSaving(false)
    resetForm()
    await fetchEntries(userId)
  }

  async function deleteEntry(id: string) {
    if (!userId || !confirm('Supprimer ce backtest ?')) return
    await supabase.from('backtests').delete().eq('id', id)
    await fetchEntries(userId)
  }

  // ── Filtered entries ──

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterInstrument && e.instrument !== filterInstrument) return false
      if (filterFrom && e.date < filterFrom) return false
      if (filterTo && e.date > filterTo) return false
      return true
    })
  }, [entries, filterInstrument, filterFrom, filterTo])

  // ── Stats computation ──

  const stats = useMemo(() => {
    const f = filtered
    const total = f.length
    const wins = f.filter(e => e.result === 'win').length
    const losses = f.filter(e => e.result === 'loss').length
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    const avgR = total > 0 ? Math.round(f.reduce((s, e) => s + e.r_result, 0) / total * 100) / 100 : 0

    // Profit factor = sum of winning R / abs(sum of losing R)
    const winningR = f.filter(e => e.result === 'win').reduce((s, e) => s + e.r_result, 0)
    const losingR = f.filter(e => e.result === 'loss').reduce((s, e) => s + Math.abs(e.r_result), 0)
    const profitFactor = losingR > 0 ? Math.round((winningR / losingR) * 100) / 100 : winningR > 0 ? Infinity : 0

    // Per-setup stats
    const setupStats: Record<string, { total: number; wins: number }> = {}
    ALL_SETUPS.forEach(s => { setupStats[s] = { total: 0, wins: 0 } })
    f.forEach(e => {
      e.setup_types.forEach(st => {
        if (!setupStats[st]) setupStats[st] = { total: 0, wins: 0 }
        setupStats[st].total++
        if (e.result === 'win') setupStats[st].wins++
      })
    })

    // Per-signal stats
    const signalStats: Record<string, { total: number; wins: number }> = {}
    SIGNALS.forEach(s => { signalStats[s] = { total: 0, wins: 0 } })
    f.forEach(e => {
      e.signals.forEach(sig => {
        if (!signalStats[sig]) signalStats[sig] = { total: 0, wins: 0 }
        signalStats[sig].total++
        if (e.result === 'win') signalStats[sig].wins++
      })
    })

    // Best setup
    let bestSetup = '-'
    let bestSetupWR = 0
    Object.entries(setupStats).forEach(([name, s]) => {
      if (s.total >= 3) {
        const wr = (s.wins / s.total) * 100
        if (wr > bestSetupWR) { bestSetupWR = wr; bestSetup = name }
      }
    })

    // Timeframe analysis
    const tfStats: Record<string, { total: number; wins: number }> = {}
    f.forEach(e => {
      e.setup_types.forEach(st => {
        const tfMatch = st.match(/(M1|M5|M15|H1|H4)/)
        if (tfMatch) {
          const tf = tfMatch[1]
          if (!tfStats[tf]) tfStats[tf] = { total: 0, wins: 0 }
          tfStats[tf].total++
          if (e.result === 'win') tfStats[tf].wins++
        }
      })
    })

    // Confluence vs single
    const confEntries = f.filter(e => e.has_confluence)
    const singleEntries = f.filter(e => !e.has_confluence)
    const confWR = confEntries.length > 0 ? Math.round((confEntries.filter(e => e.result === 'win').length / confEntries.length) * 100) : 0
    const singleWR = singleEntries.length > 0 ? Math.round((singleEntries.filter(e => e.result === 'win').length / singleEntries.length) * 100) : 0

    return {
      total, wins, losses, winRate, avgR, profitFactor,
      bestSetup, bestSetupWR: Math.round(bestSetupWR),
      setupStats, signalStats, tfStats,
      confWR, singleWR, confCount: confEntries.length, singleCount: singleEntries.length,
    }
  }, [filtered])

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Backtest</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>
          Analysez vos setups ATP et identifiez vos patterns les plus profitables
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['saisie', 'resultats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: tab === t ? 'var(--green, #22c55e)' : 'transparent',
              color: tab === t ? '#000' : 'var(--text3)',
            }}
          >
            {t === 'saisie' ? 'Saisie' : 'Resultats'}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB SAISIE ═══════════════════ */}
      {tab === 'saisie' && (
        <Card>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 20 }}>
            Nouveau backtest
          </p>

          {/* Row 1: Date, Instrument, Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Instrument</label>
              <select value={instrument} onChange={e => setInstrument(e.target.value)} style={inputStyle}>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direction</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['LONG', 'SHORT'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: direction === d ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 0.15s',
                      background: direction === d
                        ? (d === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)')
                        : 'var(--bg3)',
                      color: direction === d
                        ? (d === 'LONG' ? '#22c55e' : '#ef4444')
                        : 'var(--text3)',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Setup types */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Types de Setup</label>
            {Object.entries(SETUP_GROUPS).map(([group, items]) => (
              <div key={group} style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>{group}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map(item => (
                    <span
                      key={item}
                      onClick={() => toggleChip(item, setupTypes, setSetupTypes)}
                      style={setupTypes.includes(item) ? chipActive : chipBase}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Signal d'entree */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Signal d&apos;entree</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SIGNALS.map(sig => (
                <span
                  key={sig}
                  onClick={() => toggleChip(sig, signals, setSignals)}
                  style={signals.includes(sig) ? chipActive : chipBase}
                >
                  {sig}
                </span>
              ))}
            </div>
          </div>

          {/* Confluence */}
          <div style={{ marginBottom: 20 }}>
            <label
              onClick={() => setHasConfluence(!hasConfluence)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 6, border: hasConfluence ? '2px solid #22c55e' : '2px solid var(--border)',
                background: hasConfluence ? 'rgba(34,197,94,0.15)' : 'var(--bg3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
              }}>
                {hasConfluence && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
                Confluence (plusieurs elements alignes)
              </span>
            </label>
          </div>

          {/* Row: Points, SL, R, Result */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Points gagnes</label>
              <input
                type="number" step="any" value={points}
                onChange={e => setPoints(e.target.value)}
                placeholder="0" style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>SL (points)</label>
              <input
                type="number" step="any" value={slPoints}
                onChange={e => setSlPoints(e.target.value)}
                placeholder="0" style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>R (auto)</label>
              <div style={{
                ...inputStyle, display: 'flex', alignItems: 'center',
                fontWeight: 700, color: rResult > 0 ? '#22c55e' : rResult < 0 ? '#ef4444' : 'var(--text3)',
                background: 'var(--bg)', cursor: 'default',
              }}>
                {rResult > 0 ? '+' : ''}{rResult}R
              </div>
            </div>
            <div>
              <label style={labelStyle}>Resultat</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['win', 'loss', 'be'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setResult(r)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: result === r ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 0.15s', textTransform: 'uppercase',
                      background: result === r ? resultBg(r) : 'var(--bg3)',
                      color: result === r ? resultColor(r) : 'var(--text3)',
                    }}
                  >
                    {r === 'be' ? 'BE' : r === 'win' ? 'WIN' : 'LOSS'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Observations, contexte du marche, erreurs..."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            />
          </div>

          {/* Image */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Screenshot</label>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)',
                  cursor: 'pointer',
                }}
              >
                {uploading ? 'Upload...' : imagePreview ? 'Changer' : 'Ajouter une image'}
              </button>
              {imagePreview && (
                <img src={imagePreview} alt="preview" style={{ height: 40, borderRadius: 6, border: '1px solid var(--border)' }} />
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={resetForm}>Reset</Button>
            <Button onClick={handleSave} loading={saving} disabled={setupTypes.length === 0}>
              Sauvegarder le backtest
            </Button>
          </div>
        </Card>
      )}

      {/* ═══════════════════ TAB RESULTATS ═══════════════════ */}
      {tab === 'resultats' && (
        <div>
          {/* Info + Filters */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 16, fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, borderLeft: '3px solid var(--green)' }}>
            Par défaut, toutes vos données sont affichées. Utilisez les filtres ci-dessous pour analyser une période ou un instrument spécifique.
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ ...labelStyle, marginBottom: 4 }}>Instrument</label>
              <select value={filterInstrument} onChange={e => setFilterInstrument(e.target.value)} style={{ ...inputStyle, width: 120 }}>
                <option value="">Tous</option>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 4 }}>Du</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 4 }}>Au</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            </div>
            {(filterInstrument || filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterInstrument(''); setFilterFrom(''); setFilterTo('') }}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer' }}
              >
                Reset filtres
              </button>
            )}
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
            <div style={kpiCardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total setups</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{stats.total}</p>
            </div>
            <div style={kpiCardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Win Rate</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: winRateColor(stats.winRate), lineHeight: 1 }}>{stats.winRate}%</p>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{stats.wins}W / {stats.losses}L</p>
            </div>
            <div style={kpiCardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>R Moyen</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: stats.avgR >= 0 ? '#22c55e' : '#ef4444', lineHeight: 1 }}>
                {stats.avgR > 0 ? '+' : ''}{stats.avgR}R
              </p>
            </div>
            <div style={kpiCardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Meilleur setup</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', lineHeight: 1.3 }}>{stats.bestSetup}</p>
              {stats.bestSetup !== '-' && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{stats.bestSetupWR}% WR</p>}
            </div>
            <div style={kpiCardStyle}>
              <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Profit Factor</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: stats.profitFactor >= 1 ? '#22c55e' : '#ef4444', lineHeight: 1 }}>
                {stats.profitFactor === Infinity ? '++' : stats.profitFactor}
              </p>
            </div>
          </div>

          {stats.total === 0 ? (
            <Card>
              <div className="text-center" style={{ padding: '60px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Aucun backtest enregistré</p>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Commence par saisir tes premiers setups dans l&apos;onglet Saisie pour voir tes stats ici</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 2-column grid: Setups + Signals */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Meilleurs Setups */}
                <Card>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>Meilleurs Setups</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {Object.entries(stats.setupStats)
                      .filter(([, s]) => s.total > 0)
                      .sort((a, b) => {
                        const wrA = a[1].total > 0 ? a[1].wins / a[1].total : 0
                        const wrB = b[1].total > 0 ? b[1].wins / b[1].total : 0
                        return wrB - wrA
                      })
                      .map(([name, s]) => {
                        const wr = Math.round((s.wins / s.total) * 100)
                        return (
                          <div key={name} style={{
                            padding: '10px 14px', borderRadius: 10,
                            background: winRateBg(wr), border: `1px solid ${winRateColor(wr)}22`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: winRateColor(wr) }}>{wr}%</span>
                            </div>
                            <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.total} trade{s.total > 1 ? 's' : ''}</p>
                          </div>
                        )
                      })}
                  </div>
                </Card>

                {/* Meilleurs Signaux */}
                <Card>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>Meilleurs Signaux</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {Object.entries(stats.signalStats)
                      .filter(([, s]) => s.total > 0)
                      .sort((a, b) => {
                        const wrA = a[1].total > 0 ? a[1].wins / a[1].total : 0
                        const wrB = b[1].total > 0 ? b[1].wins / b[1].total : 0
                        return wrB - wrA
                      })
                      .map(([name, s]) => {
                        const wr = Math.round((s.wins / s.total) * 100)
                        return (
                          <div key={name} style={{
                            padding: '10px 14px', borderRadius: 10,
                            background: winRateBg(wr), border: `1px solid ${winRateColor(wr)}22`,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: winRateColor(wr) }}>{wr}%</span>
                            </div>
                            <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{s.total} trade{s.total > 1 ? 's' : ''}</p>
                          </div>
                        )
                      })}
                  </div>
                </Card>
              </div>

              {/* 2-column: Timeframe + Confluence */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Timeframe */}
                <Card>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>Timeframe le plus rentable</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(stats.tfStats)
                      .sort((a, b) => {
                        const wrA = a[1].total > 0 ? a[1].wins / a[1].total : 0
                        const wrB = b[1].total > 0 ? b[1].wins / b[1].total : 0
                        return wrB - wrA
                      })
                      .map(([tf, s]) => {
                        const wr = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0
                        return (
                          <div key={tf} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', width: 40 }}>{tf}</span>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg3)', overflow: 'hidden' }}>
                              <div style={{ width: `${wr}%`, height: '100%', borderRadius: 4, background: winRateColor(wr), transition: 'width 0.5s ease' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: winRateColor(wr), width: 40, textAlign: 'right' }}>{wr}%</span>
                            <span style={{ fontSize: 10, color: 'var(--text3)', width: 50 }}>{s.total} trades</span>
                          </div>
                        )
                      })}
                    {Object.keys(stats.tfStats).length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text3)' }}>Pas assez de donnees</p>
                    )}
                  </div>
                </Card>

                {/* Confluence vs Single */}
                <Card>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>Confluences vs Single</p>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{
                      flex: 1, padding: 20, borderRadius: 12, textAlign: 'center',
                      background: stats.confWR >= stats.singleWR ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
                      border: stats.confWR >= stats.singleWR ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Confluence</p>
                      <p style={{ fontSize: 32, fontWeight: 800, color: winRateColor(stats.confWR), lineHeight: 1 }}>{stats.confWR}%</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{stats.confCount} trades</p>
                    </div>
                    <div style={{
                      flex: 1, padding: 20, borderRadius: 12, textAlign: 'center',
                      background: stats.singleWR > stats.confWR ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
                      border: stats.singleWR > stats.confWR ? '1px solid rgba(34,197,94,0.25)' : '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Single</p>
                      <p style={{ fontSize: 32, fontWeight: 800, color: winRateColor(stats.singleWR), lineHeight: 1 }}>{stats.singleWR}%</p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{stats.singleCount} trades</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Recent entries table */}
              <Card>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>
                  Historique ({filtered.length} entree{filtered.length !== 1 ? 's' : ''})
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Instr.', 'Dir.', 'Setups', 'Signal', 'Conf.', 'Pts', 'SL', 'R', 'Result', 'Img', ''].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(e => (
                        <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px', color: 'var(--text)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {new Date(e.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg3)', color: 'var(--text2)', fontWeight: 600, fontSize: 11 }}>{e.instrument}</span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ color: e.direction === 'LONG' ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: 11 }}>{e.direction}</span>
                          </td>
                          <td style={{ padding: '10px', maxWidth: 180 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {e.setup_types.slice(0, 3).map(s => (
                                <span key={s} style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', fontSize: 10, fontWeight: 500 }}>{s}</span>
                              ))}
                              {e.setup_types.length > 3 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>+{e.setup_types.length - 3}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px', maxWidth: 140 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {e.signals.slice(0, 2).map(s => (
                                <span key={s} style={{ padding: '1px 5px', borderRadius: 4, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: 10, fontWeight: 500 }}>{s}</span>
                              ))}
                              {e.signals.length > 2 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>+{e.signals.length - 2}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {e.has_confluence && (
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                            )}
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text)', fontFamily: 'monospace', fontWeight: 600 }}>{e.points}</td>
                          <td style={{ padding: '10px', color: 'var(--text3)', fontFamily: 'monospace' }}>{e.sl_points}</td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: e.r_result > 0 ? '#22c55e' : e.r_result < 0 ? '#ef4444' : 'var(--text3)' }}>
                            {e.r_result > 0 ? '+' : ''}{e.r_result}R
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10,
                              textTransform: 'uppercase',
                              background: resultBg(e.result), color: resultColor(e.result),
                            }}>
                              {e.result === 'be' ? 'BE' : e.result.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            {e.image_url && (
                              <img
                                src={e.image_url}
                                alt="setup"
                                onClick={() => setViewImage(e.image_url)}
                                style={{ width: 36, height: 28, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer' }}
                              />
                            )}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <button
                              onClick={() => deleteEntry(e.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', opacity: 0.5, fontSize: 14 }}
                              title="Supprimer"
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Image modal */}
      {viewImage && (
        <div
          onClick={() => setViewImage(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.8)', cursor: 'zoom-out' }}
        >
          <img src={viewImage} alt="Setup screenshot" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, border: '1px solid var(--border)' }} />
        </div>
      )}
    </div>
  )
}
