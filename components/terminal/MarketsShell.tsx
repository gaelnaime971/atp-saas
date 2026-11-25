'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import AppSidebar from '@/components/ui/AppSidebar'
import AppTopbar from '@/components/ui/AppTopbar'
import CommandPalette from '@/components/ui/CommandPalette'
import TraderSidebarFooter from '@/components/dashboard/TraderSidebarFooter'
import TraderChatWidget from '@/components/chat/TraderChatWidget'
import SpaceSwitcher from '@/components/terminal/SpaceSwitcher'
import MarketsClocks from '@/components/terminal/MarketsClocks'
import { useSidebarProfile } from '@/lib/hooks/useSidebarProfile'
import { MARKETS_NAV, type MarketsNavId } from '@/lib/nav/markets-nav'
import { buildPaletteItems } from '@/lib/nav/palette'
import { findItemByHref, MARKETS_BASE_PATH, withSpaHrefs } from '@/lib/nav/spaces'

// Hors SPA, Analyse d'action devient un lien /dashboard?page=stock-analysis.
const NAV = withSpaHrefs(MARKETS_NAV)

/**
 * Shell de l'espace Marchés (/dashboard/marches/*). Même rail, même pied
 * de menu et même ⌘K que le SPA « Mon trading », mais l'item actif et le
 * titre se dérivent du pathname, et la barre du haut porte les horloges.
 */
export default function MarketsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { name, avatarUrl, logout } = useSidebarProfile()

  const activeItem = findItemByHref(NAV, pathname)
  const activeId = (activeItem?.id ?? 'marches-overview') as MarketsNavId
  const title = activeItem?.label ?? 'Marchés'

  const paletteItems = useMemo(() => buildPaletteItems('routes', 'marches'), [])

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

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-surface-0)' }}>
      <AppSidebar<MarketsNavId>
        groups={NAV}
        activePage={activeId}
        onPageChange={() => { /* tous les items actifs sont des liens */ }}
        storageKey="atp.sidebar.trader"
        header={railCollapsed => (
          <SpaceSwitcher
            active="marches"
            targets={{ trading: { href: '/dashboard' }, marches: { href: MARKETS_BASE_PATH } }}
            onSearch={() => setPaletteOpen(true)}
            railCollapsed={railCollapsed}
          />
        )}
        footer={<TraderSidebarFooter name={name} avatarUrl={avatarUrl} logout={logout} />}
      />

      <div className="flex-1 flex flex-col min-w-0" style={{ marginLeft: 'var(--app-sidebar-width, 240px)', transition: 'margin-left 0.18s ease' }}>
        <AppTopbar title={title} actions={<MarketsClocks />} />
        <main className="flex-1 p-7">
          {children}
        </main>
      </div>
      <TraderChatWidget />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
        onSelect={(_id, item) => { if (item.href) router.push(item.href) }}
      />
    </div>
  )
}
