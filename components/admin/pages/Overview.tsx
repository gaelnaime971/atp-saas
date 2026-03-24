'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

interface KPIData {
  monthlyRevenue: number
  activeTraders: number
  monthSessions: number
  winRate: number
}

interface RecentSession {
  id: string
  trader_name: string
  session_date: string
  pnl: number
  result: string
  instrument: string
}

export default function Overview() {
  const [kpis, setKpis] = useState<KPIData>({ monthlyRevenue: 0, activeTraders: 0, monthSessions: 0, winRate: 0 })
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const now = new Date()
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

        // Fetch active traders count
        const { count: tradersCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'trader')

        // Fetch monthly revenue
        const { data: revenues } = await supabase
          .from('revenues')
          .select('amount')
          .gte('payment_date', firstOfMonth)

        const totalRevenue = revenues?.reduce((sum, r) => sum + r.amount, 0) ?? 0

        // Fetch sessions this month
        const { data: sessions, count: sessionCount } = await supabase
          .from('trading_sessions')
          .select('result', { count: 'exact' })
          .gte('session_date', firstOfMonth)

        const wins = sessions?.filter(s => s.result === 'win').length ?? 0
        const winRate = sessionCount && sessionCount > 0 ? Math.round((wins / sessionCount) * 100) : 0

        setKpis({
          monthlyRevenue: totalRevenue,
          activeTraders: tradersCount ?? 0,
          monthSessions: sessionCount ?? 0,
          winRate,
        })

        // Fetch recent sessions with trader names
        const { data: recentData } = await supabase
          .from('trading_sessions')
          .select('id, session_date, pnl, result, instrument, trader_id, profiles(full_name)')
          .order('session_date', { ascending: false })
          .limit(8)

        if (recentData) {
          setRecentSessions(recentData.map((s: any) => ({
            id: s.id,
            trader_name: s.profiles?.full_name ?? 'Trader',
            session_date: s.session_date,
            pnl: s.pnl,
            result: s.result,
            instrument: s.instrument ?? 'N/A',
          })))
        }
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const kpiCards = [
    {
      label: 'CA Mensuel',
      value: `${kpis.monthlyRevenue.toLocaleString('fr-FR')} €`,
      icon: '💰',
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      change: '+12%',
      changeUp: true,
    },
    {
      label: 'Traders Actifs',
      value: kpis.activeTraders.toString(),
      icon: '👥',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      change: '+2',
      changeUp: true,
    },
    {
      label: 'Sessions ce mois',
      value: kpis.monthSessions.toString(),
      icon: '📊',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      change: '+8%',
      changeUp: true,
    },
    {
      label: 'Taux de Réussite',
      value: `${kpis.winRate}%`,
      icon: '🎯',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      change: kpis.winRate >= 50 ? '+' : '-',
      changeUp: kpis.winRate >= 50,
    },
  ]

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
        <h1 className="text-xl font-semibold text-[#e8edf5]">Vue Globale</h1>
        <p className="text-[#5a6a82] text-sm mt-1">Aperçu de votre activité de coaching</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className={`border ${kpi.borderColor}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 ${kpi.bgColor} rounded-lg flex items-center justify-center text-lg`}>
                {kpi.icon}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${kpi.changeUp ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {kpi.change}
              </span>
            </div>
            <div>
              <p className={`text-2xl font-bold ${kpi.color} font-mono`}>{kpi.value}</p>
              <p className="text-[#5a6a82] text-xs mt-1">{kpi.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent Sessions */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[#e8edf5]">Sessions Récentes</h2>
          <span className="text-xs text-[#5a6a82]">{recentSessions.length} sessions</span>
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucune session enregistrée</p>
            <p className="text-[#5a6a82] text-xs mt-1">Les sessions apparaîtront ici une fois que les traders auront commencé à logger</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Date</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Instrument</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">PnL</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {recentSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3 text-sm font-medium text-[#e8edf5]">{session.trader_name}</td>
                    <td className="py-3 text-sm text-[#a0aec0]">
                      {new Date(session.session_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-sm text-[#a0aec0]">
                      <span className="px-2 py-0.5 bg-[#1c2333] rounded text-xs font-mono">
                        {session.instrument}
                      </span>
                    </td>
                    <td className={`py-3 text-sm font-mono font-medium text-right ${session.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {session.pnl >= 0 ? '+' : ''}{session.pnl.toFixed(2)} $
                    </td>
                    <td className="py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        session.result === 'win'
                          ? 'bg-green-500/10 text-green-400'
                          : session.result === 'loss'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-[#222940] text-[#a0aec0]'
                      }`}>
                        {session.result === 'win' ? 'Win' : session.result === 'loss' ? 'Loss' : 'Breakeven'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
