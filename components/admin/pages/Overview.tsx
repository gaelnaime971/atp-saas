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

interface Alert {
  type: 'warning' | 'info' | 'success'
  message: string
  detail?: string
}

export default function Overview() {
  const [kpis, setKpis] = useState<KPIData>({ monthlyRevenue: 0, activeTraders: 0, monthSessions: 0, winRate: 0 })
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
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

        // Build alerts
        const newAlerts: Alert[] = []

        // Inactive traders (no session in last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: allTraders } = await supabase.from('profiles').select('id, full_name').eq('role', 'trader')
        if (allTraders) {
          for (const t of allTraders) {
            const { count } = await supabase.from('trading_sessions').select('*', { count: 'exact', head: true }).eq('trader_id', t.id).gte('session_date', sevenDaysAgo)
            if ((count ?? 0) === 0) {
              newAlerts.push({ type: 'warning', message: `${t.full_name ?? 'Un trader'} est inactif`, detail: 'Aucune session depuis 7 jours' })
            }
          }
        }

        // Unread messages
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { count: unread } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false)
          if (unread && unread > 0) {
            newAlerts.push({ type: 'info', message: `${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}` })
          }
        }

        // Loss streak detection
        if (allTraders) {
          for (const t of allTraders) {
            const { data: lastSessions } = await supabase.from('trading_sessions').select('result').eq('trader_id', t.id).order('session_date', { ascending: false }).limit(5)
            if (lastSessions && lastSessions.length >= 3) {
              const lossStreak = lastSessions.findIndex(s => s.result !== 'loss')
              if (lossStreak === -1 || lossStreak >= 3) {
                newAlerts.push({ type: 'warning', message: `${t.full_name ?? 'Un trader'} est en série de pertes`, detail: `${lossStreak === -1 ? lastSessions.length : lossStreak} losses consécutives` })
              }
            }
          }
        }

        setAlerts(newAlerts)
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
    const shimmer = {
      background: 'linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.04) 50%, var(--bg3) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: 8,
    } as React.CSSProperties

    return (
      <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
        <div className="space-y-6">
          {/* Title skeleton */}
          <div>
            <div style={{ ...shimmer, width: 180, height: 24, marginBottom: 8 }} />
            <div style={{ ...shimmer, width: 260, height: 14 }} />
          </div>

          {/* KPI cards skeleton */}
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '20px 18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ ...shimmer, width: 40, height: 40, borderRadius: 8 }} />
                  <div style={{ ...shimmer, width: 36, height: 20, borderRadius: 10 }} />
                </div>
                <div style={{ ...shimmer, width: 100, height: 28, marginBottom: 6 }} />
                <div style={{ ...shimmer, width: 80, height: 12 }} />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px 18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ ...shimmer, width: 160, height: 16 }} />
              <div style={{ ...shimmer, width: 80, height: 14 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ ...shimmer, width: '100%', height: 40 }} />
              ))}
            </div>
          </div>
        </div>
      </>
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

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h2 className="text-sm font-semibold text-[#e8edf5]">Notifications</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-mono">{alerts.length}</span>
          </div>
          <div className="space-y-2">
            {alerts.map((alert, i) => {
              const colors = alert.type === 'warning' ? { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)', color: '#f59e0b', icon: '⚠️' }
                : alert.type === 'success' ? { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)', color: '#22c55e', icon: '✅' }
                : { bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)', color: '#60a5fa', icon: '💬' }
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                  <span className="text-sm">{colors.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: colors.color }}>{alert.message}</p>
                    {alert.detail && <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{alert.detail}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

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
