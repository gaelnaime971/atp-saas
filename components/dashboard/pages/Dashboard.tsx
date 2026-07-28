'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, toneForPlanScore, toneForRate, TONE_COLOR_VAR } from '@/lib/format'
import { chartTokens, verticalGradient, barGradientByValue } from '@/lib/chart-tokens'
import CalendarPnl from '@/components/dashboard/CalendarPnl'
import InsightIAPerf from '@/components/dashboard/InsightIAPerf'
import InsightIAMarket from '@/components/dashboard/InsightIAMarket'
import InsightIAMental from '@/components/dashboard/InsightIAMental'
import AtpScoreCard from '@/components/dashboard/AtpScoreCard'
import PropFirmSummary from '@/components/dashboard/PropFirmSummary'
import type { TradingSession, Profile, TraderAccount } from '@/lib/types'
import WelcomeModal from '@/components/dashboard/WelcomeModal'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip)

interface DashboardProps {
  /** Callback SPA — permet aux cartes internes (Insight IA) de naviguer
   *  vers une autre page trader (AnalyseIA notamment). */
  onGoToAnalysis?: () => void
}

export default function Dashboard({ onGoToAnalysis }: DashboardProps = {}) {
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

  // Comptes actuellement dans le périmètre (respecte le filtre header).
  const scopedAccounts = selectedAccounts.has('all')
    ? accounts
    : accounts.filter(a => selectedAccounts.has(a.id))

  // Somme des capitaux des comptes affichés — utilisé par CalendarPnl pour
  // ses paliers d'intensité relatifs (0.25% / 0.75% / 2%).
  const totalCapital = scopedAccounts.reduce(
    (s, a) => s + (Number(a.initial_balance) || Number(a.capital) || 0), 0,
  )

  // Sous-titre de périmètre pour l'ATP Score. Dit explicitement sur quoi
  // le score est calculé pour éviter la contradiction apparente avec les
  // Insight IA (qui, eux, portent sur une fenêtre glissante de N jours).
  //   "Profil global · tous comptes"
  //   "Profil global · 2 comptes"
  const scopeLabel = selectedAccounts.has('all') || scopedAccounts.length === accounts.length
    ? 'Profil global · tous comptes'
    : `Profil global · ${scopedAccounts.length} compte${scopedAccounts.length > 1 ? 's' : ''}`

  // Last 8 sessions for table
  const recentSessions = filtered.slice(0, 8)

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
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
                  background: selectedAccounts.has('all') ? 'var(--color-accent)' : 'var(--bg2)',
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

      {/* Rangée Insight IA — trio : Perf/Discipline · Marché/Setup · Psycho/Mental.
          Le 3e (mental) est le différenciant ATP (formation neuroscience,
          prompt enrichi analyse_mentale). auto-fit + minmax(280px,1fr)
          donne un responsive natif 3→2→1 col selon largeur, sans media
          query. Le seuil 280 est ce que les cartes tolèrent avant que
          les 2/3 pills débordent. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <InsightIAPerf onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
        <InsightIAMarket onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
        <InsightIAMental onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
      </div>

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

      {/* Rangée « cœur » : Calendrier (2/3) + stack ATP Score / Prop Firm (1/3).
          Grille 2fr/1fr inspirée des dashboards traders premium — la donnée
          visuelle massive (calendar) à gauche, deux cartes info-dense
          empilées à droite (score qualitatif au-dessus, snapshot capital
          en dessous). Le sous-stack 2fr/1fr donne au radar la respiration
          nécessaire, la carte Prop Firm restant compacte. */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <CalendarPnl sessions={filtered} totalCapital={totalCapital} />
        <div style={{ display: 'grid', gridTemplateRows: '2fr 1fr', gap: 16, minWidth: 0, minHeight: 0 }}>
          <AtpScoreCard sessions={filtered} scopeLabel={scopeLabel} />
          <PropFirmSummary
            accounts={scopedAccounts}
            totalCapital={totalCapital}
            totalPnl={totalPnl}
          />
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
            P&L Cumulé
          </h2>
          {/* 280px : une courbe cumulée écrasée à 200px devenait
              illisible depuis la réorg 2fr/1fr (calendrier vole la
              hauteur visuelle). P&L par Session est aligné pour l'harmonie. */}
          <div style={{ height: 280 }}>
            {(() => {
              const sorted = [...filtered].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const cumulative: number[] = []
              sorted.reduce((acc, s) => { const v = acc + Number(s.pnl) ; cumulative.push(v); return v }, 0)
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
                      tooltip: { callbacks: { label: (ctx) => `${(ctx.parsed.y ?? 0).toFixed(2)} $` } },
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
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
            P&L par Session
          </h2>
          <div style={{ height: 280 }}>
            {(() => {
              const sorted = [...filtered].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
              const labels = sorted.map(s => { const d = new Date(s.session_date + 'T00:00:00'); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) })
              const pnls = sorted.map(s => Number(s.pnl) )
              const t = chartTokens()
              return (
                <Bar
                  data={{
                    labels,
                    datasets: [{
                      data: pnls,
                      backgroundColor: barGradientByValue(t),
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
                      tooltip: { callbacks: { label: (ctx) => `${(ctx.parsed.y ?? 0).toFixed(2)} $` } },
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
                return <Badge tone={toneForPlanScore(p)} size="md">{p}/10</Badge>
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
