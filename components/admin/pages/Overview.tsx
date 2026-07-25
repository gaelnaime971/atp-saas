'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { fmtEur, fmtUsd, fmtNumber, fmtPct, toneForPnl, TONE_COLOR_VAR } from '@/lib/format'

interface KPIData {
  monthlyRevenue: number
  activeTraders: number
  monthSessions: number
  winRate: number
}

interface TopProspect {
  id: string
  prenom: string
  nom: string
  score: number
  objectif: string
  source: string
  status: string
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
  const [topProspects, setTopProspects] = useState<TopProspect[]>([])
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

        // Fetch top prospects
        const { data: topP } = await supabase
          .from('prospects')
          .select('id, prenom, nom, score, objectif, source, status')
          .in('status', ['nouveau', 'contacte'])
          .order('score', { ascending: false })
          .limit(5)
        setTopProspects((topP || []) as TopProspect[])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const kpiCards: { label: string; value: string; delta: string; deltaTone: 'profit' | 'loss'; icon: string }[] = [
    { label: 'CA Mensuel',       value: fmtEur(kpis.monthlyRevenue),      delta: '+12 %', deltaTone: 'profit', icon: '💰' },
    { label: 'Traders Actifs',   value: fmtNumber(kpis.activeTraders),    delta: '+2',    deltaTone: 'profit', icon: '👥' },
    { label: 'Sessions ce mois', value: fmtNumber(kpis.monthSessions),    delta: '+8 %',  deltaTone: 'profit', icon: '📊' },
    { label: 'Taux de Réussite', value: fmtPct(kpis.winRate, 0),          delta: kpis.winRate >= 50 ? '+' : '-', deltaTone: kpis.winRate >= 50 ? 'profit' : 'loss', icon: '🎯' },
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
      <PageHeader
        size="sm"
        title="Vue Globale"
        subtitle="Aperçu de votre activité de coaching"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map(kpi => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            deltaTone={kpi.deltaTone}
            action={<span aria-hidden style={{ fontSize: 18 }}>{kpi.icon}</span>}
          />
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
              const colors = alert.type === 'warning' ? { bg: 'rgba(var(--color-warn-rgb), 0.06)', border: 'rgba(var(--color-warn-rgb), 0.15)', color: 'var(--color-warn)', icon: '⚠️' }
                : alert.type === 'success' ? { bg: 'rgba(var(--color-profit-rgb), 0.06)', border: 'rgba(var(--color-profit-rgb), 0.15)', color: 'var(--color-profit)', icon: '✅' }
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

      {/* Top Prospects */}
      {topProspects.length > 0 && (
        <Card className="border border-red-500/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔥</span>
            <h2 className="text-sm font-semibold text-[#e8edf5]">À appeler aujourd&apos;hui</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-mono">{topProspects.length}</span>
          </div>
          <div className="space-y-2">
            {topProspects.map(p => {
              const scoreColor = (p.score || 0) >= 75 ? 'var(--color-profit)' : (p.score || 0) >= 50 ? 'var(--color-warn)' : '#6b7280'
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.03)]" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: `${scoreColor}15`, border: `1px solid ${scoreColor}33` }}>
                    <span className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{p.score || 0}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.prenom} {p.nom}</p>
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>{p.objectif || '—'} · {p.source}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded uppercase font-semibold" style={{
                    background: p.status === 'nouveau' ? 'rgba(59,130,246,0.1)' : 'rgba(var(--color-warn-rgb), 0.1)',
                    color: p.status === 'nouveau' ? '#3b82f6' : 'var(--color-warn)',
                    border: `1px solid ${p.status === 'nouveau' ? 'rgba(59,130,246,0.3)' : 'rgba(var(--color-warn-rgb), 0.3)'}`,
                  }}>
                    {p.status === 'nouveau' ? 'Nouveau' : 'Contacté'}
                  </span>
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
          <span className="text-xs text-[var(--color-neutral)]">{recentSessions.length} sessions</span>
        </div>

        {(() => {
          type S = typeof recentSessions[number]
          const cols: Column<S>[] = [
            { id: 'trader', header: 'Trader',
              accessor: s => <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{s.trader_name}</span> },
            { id: 'date', header: 'Date',
              accessor: s => new Date(s.session_date).toLocaleDateString('fr-FR') },
            { id: 'instrument', header: 'Instrument',
              accessor: s => (
                <span
                  className="text-xs"
                  style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-2)',
                    fontFamily: 'var(--font-data)',
                  }}
                >{s.instrument}</span>
              ) },
            { id: 'pnl', header: 'PnL', numeric: true,
              accessor: s => (
                <span style={{ color: TONE_COLOR_VAR[toneForPnl(s.pnl)], fontWeight: 500 }}>
                  {fmtUsd(s.pnl, 2, { sign: true })}
                </span>
              ) },
            { id: 'result', header: 'Résultat', align: 'right',
              accessor: s => {
                const label = s.result === 'win' ? 'Win' : s.result === 'loss' ? 'Loss' : 'Breakeven'
                const tone = s.result === 'win' ? 'profit' : s.result === 'loss' ? 'loss' : 'neutral'
                const bg = tone === 'neutral'
                  ? 'var(--color-surface-3)'
                  : `rgba(var(--color-${tone === 'profit' ? 'profit' : 'loss'}-rgb), 0.10)`
                return (
                  <span
                    style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      fontSize: 11, fontWeight: 500,
                      background: bg,
                      color: TONE_COLOR_VAR[tone],
                    }}
                  >{label}</span>
                )
              } },
          ]
          return (
            <DataTable
              columns={cols}
              rows={recentSessions}
              rowKey={s => s.id}
              empty={
                <EmptyState
                  title="Aucune session enregistrée"
                  description="Les sessions apparaîtront ici dès que les traders auront commencé à logger."
                />
              }
            />
          )
        })()}
      </Card>
    </div>
  )
}
