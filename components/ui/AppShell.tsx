'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import AppSidebar, { type AppSidebarProps, type NavItem } from '@/components/ui/AppSidebar'
import AppTopbar from '@/components/ui/AppTopbar'
import { useViewportKind } from '@/lib/hooks/useViewportKind'
import { MENU_TAB, activeTabId, drawerReducer, type ShellTab } from '@/lib/ui/shell'

export type { ShellTab }

/**
 * Shell commun des 3 espaces (Mon trading, Marchés, admin).
 *
 * - ≥ 768 px : rail à gauche (AppSidebar, replié en icônes de 768 à
 *   1279 px), barre du haut AppTopbar. À partir de 1280 px, rien ne change
 *   par rapport à avant.
 * - < 768 px : barre du haut compacte (menu, titre, `mobileActions`),
 *   menu complet dans un tiroir (même AppSidebar, variante 'drawer'),
 *   barre d'onglets en bas (4 raccourcis + Menu). Marges de sécurité
 *   iPhone via env(safe-area-inset-*), zones de toucher ≥ 44 px.
 *
 * Règles pures et testées : lib/ui/shell.ts.
 */

export interface AppShellProps<Id extends string> {
  sidebar: Omit<AppSidebarProps<Id>, 'variant' | 'onNavigate'>
  title: string
  /** Actions de la barre du haut, à partir de 768 px. */
  topbarActions?: ReactNode
  /** Actions de la barre compacte, sous 768 px (icônes ≥ 44 px). */
  mobileActions?: ReactNode
  /** 4 raccourcis de la barre d'onglets (ids des éléments du menu). */
  tabs: ShellTab<Id>[]
  children: ReactNode
  /** Bulle de messagerie, palette ⌘K… */
  overlays?: ReactNode
}

/** Hauteur de la barre d'onglets, hors marge de sécurité (cf. --app-tabbar-offset). */
export const TABBAR_HEIGHT = 56

export default function AppShell<Id extends string>({
  sidebar, title, topbarActions, mobileActions, tabs, children, overlays,
}: AppShellProps<Id>) {
  const [drawerOpen, dispatch] = useReducer(drawerReducer, false)
  const kind = useViewportKind()
  const pathname = usePathname()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Passer en tablette ou bureau ferme le tiroir ; changer de route aussi.
  useEffect(() => { dispatch({ type: 'viewport', kind }) }, [kind])
  useEffect(() => { dispatch({ type: 'navigate' }) }, [pathname])

  const items = sidebar.groups.flatMap(g => g.items)
  const findItem = (id: Id) => items.find(i => i.id === id)
  const activeTab = activeTabId(tabs.map(t => t.id), sidebar.activePage, drawerOpen)

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-surface-0)' }}>
      <AppSidebar<Id> {...sidebar} variant="rail" />

      <div
        className="flex-1 flex flex-col min-w-0 md:ml-[var(--app-sidebar-width,240px)]"
        style={{ transition: 'margin-left 0.18s ease' }}
      >
        <AppTopbar title={title} actions={topbarActions} />
        <MobileTopbar
          title={title}
          actions={mobileActions}
          drawerOpen={drawerOpen}
          onMenu={() => dispatch({ type: 'open' })}
          menuButtonRef={menuButtonRef}
        />
        <main className="flex-1 min-w-0 p-4 pb-[calc(var(--app-tabbar-offset)+1rem)] md:p-7">
          {children}
        </main>
      </div>

      <MobileTabBar
        tabs={tabs}
        findItem={findItem}
        activeTab={activeTab}
        drawerOpen={drawerOpen}
        onSelect={id => sidebar.onPageChange(id)}
        onMenu={() => dispatch({ type: 'toggle' })}
      />

      {drawerOpen && (
        <MobileDrawer
          onClose={() => {
            dispatch({ type: 'close' })
            menuButtonRef.current?.focus()
          }}
        >
          <AppSidebar<Id> {...sidebar} variant="drawer" />
        </MobileDrawer>
      )}

      {overlays}
    </div>
  )
}

// ─── Barre du haut compacte (< 768 px) ──────────────────────────

