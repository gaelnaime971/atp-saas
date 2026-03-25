'use client'

import { useState } from 'react'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import Dashboard from '@/components/dashboard/pages/Dashboard'
import Session from '@/components/dashboard/pages/Session'
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
import TraderChatWidget from '@/components/chat/TraderChatWidget'

const pageTitles: Record<DashboardPage, string> = {
  dashboard: 'Dashboard',
  session: 'Saisie de session',
  stats: 'Stats & Performance',
  checklist: 'Checklist pré-open',
  journal: 'Journal',
  propfirm: 'Prop Firm',
  calculateur: 'Calculateur de risque — Futures',
  coaching: 'Sessions coaching',
  progression: 'Ma progression',
  ressources: 'Ressources ATP',
  contrat: 'Contrat',
  compte: 'Mon compte',
}

export default function TraderDashboard() {
  const [activePage, setActivePage] = useState<DashboardPage>('dashboard')

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />
      case 'session': return <Session />
      case 'stats': return <Stats />
      case 'checklist': return <Checklist />
      case 'journal': return <Journal />
      case 'propfirm': return <PropFirm />
      case 'calculateur': return <Calculateur />
      case 'coaching': return <Coaching />
      case 'progression': return <Progression />
      case 'ressources': return <Ressources />
      case 'contrat': return <Contrat />
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
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {pageTitles[activePage]}
          </h1>
          <span
            className="text-xs px-3 py-1.5 rounded-lg font-mono"
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
        </header>

        {/* Content */}
        <main className="flex-1 p-7">
          {renderPage()}
        </main>
      </div>
      <TraderChatWidget />
    </div>
  )
}
