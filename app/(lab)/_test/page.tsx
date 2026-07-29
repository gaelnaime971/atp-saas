'use client'

/**
 * /test — Design demo of the trader dashboard.
 * Self-contained: no DB, no API. Mock data only.
 * Uses real shadcn/ui primitives from @/components/shadcn/*.
 * shadcn tokens (--card, --primary, --border, --radius…) are overridden
 * inside the .tp scope so the dark trading palette applies here without
 * touching global .dark tokens (which other pages don't use anyway).
 */

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, ComposedChart,
  Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine,
} from 'recharts'
import {
  LayoutDashboard, List, BarChart3, FlaskConical, BookOpen, Bookmark,
  Building2, Video, Folder, Plus, Play, MoreHorizontal, TrendingUp,
  Check, ArrowRight,
} from 'lucide-react'

import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction,
} from '@/components/shadcn/card'
import { Badge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/shadcn/table'
import { Separator } from '@/components/shadcn/separator'
import {
  Tooltip, TooltipProvider, TooltipTrigger, TooltipContent,
} from '@/components/shadcn/tooltip'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/shadcn/dropdown-menu'

// ═══════════════════════════════════════════════════════════════
// MOCK DATA — 16 realistic sessions across ~5 weeks
// ═══════════════════════════════════════════════════════════════

type Session = {
  date: string
  instrument: 'ES' | 'NQ' | 'YM' | 'MNQ' | 'MES'
  trades: number
  pnl: number
  r: number
  winRate: number
  plan: number
  mood: '😌' | '🎯' | '🔥' | '😴' | '😬' | '😐'
  type: 'Live' | 'Paper'
  setup: string
}

const SESSIONS: Session[] = [
  { date: '2026-06-15', instrument: 'ES',  trades: 4, pnl:  425, r:  2.1, winRate:  75, plan: 8, mood: '😌', type: 'Live',  setup: 'Break/Retest' },
  { date: '2026-06-16', instrument: 'NQ',  trades: 6, pnl: -180, r: -0.9, winRate:  50, plan: 6, mood: '😐', type: 'Live',  setup: 'ORB' },
  { date: '2026-06-17', instrument: 'ES',  trades: 3, pnl:  680, r:  3.4, winRate: 100, plan: 9, mood: '🎯', type: 'Live',  setup: 'Trend Follow' },
  { date: '2026-06-18', instrument: 'YM',  trades: 5, pnl:  -95, r: -0.5, winRate:  40, plan: 5, mood: '😬', type: 'Live',  setup: 'Fade' },
  { date: '2026-06-19', instrument: 'NQ',  trades: 4, pnl:  312, r:  1.6, winRate:  75, plan: 8, mood: '😌', type: 'Live',  setup: 'Break/Retest' },
  { date: '2026-06-22', instrument: 'MNQ', trades: 2, pnl:  140, r:  0.7, winRate: 100, plan: 7, mood: '😐', type: 'Paper', setup: 'ORB' },
  { date: '2026-06-23', instrument: 'ES',  trades: 5, pnl:  890, r:  4.5, winRate:  80, plan: 9, mood: '🔥', type: 'Live',  setup: 'Trend Follow' },
  { date: '2026-06-24', instrument: 'NQ',  trades: 6, pnl: -420, r: -2.1, winRate:  33, plan: 4, mood: '😬', type: 'Live',  setup: 'Fade' },
  { date: '2026-06-25', instrument: 'ES',  trades: 3, pnl:  210, r:  1.1, winRate:  67, plan: 7, mood: '😌', type: 'Live',  setup: 'Break/Retest' },
  { date: '2026-06-26', instrument: 'NQ',  trades: 4, pnl:  525, r:  2.6, winRate:  75, plan: 8, mood: '🎯', type: 'Live',  setup: 'ORB' },
  { date: '2026-06-29', instrument: 'ES',  trades: 5, pnl: -280, r: -1.4, winRate:  40, plan: 6, mood: '😴', type: 'Live',  setup: 'Fade' },
  { date: '2026-06-30', instrument: 'NQ',  trades: 3, pnl:  460, r:  2.3, winRate: 100, plan: 9, mood: '🔥', type: 'Live',  setup: 'Trend Follow' },
  { date: '2026-07-01', instrument: 'YM',  trades: 4, pnl:  180, r:  0.9, winRate:  75, plan: 7, mood: '😐', type: 'Live',  setup: 'ORB' },
  { date: '2026-07-02', instrument: 'ES',  trades: 6, pnl:  715, r:  3.6, winRate:  83, plan: 8, mood: '🎯', type: 'Live',  setup: 'Break/Retest' },
  { date: '2026-07-03', instrument: 'NQ',  trades: 3, pnl: -155, r: -0.8, winRate:  33, plan: 5, mood: '😬', type: 'Live',  setup: 'Fade' },
  { date: '2026-07-06', instrument: 'ES',  trades: 4, pnl:  395, r:  2.0, winRate:  75, plan: 8, mood: '😌', type: 'Live',  setup: 'Trend Follow' },
]

// ═══════════════════════════════════════════════════════════════
// KPI COMPUTATIONS
// ═══════════════════════════════════════════════════════════════

function computeKpis(sessions: Session[]) {
  const totalPnl = sessions.reduce((s, x) => s + x.pnl, 0)
  const wins = sessions.filter(s => s.pnl > 0)
  const losses = sessions.filter(s => s.pnl < 0)
  const winRate = sessions.length ? (wins.length / sessions.length) * 100 : 0
  const grossWin = wins.reduce((s, x) => s + x.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin
  const avgSession = sessions.length ? totalPnl / sessions.length : 0
  const bestDay = sessions.reduce((m, s) => Math.max(m, s.pnl), 0)
  const sorted = [...sessions].sort((a, z) => z.date.localeCompare(a.date))
  let streak = 0
  const streakSign = sorted[0]?.pnl > 0 ? 1 : sorted[0]?.pnl < 0 ? -1 : 0
  for (const s of sorted) {
    const sign = s.pnl > 0 ? 1 : s.pnl < 0 ? -1 : 0
    if (sign === streakSign && sign !== 0) streak++
    else break
  }
  const today = sorted[0]?.date
  const todayPnl = sorted.filter(s => s.date === today).reduce((s, x) => s + x.pnl, 0)
  return {
    totalPnl, winRate, profitFactor, avgSession, bestDay,
    streak, streakSign, todayPnl, sessionsCount: sessions.length,
  }
}

// ═══════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════

export default function TestDashboardPage() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const kpis = useMemo(() => computeKpis(SESSIONS), [])
  const sorted = useMemo(() => [...SESSIONS].sort((a, z) => a.date.localeCompare(z.date)), [])
  const equityCurve = useMemo(() => {
    let cum = 0
    return sorted.map(s => {
      cum += s.pnl
      return { date: s.date.slice(5), cumulative: cum, daily: s.pnl }
    })
  }, [sorted])

  const monthlyTarget = 5000
  const monthlyPct = Math.min(100, Math.max(0, (kpis.totalPnl / monthlyTarget) * 100))

  return (
    <TooltipProvider delay={200}>
      <style>{`
        .tp{
          /* ── shadcn tokens overridden for dark trading register ── */
          --background:#0A0B0D;
          --foreground:#F5F5F7;
          --card:#111214;
          --card-foreground:#F5F5F7;
          --popover:#16171A;
          --popover-foreground:#F5F5F7;
          --primary:#C9A574;
          --primary-foreground:#0A0B0D;
          --secondary:#16171A;
          --secondary-foreground:#F5F5F7;
          --muted:#16171A;
          --muted-foreground:#B0B3B8;
          --accent:#16171A;
          --accent-foreground:#F5F5F7;
          --destructive:#D67373;
          --border:rgba(255,255,255,0.06);
          --input:rgba(255,255,255,0.10);
          --ring:rgba(201,165,116,0.35);
          --radius:0.875rem;

          /* ── extra tokens for this dashboard ── */
          --pos:#4CAF7A;
          --pos-sb:rgba(76,175,122,0.10);
          --pos-bd:rgba(76,175,122,0.24);
          --neg:#D67373;
          --neg-sb:rgba(214,115,115,0.10);
          --neg-bd:rgba(214,115,115,0.24);
          --info:#7BA5C4;
          --info-sb:rgba(123,165,196,0.10);
          --info-bd:rgba(123,165,196,0.24);
          --ac:#C9A574;
          --ac-h:#D4B587;
          --ac-sb:rgba(201,165,116,0.08);
          --ac-bd:rgba(201,165,116,0.22);
          --tx-3:#6E7075;
          --tx-4:#4A4C50;
          --card-h:#15161A;
          --card-2:#16171A;
          --border-2:rgba(255,255,255,0.10);
          --border-3:rgba(255,255,255,0.16);
          --ease:cubic-bezier(0.2,0.8,0.2,1);
          --shadow-2:0 4px 12px rgba(0,0,0,0.28),0 1px 2px rgba(0,0,0,0.35);
          --shadow-3:0 12px 32px rgba(0,0,0,0.36),0 2px 6px rgba(0,0,0,0.30);

          background:var(--background);
          color:var(--foreground);
          font-family:'Outfit',ui-sans-serif,system-ui,sans-serif;
          font-feature-settings:'ss01','cv11';
          -webkit-font-smoothing:antialiased;
        }
        .tp *::selection{background:var(--ac-sb);color:var(--foreground);}
        .tp .mono{
          font-family:'DM Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
          font-variant-numeric:tabular-nums;letter-spacing:-0.01em;
        }
        .tp .eyebrow{
          font-family:'DM Mono',monospace;font-size:10px;font-weight:500;
          letter-spacing:0.12em;text-transform:uppercase;color:var(--tx-3);
        }

        /* ── Sidebar ── */
        .tp .side-btn{
          display:flex;align-items:center;gap:12px;
          width:100%;padding:10px 14px;border-radius:12px;
          background:transparent;border:none;cursor:pointer;color:var(--muted-foreground);
          font-size:13.5px;font-weight:500;text-align:left;
          transition:background 0.15s var(--ease),color 0.15s var(--ease);
        }
        .tp .side-btn svg{width:18px;height:18px;stroke-width:1.6;flex-shrink:0;}
        .tp .side-btn:hover{background:var(--card);color:var(--foreground);}
        .tp .side-btn.active{background:var(--card);color:var(--foreground);box-shadow:inset 0 0 0 1px var(--border-2);}
        .tp .side-btn.active svg{color:var(--ac);}

        /* ── Pill nav ── */
        .tp .pill-nav{
          display:inline-flex;gap:2px;padding:4px;
          background:var(--card);border:1px solid var(--border);border-radius:100px;
          box-shadow:0 1px 2px rgba(0,0,0,0.4);
        }
        .tp .pill{
          padding:8px 14px;border-radius:100px;
          font-size:12.5px;font-weight:500;color:var(--muted-foreground);
          background:transparent;border:none;cursor:pointer;
          transition:background 0.18s var(--ease),color 0.18s var(--ease);
          display:inline-flex;align-items:center;gap:6px;
        }
        .tp .pill svg{width:14px;height:14px;stroke-width:1.8;}
        .tp .pill:hover{color:var(--foreground);}
        .tp .pill.active{background:var(--foreground);color:#0A0B0D;}

        /* ── KPI strip ── */
        .tp .kpi-strip{
          display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:0;
          background:var(--card);border:1px solid var(--border);border-radius:16px;
          overflow:hidden;box-shadow:var(--shadow-2);
        }
        .tp .kpi-strip .kpi{padding:16px 18px;border-right:1px solid var(--border);}
        .tp .kpi-strip .kpi:last-child{border-right:none;}
        .tp .kpi-l{font-family:'DM Mono',monospace;font-size:9.5px;font-weight:500;
          letter-spacing:0.10em;text-transform:uppercase;color:var(--tx-3);}
        .tp .kpi-v{
          font-family:'DM Mono',monospace;font-variant-numeric:tabular-nums;
          font-size:19px;font-weight:600;margin-top:6px;color:var(--foreground);letter-spacing:-0.01em;
        }
        .tp .kpi-v.pos{color:var(--pos);} .tp .kpi-v.neg{color:var(--neg);}
        .tp .kpi-v.ac{color:var(--ac);}
        @media(max-width:1280px){
          .tp .kpi-strip{grid-template-columns:repeat(4,minmax(0,1fr));}
          .tp .kpi-strip .kpi:nth-child(4){border-right:none;}
          .tp .kpi-strip .kpi:nth-child(-n+4){border-bottom:1px solid var(--border);}
        }
        @media(max-width:768px){
          .tp .kpi-strip{grid-template-columns:repeat(2,minmax(0,1fr));}
          .tp .kpi-strip .kpi{border-right:none;border-bottom:1px solid var(--border);}
          .tp .kpi-strip .kpi:nth-child(2n){border-right:none;}
        }

        /* ── Badge variants (shadcn Badge + our tone tokens) ── */
        .tp .b-pos{background:var(--pos-sb) !important;border-color:var(--pos-bd) !important;color:var(--pos) !important;}
        .tp .b-neg{background:var(--neg-sb) !important;border-color:var(--neg-bd) !important;color:var(--neg) !important;}
        .tp .b-ac {background:var(--ac-sb)  !important;border-color:var(--ac-bd)  !important;color:var(--ac)  !important;}
        .tp .b-info{background:var(--info-sb) !important;border-color:var(--info-bd) !important;color:var(--info) !important;}

        /* ── Card hover subtle ── */
        .tp .card-hover:hover{background:var(--card-h);border-color:var(--border-2);transform:translateY(-1px);transition:all 0.2s var(--ease);}

        /* ── Heatmap ── */
        .tp .heat-cell{
          aspect-ratio:1;border-radius:6px;border:1px solid var(--border);
          display:flex;align-items:center;justify-content:center;
          font-family:'DM Mono',monospace;font-size:9px;font-weight:500;
          transition:transform 0.15s var(--ease),border-color 0.15s var(--ease);
          cursor:pointer;
        }
        .tp .heat-cell:hover{transform:scale(1.08);border-color:var(--border-3);z-index:2;}

        /* ── Avatar circle ── */
        .tp .avatar{
          width:36px;height:36px;border-radius:50%;
          background:var(--ac-sb);border:1px solid var(--ac-bd);
          display:flex;align-items:center;justify-content:center;
          font-weight:600;font-size:13px;color:var(--ac);
        }

        /* ── Shadcn Table overrides ── */
        .tp table th{
          font-family:'DM Mono',monospace;font-size:10px;font-weight:500;
          letter-spacing:0.10em;text-transform:uppercase;color:var(--tx-3);
        }
        .tp table td{color:var(--muted-foreground);}

        @media (prefers-reduced-motion:reduce){
          .tp *,.tp *::before,.tp *::after{transition-duration:0.01ms !important;animation-duration:0.01ms !important;}
        }
      `}</style>

      <div className="tp min-h-screen flex">
        <Sidebar activeNav={activeNav} setActiveNav={setActiveNav} />

        <main className="flex-1 min-w-0 p-6 lg:p-8 space-y-6">
          <Header />

          {/* KPI TOP STRIP — 8 metrics */}
          <div className="kpi-strip">
            <KpiCell label="P&L jour" value={fmtUsd(kpis.todayPnl, true)} tone={kpis.todayPnl >= 0 ? 'pos' : 'neg'} />
            <KpiCell label="P&L mois" value={fmtUsd(kpis.totalPnl, true)} tone={kpis.totalPnl >= 0 ? 'pos' : 'neg'} />
            <KpiCell label="P&L total" value={fmtUsd(kpis.totalPnl, true)} tone={kpis.totalPnl >= 0 ? 'pos' : 'neg'} />
            <KpiCell label="Win Rate" value={`${kpis.winRate.toFixed(1)}%`} tone="ac" />
            <KpiCell label="Profit Factor" value={kpis.profitFactor.toFixed(2)} tone="ac" />
            <KpiCell label="Streak" value={`${kpis.streak}${kpis.streakSign > 0 ? 'W' : kpis.streakSign < 0 ? 'L' : '—'}`} tone={kpis.streakSign > 0 ? 'pos' : kpis.streakSign < 0 ? 'neg' : undefined} />
            <KpiCell label="Moy / session" value={fmtUsd(kpis.avgSession)} tone={kpis.avgSession >= 0 ? 'pos' : 'neg'} />
            <KpiCell label="Best day" value={fmtUsd(kpis.bestDay, true)} tone="pos" />
          </div>

          {/* ROW 1 — Weekly goals (60%) + Radial gauge (40%) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3"><WeeklyGoalsCard /></div>
            <div className="lg:col-span-2"><MonthlyGaugeCard pct={monthlyPct} current={kpis.totalPnl} target={monthlyTarget} /></div>
          </div>

          {/* ROW 2 — 4 featured KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <FeaturedKpi
              label="P&L du jour" value={fmtUsd(kpis.todayPnl, true)}
              deltaLabel="vs. hier" deltaValue={fmtUsd(395 - (-155), true)} deltaTone="pos"
              sparkData={sorted.slice(-8).map(s => s.pnl)} sparkColor="var(--pos)"
            />
            <FeaturedKpi
              label="P&L du mois" value={fmtUsd(kpis.totalPnl, true)}
              deltaLabel="objectif 5 000 $" deltaValue={`${monthlyPct.toFixed(0)}%`} deltaTone="ac"
              sparkData={equityCurve.map(e => e.cumulative)} sparkColor="var(--ac)"
            />
            <FeaturedKpi
              label="Win Rate" value={`${kpis.winRate.toFixed(1)}%`}
              deltaLabel="vs. mois dernier" deltaValue="+4.2%" deltaTone="pos"
              sparkData={sorted.map((_, i) => {
                const w = sorted.slice(Math.max(0, i - 4), i + 1)
                return w.filter(s => s.pnl > 0).length / w.length * 100
              })} sparkColor="var(--ac)"
            />
            <FeaturedKpi
              label="Profit Factor" value={kpis.profitFactor.toFixed(2)}
              deltaLabel="vs. mois dernier" deltaValue="+0.87" deltaTone="pos"
              sparkData={sorted.map((_, i) => {
                const w = sorted.slice(0, i + 1)
                const gw = w.filter(s => s.pnl > 0).reduce((s, x) => s + x.pnl, 0)
                const gl = Math.abs(w.filter(s => s.pnl < 0).reduce((s, x) => s + x.pnl, 0))
                return gl > 0 ? gw / gl : gw
              })} sparkColor="var(--ac)"
            />
          </div>

          {/* ROW 3 — Equity curve (60%) + Recent sessions (40%) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3"><EquityCurveCard data={equityCurve} totalPnl={kpis.totalPnl} /></div>
            <div className="lg:col-span-2"><RecentSessionsCard sessions={[...SESSIONS].sort((a, z) => z.date.localeCompare(a.date)).slice(0, 5)} /></div>
          </div>

          {/* ROW 4 — Heatmap */}
          <HeatmapCard sessions={SESSIONS} />

          {/* ROW 5 — P&L per session bars */}
          <PnlBarsCard data={equityCurve} />

          {/* ROW 6 — Full sessions history */}
          <FullHistoryCard sessions={[...SESSIONS].sort((a, z) => a.date.localeCompare(z.date))} />
        </main>
      </div>
    </TooltipProvider>
  )
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════

function Sidebar({ activeNav, setActiveNav }: { activeNav: string; setActiveNav: (v: string) => void }) {
  const items = [
    { id: 'dashboard', label: 'Vue globale', icon: LayoutDashboard },
    { id: 'sessions',  label: 'Sessions',    icon: List },
    { id: 'stats',     label: 'Statistiques', icon: BarChart3 },
    { id: 'backtest',  label: 'Backtest',    icon: FlaskConical },
    { id: 'journal',   label: 'Journal',     icon: BookOpen },
    { id: 'setups',    label: 'Setups',      icon: Bookmark },
    { id: 'propfirm',  label: 'Prop Firm',   icon: Building2 },
    { id: 'coaching',  label: 'Coaching',    icon: Video },
    { id: 'ressources', label: 'Ressources', icon: Folder },
  ]

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 p-4 gap-6"
      style={{ width: 240, borderRight: '1px solid var(--border)', background: 'var(--background)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div
          className="flex items-center justify-center"
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg,var(--ac) 0%,var(--ac-h) 100%)',
            boxShadow: '0 2px 8px rgba(201,165,116,0.30)',
          }}
        >
          <TrendingUp size={14} strokeWidth={2.5} style={{ color: '#0A0B0D' }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Alpha Trading</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--tx-3)', letterSpacing: '0.10em' }}>PRO · v3.2</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        <div className="eyebrow px-3 mb-2">Menu</div>
        {items.map(i => {
          const Icon = i.icon
          return (
            <button key={i.id} className={`side-btn ${activeNav === i.id ? 'active' : ''}`} onClick={() => setActiveNav(i.id)}>
              <Icon />
              <span>{i.label}</span>
            </button>
          )
        })}
      </nav>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="avatar">GN</div>
          <div className="min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Gaël Naime</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--tx-3)', letterSpacing: '0.06em' }}>PRO · TIER 3</div>
          </div>
        </div>
      </Card>
    </aside>
  )
}

