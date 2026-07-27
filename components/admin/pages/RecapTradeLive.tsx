'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip as ChartTooltip, Filler } from 'chart.js'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { toneForPnl, toneForRate } from '@/lib/format'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTooltip, Filler)

interface LiveTrade {
  id: string
  trade_date: string
  instrument: string
  direction: 'long' | 'short'
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  r_result: number
  points: number | null
  result: 'win' | 'loss' | 'breakeven'
  setup_type: string | null
  notes: string | null
  created_at: string
}

const INSTRUMENTS = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ', 'GC', 'MGC']
const SETUPS = ['Break of Structure', 'Order Block', 'Fair Value Gap', 'Liquidity Sweep', 'Fibonacci', 'Supply/Demand', 'Trend Continuation', 'Reversal', 'Scalp', 'Autre']

type Tab = 'trades' | 'perf'
type PerfPeriod = 'all' | 'week' | 'day' | 'range' | 'month' | 'year'

const RESULT_TONE: Record<LiveTrade['result'], BadgeTone> = {
  win:       'profit',
  loss:      'loss',
  breakeven: 'warn',
}
const RESULT_LABEL: Record<LiveTrade['result'], string> = {
  win:       'Win',
  loss:      'Loss',
  breakeven: 'BE',
}

// Segmented controls / form radio-buttons restent inline (patterns
// SegmentedControl à extraire quand 3+ sites migrés — cf REFONTE.md).
// Setup badge inline table utilise #60a5fa (bleu non-tokénisé) —
// laissé inline en attendant les tokens dédiés (Backtest en a le même besoin).

