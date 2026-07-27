'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TradingSession } from '@/lib/types'
import type { TraderAccount } from '@/lib/types'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import { fmtUsd, fmtEur, fmtPct, fmtNumber, toneForPnl, toneForRate } from '@/lib/format'
import Button from '@/components/ui/Button'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { chartTokens, verticalGradient } from '@/lib/chart-tokens'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip)

type Period = '7j' | '30j' | '3m' | '1an'

function getDaysForPeriod(period: Period): number {
  switch (period) {
    case '7j': return 7
    case '30j': return 30
    case '3m': return 90
    case '1an': return 365
  }
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)} €`
}

export default function Stats() {
  const [allSessions, setAllSessions] = useState<TradingSession[]>([])
  const [accounts, setAccounts] = useState<TraderAccount[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set(['all']))
  const [period, setPeriod] = useState<Period>('7j')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const days = getDaysForPeriod(period)
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - days)

      const [{ data: sessData }, { data: accData }] = await Promise.all([
        supabase.from('trading_sessions').select('*').eq('trader_id', user.id).gte('session_date', fromDate.toISOString().split('T')[0]).order('session_date', { ascending: false }),
        supabase.from('trader_accounts').select('*').eq('trader_id', user.id).order('created_at', { ascending: true }),
      ])

      setAllSessions(sessData ?? [])
      setAccounts(accData as TraderAccount[] ?? [])
      setLoading(false)
    }
    fetchSessions()
  }, [period])

  function toggleAccount(id: string) {
    setSelectedAccounts(prev => {
      const next = new Set(prev)
      if (id === 'all') return new Set(['all'])
      next.delete('all')
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size === 0) return new Set(['all'])
      return next
    })
  }

  // Filter sessions by selected accounts
  const sessions = useMemo(() => {
    if (selectedAccounts.has('all')) return allSessions
    return allSessions.filter(s => {
      try {
        const setup = s.setup ? JSON.parse(s.setup) : null
        const ids: string[] = setup?.account_ids ?? []
        return ids.some(id => selectedAccounts.has(id))
      } catch { return false }
    })
  }, [allSessions, selectedAccounts])

  const metrics = useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalPnl: 0,
        winRate: 0,
        profitFactor: 0,
        avgR: 0,
        maxDrawdown: 0,
        bestSession: 0,
        worstSession: 0,
      }
    }

    const totalPnl = sessions.reduce((sum, s) => sum + s.pnl, 0)
    const wins = sessions.filter(s => s.result === 'win')
    const losses = sessions.filter(s => s.result === 'loss')
    const winRate = (wins.length / sessions.length) * 100

    const sumWins = wins.reduce((sum, s) => sum + s.pnl, 0)
    const sumLosses = Math.abs(losses.reduce((sum, s) => sum + s.pnl, 0))
    const profitFactor = sumLosses > 0 ? sumWins / sumLosses : 0

    const avgR = sessions.reduce((sum, s) => sum + s.pnl / 25, 0) / sessions.length

    // Max drawdown: lowest point of cumulative P&L
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()
    )
    let cumPnl = 0
    let peak = 0
    let maxDrawdown = 0
    for (const s of sorted) {
      cumPnl += s.pnl
      if (cumPnl > peak) peak = cumPnl
      const dd = peak - cumPnl
      if (dd > maxDrawdown) maxDrawdown = dd
    }

    const bestSession = Math.max(...sessions.map(s => s.pnl))
    const worstSession = Math.min(...sessions.map(s => s.pnl))

    return { totalPnl, winRate, profitFactor, avgR, maxDrawdown, bestSession, worstSession }
  }, [sessions])

  const periods: Period[] = ['7j', '30j', '3m', '1an']

  const pnlColor = (v: number) => (v >= 0 ? 'var(--green, #4ade80)' : 'var(--red, #f87171)')

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <PageHeader
          title="Stats & Performance"
          subtitle="Analyse de vos performances de trading"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap" style={{ marginBottom: 24 }}>
        {/* Period */}
        <div className="flex gap-2">
          {periods.map(p => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>

        {/* Account filter */}
        {accounts.length > 0 && (
          <>
            <div className="h-5 w-px" style={{ background: 'var(--border)' }} />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Compte :</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => toggleAccount('all')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: selectedAccounts.has('all') ? 'rgba(var(--color-profit-rgb), 0.1)' : 'var(--bg2)',
                    color: selectedAccounts.has('all') ? 'var(--color-profit)' : 'var(--text3)',
                    border: `1px solid ${selectedAccounts.has('all') ? 'rgba(var(--color-profit-rgb), 0.2)' : 'var(--border)'}`,
                  }}
                >
                  Tous
                </button>
                {accounts.map(acc => {
                  const active = selectedAccounts.has(acc.id)
                  const color = acc.account_type === 'funded' ? 'var(--color-profit)' : acc.account_type === 'challenge' ? '#60a5fa' : 'var(--color-warn)'
                  return (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: active ? `${color}15` : 'var(--bg2)',
                        color: active ? color : 'var(--text3)',
                        border: `1px solid ${active ? `${color}40` : 'var(--border)'}`,
                      }}
                    >
                      {acc.label || acc.propfirm_name || 'Compte'}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text3)' }}>Chargement...</p>
      ) : (
        <>
          {/* 4 KPI cards */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}
          >
            <KpiCard
              label="P&L Total"
              value={fmtUsd(metrics.totalPnl, 2, { sign: true })}
              tone={toneForPnl(metrics.totalPnl)}
            />
            <KpiCard
              label="Win Rate"
              value={fmtPct(metrics.winRate, 0)}
              tone={toneForRate(metrics.winRate, 50)}
            />
            <KpiCard
              label="Profit Factor"
              value={fmtNumber(metrics.profitFactor, 2)}
              tone={toneForRate(metrics.profitFactor, 1)}
            />
            <KpiCard
              label="R moyen"
              value={`${fmtNumber(metrics.avgR, 2, { sign: true })}R`}
              tone={toneForPnl(metrics.avgR)}
            />
          </div>

          {/* 3 metric cards */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}
          >
            <KpiCard
              label="Max Drawdown"
              value={metrics.maxDrawdown === 0 ? fmtEur(0) : `-${fmtNumber(metrics.maxDrawdown, 2)} €`}
              tone={metrics.maxDrawdown > 0 ? 'loss' : 'neutral'}
            />
            <KpiCard
              label="Meilleure session"
              value={fmtEur(metrics.bestSession, 2, { sign: true })}
              tone={toneForPnl(metrics.bestSession)}
            />
            <KpiCard
              label="Pire session"
              value={fmtEur(metrics.worstSession, 2, { sign: true })}
              tone={toneForPnl(metrics.worstSession)}
            />
          </div>

          {/* Charts */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 24 }}
          >
            <Card>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 12 }}>
                Courbe P&L cumulée
              </p>
              <div style={{ height: 200 }}>
                {(() => {
                  const sorted = [...sessions].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
                  const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
                  const cumulative: number[] = []
                  sorted.reduce((acc, s) => { const v = acc + s.pnl; cumulative.push(v); return v }, 0)
                  const t = chartTokens()
                  const lastIdx = cumulative.length - 1
                  return (
                    <Line
                      data={{
                        labels,
                        datasets: [{
                          data: cumulative,
                          borderColor: t.profit,
                          borderWidth: 2.5,
                          backgroundColor: (ctx) => {
                            const { chart } = ctx
                            if (!chart.chartArea) return undefined
                            return verticalGradient(chart.ctx, chart.chartArea, t.profitRgb, [[0, 0.25], [1, 0]])
                          },
                          fill: true,
                          tension: 0.3,
                          pointRadius: cumulative.map((_, i) => i === lastIdx ? 4 : 0),
                          pointBackgroundColor: cumulative.map(v => v < 0 ? t.loss : t.profit),
                          pointBorderColor: cumulative.map(v => v < 0 ? t.loss : t.profit),
                          pointHoverRadius: 5,
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
                          x: { grid: { color: t.gridColor }, ticks: { color: t.text3, font: { family: t.fontData } } },
                          y: { grid: { color: t.gridColor }, ticks: { color: t.text3, font: { family: t.fontData } } },
                        },
                      }}
                    />
                  )
                })()}
              </div>
            </Card>
            <Card>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 12 }}>
                Distribution des R
              </p>
              <div style={{ height: 200 }}>
                {(() => {
                  const bucketLabels = ['<-2R', '-2/-1', '-1/0', '0/1', '1/2', '2/3', '>3R']
                  const buckets = [0, 0, 0, 0, 0, 0, 0]
                  const t = chartTokens()
                  // Couleurs par bucket-index (histogramme sémantique R : loss → warn → profit).
                  // Pas de barGradientByValue ici : Y = count (toujours > 0), donc le signe ne
                  // reflète pas la sémantique R. On garde l'array avec vars résolues via t.
                  const bucketColors = [
                    `rgba(${t.lossRgb}, 0.8)`,
                    `rgba(${t.lossRgb}, 0.5)`,
                    `rgba(${t.warnRgb}, 0.5)`,
                    `rgba(${t.warnRgb}, 0.6)`,
                    `rgba(${t.profitRgb}, 0.5)`,
                    `rgba(${t.profitRgb}, 0.7)`,
                    `rgba(${t.profitRgb}, 0.9)`,
                  ]
                  sessions.forEach(s => {
                    const meta = (() => { try { return s.setup ? JSON.parse(s.setup) : null } catch { return null } })()
                    const r = meta?.r_value ?? s.pnl / 25
                    if (r < -2) buckets[0]++
                    else if (r < -1) buckets[1]++
                    else if (r < 0) buckets[2]++
                    else if (r < 1) buckets[3]++
                    else if (r < 2) buckets[4]++
                    else if (r < 3) buckets[5]++
                    else buckets[6]++
                  })
                  return (
                    <Bar
                      data={{
                        labels: bucketLabels,
                        datasets: [{
                          data: buckets,
                          backgroundColor: bucketColors,
                          borderRadius: 6,
                          borderSkipped: false,
                          maxBarThickness: 32,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} sessions` } },
                        },
                        scales: {
                          x: { grid: { color: t.gridColor }, ticks: { color: t.text3, font: { family: t.fontData } } },
                          y: { grid: { color: t.gridColor }, ticks: { color: t.text3, font: { family: t.fontData }, stepSize: 1 } },
                        },
                      }}
                    />
                  )
                })()}
              </div>
            </Card>
          </div>

          {/* History table */}
          <Card>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>
              Historique des sessions
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Inst.', 'Trades', 'P&L', 'R', 'Win%', 'Plan', 'Humeur', 'Type'].map(
                      header => (
                        <th
                          key={header}
                          className="text-xs font-medium uppercase tracking-wider text-left"
                          style={{
                            color: 'var(--text3)',
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
                          }}
                        >
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-sm text-center"
                        style={{ color: 'var(--text3)', padding: 24 }}
                      >
                        Aucune session sur cette période
                      </td>
                    </tr>
                  ) : (
                    sessions.map(s => {
                      const meta = (() => { try { return s.setup ? JSON.parse(s.setup) : null } catch { return null } })()
                      const rValue = meta?.r_value ?? s.pnl / 25
                      const winPct = meta?.win_rate ?? (s.result === 'win' ? 100 : s.result === 'loss' ? 0 : 50)
                      const planScore = meta?.plan_score
                      const planColor = planScore != null ? (planScore >= 8 ? 'var(--green)' : planScore >= 5 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)'
                      const mood = meta?.mood ?? '—'
                      const sessionType = meta?.session_type ?? (s.result ?? '-')
                      const tdStyle = { padding: '8px 12px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }
                      return (
                        <tr key={s.id}>
                          <td className="text-sm font-mono" style={{ color: 'var(--text2)', ...tdStyle }}>
                            {s.session_date}
                          </td>
                          <td className="text-sm" style={{ color: 'var(--text2)', ...tdStyle }}>
                            {s.instrument ?? '-'}
                          </td>
                          <td className="text-sm font-mono" style={{ color: 'var(--text2)', ...tdStyle }}>
                            {s.trades_count}
                          </td>
                          <td className="text-sm font-mono font-semibold" style={{ color: pnlColor(s.pnl), ...tdStyle }}>
                            {formatPnl(s.pnl)}
                          </td>
                          <td className="text-sm font-mono" style={{ color: pnlColor(rValue), ...tdStyle }}>
                            {rValue >= 0 ? '+' : ''}{Number(rValue).toFixed(1)}R
                          </td>
                          <td className="text-sm font-mono" style={{ color: 'var(--text2)', ...tdStyle }}>
                            {winPct}%
                          </td>
                          <td className="text-sm" style={{ ...tdStyle }}>
                            {planScore != null ? (
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                                background: planScore >= 8 ? 'rgba(var(--color-profit-rgb), 0.15)' : planScore >= 5 ? 'rgba(var(--color-warn-rgb), 0.12)' : 'rgba(var(--color-loss-rgb), 0.15)',
                                color: planColor,
                              }}>
                                {planScore}/10
                              </span>
                            ) : '—'}
                          </td>
                          <td className="text-sm" style={{ fontSize: 16, ...tdStyle }}>
                            {mood}
                          </td>
                          <td className="text-sm" style={{ color: 'var(--text3)', ...tdStyle }}>
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
        </>
      )}
    </div>
  )
}
