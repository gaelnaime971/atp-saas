'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'

// ---------- Types ----------
type Impact = 'ÉLEVÉ' | 'MODÉRÉ' | 'FAIBLE'
type Priority = 'HAUTE' | 'MOYENNE' | 'BASSE'
type AlertLevel = 'CRITIQUE' | 'ATTENTION' | 'INFO'
type Trend = 'PROGRESSION' | 'STAGNATION' | 'DEGRADATION'

interface ForceItem { titre: string; detail: string; impact: Impact }
interface WeaknessItem { titre: string; detail: string; impact: Impact; fix: string }
interface PatternItem { titre: string; detail: string; frequence: string }
interface AlertItem { niveau: AlertLevel; message: string }
interface ActionItem { action: string; priorite: Priority; metric_cible: string }
interface InstrumentAnalysis { instrument: string; verdict: string; conseil: string }
interface PlanJourType { matin: string; session: string; post_session: string }
interface Objectifs { court_terme: string; moyen_terme: string; long_terme: string }

interface Analysis {
  verdict_general: string
  trend_global: Trend
  trend_explanation: string
  forces: ForceItem[]
  faiblesses: WeaknessItem[]
  patterns_detectes: PatternItem[]
  alertes: AlertItem[]
  actions_semaine: ActionItem[]
  instruments_analysis: InstrumentAnalysis[]
  plan_jour_type: PlanJourType
  objectifs_realistes: Objectifs
  stop_doing: string[]
  keep_doing: string[]
  discipline_note_sur_10: number
  psychologie_note_sur_10: number
  methode_note_sur_10: number
  gestion_risque_note_sur_10: number
  consistance_note_sur_10: number
  force_mentale_note_sur_10: number
  message_motivant: string
}

interface InstrumentStat { instrument: string; count: number; pnl: number; win_rate: number; avg_r: number | null }
interface DayStat { day: string; count: number; pnl: number; avg_pnl: number; win_rate: number }
interface PeriodStats { count: number; pnl: number; win_rate: number; avg_r: number | null }
interface RDistribution { lt_minus2: number; m2_to_m1: number; m1_to_0: number; z0_to_1: number; p1_to_2: number; gt_2: number }
interface MoodStat { mood: string; count: number; avg_pnl: number; win_rate: number }
interface AccountStat { account_id: string; count: number; pnl: number }
interface BtSetupStat { name: string; wr: number; n: number; avg_r: number }
interface BtSignalStat { name: string; wr: number; n: number }
interface ConfluenceSide { count: number; win_rate: number; avg_r: number | null }

interface Stats {
  period_days: number
  sessions_count: number
  backtests_count: number
  total_pnl: number
  win_rate: number
  wins: number
  losses: number
  breakevens: number
  profit_factor: number | null
  avg_winner_eur: number | null
  avg_loser_eur: number | null
  risk_reward: number | null
  avg_plan_score: number | null
  avg_sessions_per_week: number | null
  max_win_streak: number
  max_loss_streak: number
  current_streak: { type: 'win' | 'loss' | 'none'; length: number }
  r_distribution: RDistribution
  trades_distribution: { light_1_3: number; medium_4_6: number; heavy_7_plus: number }
  day_of_week: DayStat[]
  best_day: DayStat | null
  worst_day: DayStat | null
  recent_vs_older: { recent_15d: PeriodStats; older_15d: PeriodStats }
  instruments: InstrumentStat[]
  mood_stats: MoodStat[]
  best_mood: MoodStat | null
  plan_score_correlation: {
    count_high_plan: number
    count_low_plan: number
    avg_pnl_high_plan: number | null
    avg_pnl_low_plan: number | null
    avg_plan_score: number | null
  }
  top_accounts: AccountStat[]
  top_setups_backtest: BtSetupStat[]
  top_signals_backtest: BtSignalStat[]
  best_timeframe: { name: string; wr: number; n: number } | null
  timeframe_stats: { name: string; wr: number; n: number }[]
  confluence_comparison: {
    with_confluence: ConfluenceSide
    without_confluence: ConfluenceSide
  }
}

interface HistoryEntry {
  date: string
  scores: {
    discipline: number
    psycho: number
    methode: number
    risk: number
    consistance: number
    force_mentale: number
  }
  verdict_general: string
  trend: Trend
}

type TabId = 'overview' | 'forces' | 'patterns' | 'plan' | 'instruments' | 'objectifs' | 'metrics' | 'compare'

// ---------- Constants ----------
const HISTORY_KEY = 'atp_analyses_history'
const ACTIONS_KEY_PREFIX = 'atp_ai_actions_'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: '🎯' },
  { id: 'forces', label: 'Forces & Faiblesses', icon: '⚖️' },
  { id: 'patterns', label: 'Patterns', icon: '🔍' },
  { id: 'plan', label: 'Plan d\'action', icon: '📋' },
  { id: 'instruments', label: 'Instruments', icon: '📊' },
  { id: 'objectifs', label: 'Objectifs', icon: '🚀' },
  { id: 'metrics', label: 'Métriques', icon: '📈' },
  { id: 'compare', label: 'Comparaison', icon: '🔄' },
]

