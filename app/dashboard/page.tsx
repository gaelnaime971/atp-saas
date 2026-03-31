'use client'

import { useState } from 'react'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import Dashboard from '@/components/dashboard/pages/Dashboard'
import Session from '@/components/dashboard/pages/Session'
import SessionsHistory from '@/components/dashboard/pages/SessionsHistory'
import Stats from '@/components/dashboard/pages/Stats'
import Checklist from '@/components/dashboard/pages/Checklist'
import Journal from '@/components/dashboard/pages/Journal'
import PropFirm from '@/components/dashboard/pages/PropFirm'
import Calculateur from '@/components/dashboard/pages/Calculateur'
import Coaching from '@/components/dashboard/pages/Coaching'
import Progression from '@/components/dashboard/pages/Progression'
import Ressources from '@/components/dashboard/pages/Ressources'
import Contrat from '@/components/dashboard/pages/Contrat'
import Compte from '@/components/dashboard/pages/Compte'
import BilanCompetences from '@/components/dashboard/pages/BilanCompetences'
import RecapTradeLive from '@/components/dashboard/pages/RecapTradeLive'
import Classement from '@/components/dashboard/pages/Classement'
import SavedSetups from '@/components/dashboard/pages/SavedSetups'
import PreMarket from '@/components/dashboard/pages/PreMarket'
import SessionLive from '@/components/dashboard/pages/SessionLive'
import TopbarStats from '@/components/dashboard/TopbarStats'
import TraderChatWidget from '@/components/chat/TraderChatWidget'

const pageTitles: Record<DashboardPage, string> = {
  dashboard: 'Dashboard',
  session: 'Saisie de session',
  'sessions-history': 'Sessions de trading',
  stats: 'Stats & Performance',
  checklist: 'Checklist pré-open',
  'pre-market': 'Routine pré-marché',
  journal: 'Journal',
  propfirm: 'Prop Firm',
  calculateur: 'Calculateur de risque — Futures',
  coaching: 'Sessions coaching',
  'recap-live': 'Trades Live Coach',
  progression: 'Ma progression',
  classement: 'Achievements',
  'saved-setups': 'Bibliothèque de Setups',
  ressources: 'Ressources ATP',
  contrat: 'Contrat',
  bilan: 'Bilan de compétences',
  compte: 'Mon compte',
}

export default function TraderDashboard() {
  const [activePage, setActivePage] = useState<DashboardPage>('dashboard')
  const [sessionLive, setSessionLive] = useState(false)

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />
      case 'session': return <Session />
      case 'sessions-history': return <SessionsHistory />
      case 'stats': return <Stats />
      case 'checklist': return <Checklist />
      case 'journal': return <Journal />
      case 'propfirm': return <PropFirm />
      case 'calculateur': return <Calculateur />
      case 'pre-market': return <PreMarket />
      case 'coaching': return <Coaching />
      case 'recap-live': return <RecapTradeLive />
      case 'progression': return <Progression />
      case 'classement': return <Classement />
      case 'saved-setups': return <SavedSetups />
      case 'ressources': return <Ressources />
      case 'contrat': return <Contrat />
      case 'bilan': return <BilanCompetences />
      case 'compte': return <Compte />
      default: return <Dashboard />
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <DashboardSidebar activePage={activePage} onPageChange={setActivePage} />

      <div className="flex-1 flex flex-col" style={{ marginLeft: 240 }}>
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-7 py-4"
          style={{
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h1 className="text-sm font-semibold shrink-0" style={{ color: 'var(--text)' }}>
            {pageTitles[activePage]}
          </h1>
          <div className="flex items-center gap-3 overflow-x-auto">
            <button
              onClick={() => setSessionLive(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#000',
                boxShadow: '0 0 20px rgba(34,197,94,0.3)',
                letterSpacing: '0.08em',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Assistant Trader
            </button>
            <div className="h-5 w-px shrink-0" style={{ background: 'var(--border)' }} />
            <TopbarStats />
            <div className="h-5 w-px shrink-0" style={{ background: 'var(--border)' }} />
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-mono shrink-0"
              style={{
                color: 'var(--text3)',
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
              }}
            >
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
            })}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-7">
          {renderPage()}
        </main>
      </div>
      <TraderChatWidget />
      {sessionLive && <SessionLive onExit={() => setSessionLive(false)} />}
    </div>
  )
}
