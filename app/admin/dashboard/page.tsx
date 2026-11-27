'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import AppShell from '@/components/ui/AppShell'
import CommandPalette, { flattenNavForPalette } from '@/components/ui/CommandPalette'
import { useSidebarProfile } from '@/lib/hooks/useSidebarProfile'
import { ADMIN_NAV, ADMIN_FOOTER_ITEMS, ADMIN_TABS, type AdminNavId, type AdminPage } from '@/lib/nav/admin-nav'
import Overview from '@/components/admin/pages/Overview'
import Traders from '@/components/admin/pages/Traders'
import Results from '@/components/admin/pages/Results'
import Calendar from '@/components/admin/pages/Calendar'
import Sessions from '@/components/admin/pages/Sessions'
import AdminCoaching from '@/components/admin/pages/Coaching'
import Revenus from '@/components/admin/pages/Revenus'
import Bibliotheque from '@/components/admin/pages/Bibliotheque'
import Settings from '@/components/admin/pages/Settings'
import CRM from '@/components/admin/pages/CRM'
import Notes from '@/components/admin/pages/Notes'
import Reports from '@/components/admin/pages/Reports'
import Tasks from '@/components/admin/pages/Tasks'
import Broadcast from '@/components/admin/pages/Broadcast'
import BilanCompetences from '@/components/admin/pages/BilanCompetences'
import Prospects from '@/components/admin/pages/Prospects'
import Pipeline from '@/components/admin/pages/Pipeline'
import ContentManager from '@/components/admin/pages/ContentManager'
import RecapTradeLive from '@/components/admin/pages/RecapTradeLive'
import TradingPerso from '@/components/admin/pages/TradingPerso'
import AdminTopbarStats from '@/components/admin/TopbarStats'
import AdminChatWidget from '@/components/chat/AdminChatWidget'

const pageTitles: Record<AdminPage, string> = {
  overview: 'Vue Globale',
  traders: 'Traders',
  results: 'Résultats',
  crm: 'Vue CRM',
  notes: 'Notes privées',
  calendar: 'Calendrier',
  sessions: 'Sessions',
  coaching: 'Coaching vidéo',
  revenus: 'Revenus',
  reports: 'Rapports mensuels',
  tasks: 'Tâches',
  prospects: 'Prospects',
  pipeline: 'Pipeline calls',
  content: 'Pilotage Contenu',
  broadcast: 'Broadcast',
  bibliotheque: 'Bibliothèque',
  bilan: 'Bilan de compétences',
  'recap-live': 'Récap Trade Live',
  'trading-perso': 'Trading Perso',
  settings: 'Paramètres',
}

export default function AdminDashboard() {
  const [activePage, setActivePage] = useState<AdminPage>('overview')
  const [openNewTrader, setOpenNewTrader] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { name, avatarUrl, logout } = useSidebarProfile()
  const router = useRouter()

  const paletteItems = useMemo(
    () => flattenNavForPalette<AdminNavId>(ADMIN_NAV, ADMIN_FOOTER_ITEMS, 'Outils'),
    [],
  )

  // Items avec href (Terminal Marchés) : vraie navigation ; sinon page du SPA.
  const goTo = (id: AdminNavId, href?: string) => {
    if (href) router.push(href)
    else if (id !== 'terminal-marches') setActivePage(id)
  }

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
      case 'crm': return <CRM />
      case 'notes': return <Notes />
      case 'calendar': return <Calendar />
      case 'sessions': return <Sessions />
      case 'coaching': return <AdminCoaching />
      case 'revenus': return <Revenus />
      case 'reports': return <Reports />
      case 'tasks': return <Tasks />
      case 'prospects': return <Prospects />
      case 'pipeline': return <Pipeline />
      case 'content': return <ContentManager />
      case 'broadcast': return <Broadcast />
      case 'bibliotheque': return <Bibliotheque />
      case 'bilan': return <BilanCompetences />
      case 'recap-live': return <RecapTradeLive />
      case 'trading-perso': return <TradingPerso />
      case 'settings': return <Settings />
      default: return <Overview />
    }
  }

  return (
    <AppShell<AdminNavId>
      sidebar={{
        groups: ADMIN_NAV,
        activePage,
        onPageChange: id => goTo(id),
        banner: { label: 'Admin', tone: 'loss' },
        storageKey: 'atp.sidebar.admin',
        drawerFooterLabel: 'Trading perso, paramètres',
        // Rail replié (tablette par défaut) : icônes seules, nom au survol.
        footer: railCollapsed => (
          <>
            {name && (
              <div className={`mb-2 flex items-center gap-3 ${railCollapsed ? 'justify-center' : 'px-1'}`} title={railCollapsed ? name : undefined}>
                <Avatar url={avatarUrl} name={name} size={32} />
                {!railCollapsed && (
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-1)' }}>
                    {name}
                  </p>
                )}
              </div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ADMIN_FOOTER_ITEMS.map(item => {
                const isActive = activePage === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActivePage(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={railCollapsed ? item.label : undefined}
                      title={railCollapsed ? item.label : undefined}
                      style={{
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        justifyContent: railCollapsed ? 'center' : undefined,
                        padding: railCollapsed ? '0.5rem 0' : '0.375rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: isActive ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
                        color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.8125rem',
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
                      {!railCollapsed && item.label}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              onClick={logout}
              aria-label={railCollapsed ? 'Déconnexion' : undefined}
              title={railCollapsed ? 'Déconnexion' : undefined}
              className={`w-full flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-all ${railCollapsed ? 'justify-center px-0' : 'px-3'}`}
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
              {!railCollapsed && 'Déconnexion'}
            </button>
          </>
        ),
      }}
      title={pageTitles[activePage]}
      tabs={ADMIN_TABS}
      topbarActions={
            <>
              <AdminTopbarStats />
              <div className="h-5 w-px shrink-0" style={{ background: 'var(--color-border-subtle)' }} />
              <span
                className="text-xs px-3 py-1.5 rounded-lg font-mono shrink-0"
                style={{ color: 'var(--color-text-3)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-1)' }}
              >
                {new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <button
                onClick={handleNewTrader}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'var(--color-accent)', color: 'var(--color-surface-0)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nouveau trader
              </button>
            </>
      }
      mobileActions={
        <button
          type="button"
          onClick={handleNewTrader}
          aria-label="Nouveau trader"
          className="inline-flex items-center justify-center shrink-0"
          style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'var(--color-accent)', color: 'var(--color-surface-0)', border: 'none', cursor: 'pointer' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      }
      overlays={
        <>
          <AdminChatWidget />
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            items={paletteItems}
            onSelect={(id, item) => goTo(id, item.href)}
          />
        </>
      }
    >
      {renderPage()}
    </AppShell>
  )
}
