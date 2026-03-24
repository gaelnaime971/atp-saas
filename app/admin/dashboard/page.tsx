'use client'

import { useState } from 'react'
import AdminSidebar from '@/components/admin/AdminSidebar'
import Overview from '@/components/admin/pages/Overview'
import Traders from '@/components/admin/pages/Traders'
import Results from '@/components/admin/pages/Results'
import Calendar from '@/components/admin/pages/Calendar'
import Sessions from '@/components/admin/pages/Sessions'
import Revenus from '@/components/admin/pages/Revenus'
import Bibliotheque from '@/components/admin/pages/Bibliotheque'

type AdminPage = 'overview' | 'traders' | 'results' | 'calendar' | 'sessions' | 'revenus' | 'bibliotheque' | 'broadcast' | 'settings'

const pageTitles: Record<AdminPage, string> = {
  overview: 'Vue Globale',
  traders: 'Traders',
  results: 'Résultats',
  calendar: 'Calendrier',
  sessions: 'Sessions',
  revenus: 'Revenus',
  bibliotheque: 'Bibliothèque',
  broadcast: 'Broadcast',
  settings: 'Paramètres',
}

export default function AdminDashboard() {
  const [activePage, setActivePage] = useState<AdminPage>('overview')
  const [openNewTrader, setOpenNewTrader] = useState(false)

  const handleNewTrader = () => {
    setActivePage('traders')
    setOpenNewTrader(true)
  }

  const renderPage = () => {
    switch (activePage) {
      case 'overview': return <Overview />
      case 'traders': return (
        <Traders
          triggerNewModal={openNewTrader}
          onNewModalHandled={() => setOpenNewTrader(false)}
        />
      )
      case 'results': return <Results />
      case 'calendar': return <Calendar />
      case 'sessions': return <Sessions />
      case 'revenus': return <Revenus />
      case 'bibliotheque': return <Bibliotheque />
      case 'broadcast': return <div className="text-[#5a6a82] text-sm">Broadcast — bientôt disponible</div>
      case 'settings': return <div className="text-[#5a6a82] text-sm">Paramètres — bientôt disponible</div>
      default: return <Overview />
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      <AdminSidebar activePage={activePage} onPageChange={setActivePage} />

      <div className="flex-1 ml-56 flex flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-7 py-4 border-b"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {pageTitles[activePage]}
          </h1>
          <div className="flex items-center gap-3">
            <span
              className="text-xs px-3 py-1.5 rounded-lg border font-mono"
              style={{ color: 'var(--text3)', borderColor: 'var(--border)', background: 'var(--bg2)' }}
            >
              {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <button
              onClick={handleNewTrader}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
              style={{ background: 'var(--green)', color: '#0f1117' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau trader
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-7">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
