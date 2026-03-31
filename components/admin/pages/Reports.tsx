'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

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
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const kpiCards = [
    {
      label: 'CA du mois', value: `${ca.toLocaleString('fr-FR')} \u20ac`, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20',
      icon: <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Sessions coaching', value: coachingSessions.toString(), color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20',
      icon: <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
    },
    {
      label: 'Traders actifs', value: activeTraders.toString(), color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20',
      icon: <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      label: 'Win Rate moyen', value: `${avgWinRate}%`, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20',
      icon: <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    },
  ]

  const activityRows = [
    { label: 'Sessions de trading enregistrées', current: activity.tradingSessions, prev: activity.prevTradingSessions },
    { label: 'Entrées journal', current: activity.journalEntries, prev: activity.prevJournalEntries },
    { label: 'Traders ayant rempli la checklist', current: activity.checklistTraders, prev: activity.prevChecklistTraders },
  ]

  return (
    <div className="space-y-6">
      {/* Header + Month selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8edf5]">Rapports Mensuels</h1>
          <p className="text-[#5a6a82] text-sm mt-1">Récapitulatif mensuel de votre activité</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#18181b] border border-[rgba(255,255,255,0.07)] text-[#a0aec0] hover:text-[#e8edf5] hover:border-[rgba(255,255,255,0.15)] transition-colors"
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
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#18181b] border border-[rgba(255,255,255,0.07)] text-[#a0aec0] hover:text-[#e8edf5] hover:border-[rgba(255,255,255,0.15)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map(kpi => (
          <Card key={kpi.label} className={`border ${kpi.borderColor}`}>
            <div className={`w-10 h-10 ${kpi.bgColor} rounded-lg flex items-center justify-center mb-3`}>
              {kpi.icon}
            </div>
            <p className={`text-2xl font-bold ${kpi.color} font-mono`}>{kpi.value}</p>
            <p className="text-[#5a6a82] text-xs mt-1">{kpi.label}</p>
          </Card>
        ))}
      </div>

      {/* Grid-2: Trader performance + Detailed revenues */}
      <div className="grid grid-cols-2 gap-4">
        {/* Trader performance */}
        <Card>
          <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Performance traders</h2>
          {traderPerfs.length === 0 ? (
            <p className="text-[#5a6a82] text-sm py-8 text-center">Aucune session ce mois</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.05)]">
                    <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                    <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Sessions</th>
                    <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">P&L</th>
                    <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Win%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {traderPerfs.map((t, i) => (
                    <tr key={t.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-3 text-sm font-medium text-[#e8edf5] flex items-center gap-2">
                        {i === 0 && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold" title="Top trader">
                            1
                          </span>
                        )}
                        {t.name}
                      </td>
                      <td className="py-3 text-sm text-[#a0aec0] text-right font-mono">{t.sessions}</td>
                      <td className={`py-3 text-sm font-mono font-medium text-right ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)} $
                      </td>
                      <td className="py-3 text-sm font-mono text-right text-[#a0aec0]">{t.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Detailed revenues */}
        <Card>
          <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Revenus détaillés</h2>
          {revenueRows.length === 0 ? (
            <p className="text-[#5a6a82] text-sm py-8 text-center">Aucun revenu ce mois</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.05)]">
                    <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Date</th>
                    <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                    <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Description</th>
                    <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {revenueRows.map((r, i) => (
                    <tr key={i} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-3 text-sm text-[#a0aec0]">
                        {new Date(r.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 text-sm font-medium text-[#e8edf5]">{r.trader}</td>
                      <td className="py-3 text-sm text-[#a0aec0]">{r.description}</td>
                      <td className="py-3 text-sm font-mono font-semibold text-green-400 text-right">
                        +{r.amount.toLocaleString('fr-FR')} &euro;
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
        <p className="text-xs text-[#5a6a82] mt-4">
          Evolution par rapport à {MONTH_NAMES[prevMonth]} {prevYear}
        </p>
      </Card>
    </div>
  )
}