// ═══════════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════════

function Header() {
  return (
    <header className="flex items-start lg:items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Bienvenue Gaël,
        </h1>
        <p style={{ fontSize: 13, color: 'var(--tx-3)', marginTop: 6 }}>
          Ta salle de marché — sessions, performance, journal
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="pill-nav">
          <button className="pill active"><LayoutDashboard /> Dashboard</button>
          <button className="pill"><List /> Sessions</button>
          <button className="pill"><BarChart3 /> Stats</button>
          <button className="pill"><BookOpen /> Journal</button>
        </div>
        <Button variant="outline" size="sm" className="rounded-full">
          <Plus />Nouvelle session
        </Button>
        <Button size="sm" className="rounded-full">
          <Play />Live trading
        </Button>
      </div>
    </header>
  )
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY GOALS CARD
// ═══════════════════════════════════════════════════════════════

function WeeklyGoalsCard() {
  const goals = [
    { done: true,  label: 'Compléter le journal de la semaine' },
    { done: true,  label: 'Revoir les 3 pires trades' },
    { done: false, label: 'Backtester 20 setups Break/Retest' },
    { done: false, label: 'Préparer le plan de trading — semaine 28' },
  ]
  const doneCount = goals.filter(g => g.done).length
  const pct = (doneCount / goals.length) * 100

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Objectifs de la semaine</CardTitle>
            <CardDescription>Focus 4 tâches pour verrouiller ton edge cette semaine</CardDescription>
          </div>
          <Badge variant="outline" className="mono b-ac">{doneCount}/{goals.length}</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-baseline justify-between mb-2">
          <div className="mono" style={{ fontSize: 12, color: 'var(--tx-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Progression</div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>{pct.toFixed(0)}%</div>
        </div>
        <div style={{ height: 6, background: 'var(--card-2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'linear-gradient(90deg,var(--ac) 0%,var(--ac-h) 100%)',
            borderRadius: 3, transition: 'width 0.6s var(--ease)',
          }} />
        </div>

        <div className="mt-6 flex flex-col">
          {goals.map((g, i) => (
            <div key={g.label}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 py-2.5">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: g.done ? 'var(--ac)' : 'transparent',
                    border: `1.5px solid ${g.done ? 'var(--ac)' : 'var(--border-3)'}`,
                    transition: 'all 0.2s var(--ease)',
                  }}
                >
                  {g.done && <Check size={12} strokeWidth={3} style={{ color: '#0A0B0D' }} />}
                </div>
                <span style={{
                  fontSize: 13.5, color: g.done ? 'var(--tx-3)' : 'var(--muted-foreground)',
                  textDecoration: g.done ? 'line-through' : 'none',
                  textDecorationColor: 'var(--tx-4)',
                }}>{g.label}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// MONTHLY GAUGE CARD
// ═══════════════════════════════════════════════════════════════

function MonthlyGaugeCard({ pct, current, target }: { pct: number; current: number; target: number }) {
  const R = 60
  const STROKE = 12
  const CIRC = Math.PI * R
  const dash = (pct / 100) * CIRC
  const remaining = Math.max(0, target - current)

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Objectif mensuel</CardTitle>
            <CardDescription>Juillet 2026 · seuil {fmtUsdShort(target)}</CardDescription>
          </div>
          <CardAction>
            <CardMenu />
          </CardAction>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col items-center">
          <svg width={R * 2 + STROKE + 8} height={R + STROKE + 20} viewBox={`0 0 ${R * 2 + STROKE + 8} ${R + STROKE + 20}`}>
            <path
              d={`M ${STROKE / 2 + 4} ${R + STROKE / 2} A ${R} ${R} 0 0 1 ${R * 2 + STROKE / 2 + 4} ${R + STROKE / 2}`}
              fill="none" stroke="var(--card-2)" strokeWidth={STROKE} strokeLinecap="round"
            />
            <path
              d={`M ${STROKE / 2 + 4} ${R + STROKE / 2} A ${R} ${R} 0 0 1 ${R * 2 + STROKE / 2 + 4} ${R + STROKE / 2}`}
              fill="none" stroke="url(#gaugeGrad)" strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
              style={{ transition: 'stroke-dasharray 0.9s var(--ease)' }}
            />
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--ac)" />
                <stop offset="100%" stopColor="var(--pos)" />
              </linearGradient>
            </defs>
          </svg>

          <div style={{ marginTop: -34 }}>
            <div className="mono" style={{ fontSize: 36, fontWeight: 600, textAlign: 'center', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {pct.toFixed(0)}%
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--tx-3)', textAlign: 'center', marginTop: 4, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              Atteint
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-[13px]">
            <span style={{ color: 'var(--tx-3)' }}>Réalisé</span>
            <span className="mono" style={{ color: 'var(--pos)', fontWeight: 600 }}>{fmtUsd(current, true)}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span style={{ color: 'var(--tx-3)' }}>Restant</span>
            <span className="mono" style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>{fmtUsd(remaining)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-[13px]">
            <span style={{ color: 'var(--tx-3)' }}>Projection EOY</span>
            <Badge variant="outline" className="mono b-ac">+{fmtUsdShort(current * 12)}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// FEATURED KPI (with sparkline)
// ═══════════════════════════════════════════════════════════════

function FeaturedKpi({
  label, value, deltaLabel, deltaValue, deltaTone, sparkData, sparkColor,
}: {
  label: string; value: string; deltaLabel: string; deltaValue: string;
  deltaTone: 'pos' | 'neg' | 'ac'; sparkData: number[]; sparkColor: string;
}) {
  const toneCls = deltaTone === 'pos' ? 'b-pos' : deltaTone === 'neg' ? 'b-neg' : 'b-ac'
  return (
    <Card className="card-hover">
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="eyebrow">{label}</span>
          <CardMenu />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mono" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={`mono ${toneCls}`}>
            {deltaTone === 'pos' && '▲ '}
            {deltaTone === 'neg' && '▼ '}
            {deltaValue}
          </Badge>
          <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>{deltaLabel}</span>
        </div>
        <div style={{ marginTop: 14, height: 44 }}>
          <Sparkline data={sparkData} color={sparkColor} />
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// EQUITY CURVE CARD
// ═══════════════════════════════════════════════════════════════

function EquityCurveCard({ data, totalPnl }: { data: { date: string; cumulative: number; daily: number }[]; totalPnl: number }) {
  const [range, setRange] = useState<'7J' | '30J' | 'YTD'>('30J')

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>P&L cumulé</CardTitle>
            <CardDescription>Équity curve — 16 dernières sessions</CardDescription>
          </div>
          <div className="pill-nav" style={{ padding: 2 }}>
            {(['7J', '30J', 'YTD'] as const).map(v => (
              <button
                key={v}
                className={`pill ${range === v ? 'active' : ''}`}
                style={{ padding: '5px 12px', fontSize: 11 }}
                onClick={() => setRange(v)}
              >{v}</button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {fmtUsd(totalPnl, true)}
          </span>
          <Badge variant="outline" className="mono b-pos">▲ +{((totalPnl / 3000) * 100).toFixed(1)}%</Badge>
        </div>

        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ac)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--ac)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--tx-3)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--tx-3)' }} tickLine={false} axisLine={false} width={55} tickFormatter={v => `$${Math.round(v / 100) / 10}k`} />
              <RTooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-3)' }}
                labelStyle={{ color: 'var(--tx-3)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}
                itemStyle={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                formatter={(v) => [fmtUsd(Number(v), true), 'Cumulé']}
                cursor={{ stroke: 'var(--ac)', strokeDasharray: '3 3', strokeOpacity: 0.6 }}
              />
              <ReferenceLine y={0} stroke="var(--border-2)" />
              <Area type="monotone" dataKey="cumulative" stroke="var(--ac)" strokeWidth={2} fill="url(#eq-fill)" />
              <Line type="monotone" dataKey="cumulative" stroke="var(--ac)" strokeWidth={2} dot={{ r: 0 }} activeDot={{ r: 5, fill: 'var(--ac)', stroke: 'var(--background)', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// RECENT SESSIONS CARD
// ═══════════════════════════════════════════════════════════════

function RecentSessionsCard({ sessions }: { sessions: Session[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sessions récentes</CardTitle>
            <CardDescription>5 dernières entrées</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="rounded-full h-7 px-3 text-xs">
            Voir tout <ArrowRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          {sessions.map((s, i) => (
            <div key={s.date}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 py-3">
                <div
                  className="flex items-center justify-center shrink-0 mono"
                  style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: s.pnl >= 0 ? 'var(--pos-sb)' : 'var(--neg-sb)',
                    border: `1px solid ${s.pnl >= 0 ? 'var(--pos-bd)' : 'var(--neg-bd)'}`,
                    fontSize: 10.5, fontWeight: 600,
                    color: s.pnl >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                >{s.instrument}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{s.instrument} · {s.setup}</span>
                    <span style={{ fontSize: 15 }}>{s.mood}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                    {fmtDate(s.date)} · {s.trades} trades · {s.winRate.toFixed(0)}% WR
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: s.pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {fmtUsd(s.pnl, true)}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--tx-3)', marginTop: 2 }}>
                    {s.r >= 0 ? '+' : ''}{s.r.toFixed(1)}R
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// HEATMAP CARD (with shadcn Tooltip)
// ═══════════════════════════════════════════════════════════════

function HeatmapCard({ sessions }: { sessions: Session[] }) {
  const startDate = new Date('2026-06-08')
  const weeks: { date: string; pnl: number | null }[][] = []
  const sessionMap = new Map(sessions.map(s => [s.date, s.pnl]))
  const maxAbs = Math.max(...sessions.map(s => Math.abs(s.pnl)))

  for (let w = 0; w < 5; w++) {
    const week: { date: string; pnl: number | null }[] = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(startDate)
      dt.setDate(dt.getDate() + w * 7 + d)
      const iso = dt.toISOString().slice(0, 10)
      week.push({ date: iso, pnl: sessionMap.get(iso) ?? null })
    }
    weeks.push(week)
  }

  const getBg = (pnl: number | null) => {
    if (pnl == null) return { bg: 'var(--card-2)', color: 'var(--tx-4)' }
    const intensity = Math.min(1, Math.abs(pnl) / maxAbs)
    const alpha = 0.15 + intensity * 0.45
    if (pnl >= 0) return { bg: `rgba(76,175,122,${alpha})`, color: intensity > 0.6 ? '#0A0B0D' : 'var(--pos)' }
    return { bg: `rgba(214,115,115,${alpha})`, color: intensity > 0.6 ? '#0A0B0D' : 'var(--neg)' }
  }

  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Heatmap P&L</CardTitle>
            <CardDescription>Intensité proportionnelle au P&L quotidien</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <span className="eyebrow">Perte</span>
            <div className="flex gap-1">
              {['rgba(214,115,115,0.6)', 'rgba(214,115,115,0.35)', 'var(--card-2)', 'rgba(76,175,122,0.35)', 'rgba(76,175,122,0.6)'].map((c, i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid var(--border)' }} />
              ))}
            </div>
            <span className="eyebrow">Gain</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12 }}>
          <div className="flex flex-col gap-2 justify-between pt-6">
            {['S 24', 'S 25', 'S 26', 'S 27', 'S 28'].map(l => (
              <div key={l} className="mono" style={{ fontSize: 10, color: 'var(--tx-3)' }}>{l}</div>
            ))}
          </div>

          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 8 }}>
              {dayLabels.map((d, i) => (
                <div key={i} className="mono text-center" style={{ fontSize: 10, color: 'var(--tx-3)' }}>{d}</div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              {weeks.map((wk, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                  {wk.map(cell => {
                    const { bg, color } = getBg(cell.pnl)
                    return (
                      <Tooltip key={cell.date}>
                        <TooltipTrigger
                          className="heat-cell"
                          style={{
                            background: bg,
                            color: cell.pnl != null ? color : 'var(--tx-4)',
                            borderColor: cell.pnl != null ? 'transparent' : 'var(--border)',
                          }}
                        >
                          {cell.pnl != null && (cell.pnl >= 1000 ? `${(cell.pnl / 1000).toFixed(1)}k` : Math.round(cell.pnl))}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="mono text-xs">
                          {fmtDate(cell.date)}{cell.pnl != null ? ` · ${fmtUsd(cell.pnl, true)}` : ' · —'}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// P&L BARS CARD
// ═══════════════════════════════════════════════════════════════

function PnlBarsCard({ data }: { data: { date: string; cumulative: number; daily: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>P&L par session</CardTitle>
            <CardDescription>Verts = sessions gagnantes · rouges = sessions perdantes</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--pos)' }} />
              <span className="eyebrow">Gain</span>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--neg)' }} />
              <span className="eyebrow">Perte</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--tx-3)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--tx-3)' }} tickLine={false} axisLine={false} width={55} tickFormatter={v => `$${v}`} />
              <RTooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border-2)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-3)' }}
                labelStyle={{ color: 'var(--tx-3)', fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}
                itemStyle={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                formatter={(v) => [fmtUsd(Number(v), true), 'P&L']}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <ReferenceLine y={0} stroke="var(--border-2)" />
              <Bar dataKey="daily" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.daily >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// FULL HISTORY CARD (shadcn Tabs + Table)
// ═══════════════════════════════════════════════════════════════

type FilterId = 'all' | 'live' | 'paper' | 'wins' | 'losses'

function FullHistoryCard({ sessions }: { sessions: Session[] }) {
  const [filter, setFilter] = useState<FilterId>('all')
  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: 'all',    label: 'Tout',       count: sessions.length },
    { id: 'live',   label: 'Live',       count: sessions.filter(s => s.type === 'Live').length },
    { id: 'paper',  label: 'Paper',      count: sessions.filter(s => s.type === 'Paper').length },
    { id: 'wins',   label: 'Gagnantes',  count: sessions.filter(s => s.pnl > 0).length },
    { id: 'losses', label: 'Perdantes',  count: sessions.filter(s => s.pnl < 0).length },
  ]
  const filtered = sessions.filter(s => {
    if (filter === 'live')   return s.type === 'Live'
    if (filter === 'paper')  return s.type === 'Paper'
    if (filter === 'wins')   return s.pnl > 0
    if (filter === 'losses') return s.pnl < 0
    return true
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Historique complet</CardTitle>
            <CardDescription>{sessions.length} sessions · classées de la plus récente à la plus ancienne</CardDescription>
          </div>
          <Tabs value={filter} onValueChange={v => setFilter(v as FilterId)}>
            <TabsList
              className="rounded-full h-auto p-1 gap-1"
              style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
            >
              {filters.map(f => (
                <TabsTrigger
                  key={f.id} value={f.id}
                  className="rounded-full px-3 py-1.5 text-xs font-medium data-[state=active]:bg-foreground data-[state=active]:text-background"
                >
                  {f.label}
                  <span className="mono ml-1.5 px-1.5 py-0.5 rounded-md text-[10px]"
                    style={{
                      background: filter === f.id ? 'rgba(10,11,13,0.15)' : 'var(--card)',
                      color: filter === f.id ? '#0A0B0D' : 'var(--tx-3)',
                    }}
                  >{f.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Instr.</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">R</TableHead>
              <TableHead className="text-right">Win%</TableHead>
              <TableHead className="text-center">Plan</TableHead>
              <TableHead className="text-center">Humeur</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...filtered].reverse().map(s => (
              <TableRow key={s.date} className="hover:bg-white/[0.02] cursor-pointer">
                <TableCell className="mono">{fmtDate(s.date)}</TableCell>
                <TableCell><Badge variant="outline" className="mono">{s.instrument}</Badge></TableCell>
                <TableCell>{s.setup}</TableCell>
                <TableCell className="mono text-right">{s.trades}</TableCell>
                <TableCell className="mono text-right font-semibold" style={{ color: s.pnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtUsd(s.pnl, true)}</TableCell>
                <TableCell className="mono text-right" style={{ color: s.r >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{s.r >= 0 ? '+' : ''}{s.r.toFixed(1)}R</TableCell>
                <TableCell className="mono text-right">{s.winRate.toFixed(0)}%</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={`mono ${s.plan >= 8 ? 'b-pos' : s.plan >= 6 ? 'b-ac' : 'b-neg'}`}>{s.plan}/10</Badge>
                </TableCell>
                <TableCell className="text-center" style={{ fontSize: 16 }}>{s.mood}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`mono ${s.type === 'Live' ? 'b-info' : ''}`}>
                    {s.type === 'Live' && (
                      <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--info)', display: 'inline-block', marginRight: 4 }} />
                    )}
                    {s.type}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════

function KpiCell({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' | 'ac' }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className={`kpi-v ${tone || ''}`}>{value}</div>
    </div>
  )
}

function CardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="mono text-[10px] tracking-wider uppercase text-muted-foreground">Actions</DropdownMenuLabel>
        <DropdownMenuItem>Voir détails</DropdownMenuItem>
        <DropdownMenuItem>Exporter CSV</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Masquer ce widget</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 100
  const h = 40
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })
  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`
  const gradId = `sp-${Math.abs(data.reduce((a, b) => a + b, 0) * 1000 + data.length).toString(36)}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((data[data.length - 1] - min) / range) * h} r={2.5} fill={color} />
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════

function fmtUsd(n: number, showSign = false): string {
  const sign = n > 0 && showSign ? '+' : ''
  return `${sign}$${Math.round(n).toLocaleString('en-US')}`
}
function fmtUsdShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