export default function RecapTradeLive() {
  const [trades, setTrades] = useState<LiveTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('trades')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formInstrument, setFormInstrument] = useState('ES')
  const [formDirection, setFormDirection] = useState<'long' | 'short'>('long')
  const [formEntry, setFormEntry] = useState('')
  const [formExit, setFormExit] = useState('')
  const [formSL, setFormSL] = useState('')
  const [formR, setFormR] = useState('')
  const [formPoints, setFormPoints] = useState('')
  const [formResult, setFormResult] = useState<'win' | 'loss' | 'breakeven'>('win')
  const [formSetup, setFormSetup] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Filters
  const [filterDate, setFilterDate] = useState('')

  // Perf filter
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('all')
  const [perfDay, setPerfDay] = useState(new Date().toISOString().split('T')[0])
  const [perfRangeFrom, setPerfRangeFrom] = useState('')
  const [perfRangeTo, setPerfRangeTo] = useState('')
  const [perfMonth, setPerfMonth] = useState(new Date().toISOString().slice(0, 7))
  const [perfYear, setPerfYear] = useState(String(new Date().getFullYear()))

  const supabase = createClient()

  async function fetchTrades() {
    const { data } = await supabase
      .from('live_trades')
      .select('*')
      .order('trade_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setTrades(data as LiveTrade[])
    setLoading(false)
  }

  useEffect(() => { fetchTrades() }, [])

  function resetForm() {
    setFormDate(new Date().toISOString().split('T')[0])
    setFormInstrument('ES')
    setFormDirection('long')
    setFormEntry('')
    setFormExit('')
    setFormSL('')
    setFormR('')
    setFormPoints('')
    setFormResult('win')
    setFormSetup('')
    setFormNotes('')
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(t: LiveTrade) {
    setEditingId(t.id)
    setFormDate(t.trade_date)
    setFormInstrument(t.instrument)
    setFormDirection(t.direction)
    setFormEntry(t.entry_price != null ? String(t.entry_price) : '')
    setFormExit(t.exit_price != null ? String(t.exit_price) : '')
    setFormSL(t.stop_loss != null ? String(t.stop_loss) : '')
    setFormR(String(t.r_result))
    setFormPoints(t.points != null ? String(t.points) : '')
    setFormResult(t.result)
    setFormSetup(t.setup_type ?? '')
    setFormNotes(t.notes ?? '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!formR) return
    setSaving(true)
    const payload = {
      trade_date: formDate,
      instrument: formInstrument,
      direction: formDirection,
      entry_price: formEntry ? parseFloat(formEntry) : null,
      exit_price: formExit ? parseFloat(formExit) : null,
      stop_loss: formSL ? parseFloat(formSL) : null,
      r_result: parseFloat(formR) || 0,
      points: formPoints ? parseFloat(formPoints) : null,
      result: formResult,
      setup_type: formSetup || null,
      notes: formNotes.trim() || null,
    }
    if (editingId) {
      await supabase.from('live_trades').update(payload).eq('id', editingId)
    } else {
      await supabase.from('live_trades').insert(payload)
    }
    setSaving(false)
    resetForm()
    fetchTrades()
  }

  async function deleteTrade(id: string) {
    if (!confirm('Supprimer ce trade ?')) return
    await supabase.from('live_trades').delete().eq('id', id)
    fetchTrades()
  }

  // Filtered trades
  const filteredTrades = filterDate
    ? trades.filter(t => t.trade_date === filterDate)
    : trades

  const perfTrades = useMemo(() => {
    if (perfPeriod === 'all') return trades
    if (perfPeriod === 'week') {
      const now = new Date()
      const day = now.getDay()
      const diffToMon = day === 0 ? 6 : day - 1
      const monday = new Date(now)
      monday.setDate(now.getDate() - diffToMon)
      monday.setHours(0, 0, 0, 0)
      const monStr = monday.toISOString().split('T')[0]
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const sunStr = sunday.toISOString().split('T')[0]
      return trades.filter(t => t.trade_date >= monStr && t.trade_date <= sunStr)
    }
    if (perfPeriod === 'day' && perfDay) return trades.filter(t => t.trade_date === perfDay)
    if (perfPeriod === 'range' && perfRangeFrom && perfRangeTo) return trades.filter(t => t.trade_date >= perfRangeFrom && t.trade_date <= perfRangeTo)
    if (perfPeriod === 'month' && perfMonth) {
      const [y, m] = perfMonth.split('-')
      const last = new Date(Number(y), Number(m), 0).getDate()
      return trades.filter(t => t.trade_date >= `${perfMonth}-01` && t.trade_date <= `${perfMonth}-${String(last).padStart(2, '0')}`)
    }
    if (perfPeriod === 'year' && perfYear) return trades.filter(t => t.trade_date.startsWith(perfYear))
    return trades
  }, [trades, perfPeriod, perfDay, perfRangeFrom, perfRangeTo, perfMonth, perfYear])

  // ─── PERF STATS (based on perfTrades) ───
  const totalR = perfTrades.reduce((s, t) => s + Number(t.r_result), 0)
  const wins = perfTrades.filter(t => t.result === 'win')
  const losses = perfTrades.filter(t => t.result === 'loss')
  const bes = perfTrades.filter(t => t.result === 'breakeven')
  const winRate = perfTrades.length > 0 ? (wins.length / perfTrades.length) * 100 : 0
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.r_result), 0) / wins.length : 0
  const bestTrade = perfTrades.length > 0 ? Math.max(...perfTrades.map(t => Number(t.r_result))) : 0
  const worstTrade = perfTrades.length > 0 ? Math.min(...perfTrades.map(t => Number(t.r_result))) : 0
  const grossWinR = wins.reduce((s, t) => s + Number(t.r_result), 0)
  const grossLossR = Math.abs(losses.reduce((s, t) => s + Number(t.r_result), 0))
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? Infinity : 0

  // Daily breakdown
  const dailyMap = new Map<string, { r: number; trades: number; wins: number }>()
  for (const t of perfTrades) {
    const d = dailyMap.get(t.trade_date) ?? { r: 0, trades: 0, wins: 0 }
    d.r += Number(t.r_result)
    d.trades++
    if (t.result === 'win') d.wins++
    dailyMap.set(t.trade_date, d)
  }
  const dailyStats = Array.from(dailyMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  const dailyStatsAsc = [...dailyStats].reverse()

  // Setup breakdown
  const setupMap = new Map<string, { r: number; count: number; wins: number }>()
  for (const t of perfTrades) {
    const key = t.setup_type || 'Non défini'
    const s = setupMap.get(key) ?? { r: 0, count: 0, wins: 0 }
    s.r += Number(t.r_result)
    s.count++
    if (t.result === 'win') s.wins++
    setupMap.set(key, s)
  }
  const setupStats = Array.from(setupMap.entries()).sort((a, b) => b[1].r - a[1].r)

  // Streak
  let currentStreak = 0
  let streakType: 'win' | 'loss' | null = null
  for (const t of [...perfTrades].reverse()) {
    if (t.result === 'breakeven') continue
    if (!streakType) { streakType = t.result as 'win' | 'loss'; currentStreak = 1 }
    else if (t.result === streakType) currentStreak++
    else break
  }

  // ─── CHARTS DATA ───
  const cumulativeRData = useMemo(() => {
    const sorted = [...perfTrades].sort((a, b) => a.trade_date.localeCompare(b.trade_date) || a.created_at.localeCompare(b.created_at))
    let cumR = 0
    const labels: string[] = []
    const data: number[] = []
    sorted.forEach((t, i) => {
      cumR += Number(t.r_result)
      labels.push(`#${i + 1}`)
      data.push(parseFloat(cumR.toFixed(2)))
    })
    return { labels, data }
  }, [perfTrades])

  const dailyBarData = useMemo(() => {
    const labels = dailyStatsAsc.map(([d]) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))
    const data = dailyStatsAsc.map(([, d]) => parseFloat(d.r.toFixed(2)))
    const colors = data.map(v => v >= 0 ? 'rgba(var(--color-profit-rgb), 0.7)' : 'rgba(var(--color-loss-rgb), 0.7)')
    return { labels, data, colors }
  }, [dailyStatsAsc])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-1)',
    fontSize: 13, outline: 'none', colorScheme: 'dark',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-label)',
    color: 'var(--color-text-3)',
    marginBottom: 4,
  }

  const tradesColumns: Column<LiveTrade>[] = [
    {
      id: 'date', header: 'Date',
      accessor: t => new Date(t.trade_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      sortable: true, sortValue: t => t.trade_date, numeric: true, align: 'left',
    },
    {
      id: 'inst', header: 'Inst.',
      accessor: t => <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-1)' }}>{t.instrument}</span>,
      sortable: true, sortValue: t => t.instrument,
    },
    {
      id: 'dir', header: 'Dir.',
      accessor: t => (
        <span style={{ fontWeight: 600, color: t.direction === 'long' ? 'var(--color-profit)' : 'var(--color-loss)' }}>
          {t.direction === 'long' ? '▲' : '▼'} {t.direction}
        </span>
      ),
    },
    {
      id: 'setup', header: 'Setup',
      accessor: t => t.setup_type
        ? <span style={{
            fontSize: 'var(--text-label)', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(96,165,250,0.10)', color: '#60a5fa',
          }}>{t.setup_type}</span>
        : <span style={{ color: 'var(--color-text-3)' }}>—</span>,
    },
    { id: 'entry', header: 'Entry', numeric: true,
      accessor: t => t.entry_price ?? '—' },
    { id: 'exit', header: 'Exit', numeric: true,
      accessor: t => t.exit_price ?? '—' },
    { id: 'sl', header: 'SL', numeric: true,
      accessor: t => <span style={{ color: 'var(--color-loss)' }}>{t.stop_loss ?? '—'}</span> },
    {
      id: 'result', header: 'Résultat',
      accessor: t => <Badge tone={RESULT_TONE[t.result]} size="sm">{RESULT_LABEL[t.result]}</Badge>,
      sortable: true, sortValue: t => t.result,
    },
    {
      id: 'r', header: 'R', numeric: true, sortable: true, sortValue: t => Number(t.r_result),
      accessor: t => {
        const r = Number(t.r_result)
        return (
          <span style={{ fontWeight: 700, color: r >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            {r >= 0 ? '+' : ''}{r.toFixed(1)}R
          </span>
        )
      },
    },
    {
      id: 'pts', header: 'Pts', numeric: true, sortable: true, sortValue: t => Number(t.points ?? 0),
      accessor: t => {
        if (t.points == null) return '—'
        const v = Number(t.points)
        return (
          <span style={{ color: v >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            {v >= 0 ? '+' : ''}{v.toFixed(1)}
          </span>
        )
      },
    },
    {
      id: 'notes', header: 'Notes',
      accessor: t => (
        <span
          style={{
            display: 'inline-block',
            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--color-text-3)',
          }}
        >
          {t.notes || '—'}
        </span>
      ),
    },
    {
      id: 'actions', header: '', align: 'right',
      accessor: t => (
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => openEdit(t)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--color-text-3)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </button>
          <button
            onClick={() => deleteTrade(t.id)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--color-loss)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--color-loss-rgb), 0.10)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ),
    },
  ]

  const periods: { id: PerfPeriod; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'week', label: 'Semaine' },
    { id: 'day', label: 'Jour' },
    { id: 'range', label: 'Plage' },
    { id: 'month', label: 'Mois' },
    { id: 'year', label: 'Année' },
  ]

  const tabs: { id: Tab; label: string }[] = [
    { id: 'trades', label: 'Trades' },
    { id: 'perf', label: 'Performance' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Récap Trade Live"
        size="sm"
        actions={
          <>
            {/* Tabs — pattern SegmentedControl à extraire, cf REFONTE.md */}
            <div className="flex gap-1 mr-2">
              {tabs.map(t => {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontSize: 'var(--text-label)',
                      fontWeight: 500,
                      background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'var(--color-surface-2)',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
                      border: `1px solid ${active ? 'rgba(var(--color-accent-rgb), 0.20)' : 'var(--color-border-subtle)'}`,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {tab === 'trades' && !showForm && (
              <Button onClick={() => setShowForm(true)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nouveau trade
              </Button>
            )}
          </>
        }
      />

      {/* ═══ TRADES TAB ═══ */}
      {tab === 'trades' && (
        <>
          {/* Add/Edit form */}
          {showForm && (
            <Card>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 1rem 0' }}>
                {editingId ? 'Modifier le trade' : 'Nouveau trade'}
              </h3>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Instrument</label>
                  <select value={formInstrument} onChange={e => setFormInstrument(e.target.value)} style={inputStyle}>
                    {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Direction</label>
                  <div className="flex gap-2">
                    {(['long', 'short'] as const).map(d => {
                      const active = formDirection === d
                      const tone = d === 'long' ? 'profit' : 'loss'
                      return (
                        <button
                          key={d}
                          onClick={() => setFormDirection(d)}
                          className="flex-1 py-2 rounded-lg transition-all"
                          style={{
                            fontSize: 'var(--text-label)', fontWeight: 600,
                            background: active ? `rgba(var(--color-${tone}-rgb), 0.10)` : 'var(--color-surface-2)',
                            border: `2px solid ${active ? `var(--color-${tone})` : 'var(--color-border-subtle)'}`,
                            color: active ? `var(--color-${tone})` : 'var(--color-text-3)',
                          }}
                        >
                          {d === 'long' ? '▲ Long' : '▼ Short'}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Résultat</label>
                  <div className="flex gap-1">
                    {(['win', 'loss', 'breakeven'] as const).map(r => {
                      const active = formResult === r
                      const tone = r === 'win' ? 'profit' : r === 'loss' ? 'loss' : 'warn'
                      return (
                        <button
                          key={r}
                          onClick={() => setFormResult(r)}
                          className="flex-1 py-2 rounded-lg transition-all"
                          style={{
                            fontSize: '0.6875rem', fontWeight: 600,
                            background: active ? `rgba(var(--color-${tone}-rgb), 0.10)` : 'var(--color-surface-2)',
                            border: `2px solid ${active ? `var(--color-${tone})` : 'var(--color-border-subtle)'}`,
                            color: active ? `var(--color-${tone})` : 'var(--color-text-3)',
                          }}
                        >
                          {RESULT_LABEL[r]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-3 mb-3">
                <div>
                  <label style={labelStyle}>R Résultat</label>
                  <input type="number" step={0.1} value={formR} onChange={e => setFormR(e.target.value)} placeholder="ex: +2.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Points</label>
                  <input type="number" step="any" value={formPoints} onChange={e => setFormPoints(e.target.value)} placeholder="ex: 12.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Entry (optionnel)</label>
                  <input type="number" step="any" value={formEntry} onChange={e => setFormEntry(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Exit (optionnel)</label>
                  <input type="number" step="any" value={formExit} onChange={e => setFormExit(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Stop Loss (optionnel)</label>
                  <input type="number" step="any" value={formSL} onChange={e => setFormSL(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label style={labelStyle}>Setup</label>
                  <select value={formSetup} onChange={e => setFormSetup(e.target.value)} style={inputStyle}>
                    <option value="">Aucun</option>
                    {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Commentaire rapide..." style={inputStyle} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} loading={saving} disabled={!formR}>{editingId ? 'Mettre à jour' : 'Ajouter'}</Button>
                <Button variant="secondary" onClick={resetForm}>Annuler</Button>
              </div>
            </Card>
          )}

          {/* Filter by date */}
          <div className="flex items-center gap-3">
            <label style={{ fontSize: 'var(--text-label)', fontWeight: 500, color: 'var(--color-text-3)' }}>
              Filtrer par jour :
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg outline-none"
              style={{
                fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-1)',
                colorScheme: 'dark',
              }}
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-1)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-3)' }}
              >
                Tout afficher
              </button>
            )}
            <span className="ml-auto" style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
              {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''}
              {filterDate && ` le ${new Date(filterDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
            </span>
          </div>

          {/* Trades table */}
          <DataTable
            columns={tradesColumns}
            rows={filteredTrades}
            rowKey={t => t.id}
            loading={loading}
            defaultSort={{ columnId: 'date', dir: 'desc' }}
            empty={<EmptyState title="Aucun trade" description="Aucun trade partagé sur cette période." />}
          />
        </>
      )}

      {/* ═══ PERF TAB ═══ */}
      {tab === 'perf' && (
        <>
          {/* Period filter — pattern SegmentedControl à extraire */}
          <div
            className="flex items-center gap-2 flex-wrap p-3"
            style={{
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <span
              className="mr-1"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--color-text-3)',
              }}
            >
              Période :
            </span>
            {periods.map(f => {
              const active = perfPeriod === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setPerfPeriod(f.id)}
                  className="px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    fontSize: 'var(--text-label)', fontWeight: 500,
                    background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
                    border: `1px solid ${active ? 'rgba(var(--color-accent-rgb), 0.20)' : 'transparent'}`,
                  }}
                >
                  {f.label}
                </button>
              )
            })}
            <div className="h-5 w-px mx-1" style={{ background: 'var(--color-border-subtle)' }} />
            {perfPeriod === 'day' && (
              <input type="date" value={perfDay} onChange={e => setPerfDay(e.target.value)} className="px-2 py-1.5 rounded-lg outline-none" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)', colorScheme: 'dark' }} />
            )}
            {perfPeriod === 'range' && (
              <div className="flex items-center gap-2">
                <input type="date" value={perfRangeFrom} onChange={e => setPerfRangeFrom(e.target.value)} className="px-2 py-1.5 rounded-lg outline-none" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)', colorScheme: 'dark' }} />
                <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>→</span>
                <input type="date" value={perfRangeTo} onChange={e => setPerfRangeTo(e.target.value)} className="px-2 py-1.5 rounded-lg outline-none" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)', colorScheme: 'dark' }} />
              </div>
            )}
            {perfPeriod === 'month' && (
              <input type="month" value={perfMonth} onChange={e => setPerfMonth(e.target.value)} className="px-2 py-1.5 rounded-lg outline-none" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)', colorScheme: 'dark' }} />
            )}
            {perfPeriod === 'year' && (
              <select value={perfYear} onChange={e => setPerfYear(e.target.value)} className="px-2 py-1.5 rounded-lg outline-none" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)' }}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <span className="ml-auto" style={{ fontSize: 'var(--text-label)', fontWeight: 500, color: 'var(--color-profit)' }}>
              {perfTrades.length} trade{perfTrades.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* KPI Cards — row 1 */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="R Total"        value={`${totalR >= 0 ? '+' : ''}${totalR.toFixed(1)}R`}                               tone={toneForPnl(totalR)}   loading={loading} />
            <KpiCard label="Win Rate"       value={`${winRate.toFixed(1)}%`}                                                       tone={toneForRate(winRate, 50)} loading={loading} />
            <KpiCard label="Profit Factor"  value={profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}                      tone={profitFactor >= 1.5 ? 'profit' : profitFactor >= 1 ? 'warn' : 'loss'} loading={loading} />
            <KpiCard label="Nb Trades"      value={String(perfTrades.length)}                                                      tone="neutral"              loading={loading} />
          </div>

          {/* KPI Cards — row 2 */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="R moyen (wins)"  value={`+${avgWinR.toFixed(2)}R`}                                                                                     tone={avgWinR > 0 ? 'profit' : 'neutral'} loading={loading} />
            <KpiCard label="Points cumulés"  value={(() => { const pts = perfTrades.reduce((s, t) => s + (Number(t.points) || 0), 0); return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts` })()} tone={toneForPnl(perfTrades.reduce((s, t) => s + (Number(t.points) || 0), 0))} loading={loading} />
            <KpiCard label="Meilleur trade"  value={`+${bestTrade.toFixed(1)}R`}                                                                                    tone={bestTrade > 0 ? 'profit' : 'neutral'} loading={loading} />
            <KpiCard label="Pire trade"      value={`${worstTrade.toFixed(1)}R`}                                                                                    tone={worstTrade < 0 ? 'loss' : 'neutral'}  loading={loading} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            {/* Cumulative R curve */}
            <Card>
              <p style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                R Cumulé
              </p>
              {cumulativeRData.data.length === 0 ? (
                <p style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)', textAlign: 'center', padding: '2rem 0' }}>Aucune donnée</p>
              ) : (
                <div style={{ height: 220 }}>
                  <Line
                    data={{
                      labels: cumulativeRData.labels,
                      datasets: [{
                        data: cumulativeRData.data,
                        borderColor: totalR >= 0 ? '#22c55e' : '#ef4444',
                        backgroundColor: totalR >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: cumulativeRData.data.length > 50 ? 0 : 3,
                        pointBackgroundColor: totalR >= 0 ? '#22c55e' : '#ef4444',
                        borderWidth: 2,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y ?? 0) >= 0 ? '+' : ''}${ctx.parsed.y ?? 0}R` } } },
                      scales: {
                        x: { display: false },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a82', font: { size: 10 }, callback: v => `${v}R` } },
                      },
                    }}
                  />
                </div>
              )}
            </Card>

            {/* Daily R histogram */}
            <Card>
              <p style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                R par jour
              </p>
              {dailyBarData.data.length === 0 ? (
                <p style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)', textAlign: 'center', padding: '2rem 0' }}>Aucune donnée</p>
              ) : (
                <div style={{ height: 220 }}>
                  <Bar
                    data={{
                      labels: dailyBarData.labels,
                      datasets: [{
                        data: dailyBarData.data,
                        backgroundColor: dailyBarData.colors,
                        borderRadius: 4,
                        maxBarThickness: 32,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { tooltip: { callbacks: { label: ctx => `${(ctx.parsed.y ?? 0) >= 0 ? '+' : ''}${ctx.parsed.y ?? 0}R` } } },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: '#5a6a82', font: { size: 10 } } },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a6a82', font: { size: 10 }, callback: v => `${v}R` } },
                      },
                    }}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* Breakdown row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Win/Loss/BE */}
            <Card>
              <p style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                Répartition
              </p>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                  {perfTrades.length > 0 && (
                    <div className="flex h-full">
                      <div style={{ width: `${(wins.length / perfTrades.length) * 100}%`, background: 'var(--color-profit)' }} />
                      <div style={{ width: `${(bes.length / perfTrades.length) * 100}%`, background: 'var(--color-warn)' }} />
                      <div style={{ width: `${(losses.length / perfTrades.length) * 100}%`, background: 'var(--color-loss)' }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4" style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)' }}>
                <span style={{ color: 'var(--color-profit)' }}>{wins.length} W</span>
                <span style={{ color: 'var(--color-warn)' }}>{bes.length} BE</span>
                <span style={{ color: 'var(--color-loss)' }}>{losses.length} L</span>
              </div>
              {streakType && (
                <p style={{ fontSize: 'var(--text-label)', marginTop: 12, color: streakType === 'win' ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                  Série en cours : {currentStreak} {streakType === 'win' ? 'win' : 'loss'}{currentStreak > 1 ? 's' : ''}
                </p>
              )}
            </Card>

            {/* Setup breakdown */}
            <Card>
              <p style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                Par setup
              </p>
              {setupStats.length === 0 ? (
                <p style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {setupStats.map(([name, s]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
                          {s.count}t · {Math.round((s.wins / s.count) * 100)}%
                        </span>
                        <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', fontWeight: 700, color: s.r >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                          {s.r >= 0 ? '+' : ''}{s.r.toFixed(1)}R
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Daily breakdown */}
            <Card>
              <p style={{ fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                Par jour
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {dailyStats.map(([date, d]) => (
                  <div key={date} className="flex items-center justify-between">
                    <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', color: 'var(--color-text-2)' }}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
                        {d.trades}t · {Math.round((d.wins / d.trades) * 100)}%
                      </span>
                      <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', fontWeight: 700, color: d.r >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                        {d.r >= 0 ? '+' : ''}{d.r.toFixed(1)}R
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
