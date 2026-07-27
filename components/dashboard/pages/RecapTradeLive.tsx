'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { toneForPnl, toneForRate } from '@/lib/format'

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

// Segmented control période reste inline : primitive SegmentedControl documentée
// dans REFONTE.md, à extraire quand 3+ sites migrés l'utilisent.

const RESULT_BADGE: Record<LiveTrade['result'], { label: string; tone: BadgeTone }> = {
  win:       { label: 'Win',  tone: 'profit' },
  loss:      { label: 'Loss', tone: 'loss'   },
  breakeven: { label: 'BE',   tone: 'warn'   },
}

export default function RecapTradeLive() {
  const [trades, setTrades] = useState<LiveTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function fetchTrades() {
      setLoading(true)
      let query = supabase.from('live_trades').select('*').order('trade_date', { ascending: false }).order('created_at', { ascending: false })
      const start = getStartDate(period, customFrom)
      if (start) query = query.gte('trade_date', start)
      if (period === 'custom' && customTo) query = query.lte('trade_date', customTo)
      const { data } = await query
      setTrades((data ?? []) as LiveTrade[])
      setLoading(false)
    }
    fetchTrades()
  }, [period, customFrom, customTo])

  const { totalR, winRate, avgWinR, totalPoints } = useMemo(() => {
    const wins = trades.filter(t => t.result === 'win')
    const total = trades.reduce((s, t) => s + Number(t.r_result), 0)
    const rate = trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0
    const avg = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.r_result), 0) / wins.length : 0
    const pts = trades.reduce((s, t) => s + (Number(t.points) || 0), 0)
    return { totalR: total, winRate: rate, avgWinR: avg, totalPoints: pts }
  }, [trades])

  const columns: Column<LiveTrade>[] = [
    {
      id: 'date',
      header: 'Date',
      accessor: t => new Date(t.trade_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      sortable: true,
      sortValue: t => t.trade_date,
      numeric: true,
      align: 'left',
    },
    {
      id: 'instrument',
      header: 'Instrument',
      accessor: t => <span style={{ fontFamily: 'var(--font-data)', fontWeight: 500, color: 'var(--color-text-1)' }}>{t.instrument}</span>,
      sortable: true,
      sortValue: t => t.instrument,
    },
    {
      id: 'direction',
      header: 'Direction',
      accessor: t => (
        <Badge tone={t.direction === 'long' ? 'profit' : 'loss'} size="md">
          {t.direction === 'long' ? 'Long' : 'Short'}
        </Badge>
      ),
    },
    {
      id: 'r',
      header: 'R Résultat',
      accessor: t => {
        const v = Number(t.r_result)
        return (
          <span style={{ fontWeight: 600, color: v >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            {v >= 0 ? '+' : ''}{v.toFixed(2)}R
          </span>
        )
      },
      sortable: true,
      sortValue: t => Number(t.r_result),
      numeric: true,
    },
    {
      id: 'points',
      header: 'Points',
      accessor: t => {
        if (t.points == null) return '—'
        const v = Number(t.points)
        return (
          <span style={{ color: v >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            {v >= 0 ? '+' : ''}{v.toFixed(1)}
          </span>
        )
      },
      sortable: true,
      sortValue: t => Number(t.points ?? 0),
      numeric: true,
    },
    {
      id: 'result',
      header: 'Résultat',
      accessor: t => {
        const b = RESULT_BADGE[t.result]
        return <Badge tone={b.tone} size="md" bordered>{b.label}</Badge>
      },
      sortable: true,
      sortValue: t => t.result,
    },
    {
      id: 'setup',
      header: 'Setup',
      accessor: t => t.setup_type ?? '—',
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: t => (
        <span
          style={{
            display: 'inline-block',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--color-text-3)',
          }}
        >
          {t.notes ?? '—'}
        </span>
      ),
    },
  ]

  const periods: { id: Period; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'week', label: 'Semaine' },
    { id: 'month', label: 'Mois' },
    { id: 'year', label: 'Année' },
    { id: 'custom', label: 'Période' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trades Live Partagés"
        subtitle="Trades partagés par votre coach en temps réel"
        size="sm"
      />

      {/* Period filter — pattern SegmentedControl, à extraire quand 3+ sites migrés */}
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
          const active = period === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setPeriod(f.id)}
              className="px-3 py-1.5 rounded-lg transition-all"
              style={{
                fontSize: 'var(--text-label)',
                fontWeight: 500,
                background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
                color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
                border: `1px solid ${active ? 'rgba(var(--color-accent-rgb), 0.20)' : 'transparent'}`,
              }}
            >
              {f.label}
            </button>
          )
        })}
        {period === 'custom' && (
          <>
            <div className="h-5 w-px mx-1" style={{ background: 'var(--color-border-subtle)' }} />
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg outline-none"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--text-label)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-1)',
                colorScheme: 'dark',
              }}
            />
            <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg outline-none"
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--text-label)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-1)',
                colorScheme: 'dark',
              }}
            />
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Total R"          value={`${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`}         tone={toneForPnl(totalR)} loading={loading} />
        <KpiCard label="Win Rate"         value={`${winRate}%`}                                           tone={toneForRate(winRate, 50)} loading={loading} />
        <KpiCard label="R moyen (wins)"   value={`+${avgWinR.toFixed(2)}R`}                                tone={avgWinR > 0 ? 'profit' : 'neutral'} loading={loading} />
        <KpiCard label="Points cumulés"   value={`${totalPoints >= 0 ? '+' : ''}${totalPoints.toFixed(1)} pts`} tone={toneForPnl(totalPoints)} loading={loading} />
        <KpiCard label="Total trades"     value={String(trades.length)}                                    tone="neutral" loading={loading} />
      </div>

      {/* Trades table */}
      <DataTable
        columns={columns}
        rows={trades}
        rowKey={t => t.id}
        loading={loading}
        defaultSort={{ columnId: 'date', dir: 'desc' }}
        empty={
          <EmptyState
            title="Aucun trade partagé"
            description="Aucun trade partagé pour cette période."
          />
        }
      />
    </div>
  )
}
