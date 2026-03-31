'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import type { TradingSession } from '@/lib/types'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend)

interface MonthlyData {
  label: string
  sessions: number
  pnl: number
  winRate: number
  avgR: number
  pf: number
  plan: number
}

const progressionAxes = [
  { label: 'Discipline (plan ATP)', score: 7.0, color: 'var(--green, #22c55e)' },
  { label: 'Gestion du risque', score: 8.0, color: 'var(--green, #22c55e)' },
  { label: 'Lecture du marche', score: 6.2, color: 'var(--amber, #f59e0b)' },
  { label: 'Psychologie', score: 6.5, color: 'var(--amber, #f59e0b)' },
  { label: 'Constance', score: 5.5, color: 'var(--red, #ef4444)' },
]

export default function Progression() {
  const [sessions, setSessions] = useState<TradingSession[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('trading_sessions')
          .select('*')
          .eq('trader_id', user.id)
          .order('session_date', { ascending: false })

        setSessions((data ?? []) as TradingSession[])
      } catch (err) {
        console.error('Progression fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Compute KPIs
  const kpis = useMemo(() => {
    const totalPnl = sessions.reduce((sum, s) => sum + Number(s.pnl), 0)
    const wins = sessions.filter(s => s.result === 'win').length
    const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0

    // Best month
    const byMonth: Record<string, number> = {}
    sessions.forEach(s => {
      const key = s.session_date.slice(0, 7)
      byMonth[key] = (byMonth[key] ?? 0) + Number(s.pnl)
    })
    const bestMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0]

    // Constance plan (placeholder - no plan_score field, use static)
    const constance = 7.0

    return { totalPnl, winRate, bestMonth, constance }
  }, [sessions])

  // Monthly data
  const monthlyData = useMemo<MonthlyData[]>(() => {
    const byMonth: Record<string, TradingSession[]> = {}
    sessions.forEach(s => {
      const key = s.session_date.slice(0, 7)
      if (!byMonth[key]) byMonth[key] = []
      byMonth[key].push(s)
    })

    return Object.entries(byMonth)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([month, sess]) => {
        const d = new Date(month + '-01')
        const label = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
        const pnl = sess.reduce((sum, s) => sum + Number(s.pnl), 0)
        const wins = sess.filter(s => s.result === 'win').length
        const winRate = sess.length > 0 ? Math.round((wins / sess.length) * 100) : 0

        const grossProfit = sess.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
        const grossLoss = Math.abs(sess.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
        const pf = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0

        const avgR = sess.length > 0 ? Number((pnl / sess.length / 100).toFixed(1)) : 0

        return {
          label: label.charAt(0).toUpperCase() + label.slice(1),
          sessions: sess.length,
          pnl,
          winRate,
          avgR,
          pf,
          plan: 0,
        }
      })
  }, [sessions])

  // Extended chart data (chronological order, with best/worst R and plan score)
  const chartData = useMemo(() => {
    const reversed = [...monthlyData].reverse()
    const labels = reversed.map(m => m.label)

    // Compute best/worst R per month from sessions
    const byMonth: Record<string, TradingSession[]> = {}
    sessions.forEach(s => {
      const key = s.session_date.slice(0, 7)
      if (!byMonth[key]) byMonth[key] = []
      byMonth[key].push(s)
    })

    const sortedMonthKeys = Object.keys(byMonth).sort().slice(-6)

    const bestR: number[] = []
    const worstR: number[] = []
    const planScores: number[] = []
    const avgRValues: number[] = []

    sortedMonthKeys.forEach(key => {
      const sess = byMonth[key]
      const rValues = sess.map(s => {
        if (s.setup) {
          try {
            const parsed = typeof s.setup === 'string' ? JSON.parse(s.setup) : s.setup
            if (parsed?.meta?.r_value != null) return Number(parsed.meta.r_value)
          } catch {}
        }
        return Number(s.pnl) / 25
      })
      bestR.push(rValues.length > 0 ? Math.max(...rValues) : 0)
      worstR.push(rValues.length > 0 ? Math.min(...rValues) : 0)
      avgRValues.push(rValues.length > 0 ? Number((rValues.reduce((a, b) => a + b, 0) / rValues.length).toFixed(2)) : 0)

      const scores = sess
        .map(s => {
          if (s.setup) {
            try {
              const parsed = typeof s.setup === 'string' ? JSON.parse(s.setup) : s.setup
              if (parsed?.meta?.plan_score != null) return Number(parsed.meta.plan_score)
            } catch {}
          }
          return null
        })
        .filter((v): v is number => v !== null)
      planScores.push(scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length / 10) * 100) : 0)
    })

    return { labels, reversed, bestR, worstR, planScores, avgRValues }
  }, [monthlyData, sessions])

  // Common chart options for dark theme
  const darkGridColor = 'rgba(255,255,255,0.05)'
  const darkTickColor = '#4a5568'
  const chartFont = { size: 10 }

  // Points forts / a ameliorer (static tags based on data trend)
  const tags = useMemo(() => {
    const result: { label: string; type: 'green' | 'red' | 'amber' }[] = []
    if (monthlyData.length >= 2) {
      if (monthlyData[0].pf > monthlyData[1].pf) result.push({ label: '↑ Profit Factor', type: 'green' })
      if (monthlyData[0].winRate > monthlyData[1].winRate) result.push({ label: '↑ Win Rate', type: 'green' })
      if (monthlyData[0].winRate < monthlyData[1].winRate) result.push({ label: '↓ Win Rate', type: 'red' })
      if (monthlyData[0].pf < monthlyData[1].pf) result.push({ label: '↓ Profit Factor', type: 'red' })
    }
    if (result.length === 0) {
      result.push({ label: '↑ Risk discipline', type: 'green' })
      result.push({ label: '↓ Constance', type: 'red' })
    }
    return result
  }, [monthlyData])

  function formatPnl(value: number) {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(0)} $`
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>P&L cumule</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: kpis.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {formatPnl(kpis.totalPnl)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Toutes sessions</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Progression WR</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>
            {kpis.winRate}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Win Rate actuel</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Meilleur mois</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: kpis.bestMonth && kpis.bestMonth[1] >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {kpis.bestMonth ? formatPnl(kpis.bestMonth[1]) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {kpis.bestMonth ? kpis.bestMonth[0] : '—'}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Constance plan ATP</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>
            {kpis.constance.toFixed(1)}/10
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Moy. 3 mois</div>
        </Card>
      </div>

      {/* Charts row 1 - grid-2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>P&L mensuel</h2>
          <div style={{ height: 200 }}>
            <Line
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.reversed.map(m => m.pnl),
                  borderColor: '#22c55e',
                  backgroundColor: 'rgba(34,197,94,0.1)',
                  fill: true,
                  tension: 0.3,
                  pointBackgroundColor: chartData.reversed.map(m => m.pnl < 0 ? '#ef4444' : '#22c55e'),
                  pointRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                },
              }}
            />
          </div>
        </Card>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>Win Rate mensuel</h2>
          <div style={{ height: 200 }}>
            <Line
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.reversed.map(m => m.winRate),
                  borderColor: '#f59e0b',
                  backgroundColor: 'rgba(245,158,11,0.1)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont }, min: 0, max: 100 },
                },
              }}
            />
          </div>
        </Card>
      </div>

      {/* Charts row 2 - grid-2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>Profit Factor</h2>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.reversed.map(m => m.pf),
                  backgroundColor: chartData.reversed.map(m => m.pf >= 1.5 ? '#22c55e' : m.pf >= 1 ? '#f59e0b' : '#ef4444'),
                  borderRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                },
              }}
            />
          </div>
        </Card>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>Respect plan ATP (%)</h2>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.planScores,
                  backgroundColor: '#22c55e',
                  borderRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont }, min: 0, max: 100 },
                },
              }}
            />
          </div>
        </Card>
      </div>

      {/* Charts row 3 - grid-3 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>R moyen mensuel</h2>
          <div style={{ height: 200 }}>
            <Line
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.avgRValues,
                  borderColor: '#60a5fa',
                  backgroundColor: 'rgba(96,165,250,0.1)',
                  fill: true,
                  tension: 0.3,
                  pointRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                },
              }}
            />
          </div>
        </Card>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>Nb sessions / mois</h2>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.reversed.map(m => m.sessions),
                  backgroundColor: '#a78bfa',
                  borderRadius: 4,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                },
              }}
            />
          </div>
        </Card>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>Meilleur / Pire trade (R)</h2>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: chartData.labels,
                datasets: [
                  {
                    label: 'Meilleur R',
                    data: chartData.bestR,
                    backgroundColor: '#22c55e',
                    borderRadius: 4,
                  },
                  {
                    label: 'Pire R',
                    data: chartData.worstR,
                    backgroundColor: '#ef4444',
                    borderRadius: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: true, labels: { color: darkTickColor, font: chartFont } },
                  tooltip: { enabled: true },
                },
                scales: {
                  x: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                  y: { grid: { color: darkGridColor }, ticks: { color: darkTickColor, font: chartFont } },
                },
              }}
            />
          </div>
        </Card>
      </div>

      {/* Bottom grid-2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {/* Axes de progression */}
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            Axes de progression
          </h2>
          {progressionAxes.map((axis, i) => (
            <div
              key={axis.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < progressionAxes.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.07))' : 'none',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{axis.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 120, height: 6, background: 'var(--bg3, #222225)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    width: `${axis.score * 10}%`,
                    height: '100%',
                    background: axis.color,
                    borderRadius: 99,
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: axis.color, fontFamily: "'DM Mono', monospace", minWidth: 50, textAlign: 'right' }}>
                  {axis.score.toFixed(1)}/10
                </span>
              </div>
            </div>
          ))}
        </Card>

        {/* Recapitulatif mensuel */}
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            Recapitulatif mensuel
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Mois', 'Sess.', 'P&L', 'Win%', 'R moy.', 'PF', 'Plan'].map(col => (
                    <th
                      key={col}
                      style={{
                        textAlign: 'left',
                        padding: '6px 8px',
                        color: 'var(--text3)',
                        fontWeight: 500,
                        fontSize: 10,
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
                {monthlyData.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
                      Aucune donnee
                    </td>
                  </tr>
                ) : (
                  monthlyData.map(m => (
                    <tr key={m.label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text)', fontFamily: "'DM Mono', monospace" }}>{m.label}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{m.sessions}</td>
                      <td style={{ padding: '6px 8px', color: m.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                        {formatPnl(m.pnl)}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{m.winRate}%</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace" }}>
                        {m.avgR >= 0 ? '+' : ''}{m.avgR}R
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{m.pf.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Points forts / a ameliorer */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Points forts / Points a ameliorer
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tags.map((tag, i) => {
                const colors = {
                  green: { bg: 'rgba(34,197,94,0.1)', color: 'var(--green, #22c55e)', border: 'rgba(34,197,94,0.3)' },
                  red: { bg: 'rgba(239,68,68,0.1)', color: 'var(--red, #ef4444)', border: 'rgba(239,68,68,0.3)' },
                  amber: { bg: 'rgba(245,158,11,0.1)', color: 'var(--amber, #f59e0b)', border: 'rgba(245,158,11,0.3)' },
                }
                const c = colors[tag.type]
                return (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      background: c.bg,
                      color: c.color,
                      border: `1px solid ${c.border}`,
                      borderRadius: 4,
                      padding: '3px 8px',
                    }}
                  >
                    {tag.label}
                  </span>
                )
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
