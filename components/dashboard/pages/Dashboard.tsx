'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import Reveal from '@/components/ui/Reveal'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, toneForPlanScore, toneForRate, TONE_COLOR_VAR } from '@/lib/format'
import { MOTION, EASE, prefersReducedMotion } from '@/lib/motion'
import { chartTokens, verticalGradient, barGradientByValue } from '@/lib/chart-tokens'
import CalendarPnl from '@/components/dashboard/CalendarPnl'
import InsightIAPerf from '@/components/dashboard/InsightIAPerf'
import InsightIAMarket from '@/components/dashboard/InsightIAMarket'
import InsightIAMental from '@/components/dashboard/InsightIAMental'
import BestWorstDay from '@/components/dashboard/BestWorstDay'
import InstrumentDonut from '@/components/dashboard/InstrumentDonut'
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

  // Refs pour le halo parallaxe sur la Card P&L Cumulé (zone témoin
  // paquet 3 dynamique — le seul endroit du dashboard qui a un halo,
  // décision produit validée : "impressionne une fois, fatigue ensuite,
  // subtil sur ma courbe de capital suffit au premier premium").
  const pnlCardRef = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)

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

  // Halo parallaxe P&L Cumulé — un cercle diffus qui suit doucement le
  // curseur (lerp GSAP via quickTo). Actif uniquement quand le contenu
  // est rendu (loading=false, refs disponibles) et hors reduced-motion.
  // Deps [loading] pour se rebrancher après le passage skeleton→contenu.
  useEffect(() => {
    if (loading) return
    const card = pnlCardRef.current
    const halo = haloRef.current
    if (!card || !halo || prefersReducedMotion()) return

    // xPercent/yPercent = -50 pour que (x,y) du curseur soit le CENTRE
    // du halo, pas son coin haut-gauche. GSAP additionne ces percent
    // aux x/y en px animés par quickTo.
    gsap.set(halo, { xPercent: -50, yPercent: -50 })

    const xTo = gsap.quickTo(halo, 'x', { duration: MOTION.countUp, ease: EASE.outLong })
    const yTo = gsap.quickTo(halo, 'y', { duration: MOTION.countUp, ease: EASE.outLong })

    const onMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect()
      xTo(e.clientX - rect.left)
      yTo(e.clientY - rect.top)
    }
    const onEnter = () => { gsap.to(halo, { opacity: 1, duration: MOTION.slow, ease: EASE.out }) }
    const onLeave = () => { gsap.to(halo, { opacity: 0, duration: MOTION.slow, ease: EASE.out }) }

    card.addEventListener('mousemove', onMove)
    card.addEventListener('mouseenter', onEnter)
    card.addEventListener('mouseleave', onLeave)

    return () => {
      card.removeEventListener('mousemove', onMove)
      card.removeEventListener('mouseenter', onEnter)
      card.removeEventListener('mouseleave', onLeave)
    }
  }, [loading])

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

  // Suffixe commun pour les sous-titres de périmètre — "tous comptes"
  // ou "N comptes" selon le filtre header. Utilisé par plusieurs cartes
  // (ATP Score, Best/Worst) pour garantir une formulation identique.
  const accountsSuffix = selectedAccounts.has('all') || scopedAccounts.length === accounts.length
    ? 'tous comptes'
    : `${scopedAccounts.length} compte${scopedAccounts.length > 1 ? 's' : ''}`

  // Sous-titre ATP Score : profil global (toute l'historique). Dit
  // explicitement sur quoi le score est calculé pour éviter la
  // contradiction apparente avec les Insight IA (qui, eux, portent sur
  // une fenêtre glissante).
  const scopeLabelAtp = `Profil global · ${accountsSuffix}`

  // Sous-titre Best/Worst Day : fenêtre 3 mois (décision produit —
  // records datant de >6 mois deviennent déprimants sur un dashboard
  // ouvert chaque matin).
  const scopeLabelBestWorst = `3 derniers mois · ${accountsSuffix}`

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
      {/* Cascade d'entrée — chaque section wrapée dans <Reveal> avec un
          delay incrémenté de 40ms. Fade-in + slide-up 8px sur 320ms.
          Total séquence ~560ms, sous le seuil "rien qui traîne >800ms".
          Le count-up des KPI démarre en parallèle du fade (t≈80ms) et
          finit à ~t=680ms — l'utilisateur voit la valeur monter DURANT
          l'apparition, effet "morningside" pas "je regarde des barres". */}
      {/* Welcome bar */}
      <Reveal delay={0}>
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
      </Reveal>

      {/* Rangée Insight IA — trio : Perf/Discipline · Marché/Setup · Psycho/Mental.
          Le 3e (mental) est le différenciant ATP (formation neuroscience,
          prompt enrichi analyse_mentale). auto-fit + minmax(280px,1fr)
          donne un responsive natif 3→2→1 col selon largeur, sans media
          query. Le seuil 280 est ce que les cartes tolèrent avant que
          les 2/3 pills débordent. */}
      <Reveal delay={40} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <InsightIAPerf onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
        <InsightIAMarket onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
        <InsightIAMental onGoToAnalysis={onGoToAnalysis ?? (() => {})} />
      </Reveal>

      {/* KPI Cards — valeurs animées en count-up GSAP (zone témoin paquet 3).
          Chaque KpiCard reçoit un <AnimatedNumber> en value. Le format
          arrondit selon les décimales voulues (Math.round pour Win Rate
          et Sessions qui doivent être des ints propres pendant le tween). */}
      <Reveal delay={80} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KpiCard
          label="P&L Total"
          value={<AnimatedNumber value={totalPnl} format={n => fmtUsd(n, 2, { sign: true })} />}
          tone={toneForPnl(totalPnl)}
        />
        <KpiCard
          label="Win Rate"
          value={<AnimatedNumber value={winRate} format={n => fmtPct(Math.round(n), 0)} />}
          tone={toneForRate(winRate, 50)}
        />
        <KpiCard
          label="Profit Factor"
          value={<AnimatedNumber value={profitFactor} format={n => fmtNumber(n, 2)} />}
          tone={toneForRate(profitFactor, 1)}
        />
        <KpiCard
          label="Sessions"
          value={<AnimatedNumber value={filtered.length} format={n => fmtNumber(Math.round(n))} />}
        />
      </Reveal>

      {/* Rangée « cœur » : Calendrier (2/3) + stack ATP Score / Prop Firm
          / Répartition instrument (1/3, 3 cartes empilées).
          Le calendrier utilise un layout flex (cases clampées [78,130])
          pour s'étirer et matcher la hauteur du sous-stack droit, évitant
          le grand vide en bas côté gauche. Le donut est en layout vertical
          compact pour tenir dans la col étroite. Sous-stack en
          `auto auto 1fr` : ATP Score et Prop Firm gardent leur hauteur
          naturelle, le donut absorbe l'excédent. */}
      <Reveal delay={120} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <CalendarPnl sessions={filtered} totalCapital={totalCapital} />
        <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 16, minWidth: 0, minHeight: 0 }}>
          <AtpScoreCard sessions={filtered} scopeLabel={scopeLabelAtp} />
          <PropFirmSummary
            accounts={scopedAccounts}
            totalCapital={totalCapital}
            totalPnl={totalPnl}
          />
          <InstrumentDonut
            sessions={filtered}
            scopeLabel={scopeLabelBestWorst}
            layout="vertical"
          />
        </div>
      </Reveal>

      {/* Charts */}
      <Reveal delay={160} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* P&L Cumulé — zone témoin paquet 3 : count-up déjà en place
            sur les KPI ci-dessus, ici on ajoute (1) tuning de l'animation
            d'entrée Chart.js à 700ms easeOutQuart pour un "dessin de
            courbe" plus vif que le défaut 1s, (2) halo parallaxe subtil
            en overlay qui suit le curseur — géré par useEffect halo en
            haut du composant via pnlCardRef + haloRef. */}
        <Card
          ref={pnlCardRef}
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px 0' }}>
            P&L Cumulé
          </h2>
          {/* 280px : une courbe cumulée écrasée à 200px devenait
              illisible depuis la réorg 2fr/1fr (calendrier vole la
              hauteur visuelle). P&L par Session est aligné pour l'harmonie. */}
          <div style={{ height: 280, position: 'relative', zIndex: 1 }}>
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
                    // Animation d'entrée serrée — 700ms easeOutQuart vs
                    // défaut Chart.js 1000ms linear. Cohérent avec le
                    // token --motion-chart-draw et l'ease-out global.
                    // reduced-motion → false désactive complètement l'anim.
                    animation: prefersReducedMotion()
                      ? false
                      : { duration: 700, easing: 'easeOutQuart' },
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
          {/* Halo parallaxe — cercle diffus 500px teinté profit, opacity
              contrôlée par GSAP (hover in/out). Suit le curseur via
              quickTo (lerp) avec un ease long (power3.out) pour glisser
              doucement. pointer-events:none pour ne pas capter les
              tooltips Chart.js. zIndex 0 pour rester sous le canvas. */}
          <div
            ref={haloRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: 500, height: 500,
              pointerEvents: 'none',
              opacity: 0,
              background: 'radial-gradient(circle, rgba(var(--color-profit-rgb), 0.12) 0%, transparent 60%)',
              willChange: 'transform, opacity',
              zIndex: 0,
              mixBlendMode: 'screen',
            }}
          />
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
                    // Miroir P&L Cumulé — 700ms easeOutQuart, reduced-motion → off.
                    animation: prefersReducedMotion()
                      ? false
                      : { duration: 700, easing: 'easeOutQuart' },
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
      </Reveal>

      {/* Records — meilleure et pire journée sur la fenêtre 3 mois.
          La répartition par instrument a migré dans le sous-stack de la
          rangée « cœur » (col droite) pour équilibrer les hauteurs. */}
      <Reveal delay={200}>
        <BestWorstDay sessions={filtered} scopeLabel={scopeLabelBestWorst} />
      </Reveal>

      {/* Session history table */}
      <Reveal delay={240}>
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
      </Reveal>
    </div>
  )
}
