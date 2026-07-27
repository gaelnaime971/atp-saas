'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { fmtEur, fmtPct, fmtNumber, fmtUsd, toneForPnl, toneForRate, TONE_COLOR_VAR } from '@/lib/format'

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

interface TraderPerf {
  id: string
  name: string
  sessions: number
  pnl: number
  winRate: number
}

interface RevenueRow {
  date: string
  trader: string
  description: string
  amount: number
}

interface ActivityData {
  tradingSessions: number
  journalEntries: number
  checklistTraders: number
  prevTradingSessions: number
  prevJournalEntries: number
  prevChecklistTraders: number
}

export default function Reports() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [loading, setLoading] = useState(true)

  const [ca, setCa] = useState(0)
  const [coachingSessions, setCoachingSessions] = useState(0)
  const [activeTraders, setActiveTraders] = useState(0)
  const [avgWinRate, setAvgWinRate] = useState(0)

  const [traderPerfs, setTraderPerfs] = useState<TraderPerf[]>([])
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([])
  const [activity, setActivity] = useState<ActivityData>({
    tradingSessions: 0, journalEntries: 0, checklistTraders: 0,
    prevTradingSessions: 0, prevJournalEntries: 0, prevChecklistTraders: 0,
  })

  const supabase = createClient()

  const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastOfMonth = month === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 2).padStart(2, '0')}-01`

  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const firstOfPrev = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`
  const lastOfPrev = firstOfMonth

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Revenues this month
      const { data: revenues } = await supabase
        .from('revenues')
        .select('*, profiles(full_name)')
        .gte('payment_date', firstOfMonth)
        .lt('payment_date', lastOfMonth)
        .order('payment_date', { ascending: false })

      const totalCa = revenues?.reduce((s, r) => s + r.amount, 0) ?? 0
      setCa(totalCa)

      setRevenueRows((revenues ?? []).map((r: any) => ({
        date: r.payment_date,
        trader: r.profiles?.full_name ?? 'N/A',
        description: r.description ?? '-',
        amount: r.amount,
      })))

      // Coaching sessions this month (completed)
      const { count: coachCount } = await supabase
        .from('coaching_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('scheduled_at', firstOfMonth)
        .lt('scheduled_at', lastOfMonth)
        .eq('status', 'completed')
      setCoachingSessions(coachCount ?? 0)

      // Trading sessions this month + per-trader stats
      const { data: tradingSessions } = await supabase
        .from('trading_sessions')
        .select('trader_id, pnl, result, profiles(full_name)')
        .gte('session_date', firstOfMonth)
        .lt('session_date', lastOfMonth)

      // Compute active traders (unique trader_ids)
      const traderIds = new Set((tradingSessions ?? []).map(s => s.trader_id))
      setActiveTraders(traderIds.size)

      // Per-trader performance
      const perfMap = new Map<string, { name: string; sessions: number; pnl: number; wins: number }>()
      for (const s of tradingSessions ?? []) {
        const existing = perfMap.get(s.trader_id)
        const name = (s as any).profiles?.full_name ?? 'Trader'
        if (existing) {
          existing.sessions++
          existing.pnl += s.pnl
          if (s.result === 'win') existing.wins++
        } else {
          perfMap.set(s.trader_id, {
            name,
            sessions: 1,
            pnl: s.pnl,
            wins: s.result === 'win' ? 1 : 0,
          })
        }
      }

      const perfs: TraderPerf[] = Array.from(perfMap.entries())
        .map(([id, v]) => ({
          id,
          name: v.name,
          sessions: v.sessions,
          pnl: v.pnl,
          winRate: v.sessions > 0 ? Math.round((v.wins / v.sessions) * 100) : 0,
        }))
        .sort((a, b) => b.pnl - a.pnl)
      setTraderPerfs(perfs)

      // Average win rate across traders
      const totalWins = (tradingSessions ?? []).filter(s => s.result === 'win').length
      const totalSess = (tradingSessions ?? []).length
      setAvgWinRate(totalSess > 0 ? Math.round((totalWins / totalSess) * 100) : 0)

      // Activity: trading sessions, journal entries, checklist traders
      const { count: tradingCount } = await supabase
        .from('trading_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('session_date', firstOfMonth)
        .lt('session_date', lastOfMonth)

      const { count: journalCount } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .gte('entry_date', firstOfMonth)
        .lt('entry_date', lastOfMonth)

      // Previous month for comparison
      const { data: prevTradingSess } = await supabase
        .from('trading_sessions')
        .select('trader_id', { count: 'exact' })
        .gte('session_date', firstOfPrev)
        .lt('session_date', lastOfPrev)

      const { count: prevJournal } = await supabase
        .from('journal_entries')
        .select('*', { count: 'exact', head: true })
        .gte('entry_date', firstOfPrev)
        .lt('entry_date', lastOfPrev)

      const prevTraderIds = new Set((prevTradingSess ?? []).map(s => s.trader_id))

      setActivity({
        tradingSessions: tradingCount ?? 0,
        journalEntries: journalCount ?? 0,
        checklistTraders: traderIds.size,
        prevTradingSessions: prevTradingSess?.length ?? 0,
        prevJournalEntries: prevJournal ?? 0,
        prevChecklistTraders: prevTraderIds.size,
      })
    } finally {
      setLoading(false)
    }
  }, [firstOfMonth, lastOfMonth, firstOfPrev, lastOfPrev])

  useEffect(() => { fetchData() }, [fetchData])

  function goToPrevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function goToNextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function pctChange(current: number, prev: number): { value: string; up: boolean } {
    if (prev === 0) return current > 0 ? { value: '+100%', up: true } : { value: '0%', up: true }
    const pct = Math.round(((current - prev) / prev) * 100)
    return { value: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const kpiCards: { label: string; value: string; tone?: 'profit' | 'warn' | 'neutral' }[] = [
    { label: 'CA du mois',        value: fmtEur(ca) },
    { label: 'Sessions coaching', value: fmtNumber(coachingSessions) },
    { label: 'Traders actifs',    value: fmtNumber(activeTraders) },
    { label: 'Win Rate moyen',    value: fmtPct(avgWinRate, 0), tone: toneForRate(avgWinRate, 50) },
  ]

  const activityRows = [
    { label: 'Sessions de trading enregistrées', current: activity.tradingSessions, prev: activity.prevTradingSessions },
    { label: 'Entrées journal', current: activity.journalEntries, prev: activity.prevJournalEntries },
    { label: 'Traders ayant rempli la checklist', current: activity.checklistTraders, prev: activity.prevChecklistTraders },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        size="sm"
        title="Rapports Mensuels"
        subtitle="Récapitulatif mensuel de votre activité"
        actions={<>
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] text-[#a0aec0] hover:text-[#e8edf5] hover:border-[rgba(255,255,255,0.15)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-[#e8edf5] min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={goToNextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] text-[#a0aec0] hover:text-[#e8edf5] hover:border-[rgba(255,255,255,0.15)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map(kpi => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
        ))}
      </div>

      {/* Grid-2: Trader performance + Detailed revenues */}
      <div className="grid grid-cols-2 gap-4">
        {/* Trader performance */}
        <Card>
          <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Performance traders</h2>
          {(() => {
            type T = typeof traderPerfs[number]
            const cols: Column<T>[] = [
              { id: 'trader', header: 'Trader', sortable: true, sortValue: t => t.name,
                accessor: (t) => {
                  const rank = traderPerfs.indexOf(t)
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500, color: 'var(--color-text-1)' }}>
                      {rank === 0 && (
                        <span
                          title="Top trader"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'rgba(var(--color-warn-rgb), 0.2)',
                            color: 'var(--color-warn)',
                            fontSize: 11, fontWeight: 700,
                          }}
                        >1</span>
                      )}
                      {t.name}
                    </span>
                  )
                } },
              { id: 'sessions', header: 'Sessions', numeric: true, sortable: true, sortValue: t => t.sessions,
                accessor: t => t.sessions },
              { id: 'pnl', header: 'P&L', numeric: true, sortable: true, sortValue: t => t.pnl,
                accessor: t => (
                  <span style={{ color: TONE_COLOR_VAR[toneForPnl(t.pnl)], fontWeight: 500 }}>
                    {fmtUsd(t.pnl, 2, { sign: true })}
                  </span>
                ) },
              { id: 'winrate', header: 'Win%', numeric: true, sortable: true, sortValue: t => t.winRate,
                accessor: t => (
                  <span style={{ color: TONE_COLOR_VAR[toneForRate(t.winRate, 50)] }}>
                    {fmtPct(t.winRate, 0)}
                  </span>
                ) },
            ]
            return (
              <DataTable
                columns={cols}
                rows={traderPerfs}
                rowKey={t => t.id}
                empty={<EmptyState title="Aucune session ce mois" description="Les performances des traders apparaîtront ici dès qu'ils auront enregistré des sessions ce mois-ci." />}
              />
            )
          })()}
        </Card>

        {/* Detailed revenues */}
        <Card>
          <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Revenus détaillés</h2>
          {(() => {
            type R = typeof revenueRows[number]
            const cols: Column<R>[] = [
              { id: 'date', header: 'Date', sortable: true, sortValue: r => r.date,
                accessor: r => new Date(r.date).toLocaleDateString('fr-FR') },
              { id: 'trader', header: 'Trader',
                accessor: r => <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{r.trader}</span> },
              { id: 'description', header: 'Description',
                accessor: r => r.description },
              { id: 'amount', header: 'Montant', numeric: true, sortable: true, sortValue: r => r.amount,
                accessor: r => (
                  <span style={{ color: 'var(--color-profit)', fontWeight: 600 }}>
                    {fmtEur(r.amount, 0, { sign: true })}
                  </span>
                ) },
            ]
            return (
              <DataTable
                columns={cols}
                rows={revenueRows}
                rowKey={r => `${r.date}-${r.trader}-${r.amount}-${r.description}`}
                empty={<EmptyState title="Aucun revenu ce mois" description="Les paiements enregistrés ce mois-ci apparaîtront ici." />}
              />
            )
          })()}
        </Card>
      </div>

      {/* Bottom: Activity card */}
      <Card>
        <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Activité</h2>
        <div className="grid grid-cols-3 gap-6">
          {activityRows.map(row => {
            const change = pctChange(row.current, row.prev)
            return (
              <div key={row.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#a0aec0]">{row.label}</p>
                  <p className="text-xl font-bold font-mono text-[#e8edf5] mt-1">{row.current}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${change.up ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  <svg className={`w-3 h-3 ${change.up ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  {change.value}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-[var(--color-neutral)] mt-4">
          Evolution par rapport à {MONTH_NAMES[prevMonth]} {prevYear}
        </p>
      </Card>
    </div>
  )
}