const IMPACT_COLOR: Record<Impact, string> = {
  'ÉLEVÉ': '#ef4444',
  'MODÉRÉ': '#f59e0b',
  'FAIBLE': '#6b7280',
}

const PRIORITY_COLOR: Record<Priority, string> = {
  'HAUTE': '#ef4444',
  'MOYENNE': '#f59e0b',
  'BASSE': '#6b7280',
}

const ALERT_COLOR: Record<AlertLevel, string> = {
  'CRITIQUE': '#ef4444',
  'ATTENTION': '#f59e0b',
  'INFO': '#3b82f6',
}

const TREND_COLOR: Record<Trend, string> = {
  'PROGRESSION': '#22c55e',
  'STAGNATION': '#f59e0b',
  'DEGRADATION': '#ef4444',
}

const TREND_ICON: Record<Trend, string> = {
  'PROGRESSION': '↗',
  'STAGNATION': '→',
  'DEGRADATION': '↘',
}

// ---------- Helpers ----------
function noteColor(n: number): string {
  if (n >= 8) return '#22c55e'
  if (n >= 6) return '#84cc16'
  if (n >= 5) return '#f59e0b'
  return '#ef4444'
}

function fmt(v: number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || !isFinite(Number(v))) return 'N/A'
  return `${v}${suffix}`
}

