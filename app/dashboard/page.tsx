'use client'

import { useEffect, useMemo, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import AppSidebar from '@/components/ui/AppSidebar'
import AppTopbar from '@/components/ui/AppTopbar'
import CommandPalette, { flattenNavForPalette } from '@/components/ui/CommandPalette'
import { useSidebarProfile } from '@/lib/hooks/useSidebarProfile'
import { TRADER_NAV, TRADER_FOOTER_ITEMS } from '@/lib/nav/trader-nav'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import Dashboard from '@/components/dashboard/pages/Dashboard'
import Session from '@/components/dashboard/pages/Session'
import SessionsHistory from '@/components/dashboard/pages/SessionsHistory'
import Stats from '@/components/dashboard/pages/Stats'
import Backtest from '@/components/dashboard/pages/Backtest'
import AnalyseIA from '@/components/dashboard/pages/AnalyseIA'
import AnalyseGraphique from '@/components/dashboard/pages/AnalyseGraphique'
import Notebook from '@/components/dashboard/pages/Notebook'
import PropFirm from '@/components/dashboard/pages/PropFirm'
import Calculateur from '@/components/dashboard/pages/Calculateur'
import StockAnalysis from '@/components/dashboard/pages/StockAnalysis'
import Coaching from '@/components/dashboard/pages/Coaching'
import Progression from '@/components/dashboard/pages/Progression'
import Formation from '@/components/dashboard/pages/Formation'
import Documents from '@/components/dashboard/pages/Documents'
import Contrat from '@/components/dashboard/pages/Contrat'
import Compte from '@/components/dashboard/pages/Compte'
import RecapTradeLive from '@/components/dashboard/pages/RecapTradeLive'
import Classement from '@/components/dashboard/pages/Classement'

import PreMarket from '@/components/dashboard/pages/PreMarket'
import SessionLive from '@/components/dashboard/pages/SessionLive'
import TopbarStats from '@/components/dashboard/TopbarStats'
import TraderChatWidget from '@/components/chat/TraderChatWidget'

const pageTitles: Record<DashboardPage, string> = {
  dashboard: 'Dashboard',
  session: 'Saisie de session',
  'sessions-history': 'Sessions de trading',
  stats: 'Stats & Performance',
  'pre-market': 'Routine pré-marché',
  backtest: 'Backtest',
  'analyse-ia': 'Analyse IA',
  'analyse-graphique': 'Analyse graphique multi-piliers',
  notebook: 'Mon cahier',
  propfirm: 'Prop Firm',
  calculateur: 'Calculateur de risque — Futures',
  'stock-analysis': 'Analyse d\'action',
  coaching: 'Sessions coaching',
  'recap-live': 'Trades Live Coach',
  progression: 'Ma progression',
  classement: 'Achievements',
  formation: 'Formation',
  documents: 'Documents',
  contrat: 'Contrat',
  compte: 'Mon compte',
}

export default function TraderDashboard() {
  const [activePage, setActivePage] = useState<DashboardPage>('dashboard')
  const [sessionLive, setSessionLive] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { name, avatarUrl, logout } = useSidebarProfile()

  const paletteItems = useMemo(
    () => flattenNavForPalette(TRADER_NAV, TRADER_FOOTER_ITEMS, 'Compte'),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />
      case 'session': return <Session />
      case 'sessions-history': return <SessionsHistory />
      case 'stats': return <Stats />
      case 'backtest': return <Backtest />
      case 'analyse-ia': return <AnalyseIA />
      case 'analyse-graphique': return <AnalyseGraphique />
      case 'notebook': return <Notebook />
      case 'propfirm': return <PropFirm />
      case 'calculateur': return <Calculateur />
      case 'stock-analysis': return <StockAnalysis />
      case 'pre-market': return <PreMarket />
      case 'coaching': return <Coaching />
      case 'recap-live': return <RecapTradeLive />
      case 'progression': return <Progression />
      case 'classement': return <Classement />
      case 'formation': return <Formation />
      case 'documents': return <Documents />
      case 'contrat': return <Contrat />
      case 'compte': return <Compte />
      default: return <Dashboard />
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-surface-0)' }}>
      <AppSidebar
        groups={TRADER_NAV}
        activePage={activePage}
        onPageChange={setActivePage}
        storageKey="atp.sidebar.trader"
        footer={
          <>
            {name && (
              <div className="mb-2 flex items-center gap-3 px-1">
                <Avatar url={avatarUrl} name={name} size={32} />
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-1)' }}>
                  {name}
                </p>
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TRADER_FOOTER_ITEMS.map(item => {
                const isActive = activePage === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActivePage(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.375rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: isActive ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.8125rem',    // 13px, plus discret que la nav principale
                        fontWeight: isActive ? 600 : 500,
                        textAlign: 'left',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-1)' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-3)' }}
                    >
                      <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'inherit' }}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ color: 'var(--color-text-3)', marginTop: '0.25rem', fontSize: '0.8125rem' }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-loss)'
                e.currentTarget.style.background = 'rgba(var(--color-loss-rgb), 0.05)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--color-text-3)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Déconnexion
            </button>
          </>
        }
      />

      <div className="flex-1 flex flex-col" style={{ marginLeft: 'var(--app-sidebar-width, 240px)', transition: 'margin-left 0.18s ease' }}>
        <AppTopbar
          title={pageTitles[activePage]}
          actions={
            <>
              <button
                onClick={() => setSessionLive(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 transition-all hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-strong))',
                  color: '#000',
                  boxShadow: '0 0 20px rgba(var(--color-accent-rgb), 0.3)',
                  letterSpacing: '0.08em',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Assistant Trader
              </button>
              <div className="h-5 w-px shrink-0" style={{ background: 'var(--color-border-subtle)' }} />
              <TopbarStats />
              <div className="h-5 w-px shrink-0" style={{ background: 'var(--color-border-subtle)' }} />
              <span
                className="text-xs px-3 py-1.5 rounded-lg font-mono shrink-0"
                style={{
                  color: 'var(--color-text-3)',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface-1)',
                }}
              >
                {new Date().toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </>
          }
        />

        <main className="flex-1 p-7">
          {renderPage()}
        </main>
      </div>
      <TraderChatWidget />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={id => setActivePage(id)}
      />
      {sessionLive && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}>
          <SessionLive onExit={() => setSessionLive(false)} />
        </div>
      )}
    </div>
  )
}
