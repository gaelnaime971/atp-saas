'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, toneForRate, TONE_COLOR_VAR } from '@/lib/format'
import type { TradingSession, Profile, TraderAccount } from '@/lib/types'
import WelcomeModal from '@/components/dashboard/WelcomeModal'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip)

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<TradingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [accounts, setAccounts] = useState<TraderAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set(['all']))
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

        if (prof) {
          setProfile(prof as Profile)
          if (!prof.onboarded) setShowWelcome(true)
        }

        // Fetch accounts
        const { data: accs } = await supabase.from('trader_accounts').select('*').eq('trader_id', user.id).order('created_at', { ascending: true })
        if (accs) setAccounts(accs as TraderAccount[])

        // Fetch all trading sessions for this trader
        const { data: allSessions } = await supabase
          .from('trading_sessions')
          .select('*')
          .eq('trader_id', user.id)
          .order('session_date', { ascending: false })

        const sess = (allSessions ?? []) as TradingSession[]
        setSessions(sess)
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Account filter
  function toggleAccount(id: string) {
    setSelectedAccounts(prev => {
      if (id === 'all') return new Set(['all'])
      const next = new Set(prev)
      next.delete('all')
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next.size === 0 ? new Set(['all']) : next
    })
  }

  // Filter sessions by selected accounts
  const filtered = selectedAccounts.has('all') ? sessions : sessions.filter(s => {
    try {
      const setup = s.setup ? JSON.parse(s.setup) : null
      const ids: string[] = setup?.account_ids || []
      return ids.some(id => selectedAccounts.has(id))
    } catch { return true }
  })

  // Computed KPIs from filtered sessions
  const totalPnl = filtered.reduce((sum, s) => sum + Number(s.pnl), 0)
  const wins = filtered.filter(s => s.result === 'win').length
  const winRate = filtered.length > 0 ? Math.round((wins / filtered.length) * 100) : 0
  const grossProfit = filtered.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
  const grossLoss = Math.abs(filtered.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0

  // Heatmap: sessions ordered by date ascending
  const heatmapSessions = [...filtered].reverse()

  // Last 8 sessions for table
  const recentSessions = filtered.slice(0, 8)

  function getCellStyle(session: TradingSession) {
    const isToday = session.session_date === todayStr
    const pnl = Number(session.pnl)

    let bg: string, border: string, color: string
    if (session.result === 'win' || (session.result === null && pnl > 0)) {
      bg = 'rgba(var(--color-profit-rgb), 0.15)'
      border = 'rgba(var(--color-profit-rgb), 0.3)'
      color = 'var(--green)'
    } else if (session.result === 'loss' || (session.result === null && pnl < 0)) {
      bg = 'rgba(var(--color-loss-rgb), 0.15)'
      border = 'rgba(var(--color-loss-rgb), 0.3)'
      color = 'var(--red)'
    } else {
      bg = 'rgba(var(--color-warn-rgb), 0.12)'
      border = 'rgba(var(--color-warn-rgb), 0.25)'
      color = 'var(--amber)'
    }

    return {
      width: 90,
      minHeight: 90,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      color,
      fontSize: 16,
      fontWeight: 700,
      gap: 4,
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
    const shimmer = {
      background: 'linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.04) 50%, var(--bg3) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: 8,
    } as React.CSSProperties

    return (
      <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Welcome skeleton */}
          <div>
            <div style={{ ...shimmer, width: 260, height: 28, marginBottom: 8 }} />
            <div style={{ ...shimmer, width: 180, height: 16 }} />
          </div>

          {/* KPI cards skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
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
                <div style={{ ...shimmer, width: 80, height: 12, marginBottom: 12 }} />
                <div style={{ ...shimmer, width: 120, height: 32 }} />
              </div>
            ))}
          </div>

          {/* Heatmap skeleton */}
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px 18px',
            }}
          >
            <div style={{ ...shimmer, width: 120, height: 18, marginBottom: 16 }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{ ...shimmer, width: 48, height: 48 }} />
              ))}
            </div>
          </div>

          {/* Charts skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {[1, 2].map(i => (
              <div
                key={i}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '20px 18px',
                }}
              >
                <div style={{ ...shimmer, width: 140, height: 18, marginBottom: 16 }} />
                <div style={{ ...shimmer, width: '100%', height: 200 }} />
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
            <div style={{ ...shimmer, width: 200, height: 18, marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ ...shimmer, width: '100%', height: 36 }} />
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {showWelcome && profile && (
        <WelcomeModal
          userId={profile.id}
          firstName={(profile.full_name ?? 'Trader').split(' ')[0]}
          onClose={() => setShowWelcome(false)}
        />
      )}
      {/* Welcome bar */}
      <PageHeader
        title={<>Bonjour, {profile?.full_name ?? 'Trader'} 👋</>}
        subtitle={<span style={{ textTransform: 'capitalize' }}>{dateDisplay}</span>}
        actions={
          accounts.length > 0 ? (
            <>
              <button
                onClick={() => setSelectedAccounts(new Set(['all']))}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: selectedAccounts.has('all') ? 'var(--green)' : 'var(--bg2)',
                  border: `1px solid ${selectedAccounts.has('all') ? 'transparent' : 'var(--border)'}`,
                  color: selectedAccounts.has('all') ? 'var(--color-surface-0)' : 'var(--text3)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                Tous
              </button>
              {accounts.map(acc => {
                const sel = selectedAccounts.has(acc.id)
                const tc = acc.account_type === 'funded' ? 'var(--color-profit)' : acc.account_type === 'challenge' ? '#60a5fa' : 'var(--color-warn)'
                return (
                  <button
                    key={acc.id}
                    onClick={() => toggleAccount(acc.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: sel ? `${tc}18` : 'var(--bg2)',
                      border: `1px solid ${sel ? tc : 'var(--border)'}`,
                      color: sel ? tc : 'var(--text3)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {sel ? '✓ ' : ''}{acc.label || `${acc.propfirm_name} ${Number(acc.capital).toLocaleString()}$`}
                  </button>
                )
              })}
            </>
          ) : undefined
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KpiCard
          label="P&L Total"
          value={fmtUsd(totalPnl, 2, { sign: true })}
          tone={toneForPnl(totalPnl)}
        />
        <KpiCard
          label="Win Rate"
          value={fmtPct(winRate, 0)}
          tone={toneForRate(winRate, 50)}
        />
        <KpiCard
          label="Profit Factor"
          value={fmtNumber(profitFactor, 2)}
          tone={toneForRate(profitFactor, 1)}
        />
        <KpiCard
          label="Sessions"
          value={fmtNumber(filtered.length)}
        />
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
              <div key={s.id} style={getCellStyle(s)} title={`${s.session_date} — P&L: ${(Number(s.pnl) ).toFixed(2)}$`}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{formatDate(s.session_date)}</span>
                <span>{formatPnl(Number(s.pnl) )}</span>
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
              const sorted = [...filtered].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const cumulative: number[] = []
              sorted.reduce((acc, s) => { const v = acc + Number(s.pnl) ; cumulative.push(v); return v }, 0)
              return (
                <Line
                  data={{
                    labels,
                    datasets: [{
                      data: cumulative,
                      borderColor: 'rgba(var(--color-profit-rgb), 1)',
                      backgroundColor: 'rgba(var(--color-profit-rgb), 0.1)',
                      fill: true,
                      tension: 0.3,
                      pointRadius: 4,
                      pointBackgroundColor: cumulative.map(v => v < 0 ? 'rgba(var(--color-loss-rgb), 1)' : 'rgba(var(--color-profit-rgb), 1)'),
                      pointBorderColor: cumulative.map(v => v < 0 ? 'rgba(var(--color-loss-rgb), 1)' : 'rgba(var(--color-profit-rgb), 1)'),
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
              const sorted = [...filtered].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const pnls = sorted.map(s => Number(s.pnl) )
              return (
                <Bar
                  data={{
                    labels,
                    datasets: [{
                      data: pnls,
                      backgroundColor: pnls.map(v => v > 0 ? 'rgba(var(--color-profit-rgb), 0.7)' : v < 0 ? 'rgba(var(--color-loss-rgb), 0.7)' : 'rgba(var(--color-warn-rgb), 0.7)'),
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
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 12px 0' }}>
          Historique des sessions
        </h2>
        {(() => {
          type S = typeof recentSessions[number]
          const cols: Column<S>[] = [
            { id: 'date', header: 'Date', sortable: true, sortValue: s => s.session_date,
              accessor: s => <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-1)' }}>{formatDate(s.session_date)}</span> },
            { id: 'instrument', header: 'Inst.',
              accessor: s => s.instrument ?? '—' },
            { id: 'trades', header: 'Trades', numeric: true, sortable: true, sortValue: s => s.trades_count,
              accessor: s => s.trades_count },
            { id: 'pnl', header: 'P&L', numeric: true, sortable: true, sortValue: s => Number(s.pnl),
              accessor: s => {
                const pnl = Number(s.pnl)
                return <span style={{ color: TONE_COLOR_VAR[toneForPnl(pnl)], fontWeight: 600 }}>{fmtUsd(pnl, 2, { sign: true })}</span>
              } },
            { id: 'r', header: 'R', numeric: true,
              accessor: s => {
                const rVal = parseSetup(s.setup)?.r_value
                if (rVal == null) return <span style={{ color: 'var(--color-text-3)' }}>—</span>
                return <span style={{ color: TONE_COLOR_VAR[toneForPnl(Number(rVal))] }}>{fmtNumber(Number(rVal), 1, { sign: true })}R</span>
              } },
            { id: 'winrate', header: 'Win%', numeric: true,
              accessor: s => {
                const wr = parseSetup(s.setup)?.win_rate
                if (wr == null) return '—'
                return <span style={{ color: TONE_COLOR_VAR[toneForRate(Number(wr), 50)] }}>{fmtPct(Number(wr), 0)}</span>
              } },
            { id: 'plan', header: 'Plan', align: 'center',
              accessor: s => {
                const p = parseSetup(s.setup)?.plan_score
                if (p == null) return '—'
                const tone = p >= 8 ? 'profit' : p >= 5 ? 'warn' : 'loss'
                return (
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-data)',
                    background: `rgba(var(--color-${tone === 'profit' ? 'profit' : tone === 'warn' ? 'warn' : 'loss'}-rgb), 0.10)`,
                    color: TONE_COLOR_VAR[tone],
                  }}>{p}/10</span>
                )
              } },
            { id: 'mood', header: 'Humeur', align: 'center',
              accessor: s => <span className="text-base">{parseSetup(s.setup)?.mood ?? '—'}</span> },
            { id: 'type', header: 'Type',
              accessor: s => {
                const t = parseSetup(s.setup)?.session_type ?? (s.result === 'win' ? 'Win' : s.result === 'loss' ? 'Loss' : 'BE')
                return <span style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{t}</span>
              } },
          ]
          return (
            <DataTable
              columns={cols}
              rows={recentSessions}
              rowKey={s => s.id}
              defaultSort={{ columnId: 'date', dir: 'desc' }}
              empty={<EmptyState title="Aucune session enregistrée" description="Log ta première session pour la voir apparaître ici." />}
            />
          )
        })()}
      </div>
    </div>
  )
}
