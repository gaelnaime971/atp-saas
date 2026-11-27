'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import AppShell from '@/components/ui/AppShell'
import CommandPalette from '@/components/ui/CommandPalette'
import TraderSidebarFooter from '@/components/dashboard/TraderSidebarFooter'
import TraderChatWidget from '@/components/chat/TraderChatWidget'
import SpaceSwitcher, { AdminBackLink, SearchButton } from '@/components/terminal/SpaceSwitcher'
import MarketsClocks from '@/components/terminal/MarketsClocks'
import { useSidebarProfile } from '@/lib/hooks/useSidebarProfile'
import { MARKETS_NAV, MARKETS_TABS, type MarketsNavId } from '@/lib/nav/markets-nav'
import { buildPaletteItems } from '@/lib/nav/palette'
import { findItemByHref, MARKETS_BASE_PATH, withSpaHrefs } from '@/lib/nav/spaces'
import type { TerminalViewer } from '@/lib/terminal/access'

/**
 * Shell de l'espace Marchés (/dashboard/marches/*). Même rail, même pied
 * de menu et même ⌘K que le SPA « Mon trading », mais l'item actif et le
 * titre se dérivent du pathname, et la barre du haut porte les horloges.
 *
 * `viewer` vient du layout serveur (rôle + TERMINAL_ACCESS) :
 * - 'member' : sélecteur d'espace, ⌘K sur les 2 espaces, pied de menu complet ;
 * - 'admin'  : « Retour admin » à la place du sélecteur, aucun lien du
 *   SPA (/dashboard le renvoie vers /admin/dashboard).
 */
export default function MarketsShell({ viewer, children }: { viewer: Exclude<TerminalViewer, 'hidden'>; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { name, avatarUrl, logout } = useSidebarProfile()
  const isAdmin = viewer === 'admin'

  // Hors SPA, une page du SPA rangée dans Marchés deviendrait un lien /dashboard?page=… (aucune aujourd'hui).
  const nav = useMemo(() => withSpaHrefs(MARKETS_NAV), [])
  const activeItem = findItemByHref(nav, pathname)
  const activeId = (activeItem?.id ?? 'marches-overview') as MarketsNavId
  const title = activeItem?.label ?? 'Marchés'

  const paletteItems = useMemo(() => buildPaletteItems('routes', 'marches', viewer), [viewer])

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

  const settingsHref = isAdmin ? undefined : '/dashboard?page=compte#fuseau'

  return (
    <AppShell<MarketsNavId>
      sidebar={{
        groups: nav,
        activePage: activeId,
        onPageChange: () => { /* tous les items actifs sont des liens */ },
        storageKey: 'atp.sidebar.trader',
        drawerFooterLabel: isAdmin ? 'Déconnexion' : 'Mon compte, contrat, documents',
        header: railCollapsed => (
          <>
            {isAdmin
              ? <AdminBackLink railCollapsed={railCollapsed} />
              : (
                <SpaceSwitcher
                  active="marches"
                  targets={{ trading: { href: '/dashboard' }, marches: { href: MARKETS_BASE_PATH } }}
                  railCollapsed={railCollapsed}
                />
              )}
            <SearchButton onSearch={() => setPaletteOpen(true)} railCollapsed={railCollapsed} />
          </>
        ),
        footer: railCollapsed => <TraderSidebarFooter name={name} avatarUrl={avatarUrl} logout={logout} accountLinks={!isAdmin} railCollapsed={railCollapsed} />,
      }}
      title={title}
      tabs={MARKETS_TABS}
      topbarActions={<MarketsClocks settingsHref={settingsHref} />}
      mobileActions={<MarketsClocks compact settingsHref={settingsHref} />}
      overlays={
        <>
          {/* Messagerie membre ↔ coach : sans objet pour l'admin. */}
          {!isAdmin && <TraderChatWidget />}
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            items={paletteItems}
            onSelect={(_id, item) => { if (item.href) router.push(item.href) }}
          />
        </>
      }
    >
      {children}
    </AppShell>
  )
}
