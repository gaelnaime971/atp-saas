'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, toneForRate, TONE_COLOR_VAR } from '@/lib/format'

interface SessionRow {
  id: string
  trader_name: string
  session_date: string
  pnl: number
  result: string | null
  trades_count: number
  instrument: string | null
  setup: string | null
}

export default function Results() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'breakeven'>('all')
  const supabase = createClient()

  useEffect(() => {
    async function fetchSessions() {
      const { data } = await supabase
        .from('trading_sessions')
        .select('*, profiles(full_name)')
        .order('session_date', { ascending: false })
        .limit(100)

      if (data) {
        setSessions(data.map((s: any) => ({
          id: s.id,
          trader_name: s.profiles?.full_name ?? 'Trader',
          session_date: s.session_date,
          pnl: s.pnl,
          result: s.result,
          trades_count: s.trades_count,
          instrument: s.instrument,
          setup: s.setup,
        })))
      }
      setLoading(false)
    }
    fetchSessions()
  }, [])

  const filtered = sessions.filter(s => filter === 'all' || s.result === filter)
  const totalPnL = filtered.reduce((sum, s) => sum + s.pnl, 0)
  const wins = filtered.filter(s => s.result === 'win').length
  const winRate = filtered.length > 0 ? Math.round((wins / filtered.length) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        size="sm"
        title="Résultats"
        subtitle="Toutes les sessions de trading"
      />

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="PnL Total" value={fmtUsd(totalPnL, 2, { sign: true })} tone={toneForPnl(totalPnL)} />
        <KpiCard label="Sessions"  value={fmtNumber(filtered.length)} />
        <KpiCard label="Win Rate"  value={fmtPct(winRate, 0)} tone={toneForRate(winRate, 50)} />
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'win', 'loss', 'breakeven'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-[var(--color-neutral)] hover:text-[#a0aec0] bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)]'
            }`}
          >
            {f === 'all' ? 'Tout' : f === 'win' ? 'Wins' : f === 'loss' ? 'Losses' : 'Breakeven'}
          </button>
        ))}
      </div>

      {(() => {
        type S = typeof filtered[number]
        const getMeta = (s: S) => { try { return s.setup ? JSON.parse(s.setup) : null } catch { return null } }
        const cols: Column<S>[] = [
          { id: 'trader', header: 'Trader', sortable: true, sortValue: s => s.trader_name,
            accessor: s => <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{s.trader_name}</span> },
          { id: 'date', header: 'Date', sortable: true, sortValue: s => s.session_date,
            accessor: s => (
              <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-2)' }}>
                {new Date(s.session_date).toLocaleDateString('fr-FR')}
              </span>
            ) },
          { id: 'instrument', header: 'Inst.',
            accessor: s => (
              <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-2)', fontSize: 11, fontFamily: 'var(--font-data)', color: 'var(--color-text-2)' }}>
                {s.instrument ?? 'N/A'}
              </span>
            ) },
          { id: 'trades', header: 'Trades', numeric: true, sortable: true, sortValue: s => s.trades_count,
            accessor: s => s.trades_count },
          { id: 'pnl', header: 'PnL', numeric: true, sortable: true, sortValue: s => Number(s.pnl),
            accessor: s => {
              const pnl = Number(s.pnl)
              return <span style={{ color: TONE_COLOR_VAR[toneForPnl(pnl)], fontWeight: 500 }}>{fmtUsd(pnl, 2, { sign: true })}</span>
            } },
          { id: 'r', header: 'R', numeric: true, sortable: true, sortValue: s => Number(getMeta(s)?.r_value ?? s.pnl / 25),
            accessor: s => {
              const r = Number(getMeta(s)?.r_value ?? s.pnl / 25)
              return <span style={{ color: TONE_COLOR_VAR[toneForPnl(r)] }}>{fmtNumber(r, 1, { sign: true })}R</span>
            } },
          { id: 'winrate', header: 'Win%', numeric: true,
            accessor: s => {
              const wp = Number(getMeta(s)?.win_rate ?? (s.result === 'win' ? 100 : s.result === 'loss' ? 0 : 50))
              return <span style={{ color: TONE_COLOR_VAR[toneForRate(wp, 50)] }}>{fmtPct(wp, 0)}</span>
            } },
          { id: 'plan', header: 'Plan', align: 'center',
            accessor: s => {
              const p = getMeta(s)?.plan_score
              if (p == null) return '—'
              const tone = p >= 8 ? 'profit' : p >= 5 ? 'warn' : 'loss'
              return (
                <span
                  style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-data)',
                    background: `rgba(var(--color-${tone === 'profit' ? 'profit' : tone === 'warn' ? 'warn' : 'loss'}-rgb), 0.10)`,
                    color: TONE_COLOR_VAR[tone],
                  }}
                >{p}/10</span>
              )
            } },
          { id: 'mood', header: 'Humeur', align: 'center',
            accessor: s => <span className="text-base">{getMeta(s)?.mood ?? '—'}</span> },
          { id: 'type', header: 'Type', align: 'right',
            accessor: s => (
              <span style={{ fontSize: 11, color: 'var(--color-neutral)' }}>
                {getMeta(s)?.session_type ?? (s.result === 'win' ? 'Win' : s.result === 'loss' ? 'Loss' : 'BE')}
              </span>
            ) },
        ]
        const filterActive = filter !== 'all'
        return (
          <DataTable
            columns={cols}
            rows={filtered}
            rowKey={s => s.id}
            defaultSort={{ columnId: 'date', dir: 'desc' }}
            empty={filterActive ? (
              <EmptyState
                title="Aucune session ne correspond à ce filtre"
                description={<>Filtre actuel : <strong>{filter === 'win' ? 'Wins' : filter === 'loss' ? 'Losses' : 'Breakeven'}</strong>. Sélectionne « Tout » pour voir toutes les sessions.</>}
              />
            ) : (
              <EmptyState
                title="Aucune session enregistrée"
                description="Les sessions de trading de tes traders apparaîtront ici dès qu'ils en auront saisi."
              />
            )}
          />
        )
      })()}
    </div>
  )
}