function MobileTopbar({ title, actions, drawerOpen, onMenu, menuButtonRef }: {
  title: string
  actions?: ReactNode
  drawerOpen: boolean
  onMenu: () => void
  menuButtonRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <header
      className="flex md:hidden"
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        alignItems: 'center', gap: '0.5rem',
        padding: 'calc(env(safe-area-inset-top) + 0.375rem) calc(env(safe-area-inset-right) + 0.5rem) 0.375rem calc(env(safe-area-inset-left) + 0.25rem)',
        background: 'var(--color-surface-0)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onMenu}
        aria-label="Ouvrir le menu"
        aria-expanded={drawerOpen}
        aria-controls="app-mobile-drawer"
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', color: 'var(--color-text-1)', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <h1
        style={{
          flex: 1, minWidth: 0, margin: 0,
          fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600,
          color: 'var(--color-text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </header>
  )
}

// ─── Tiroir du menu (< 768 px) ──────────────────────────────────

function MobileDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>('[data-drawer-close]')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'   // la page ne défile pas sous le tiroir

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !panel) return
      // Focus gardé dans le tiroir.
      const focusables = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // Un lien ou un bouton du menu ferme le tiroir (sauf les en-têtes de
  // groupe, qui ne font que plier / déplier).
  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const control = target.closest('a, button')
    if (!control || control.closest('[data-drawer-keep-open]')) return
    // Laisse l'action se faire, puis ferme.
    setTimeout(onClose, 0)
  }

  return (
    <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 900 }}>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'var(--color-surface-0)', opacity: 0.75 }}
      />
      <div
        id="app-mobile-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClickCapture={onClickCapture}
        className="[&_a]:min-h-11 [&_button]:min-h-11 [&_[aria-disabled]]:min-h-11"
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: 'min(20rem, calc(100vw - 3rem))',
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface-1)',
          borderRight: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-2)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        }}
      >
        <button
          type="button"
          data-drawer-close
          data-drawer-keep-open
          onClick={onClose}
          aria-label="Fermer le menu"
          className="inline-flex items-center justify-center"
          style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top) + 0.5rem)', right: '0.5rem', zIndex: 1,
            width: 44, height: 44, borderRadius: 'var(--radius-lg)',
            background: 'transparent', border: 'none', color: 'var(--color-text-2)', cursor: 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Barre d'onglets (< 768 px) ─────────────────────────────────

function MobileTabBar<Id extends string>({ tabs, findItem, activeTab, drawerOpen, onSelect, onMenu }: {
  tabs: ShellTab<Id>[]
  findItem: (id: Id) => NavItem<Id> | undefined
  activeTab: Id | typeof MENU_TAB | null
  drawerOpen: boolean
  onSelect: (id: Id) => void
  onMenu: () => void
}) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    minHeight: TABBAR_HEIGHT, minWidth: 44, padding: '6px 2px',
    background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'none',
    color: active ? 'var(--color-accent)' : 'var(--color-text-3)',
    fontFamily: 'var(--font-display)', fontSize: 10.5, fontWeight: active ? 600 : 500, lineHeight: 1.1,
    textAlign: 'center',
  })

  return (
    <nav
      aria-label="Raccourcis"
      className="grid md:hidden"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
        background: 'var(--color-surface-1)',
        borderTop: '1px solid var(--color-border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {tabs.map(tab => {
        const item = findItem(tab.id)
        if (!item) return null
        const active = activeTab === tab.id
        const inner = (
          <>
            <span aria-hidden style={{ display: 'inline-flex' }}>{item.icon}</span>
            <span>{tab.label}</span>
          </>
        )
        return item.href ? (
          <Link key={tab.id} href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.label} style={tabStyle(active)}>
            {inner}
          </Link>
        ) : (
          <button key={tab.id} type="button" onClick={() => onSelect(tab.id)} aria-current={active ? 'page' : undefined} aria-label={item.label} style={tabStyle(active)}>
            {inner}
          </button>
        )
      })}
      <button
        type="button"
        onClick={onMenu}
        aria-expanded={drawerOpen}
        aria-controls="app-mobile-drawer"
        style={tabStyle(activeTab === MENU_TAB)}
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span>Menu</span>
      </button>
    </nav>
  )
}
