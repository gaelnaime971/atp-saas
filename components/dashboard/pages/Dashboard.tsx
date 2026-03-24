'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import type { TradingSession, Profile } from '@/lib/types'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip)

interface KPIs {
  totalPnl: number
  winRate: number
  profitFactor: number
  sessionCount: number
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [kpis, setKpis] = useState<KPIs>({ totalPnl: 0, winRate: 0, profitFactor: 0, sessionCount: 0 })
  const [sessions, setSessions] = useState<TradingSession[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dateDisplay = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Fetch profile
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (prof) setProfile(prof as Profile)

        // Fetch all trading sessions for this trader
        const { data: allSessions } = await supabase
          .from('trading_sessions')
          .select('*')
          .eq('trader_id', user.id)
          .order('session_date', { ascending: false })

        const sess = (allSessions ?? []) as TradingSession[]
        setSessions(sess)

        // Compute KPIs
        const totalPnl = sess.reduce((sum, s) => sum + Number(s.pnl), 0)
        const wins = sess.filter(s => s.result === 'win').length
        const losses = sess.filter(s => s.result === 'loss').length
        const winRate = sess.length > 0 ? Math.round((wins / sess.length) * 100) : 0

        const grossProfit = sess.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
        const grossLoss = Math.abs(sess.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
        const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0

        setKpis({
          totalPnl,
          winRate,
          profitFactor: profitFactor === Infinity ? 99.99 : profitFactor,
          sessionCount: sess.length,
        })
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Heatmap: sessions ordered by date ascending
  const heatmapSessions = [...sessions].reverse()

  // Last 8 sessions for table
  const recentSessions = sessions.slice(0, 8)

  function getCellStyle(session: TradingSession) {
    const isToday = session.session_date === todayStr
    const pnl = Number(session.pnl)

    let bg: string, border: string, color: string
    if (session.result === 'win' || (session.result === null && pnl > 0)) {
      bg = 'rgba(34,197,94,0.15)'
      border = 'rgba(34,197,94,0.3)'
      color = 'var(--green)'
    } else if (session.result === 'loss' || (session.result === null && pnl < 0)) {
      bg = 'rgba(239,68,68,0.15)'
      border = 'rgba(239,68,68,0.3)'
      color = 'var(--red)'
    } else {
      bg = 'rgba(245,158,11,0.12)'
      border = 'rgba(245,158,11,0.25)'
      color = 'var(--amber)'
    }

    return {
      width: 48,
      minHeight: 48,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 6,
      color,
      fontSize: 10,
      fontWeight: 600,
      gap: 2,
      cursor: 'default',
      boxShadow: isToday ? `0 0 8px ${border}, 0 0 2px ${border}` : undefined,
      outline: isToday ? `2px solid ${border}` : undefined,
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  function formatPnl(pnl: number) {
    const sign = pnl >= 0 ? '+' : ''
    return `${sign}${pnl.toFixed(0)}$`
  }

  function parseSetup(setup: string | null | undefined) {
    if (!setup) return null
    try { return JSON.parse(setup) } catch { return null }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Chargement...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Bonjour, {profile?.full_name ?? 'Trader'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text3)', margin: '4px 0 0 0', textTransform: 'capitalize' }}>
            {dateDisplay}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            P&L Total
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: kpis.totalPnl >= 0 ? 'var(--green)' : 'var(--red)',
          }}>
            {kpis.totalPnl >= 0 ? '+' : ''}{kpis.totalPnl.toFixed(2)}$
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Win Rate
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
            {kpis.winRate}%
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Profit Factor
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: kpis.profitFactor >= 1 ? 'var(--green)' : 'var(--red)' }}>
            {kpis.profitFactor.toFixed(2)}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            Sessions
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
            {kpis.sessionCount}
          </div>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Heatmap P&L
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {heatmapSessions.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Aucune session enregistrée</p>
          ) : (
            heatmapSessions.map(s => (
              <div key={s.id} style={getCellStyle(s)} title={`${s.session_date} — P&L: ${Number(s.pnl).toFixed(2)}$`}>
                <span style={{ fontSize: 8, opacity: 0.7 }}>{formatDate(s.session_date)}</span>
                <span>{formatPnl(Number(s.pnl))}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
            P&L Cumulé
          </h2>
          <div style={{ height: 200 }}>
            {(() => {
              const sorted = [...sessions].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const cumulative: number[] = []
              sorted.reduce((acc, s) => { const v = acc + Number(s.pnl); cumulative.push(v); return v }, 0)
              return (
                <Line
                  data={{
                    labels,
                    datasets: [{
                      data: cumulative,
                      borderColor: 'rgba(34,197,94,1)',
                      backgroundColor: 'rgba(34,197,94,0.1)',
                      fill: true,
                      tension: 0.3,
                      pointRadius: 4,
                      pointBackgroundColor: cumulative.map(v => v < 0 ? 'rgba(239,68,68,1)' : 'rgba(34,197,94,1)'),
                      pointBorderColor: cumulative.map(v => v < 0 ? 'rgba(239,68,68,1)' : 'rgba(34,197,94,1)'),
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => `${(ctx.parsed.y ?? 0).toFixed(2)} €` } },
                    },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: "'DM Mono', monospace" } } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: "'DM Mono', monospace" } } },
                    },
                  }}
                />
              )
            })()}
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
            P&L par Session
          </h2>
          <div style={{ height: 200 }}>
            {(() => {
              const sorted = [...sessions].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const pnls = sorted.map(s => Number(s.pnl))
              return (
                <Bar
                  data={{
                    labels,
                    datasets: [{
                      data: pnls,
                      backgroundColor: pnls.map(v => v > 0 ? 'rgba(34,197,94,0.7)' : v < 0 ? 'rgba(239,68,68,0.7)' : 'rgba(245,158,11,0.7)'),
                      borderRadius: 4,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: (ctx) => `${(ctx.parsed.y ?? 0).toFixed(2)} €` } },
                    },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: "'DM Mono', monospace" } } },
                      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: "'DM Mono', monospace" } } },
                    },
                  }}
                />
              )
            })()}
          </div>
        </Card>
      </div>

      {/* Session history table */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
          Historique des sessions
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Inst.', 'Trades', 'P&L', 'R', 'Win%', 'Plan', 'Humeur', 'Type'].map(col => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      color: 'var(--text3)',
                      fontWeight: 500,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSessions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
                    Aucune session enregistrée
                  </td>
                </tr>
              ) : (
                recentSessions.map(s => {
                  const pnl = Number(s.pnl)
                  const pnlColor = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--amber)'
                  const meta = parseSetup(s.setup)
                  const rValue = meta?.r_value
                  const rColor = rValue != null ? (rValue >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text2)'
                  const winPct = meta?.win_rate != null ? `${meta.win_rate}%` : '—'
                  const planScore = meta?.plan_score
                  const planColor = planScore != null ? (planScore >= 8 ? 'var(--green)' : planScore >= 5 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)'
                  const mood = meta?.mood ?? '—'
                  const sessionType = meta?.session_type ?? (s.result === 'win' ? 'Win' : s.result === 'loss' ? 'Loss' : 'BE')

                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                        {formatDate(s.session_date)}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>
                        {s.instrument ?? '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace" }}>
                        {s.trades_count}
                      </td>
                      <td style={{ padding: '8px 10px', color: pnlColor, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                        {formatPnl(pnl)}
                      </td>
                      <td style={{ padding: '8px 10px', color: rColor, fontFamily: "'DM Mono', monospace" }}>
                        {rValue != null ? `${rValue >= 0 ? '+' : ''}${rValue}R` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>
                        {winPct}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {planScore != null ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            background: planScore >= 8 ? 'rgba(34,197,94,0.15)' : planScore >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.15)',
                            color: planColor,
                          }}>
                            {planScore}/10
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 16 }}>
                        {mood}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text3)', fontSize: 12 }}>
                        {sessionType}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