function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(Number(v))) return 'N/A'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${Number(v).toFixed(0)} €`
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-5)))
  } catch {
    // ignore
  }
}

// ---------- Component ----------
export default function AnalyseIA() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({})
  const [expandedForces, setExpandedForces] = useState<Record<number, boolean>>({})
  const [expandedWeaknesses, setExpandedWeaknesses] = useState<Record<number, boolean>>({})
  const [expandedPlan, setExpandedPlan] = useState<Record<string, boolean>>({})
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [savedToast, setSavedToast] = useState(false)

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // Per-analysis actions checklist (key = generatedAt.toISOString())
  const actionsKey = useMemo(() => generatedAt ? `${ACTIONS_KEY_PREFIX}${generatedAt.toISOString().split('T')[0]}` : null, [generatedAt])

  useEffect(() => {
    if (!actionsKey) { setCompletedActions({}); return }
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(actionsKey)
      if (raw) setCompletedActions(JSON.parse(raw))
      else setCompletedActions({})
    } catch {
      setCompletedActions({})
    }
  }, [actionsKey])

  const toggleAction = (idx: number) => {
    if (!actionsKey) return
    const next = { ...completedActions, [idx]: !completedActions[idx] }
    setCompletedActions(next)
    try { window.localStorage.setItem(actionsKey, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const generate = async () => {
    setLoading(true)
    setError('')
    setAnalysis(null)
    setStats(null)
    try {
      const r = await fetch('/api/ai-coach-analysis', { method: 'POST' })
      const data = await r.json()
      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }
      let raw: string = (data.analysis || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) raw = raw.substring(firstBrace, lastBrace + 1)
      let parsed: Analysis | null = null
      try {
        parsed = JSON.parse(raw) as Analysis
      } catch {
        setError('Réponse de l\'IA invalide. Réessaie.')
        setLoading(false)
        return
      }
      setAnalysis(parsed)
      setStats((data.stats as Stats) || null)
      const now = new Date()
      setGeneratedAt(now)
      setActiveTab('overview')

      // Auto-save to history
      if (parsed) {
        const entry: HistoryEntry = {
          date: now.toISOString(),
          scores: {
            discipline: parsed.discipline_note_sur_10,
            psycho: parsed.psychologie_note_sur_10,
            methode: parsed.methode_note_sur_10,
            risk: parsed.gestion_risque_note_sur_10,
            consistance: parsed.consistance_note_sur_10,
            force_mentale: parsed.force_mentale_note_sur_10,
          },
          verdict_general: parsed.verdict_general,
          trend: parsed.trend_global,
        }
        const next = [...loadHistory(), entry].slice(-5)
        saveHistory(next)
        setHistory(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    }
    setLoading(false)
  }

  const saveCurrent = () => {
    if (!analysis || !generatedAt) return
    const entry: HistoryEntry = {
      date: generatedAt.toISOString(),
      scores: {
        discipline: analysis.discipline_note_sur_10,
        psycho: analysis.psychologie_note_sur_10,
        methode: analysis.methode_note_sur_10,
        risk: analysis.gestion_risque_note_sur_10,
        consistance: analysis.consistance_note_sur_10,
        force_mentale: analysis.force_mentale_note_sur_10,
      },
      verdict_general: analysis.verdict_general,
      trend: analysis.trend_global,
    }
    const existing = loadHistory().filter(h => h.date !== entry.date)
    const next = [...existing, entry].slice(-5)
    saveHistory(next)
    setHistory(next)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2200)
  }

  // --------- Subcomponents ---------
  const Gauge = ({ note, label, icon }: { note: number; label: string; icon: string }) => {
    const radius = 38
    const circ = 2 * Math.PI * radius
    const dash = (Math.max(0, Math.min(10, note)) / 10) * circ
    const color = noteColor(note)
    return (
      <div style={{ textAlign: 'center', padding: '18px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 30%, ${color}15, transparent 65%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 10px' }}>
          <svg width="96" height="96" style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 6px ${color}55)` }}>
            <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--bg2)" strokeWidth="7" />
            <circle
              cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="7"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.2,.7,.2,1)' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{note}</div>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>/ 10</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    )
  }

  const ImpactBadge = ({ impact }: { impact: Impact }) => (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 6,
      background: `${IMPACT_COLOR[impact]}20`, color: IMPACT_COLOR[impact], border: `1px solid ${IMPACT_COLOR[impact]}40`,
    }}>{impact}</span>
  )

  const PriorityBadge = ({ priority }: { priority: Priority }) => (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 6,
      background: `${PRIORITY_COLOR[priority]}20`, color: PRIORITY_COLOR[priority], border: `1px solid ${PRIORITY_COLOR[priority]}40`,
    }}>{priority}</span>
  )

  // ---------- Tab content ----------
  const renderOverview = () => {
    if (!analysis) return null
    const trendColor = TREND_COLOR[analysis.trend_global] || '#9ca3af'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        {/* Verdict */}
        <Card style={{ border: '1px solid rgba(34,197,94,0.25)', background: 'linear-gradient(135deg, rgba(34,197,94,0.06), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>💬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 4 }}>Verdict général</div>
              <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{analysis.verdict_general}</p>
            </div>
          </div>
        </Card>

        {/* Trend */}
        <Card style={{ border: `1px solid ${trendColor}40`, background: `linear-gradient(135deg, ${trendColor}10, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 32, color: trendColor, fontWeight: 800 }}>{TREND_ICON[analysis.trend_global]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: trendColor, textTransform: 'uppercase', marginBottom: 4 }}>Tendance: {analysis.trend_global}</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{analysis.trend_explanation}</p>
            </div>
          </div>
        </Card>

        {/* 6 Gauges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Gauge note={analysis.discipline_note_sur_10} label="Discipline" icon="🎯" />
          <Gauge note={analysis.psychologie_note_sur_10} label="Psychologie" icon="🧠" />
          <Gauge note={analysis.methode_note_sur_10} label="Méthode" icon="📐" />
          <Gauge note={analysis.gestion_risque_note_sur_10} label="Gestion risque" icon="🛡️" />
          <Gauge note={analysis.consistance_note_sur_10} label="Consistance" icon="📊" />
          <Gauge note={analysis.force_mentale_note_sur_10} label="Force mentale" icon="💪" />
        </div>

        {/* Quick stats strip */}
        {stats && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
            {[
              { lbl: 'Sessions', val: stats.sessions_count },
              { lbl: 'Backtests', val: stats.backtests_count },
              { lbl: 'P&L 60j', val: fmtEur(stats.total_pnl), color: stats.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
              { lbl: 'Win rate', val: `${stats.win_rate}%` },
              { lbl: 'Profit factor', val: stats.profit_factor !== null ? stats.profit_factor : '∞' },
              { lbl: 'R:R', val: stats.risk_reward !== null ? stats.risk_reward : 'N/A' },
            ].map(s => (
              <div key={s.lbl} style={{ fontSize: 11, color: 'var(--text3)' }}>
                {s.lbl}: <span style={{ color: s.color || 'var(--text)', fontWeight: 700, fontFamily: 'monospace' }}>{s.val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Alertes */}
        {analysis.alertes && analysis.alertes.length > 0 && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🚨</span>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Alertes</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.alertes.map((a, i) => {
                const c = ALERT_COLOR[a.niveau] || '#9ca3af'
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: `${c}10`, border: `1px solid ${c}40` }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 6, background: `${c}25`, color: c, whiteSpace: 'nowrap' }}>{a.niveau}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{a.message}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Motivational */}
        <Card style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', border: '1px solid rgba(34,197,94,0.25)', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🚀</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--green)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
            &ldquo;{analysis.message_motivant}&rdquo;
          </p>
        </Card>
      </div>
    )
  }

  const renderForces = () => {
    if (!analysis) return null
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        {/* Forces column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', margin: 0 }}>Forces ({analysis.forces.length})</h3>
          </div>
          {analysis.forces.map((f, i) => {
            const expanded = !!expandedForces[i]
            const borderColor = IMPACT_COLOR[f.impact] || '#22c55e'
            return (
              <div key={i}
                onClick={() => setExpandedForces({ ...expandedForces, [i]: !expanded })}
                style={{ cursor: 'pointer', background: 'var(--bg3)', border: `1px solid ${borderColor}40`, borderLeft: `3px solid ${borderColor}`, borderRadius: 10, padding: 14, transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{ fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{f.titre}</span>
                  </div>
                  <ImpactBadge impact={f.impact} />
                </div>
                {expanded && (
                  <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65, margin: '10px 0 0 24px' }}>{f.detail}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Faiblesses column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', margin: 0 }}>Faiblesses ({analysis.faiblesses.length})</h3>
          </div>
          {analysis.faiblesses.map((w, i) => {
            const expanded = !!expandedWeaknesses[i]
            const borderColor = IMPACT_COLOR[w.impact] || '#ef4444'
            return (
              <div key={i}
                onClick={() => setExpandedWeaknesses({ ...expandedWeaknesses, [i]: !expanded })}
                style={{ cursor: 'pointer', background: 'var(--bg3)', border: `1px solid ${borderColor}40`, borderLeft: `3px solid ${borderColor}`, borderRadius: 10, padding: 14, transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{ fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{w.titre}</span>
                  </div>
                  <ImpactBadge impact={w.impact} />
                </div>
                {expanded && (
                  <div style={{ marginLeft: 24, marginTop: 10 }}>
                    <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>{w.detail}</p>
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>🔧 Fix</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{w.fix}</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderPatterns = () => {
    if (!analysis) return null
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, animation: 'fadeIn 0.4s ease' }}>
        {analysis.patterns_detectes.map((p, i) => (
          <Card key={i} style={{ borderLeft: '3px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🔍</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{p.titre}</h4>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65, margin: '0 0 12px 0' }}>{p.detail}</p>
            <div style={{ display: 'inline-block', padding: '4px 10px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>
              📊 {p.frequence}
            </div>
          </Card>
        ))}
      </div>
    )
  }

  const renderPlan = () => {
    if (!analysis) return null
    const completedCount = analysis.actions_semaine.filter((_, i) => completedActions[i]).length
    const totalCount = analysis.actions_semaine.length
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        {/* Actions checklist */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Actions de la semaine</h3>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
              {completedCount}/{totalCount} • <span style={{ color: progressPct === 100 ? '#22c55e' : 'var(--text2)' }}>{progressPct}%</span>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #22c55e, #84cc16)', transition: 'width 0.4s ease', borderRadius: 3 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {analysis.actions_semaine.map((a, i) => {
              const done = !!completedActions[i]
              return (
                <div key={i} onClick={() => toggleAction(i)}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 10,
                    background: done ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
                    border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.2s',
                    opacity: done ? 0.75 : 1,
                  }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, border: `2px solid ${done ? '#22c55e' : 'var(--border)'}`,
                    background: done ? '#22c55e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    fontSize: 12, fontWeight: 800, color: '#000',
                  }}>{done ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{a.action}</div>
                      <PriorityBadge priority={a.priorite} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--text2)' }}>Mesure:</strong> {a.metric_cible}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Stop / Keep doing */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <Card style={{ borderLeft: '3px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🛑</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', margin: 0 }}>STOP DOING</h4>
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.stop_doing.map((s, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                  ✗ {s}
                </li>
              ))}
            </ul>
          </Card>

          <Card style={{ borderLeft: '3px solid #22c55e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', margin: 0 }}>KEEP DOING</h4>
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.keep_doing.map((s, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                  ✓ {s}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    )
  }

  const renderInstruments = () => {
    if (!analysis) return null
    if (!analysis.instruments_analysis || analysis.instruments_analysis.length === 0) {
      return <Card><div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Pas assez de données par instrument.</div></Card>
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, animation: 'fadeIn 0.4s ease' }}>
        {analysis.instruments_analysis.map((inst, i) => {
          const stat = stats?.instruments.find(s => s.instrument === inst.instrument)
          return (
            <Card key={i} style={{ borderLeft: '3px solid #3b82f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0, fontFamily: 'monospace' }}>{inst.instrument}</h4>
                {stat && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, fontFamily: 'monospace' }}>
                    <span style={{ color: stat.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(stat.pnl)}</span>
                    <span style={{ color: 'var(--text3)' }}>•</span>
                    <span style={{ color: 'var(--text2)' }}>{stat.win_rate}% WR</span>
                    {stat.avg_r !== null && (
                      <>
                        <span style={{ color: 'var(--text3)' }}>•</span>
                        <span style={{ color: 'var(--text2)' }}>{stat.avg_r}R avg</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Verdict</div>
                <p style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{inst.verdict}</p>
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>💡 Conseil</div>
                <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{inst.conseil}</div>
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  const renderObjectifs = () => {
    if (!analysis) return null
    const sections: { key: string; label: string; icon: string; color: string; content: string }[] = [
      { key: 'court', label: 'Court terme — 7 jours', icon: '🎯', color: '#22c55e', content: analysis.objectifs_realistes.court_terme },
      { key: 'moyen', label: 'Moyen terme — 30 jours', icon: '📅', color: '#3b82f6', content: analysis.objectifs_realistes.moyen_terme },
      { key: 'long', label: 'Long terme — 90 jours', icon: '🚀', color: '#a855f7', content: analysis.objectifs_realistes.long_terme },
    ]
    const planSections: { key: string; label: string; icon: string; content: string }[] = [
      { key: 'matin', label: 'Routine pré-marché', icon: '☀️', content: analysis.plan_jour_type.matin },
      { key: 'session', label: 'Pendant la session', icon: '⚡', content: analysis.plan_jour_type.session },
      { key: 'post', label: 'Debriefing post-session', icon: '📝', content: analysis.plan_jour_type.post_session },
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {sections.map(s => (
            <Card key={s.key} style={{ borderTop: `3px solid ${s.color}`, background: `linear-gradient(180deg, ${s.color}08, transparent)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{s.label}</h4>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{s.content}</p>
            </Card>
          ))}
        </div>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Plan jour-type</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {planSections.map(p => {
              const expanded = !!expandedPlan[p.key]
              return (
                <div key={p.key} onClick={() => setExpandedPlan({ ...expandedPlan, [p.key]: !expanded })}
                  style={{ cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{p.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{expanded ? '▼' : '▶'}</span>
                  </div>
                  {expanded && (
                    <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.65, margin: '10px 0 0 28px' }}>{p.content}</p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    )
  }

  const renderMetrics = () => {
    if (!stats) return null

    // Compute max bars for scaling
    const maxInstrumentPnl = Math.max(1, ...stats.instruments.map(i => Math.abs(i.pnl)))
    const maxDayPnl = Math.max(1, ...stats.day_of_week.map(d => Math.abs(d.avg_pnl)))
    const rTotal = stats.r_distribution.lt_minus2 + stats.r_distribution.m2_to_m1 + stats.r_distribution.m1_to_0 +
                  stats.r_distribution.z0_to_1 + stats.r_distribution.p1_to_2 + stats.r_distribution.gt_2
    const rMax = Math.max(1, stats.r_distribution.lt_minus2, stats.r_distribution.m2_to_m1, stats.r_distribution.m1_to_0,
                          stats.r_distribution.z0_to_1, stats.r_distribution.p1_to_2, stats.r_distribution.gt_2)

    const rBuckets: { lbl: string; val: number; color: string }[] = [
      { lbl: '< -2R', val: stats.r_distribution.lt_minus2, color: '#dc2626' },
      { lbl: '-2 à -1R', val: stats.r_distribution.m2_to_m1, color: '#ef4444' },
      { lbl: '-1 à 0R', val: stats.r_distribution.m1_to_0, color: '#f59e0b' },
      { lbl: '0 à 1R', val: stats.r_distribution.z0_to_1, color: '#84cc16' },
      { lbl: '1 à 2R', val: stats.r_distribution.p1_to_2, color: '#22c55e' },
      { lbl: '> 2R', val: stats.r_distribution.gt_2, color: '#16a34a' },
    ]

    const recent = stats.recent_vs_older.recent_15d
    const older = stats.recent_vs_older.older_15d

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.4s ease' }}>
        {/* Per-instrument */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Top instruments</h3>
          </div>
          {stats.instruments.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pas de données instruments.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.instruments.map(inst => {
                const widthPct = (Math.abs(inst.pnl) / maxInstrumentPnl) * 100
                const positive = inst.pnl >= 0
                return (
                  <div key={inst.instrument} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 70px 70px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{inst.instrument}</div>
                    <div style={{ position: 'relative', height: 18, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${widthPct}%`, background: positive ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #ef4444, #dc2626)', borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'monospace', color: positive ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmtEur(inst.pnl)}</div>
                    <div style={{ textAlign: 'right', color: 'var(--text2)', fontFamily: 'monospace' }}>{inst.win_rate}% WR</div>
                    <div style={{ textAlign: 'right', color: 'var(--text3)', fontFamily: 'monospace' }}>{inst.avg_r !== null ? `${inst.avg_r}R` : '—'}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Day of week */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Jour de la semaine</h3>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {stats.best_day && <span>Meilleur: <strong style={{ color: '#22c55e' }}>{stats.best_day.day}</strong></span>}
              {stats.worst_day && <span style={{ marginLeft: 12 }}>Pire: <strong style={{ color: '#ef4444' }}>{stats.worst_day.day}</strong></span>}
            </div>
          </div>
          {stats.day_of_week.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pas de données jour.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.day_of_week.map(d => {
                const widthPct = (Math.abs(d.avg_pnl) / maxDayPnl) * 100
                const positive = d.avg_pnl >= 0
                return (
                  <div key={d.day} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 70px 50px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{d.day}</div>
                    <div style={{ position: 'relative', height: 16, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${widthPct}%`, background: positive ? '#22c55e' : '#ef4444', opacity: 0.85, borderRadius: 3, transition: 'width 0.6s ease' }} />
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'monospace', color: positive ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmtEur(d.avg_pnl)}/sess</div>
                    <div style={{ textAlign: 'right', color: 'var(--text2)', fontFamily: 'monospace' }}>{d.win_rate}% WR</div>
                    <div style={{ textAlign: 'right', color: 'var(--text3)', fontFamily: 'monospace' }}>n={d.count}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Recent vs older */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🔁</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>15 derniers jours vs 15 jours précédents</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { lbl: 'Période précédente (J-30 à J-15)', s: older, color: '#9ca3af' },
              { lbl: 'Période récente (J-15 à J-0)', s: recent, color: '#22c55e' },
            ].map(p => (
              <div key={p.lbl} style={{ background: 'var(--bg3)', border: `1px solid ${p.color}30`, borderTop: `2px solid ${p.color}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{p.lbl}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text3)' }}>Sessions:</span> <strong style={{ color: 'var(--text)' }}>{p.s.count}</strong></div>
                  <div><span style={{ color: 'var(--text3)' }}>P&L:</span> <strong style={{ color: p.s.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(p.s.pnl)}</strong></div>
                  <div><span style={{ color: 'var(--text3)' }}>Win rate:</span> <strong style={{ color: 'var(--text)' }}>{p.s.win_rate}%</strong></div>
                  <div><span style={{ color: 'var(--text3)' }}>Avg R:</span> <strong style={{ color: 'var(--text)' }}>{p.s.avg_r !== null ? `${p.s.avg_r}R` : 'N/A'}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* R-distribution histogram */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>📐</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Distribution R-multiple ({rTotal} sessions)</h3>
          </div>
          {rTotal === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pas de R-multiples enregistrés. Ajoute &ldquo;r_result&rdquo; à tes sessions.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '0 4px' }}>
              {rBuckets.map(b => {
                const heightPct = (b.val / rMax) * 100
                return (
                  <div key={b.lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: b.color, fontFamily: 'monospace' }}>{b.val}</div>
                    <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${heightPct}%`, background: `linear-gradient(180deg, ${b.color}, ${b.color}aa)`, borderRadius: '4px 4px 0 0', boxShadow: `0 0 12px ${b.color}50`, transition: 'height 0.6s ease' }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: 'var(--text3)', textAlign: 'center', fontFamily: 'monospace' }}>{b.lbl}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Streaks + plan correlation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🔥</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Streaks</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{stats.max_win_streak}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max wins</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{stats.max_loss_streak}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max losses</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: stats.current_streak.type === 'win' ? '#22c55e' : stats.current_streak.type === 'loss' ? '#ef4444' : 'var(--text2)' }}>
                  {stats.current_streak.length}{stats.current_streak.type === 'win' ? 'W' : stats.current_streak.type === 'loss' ? 'L' : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actuel</div>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Corrélation plan score</h4>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text2)' }}>Plan ≥ 8 ({stats.plan_score_correlation.count_high_plan} sess)</span>
                <strong style={{ color: '#22c55e', fontFamily: 'monospace' }}>{fmtEur(stats.plan_score_correlation.avg_pnl_high_plan)}/sess</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text2)' }}>Plan &lt; 8 ({stats.plan_score_correlation.count_low_plan} sess)</span>
                <strong style={{ color: '#ef4444', fontFamily: 'monospace' }}>{fmtEur(stats.plan_score_correlation.avg_pnl_low_plan)}/sess</strong>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
                Plan score moyen: <strong style={{ color: 'var(--text2)' }}>{stats.plan_score_correlation.avg_plan_score ?? 'N/A'}</strong>
              </div>
            </div>
          </Card>
        </div>

        {/* Avg winner / loser + R:R */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { lbl: 'Avg gagnant', val: fmtEur(stats.avg_winner_eur), color: '#22c55e' },
            { lbl: 'Avg perdant', val: stats.avg_loser_eur !== null ? `-${stats.avg_loser_eur} €` : 'N/A', color: '#ef4444' },
            { lbl: 'R:R ratio', val: stats.risk_reward !== null ? `${stats.risk_reward}` : 'N/A', color: stats.risk_reward !== null && stats.risk_reward >= 1 ? '#22c55e' : '#f59e0b' },
            { lbl: 'Sessions/sem', val: stats.avg_sessions_per_week !== null ? `${stats.avg_sessions_per_week}` : 'N/A', color: 'var(--text)' },
            { lbl: 'Trades 1-3', val: stats.trades_distribution.light_1_3, color: 'var(--text)' },
            { lbl: 'Trades 4-6', val: stats.trades_distribution.medium_4_6, color: 'var(--text)' },
            { lbl: 'Trades 7+', val: stats.trades_distribution.heavy_7_plus, color: 'var(--text)' },
          ].map(m => (
            <Card key={m.lbl} style={{ padding: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.lbl}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: m.color, fontFamily: 'monospace' }}>{m.val}</div>
            </Card>
          ))}
        </div>

        {/* Backtests */}
        {(stats.top_setups_backtest.length > 0 || stats.top_signals_backtest.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {stats.top_setups_backtest.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🎯</span>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Top setups backtest</h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.top_setups_backtest.map(s => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: 10, fontFamily: 'monospace' }}>
                        <span style={{ color: s.wr >= 60 ? '#22c55e' : s.wr >= 40 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{s.wr}%</span>
                        <span style={{ color: 'var(--text3)' }}>n={s.n}</span>
                        <span style={{ color: 'var(--text2)' }}>{s.avg_r}R</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {stats.top_signals_backtest.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>📡</span>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Top signaux backtest</h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.top_signals_backtest.map(s => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: 10, fontFamily: 'monospace' }}>
                        <span style={{ color: s.wr >= 60 ? '#22c55e' : s.wr >= 40 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>{s.wr}%</span>
                        <span style={{ color: 'var(--text3)' }}>n={s.n}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Confluence */}
        {(stats.confluence_comparison.with_confluence.count > 0 || stats.confluence_comparison.without_confluence.count > 0) && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🔗</span>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Confluence vs simple (backtests)</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { lbl: 'Avec confluence', s: stats.confluence_comparison.with_confluence, color: '#22c55e' },
                { lbl: 'Sans confluence', s: stats.confluence_comparison.without_confluence, color: '#9ca3af' },
              ].map(c => (
                <div key={c.lbl} style={{ background: 'var(--bg3)', borderTop: `2px solid ${c.color}`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{c.lbl}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.color, fontFamily: 'monospace' }}>{c.s.win_rate}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{c.s.count} trades · {c.s.avg_r !== null ? `${c.s.avg_r}R avg` : 'R N/A'}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }

  const renderCompare = () => {
    if (history.length < 2) {
      return (
        <Card>
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📈</div>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Pas encore de comparaison</h4>
            <p style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
              Lance au moins 2 analyses pour voir l&apos;évolution de tes scores. Chaque nouvelle analyse est sauvegardée automatiquement.
            </p>
            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text2)' }}>
              Analyses sauvegardées: <strong>{history.length}</strong>
            </div>
          </div>
        </Card>
      )
    }

    const last3 = history.slice(-3)
    const labels: { key: keyof HistoryEntry['scores']; label: string; color: string }[] = [
      { key: 'discipline', label: 'Discipline', color: '#22c55e' },
      { key: 'psycho', label: 'Psycho', color: '#3b82f6' },
      { key: 'methode', label: 'Méthode', color: '#a855f7' },
      { key: 'risk', label: 'Risque', color: '#f59e0b' },
      { key: 'consistance', label: 'Consistance', color: '#ec4899' },
      { key: 'force_mentale', label: 'Mental', color: '#06b6d4' },
    ]

    // SVG line chart dimensions
    const w = 600
    const h = 240
    const padX = 50
    const padY = 24
    const chartW = w - padX * 2
    const chartH = h - padY * 2
    const stepX = last3.length > 1 ? chartW / (last3.length - 1) : 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.4s ease' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📈</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Évolution des scores ({last3.length} dernières analyses)</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <svg width={w} height={h} style={{ minWidth: w }}>
              {/* Grid */}
              {[0, 2.5, 5, 7.5, 10].map(g => {
                const y = padY + chartH - (g / 10) * chartH
                return (
                  <g key={g}>
                    <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,4" />
                    <text x={padX - 8} y={y + 4} fontSize="10" fill="var(--text3)" textAnchor="end">{g}</text>
                  </g>
                )
              })}
              {/* X labels */}
              {last3.map((h, i) => {
                const x = padX + i * stepX
                const date = new Date(h.date)
                return (
                  <text key={i} x={x} y={padY + chartH + 16} fontSize="10" fill="var(--text3)" textAnchor="middle">
                    {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </text>
                )
              })}
              {/* Lines */}
              {labels.map(l => {
                const points = last3.map((entry, i) => {
                  const x = padX + i * stepX
                  const y = padY + chartH - (entry.scores[l.key] / 10) * chartH
                  return `${x},${y}`
                }).join(' ')
                return (
                  <g key={l.key}>
                    <polyline fill="none" stroke={l.color} strokeWidth="2" points={points} style={{ filter: `drop-shadow(0 0 4px ${l.color}60)` }} />
                    {last3.map((entry, i) => {
                      const x = padX + i * stepX
                      const y = padY + chartH - (entry.scores[l.key] / 10) * chartH
                      return <circle key={i} cx={x} cy={y} r="3.5" fill={l.color} stroke="var(--bg)" strokeWidth="1.5" />
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {labels.map(l => (
              <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
                <div style={{ width: 12, height: 3, background: l.color, borderRadius: 2 }} />
                {l.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Per-analysis cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {last3.map((entry) => {
            const date = new Date(entry.date)
            const trendColor = TREND_COLOR[entry.trend] || '#9ca3af'
            return (
              <Card key={entry.date}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${trendColor}20`, color: trendColor }}>{entry.trend}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: '0 0 10px 0' }}>{entry.verdict_general.length > 140 ? `${entry.verdict_general.substring(0, 140)}...` : entry.verdict_general}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: 10 }}>
                  {labels.map(l => (
                    <div key={l.key} style={{ textAlign: 'center', padding: '4px 2px', background: 'var(--bg3)', borderRadius: 4 }}>
                      <div style={{ fontSize: 9, color: 'var(--text3)' }}>{l.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: noteColor(entry.scores[l.key]) }}>{entry.scores[l.key]}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- Render ----------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 14px rgba(34,197,94,0.35)}50%{box-shadow:0 0 22px rgba(34,197,94,0.55)}}
        .ai-cta-btn{position:relative;overflow:hidden}
        .ai-cta-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent,rgba(255,255,255,0.18),transparent);transform:translateX(-100%);transition:transform 0.6s}
        .ai-cta-btn:hover::before{transform:translateX(100%)}
        .ai-cta-btn:hover{transform:translateY(-1px);animation:pulseGlow 2s ease-in-out infinite}
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🧠</span> Analyse IA
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
            Diagnostic complet sur 60 jours: forces, faiblesses, patterns, plan d&apos;action et objectifs réalistes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}>
              📚 Historique ({history.length})
            </button>
          )}
          {analysis && (
            <button
              onClick={saveCurrent}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}>
              💾 Sauvegarder
            </button>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className={loading ? '' : 'ai-cta-btn'}
            style={{
              padding: '12px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              background: loading ? 'var(--bg2)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: loading ? 'var(--text3)' : '#09090b', border: 'none',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
              boxShadow: loading ? 'none' : '0 0 14px rgba(34,197,94,0.35)',
            }}>
            {loading ? '⏳ Analyse en cours...' : analysis ? '🔄 Regénérer' : '✨ Lancer l\'analyse'}
          </button>
        </div>
      </div>

      {savedToast && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 1000, padding: '10px 16px', background: 'rgba(34,197,94,0.95)', color: '#000', borderRadius: 10, fontSize: 12, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadeIn 0.3s ease' }}>
          ✓ Analyse sauvegardée
        </div>
      )}

      {/* History panel */}
      {showHistoryPanel && history.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>📚 Historique des analyses</h4>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{history.length}/5</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.slice().reverse().map(h => {
              const d = new Date(h.date)
              const trendColor = TREND_COLOR[h.trend] || '#9ca3af'
              return (
                <div key={h.date} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ fontFamily: 'monospace', color: 'var(--text3)', fontSize: 11, minWidth: 110 }}>{d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${trendColor}20`, color: trendColor }}>{h.trend}</span>
                  <div style={{ flex: 1, color: 'var(--text2)', fontSize: 11.5 }}>{h.verdict_general.length > 90 ? `${h.verdict_general.substring(0, 90)}...` : h.verdict_general}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['discipline', 'psycho', 'methode', 'risk', 'consistance', 'force_mentale'] as const).map(k => (
                      <div key={k} title={k} style={{ width: 22, height: 22, borderRadius: 4, background: noteColor(h.scores[k]) + '30', border: `1px solid ${noteColor(h.scores[k])}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: noteColor(h.scores[k]) }}>{h.scores[k]}</div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!analysis && !loading && !error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>🧠</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Prêt pour ton diagnostic ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
              L&apos;IA va analyser <strong style={{ color: 'var(--text)' }}>toutes tes sessions, notes, backtests, instruments, jours de la semaine et streaks</strong> sur les 60 derniers jours pour te livrer un diagnostic complet: 6 scores, plan d&apos;action, objectifs court/moyen/long terme et conseils par instrument.
            </p>
            <div style={{ marginTop: 24, display: 'inline-flex', gap: 16, padding: '12px 20px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span>⚡ ~12 sec</span>
              <span>·</span>
              <span>🔒 Données privées</span>
              <span>·</span>
              <span>🎯 Coach trading senior</span>
              <span>·</span>
              <span>📊 8 onglets d&apos;analyse</span>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
          <div style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.6 }}>
            <strong>Erreur :</strong> {error}
          </div>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'inline-block', width: 40, height: 40, border: '3px solid var(--bg3)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 14, color: 'var(--text2)', marginTop: 16, fontWeight: 500 }}>L&apos;IA analyse 60 jours de données...</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Quelques secondes — ne ferme pas la page</p>
          </div>
        </Card>
      )}

      {/* Tabs + content */}
      {analysis && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)', overflowX: 'auto' }}>
            {TABS.map(t => {
              const active = activeTab === t.id
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: active ? 'var(--green)' : 'transparent',
                  color: active ? '#09090b' : 'var(--text2)',
                  border: 'none', whiteSpace: 'nowrap', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Active tab content */}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'forces' && renderForces()}
          {activeTab === 'patterns' && renderPatterns()}
          {activeTab === 'plan' && renderPlan()}
          {activeTab === 'instruments' && renderInstruments()}
          {activeTab === 'objectifs' && renderObjectifs()}
          {activeTab === 'metrics' && renderMetrics()}
          {activeTab === 'compare' && renderCompare()}

          {generatedAt && (
            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              Analyse générée le {generatedAt.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · IA Llama 3.3 via Groq · 60 jours de données
            </div>
          )}
        </>
      )}
    </div>
  )
}
