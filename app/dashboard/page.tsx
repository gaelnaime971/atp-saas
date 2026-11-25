'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppSidebar from '@/components/ui/AppSidebar'
import AppTopbar from '@/components/ui/AppTopbar'
import CommandPalette from '@/components/ui/CommandPalette'
import { useSidebarProfile } from '@/lib/hooks/useSidebarProfile'
import { TRADER_NAV } from '@/lib/nav/trader-nav'
import { MARKETS_NAV } from '@/lib/nav/markets-nav'
import { buildPaletteItems, type AnyNavId } from '@/lib/nav/palette'
import {
  isDashboardPage, MARKETS_BASE_PATH, parsePageParam, searchWithoutPage, spaceOfSpaPage,
} from '@/lib/nav/spaces'
import type { NavGroup } from '@/components/ui/AppSidebar'
import TraderSidebarFooter from '@/components/dashboard/TraderSidebarFooter'
import SpaceSwitcher from '@/components/terminal/SpaceSwitcher'
import MarketsClocks from '@/components/terminal/MarketsClocks'
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
import BilanPage from '@/components/bilan/BilanPage'

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
  'bilan-2027': 'Bilan Trader 2027',
  progression: 'Ma progression',
  classement: 'Achievements',
  formation: 'Formation',
  documents: 'Documents',
  contrat: 'Contrat',
  compte: 'Mon compte',
}

/**
 * Date du jour affichée dans le topbar. Rendue UNIQUEMENT côté client
 * (useEffect + useState vide au SSR) pour éviter le React hydration
 * mismatch #418 : `new Date()` au SSR utilise le fuseau serveur (UTC
 * chez Vercel), le client utilise son fuseau local — un trader à
 * Bangkok voit "dim. 6 sept" côté client là où le serveur a rendu
 * "sam. 5 sept" → HTML différent → écran noir global error boundary.
 * Skeleton invisible au SSR (span vide même dimensions grâce au border
 * et padding), remplacé par la date après hydratation.
 */
function TopbarDate() {
  const [label, setLabel] = useState<string>('')
  useEffect(() => {
    setLabel(new Date().toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }))
  }, [])
  return (
    <span
      className="text-xs px-3 py-1.5 rounded-lg font-mono shrink-0"
      style={{
        color: 'var(--color-text-3)',
        border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-surface-1)',
        minWidth: '9ch',   // évite le layout shift au premier render vide
      }}
    >
      {label || ' '}
    </span>
  )
}

export default function TraderDashboard() {
  const [activePage, setActivePage] = useState<DashboardPage>('dashboard')
  const [sessionLive, setSessionLive] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { name, avatarUrl, logout } = useSidebarProfile()
  const router = useRouter()

  // Espace dérivé de la page active (Analyse d'action vit dans Marchés).
  const space = spaceOfSpaPage(activePage)
  const navGroups: NavGroup<AnyNavId>[] = space === 'marches' ? MARKETS_NAV : TRADER_NAV

  const paletteItems = useMemo(() => buildPaletteItems('spa', space), [space])

  // ?page=<id> : ouvert depuis l'espace Marchés (⌘K, sélecteur, menu).
  // Lu une fois au montage, avant le premier paint, puis retiré de l'URL
  // pour qu'un rechargement ne rouvre pas une page périmée. Sans
  // paramètre (ou id inconnu) : comportement d'origine, Dashboard.
  useLayoutEffect(() => {
    const page = parsePageParam(window.location.search)
    if (!page) return
    // Lecture unique d'un système externe (l'URL) au montage : le SSR ne
    // la connaît pas, un initialiseur de useState casserait l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivePage(page)
    const { pathname, hash } = window.location
    window.history.replaceState(null, '',`${pathname}${searchWithoutPage(window.location.search)}${hash}`)
  }, [])

  const goTo = (id: AnyNavId, href?: string) => {
    if (isDashboardPage(id)) setActivePage(id)
    else if (href) router.push(href)
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

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard onGoToAnalysis={() => setActivePage('analyse-ia')} />
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
      case 'bilan-2027': return <BilanPage />
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
      <AppSidebar<AnyNavId>
        groups={navGroups}
        activePage={activePage}
        onPageChange={id => goTo(id)}
        storageKey="atp.sidebar.trader"
        header={railCollapsed => (
          <SpaceSwitcher
            active={space}
            targets={{
              trading: { onClick: () => setActivePage('dashboard') },
              marches: { href: MARKETS_BASE_PATH },
            }}
            onSearch={() => setPaletteOpen(true)}
            railCollapsed={railCollapsed}
          />
        )}
        footer={
          <TraderSidebarFooter
            name={name}
            avatarUrl={avatarUrl}
            logout={logout}
            activePage={activePage}
            onSelect={setActivePage}
          />
        }
      />

      <div className="flex-1 flex flex-col" style={{ marginLeft: 'var(--app-sidebar-width, 240px)', transition: 'margin-left 0.18s ease' }}>
        <AppTopbar
          title={pageTitles[activePage]}
          actions={space === 'marches' ? <MarketsClocks /> : (
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
              <TopbarDate />
            </>
          )}
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
        onSelect={(id, item) => goTo(id, item.href)}
      />
      {sessionLive && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}>
          <SessionLive onExit={() => setSessionLive(false)} />
        </div>
      )}
    </div>
  )
}
