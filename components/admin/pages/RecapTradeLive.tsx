'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Line, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip as ChartTooltip, Filler } from 'chart.js'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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

  // ─── PERF DATE FILTER ───
  type PerfPeriod = 'all' | 'week' | 'day' | 'range' | 'month' | 'year'
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('all')
  const [perfDay, setPerfDay] = useState(new Date().toISOString().split('T')[0])
  const [perfRangeFrom, setPerfRangeFrom] = useState('')
  const [perfRangeTo, setPerfRangeTo] = useState('')
  const [perfMonth, setPerfMonth] = useState(new Date().toISOString().slice(0, 7))
  const [perfYear, setPerfYear] = useState(String(new Date().getFullYear()))

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
  const avgLossR = losses.length > 0 ? losses.reduce((s, t) => s + Number(t.r_result), 0) / losses.length : 0
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
  // Cumulative R line chart
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

  // Daily R bar chart
  const dailyBarData = useMemo(() => {
    const labels = dailyStatsAsc.map(([d]) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))
    const data = dailyStatsAsc.map(([, d]) => parseFloat(d.r.toFixed(2)))
    const colors = data.map(v => v >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)')
    return { labels, data, colors }
  }, [dailyStatsAsc])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: '#18181b',
    border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
    color: '#e8edf5', fontSize: 13, outline: 'none', colorScheme: 'dark',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8edf5]">Récap Trade Live</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex gap-1 mr-3">
            {[
              { id: 'trades' as Tab, label: 'Trades' },
              { id: 'perf' as Tab, label: 'Performance' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: tab === t.id ? 'rgba(34,197,94,0.1)' : '#18181b',
                  color: tab === t.id ? '#22c55e' : '#5a6a82',
                  border: `1px solid ${tab === t.id ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'trades' && !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau trade
            </Button>
          )}
        </div>
      </div>

      {/* ═══ TRADES TAB ═══ */}
      {tab === 'trades' && (
        <>
          {/* Add/Edit form */}
          {showForm && (
            <Card>
              <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">
                {editingId ? 'Modifier le trade' : 'Nouveau trade'}
              </h3>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Date</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Instrument</label>
                  <select value={formInstrument} onChange={e => setFormInstrument(e.target.value)} style={inputStyle}>
                    {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Direction</label>
                  <div className="flex gap-2">
                    {(['long', 'short'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setFormDirection(d)}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: formDirection === d ? (d === 'long' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : '#18181b',
                          border: `2px solid ${formDirection === d ? (d === 'long' ? '#22c55e' : '#ef4444') : 'rgba(255,255,255,0.07)'}`,
                          color: formDirection === d ? (d === 'long' ? '#22c55e' : '#ef4444') : '#5a6a82',
                        }}
                      >
                        {d === 'long' ? '▲ Long' : '▼ Short'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Résultat</label>
                  <div className="flex gap-1">
                    {(['win', 'loss', 'breakeven'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setFormResult(r)}
                        className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          background: formResult === r ? (r === 'win' ? 'rgba(34,197,94,0.1)' : r === 'loss' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)') : '#18181b',
                          border: `2px solid ${formResult === r ? (r === 'win' ? '#22c55e' : r === 'loss' ? '#ef4444' : '#f59e0b') : 'rgba(255,255,255,0.07)'}`,
                          color: formResult === r ? (r === 'win' ? '#22c55e' : r === 'loss' ? '#ef4444' : '#f59e0b') : '#5a6a82',
                        }}
                      >
                        {r === 'win' ? 'Win' : r === 'loss' ? 'Loss' : 'BE'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">R Résultat</label>
                  <input type="number" step={0.1} value={formR} onChange={e => setFormR(e.target.value)} placeholder="ex: +2.5" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Points</label>
                  <input type="number" step="any" value={formPoints} onChange={e => setFormPoints(e.target.value)} placeholder="ex: 12.5" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Entry (optionnel)</label>
                  <input type="number" step="any" value={formEntry} onChange={e => setFormEntry(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Exit (optionnel)</label>
                  <input type="number" step="any" value={formExit} onChange={e => setFormExit(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Stop Loss (optionnel)</label>
                  <input type="number" step="any" value={formSL} onChange={e => setFormSL(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Setup</label>
                  <select value={formSetup} onChange={e => setFormSetup(e.target.value)} style={inputStyle}>
                    <option value="">Aucun</option>
                    {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#5a6a82] mb-1">Notes</label>
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
            <label className="text-xs font-medium" style={{ color: '#5a6a82' }}>Filtrer par jour :</label>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
              style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5', colorScheme: 'dark' }}
            />
            {filterDate && (
              <button onClick={() => setFilterDate('')} className="text-xs text-[#5a6a82] hover:text-[#e8edf5]">
                Tout afficher
              </button>
            )}
            <span className="text-xs ml-auto" style={{ color: '#5a6a82' }}>
              {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''}
              {filterDate && ` le ${new Date(filterDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
            </span>
          </div>

          {/* Trades list */}
          <Card>
            {filteredTrades.length === 0 ? (
              <p className="text-center py-12 text-sm" style={{ color: '#5a6a82' }}>Aucun trade</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {['Date', 'Inst.', 'Dir.', 'Setup', 'Entry', 'Exit', 'SL', 'Résultat', 'R', 'Pts', 'Notes', ''].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                    {filteredTrades.map(t => {
                      const r = Number(t.r_result)
                      return (
                        <tr key={t.id} className="group hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: '#a0aec0' }}>
                            {new Date(t.trade_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: '#e8edf5' }}>{t.instrument}</td>
                          <td className="py-3 pr-3">
                            <span className="text-xs font-semibold" style={{ color: t.direction === 'long' ? '#22c55e' : '#ef4444' }}>
                              {t.direction === 'long' ? '▲' : '▼'} {t.direction}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            {t.setup_type ? (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                                {t.setup_type}
                              </span>
                            ) : <span className="text-xs text-[#5a6a82]">—</span>}
                          </td>
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: '#a0aec0' }}>
                            {t.entry_price ?? '—'}
                          </td>
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: '#a0aec0' }}>
                            {t.exit_price ?? '—'}
                          </td>
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: '#ef4444' }}>
                            {t.stop_loss ?? '—'}
                          </td>
                          <td className="py-3 pr-3">
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{
                              background: t.result === 'win' ? 'rgba(34,197,94,0.1)' : t.result === 'loss' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              color: t.result === 'win' ? '#22c55e' : t.result === 'loss' ? '#ef4444' : '#f59e0b',
                            }}>
                              {t.result === 'win' ? 'Win' : t.result === 'loss' ? 'Loss' : 'BE'}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-sm font-bold font-mono" style={{ color: r >= 0 ? '#22c55e' : '#ef4444' }}>
                            {r >= 0 ? '+' : ''}{r.toFixed(1)}R
                          </td>
                          <td className="py-3 pr-3 text-xs font-mono" style={{ color: t.points != null ? ((t.points ?? 0) >= 0 ? '#22c55e' : '#ef4444') : '#5a6a82' }}>
                            {t.points != null ? `${t.points >= 0 ? '+' : ''}${Number(t.points).toFixed(1)}` : '—'}
                          </td>
                          <td className="py-3 pr-3 text-xs truncate max-w-[120px]" style={{ color: '#5a6a82' }}>
                            {t.notes || '—'}
                          </td>
                          <td className="py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)]">
                                <svg className="w-3.5 h-3.5" style={{ color: '#5a6a82' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                              <button onClick={() => deleteTrade(t.id)} className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)]">
                                <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ═══ PERF TAB ═══ */}
      {tab === 'perf' && (
        <>
          {/* Period filter */}
          <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border" style={{ background: '#111113', borderColor: 'rgba(255,255,255,0.07)' }}>
            <span className="text-xs font-medium mr-1" style={{ color: '#5a6a82' }}>Période :</span>
            {([
              { id: 'all' as PerfPeriod, label: 'Tout' },
              { id: 'week' as PerfPeriod, label: 'Semaine' },
              { id: 'day' as PerfPeriod, label: 'Jour' },
              { id: 'range' as PerfPeriod, label: 'Plage' },
              { id: 'month' as PerfPeriod, label: 'Mois' },
              { id: 'year' as PerfPeriod, label: 'Année' },
            ]).map(f => (
              <button
                key={f.id}
                onClick={() => setPerfPeriod(f.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: perfPeriod === f.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                  color: perfPeriod === f.id ? '#22c55e' : '#5a6a82',
                  border: perfPeriod === f.id ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
                }}
              >
                {f.label}
              </button>
            ))}
            <div className="h-5 w-px mx-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
            {perfPeriod === 'day' && (
              <input type="date" value={perfDay} onChange={e => setPerfDay(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5', colorScheme: 'dark' }} />
            )}
            {perfPeriod === 'range' && (
              <div className="flex items-center gap-2">
                <input type="date" value={perfRangeFrom} onChange={e => setPerfRangeFrom(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5', colorScheme: 'dark' }} />
                <span className="text-xs" style={{ color: '#5a6a82' }}>→</span>
                <input type="date" value={perfRangeTo} onChange={e => setPerfRangeTo(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5', colorScheme: 'dark' }} />
              </div>
            )}
            {perfPeriod === 'month' && (
              <input type="month" value={perfMonth} onChange={e => setPerfMonth(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5', colorScheme: 'dark' }} />
            )}
            {perfPeriod === 'year' && (
              <select value={perfYear} onChange={e => setPerfYear(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf5' }}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <span className="text-xs ml-auto font-medium" style={{ color: '#22c55e' }}>
              {perfTrades.length} trade{perfTrades.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'R Total', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(1)}R`, color: totalR >= 0 ? '#22c55e' : '#ef4444' },
              { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? '#22c55e' : '#ef4444' },
              { label: 'Profit Factor', value: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? '#22c55e' : profitFactor >= 1 ? '#f59e0b' : '#ef4444' },
              { label: 'Nb Trades', value: String(perfTrades.length), color: '#e8edf5' },
            ].map(kpi => (
              <Card key={kpi.label}>
                <p className="text-xs text-[#5a6a82] mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'R moyen (wins)', value: `+${avgWinR.toFixed(2)}R`, color: '#22c55e' },
              { label: 'Points cumulés', value: (() => { const pts = perfTrades.reduce((s, t) => s + (Number(t.points) || 0), 0); return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts` })(), color: (() => { const pts = perfTrades.reduce((s, t) => s + (Number(t.points) || 0), 0); return pts >= 0 ? '#22c55e' : '#ef4444' })() },
              { label: 'Meilleur trade', value: `+${bestTrade.toFixed(1)}R`, color: '#22c55e' },
              { label: 'Pire trade', value: `${worstTrade.toFixed(1)}R`, color: '#ef4444' },
            ].map(kpi => (
              <Card key={kpi.label}>
                <p className="text-xs text-[#5a6a82] mb-1">{kpi.label}</p>
                <p className="text-lg font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</p>
              </Card>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            {/* Cumulative R curve */}
            <Card>
              <p className="text-xs font-semibold text-[#5a6a82] uppercase tracking-wider mb-3">R Cumulé</p>
              {cumulativeRData.data.length === 0 ? (
                <p className="text-xs text-[#5a6a82] text-center py-8">Aucune donnée</p>
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
              <p className="text-xs font-semibold text-[#5a6a82] uppercase tracking-wider mb-3">R par jour</p>
              {dailyBarData.data.length === 0 ? (
                <p className="text-xs text-[#5a6a82] text-center py-8">Aucune donnée</p>
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
              <p className="text-xs font-semibold text-[#5a6a82] uppercase tracking-wider mb-3">Répartition</p>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: '#18181b' }}>
                  {perfTrades.length > 0 && (
                    <div className="flex h-full">
                      <div style={{ width: `${(wins.length / perfTrades.length) * 100}%`, background: '#22c55e' }} />
                      <div style={{ width: `${(bes.length / perfTrades.length) * 100}%`, background: '#f59e0b' }} />
                      <div style={{ width: `${(losses.length / perfTrades.length) * 100}%`, background: '#ef4444' }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 text-xs font-mono">
                <span style={{ color: '#22c55e' }}>{wins.length} W</span>
                <span style={{ color: '#f59e0b' }}>{bes.length} BE</span>
                <span style={{ color: '#ef4444' }}>{losses.length} L</span>
              </div>
              {streakType && (
                <p className="text-xs mt-3" style={{ color: streakType === 'win' ? '#22c55e' : '#ef4444' }}>
                  Série en cours : {currentStreak} {streakType === 'win' ? 'win' : 'loss'}{currentStreak > 1 ? 's' : ''}
                </p>
              )}
            </Card>

            {/* Setup breakdown */}
            <Card>
              <p className="text-xs font-semibold text-[#5a6a82] uppercase tracking-wider mb-3">Par setup</p>
              {setupStats.length === 0 ? (
                <p className="text-xs text-[#5a6a82]">Aucune donnée</p>
              ) : (
                <div className="space-y-2">
                  {setupStats.map(([name, s]) => (
                    <div key={name} className="flex items-center justify-between">
                      <span className="text-xs truncate" style={{ color: '#a0aec0' }}>{name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono" style={{ color: '#5a6a82' }}>
                          {s.count}t · {Math.round((s.wins / s.count) * 100)}%
                        </span>
                        <span className="text-xs font-bold font-mono" style={{ color: s.r >= 0 ? '#22c55e' : '#ef4444' }}>
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
              <p className="text-xs font-semibold text-[#5a6a82] uppercase tracking-wider mb-3">Par jour</p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {dailyStats.map(([date, d]) => (
                  <div key={date} className="flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: '#a0aec0' }}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono" style={{ color: '#5a6a82' }}>
                        {d.trades}t · {Math.round((d.wins / d.trades) * 100)}%
                      </span>
                      <span className="text-xs font-bold font-mono" style={{ color: d.r >= 0 ? '#22c55e' : '#ef4444' }}>
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
