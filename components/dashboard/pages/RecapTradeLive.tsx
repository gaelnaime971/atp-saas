'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

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
}

type Period = 'all' | 'week' | 'month' | 'year' | 'custom'

function getStartDate(period: Period, customFrom: string): string | null {
  if (period === 'all') return null
  if (period === 'custom' && customFrom) return customFrom
  const now = new Date()
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
    return d.toISOString().split('T')[0]
  }
  if (period === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  if (period === 'year') return `${now.getFullYear()}-01-01`
  return null
}

export default function RecapTradeLive() {
  const [trades, setTrades] = useState<LiveTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('live_trades').select('*').order('trade_date', { ascending: false }).order('created_at', { ascending: false })
      const start = getStartDate(period, customFrom)
      if (start) query = query.gte('trade_date', start)
      if (period === 'custom' && customTo) query = query.lte('trade_date', customTo)
      const { data } = await query
      setTrades((data ?? []) as LiveTrade[])
      setLoading(false)
    }
    fetch()
  }, [period, customFrom, customTo])

  const wins = trades.filter(t => t.result === 'win')
  const losses = trades.filter(t => t.result === 'loss')
  const totalR = trades.reduce((s, t) => s + Number(t.r_result), 0)
  const winRate = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0
  const avgWinR = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.r_result), 0) / wins.length : 0
  const totalPoints = trades.reduce((s, t) => s + (Number(t.points) || 0), 0)

  const kpis = [
    { label: 'Total R', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`, color: totalR >= 0 ? '#22c55e' : '#ef4444' },
    { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? '#22c55e' : '#ef4444' },
    { label: 'R moyen (wins)', value: `+${avgWinR.toFixed(2)}R`, color: '#22c55e' },
    { label: 'Points cumulés', value: `${totalPoints >= 0 ? '+' : ''}${totalPoints.toFixed(1)} pts`, color: totalPoints >= 0 ? '#22c55e' : '#ef4444' },
    { label: 'Total trades', value: String(trades.length), color: 'var(--text)' },
  ]

  const resultBadge = (r: string) => {
    if (r === 'win') return { label: 'Win', bg: 'rgba(34,197,94,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.2)' }
    if (r === 'loss') return { label: 'Loss', bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.2)' }
    return { label: 'BE', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.2)' }
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
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Trades Live Partagés</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Trades partagés par votre coach en temps réel</p>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
        <span className="text-xs font-medium mr-1" style={{ color: 'var(--text3)' }}>Période :</span>
        {([
          { id: 'all', label: 'Tout' },
          { id: 'week', label: 'Semaine' },
          { id: 'month', label: 'Mois' },
          { id: 'year', label: 'Année' },
          { id: 'custom', label: 'Période' },
        ] as { id: Period; label: string }[]).map(f => (
          <button
            key={f.id}
            onClick={() => setPeriod(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: period === f.id ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: period === f.id ? '#22c55e' : 'var(--text3)',
              border: period === f.id ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <div className="h-5 w-px mx-1" style={{ background: 'var(--border)' }} />
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
            <span className="text-xs" style={{ color: 'var(--text3)' }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{k.label}</p>
            <p className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Trades table */}
      <Card>
        {trades.length === 0 ? (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--text3)' }}>Aucun trade partagé pour cette période</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Instrument', 'Direction', 'R Résultat', 'Points', 'Résultat', 'Setup', 'Notes'].map(h => (
                    <th key={h} className="text-left font-medium uppercase tracking-wider pb-3 pr-3" style={{ color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => {
                  const badge = resultBadge(t.result)
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2.5 pr-3 font-mono" style={{ color: 'var(--text2)' }}>
                        {new Date(t.trade_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-medium" style={{ color: 'var(--text)' }}>{t.instrument}</td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                          background: t.direction === 'long' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: t.direction === 'long' ? '#22c55e' : '#ef4444',
                        }}>
                          {t.direction === 'long' ? 'Long' : 'Short'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold" style={{ color: Number(t.r_result) >= 0 ? '#22c55e' : '#ef4444' }}>
                        {Number(t.r_result) >= 0 ? '+' : ''}{Number(t.r_result).toFixed(2)}R
                      </td>
                      <td className="py-2.5 pr-3 font-mono" style={{ color: (Number(t.points) || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                        {t.points != null ? `${Number(t.points) >= 0 ? '+' : ''}${Number(t.points).toFixed(1)}` : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3" style={{ color: 'var(--text2)' }}>{t.setup_type ?? '—'}</td>
                      <td className="py-2.5 truncate max-w-[200px]" style={{ color: 'var(--text3)' }}>{t.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
