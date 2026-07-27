'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface NavItem<Id extends string> {
  id: Id
  label: string
  icon: ReactNode
  badge?: number | string
}

export interface NavGroup<Id extends string> {
  /** Slug interne, sert de clé de persistance collapse. */
  id: string
  /** Affiché en uppercase dans le header du groupe. */
  label: string
  items: NavItem<Id>[]
  /** Défaut : ouvert. Passer `true` pour démarrer plié. */
  defaultCollapsed?: boolean
}

export interface AppSidebarProps<Id extends string> {
  groups: NavGroup<Id>[]
  activePage: Id
  onPageChange: (id: Id) => void
  /** Badge sous le logo — ex admin, beta, staging. */
  banner?: { label: string; tone?: 'accent' | 'loss' | 'profit' | 'neutral' }
  /** Clé localStorage pour persister rail + groupes collapse. Requis. */
  storageKey: string
  /** Contenu injecté en bas du rail. Typiquement : avatar + logout du hook `useSidebarProfile`. */
  footer?: ReactNode
}

// ═══════════════════════════════════════════════════════════════
// Constantes visuelles
// ═══════════════════════════════════════════════════════════════

const RAIL_WIDTH_EXPANDED = 240
const RAIL_WIDTH_COLLAPSED = 68

const BANNER_TONE = {
  accent:  { bg: 'rgba(var(--color-accent-rgb), 0.15)',  color: 'var(--color-accent)',  border: 'rgba(var(--color-accent-rgb), 0.3)'  },
  loss:    { bg: 'rgba(var(--color-loss-rgb), 0.15)',    color: 'var(--color-loss)',    border: 'rgba(var(--color-loss-rgb), 0.3)'    },
  profit:  { bg: 'rgba(var(--color-profit-rgb), 0.15)',  color: 'var(--color-profit)',  border: 'rgba(var(--color-profit-rgb), 0.3)'  },
  neutral: { bg: 'var(--color-surface-2)',               color: 'var(--color-text-2)',  border: 'var(--color-border-subtle)'          },
} as const

// ═══════════════════════════════════════════════════════════════
// Storage helpers
// ═══════════════════════════════════════════════════════════════

interface SidebarState {
  railCollapsed: boolean
  groups: Record<string, boolean> // true = collapsed
}

function readState(key: string): SidebarState {
  if (typeof window === 'undefined') return { railCollapsed: false, groups: {} }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { railCollapsed: false, groups: {} }
    const parsed = JSON.parse(raw) as Partial<SidebarState>
    return {
      railCollapsed: !!parsed.railCollapsed,
      groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {},
    }
  } catch {
    return { railCollapsed: false, groups: {} }
  }
}

function writeState(key: string, state: SidebarState) {
  try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* quota */ }
}

// ═══════════════════════════════════════════════════════════════
// NavItem — un bouton d'entrée dans la sidebar
// ═══════════════════════════════════════════════════════════════

interface NavItemProps<Id extends string> {
  item: NavItem<Id>
  isActive: boolean
  railCollapsed: boolean
  onClick: () => void
}

function NavItemButton<Id extends string>({ item, isActive, railCollapsed, onClick }: NavItemProps<Id>) {
  const [hover, setHover] = useState(false)

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={railCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center',
          gap: railCollapsed ? 0 : '0.75rem',
          justifyContent: railCollapsed ? 'center' : 'flex-start',
          padding: railCollapsed ? '0.625rem 0' : '0.5rem 0.75rem',
          borderRadius: 'var(--radius-lg)',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-body)',       // 14px
          fontWeight: isActive ? 600 : 500,
          textAlign: 'left',
          background: isActive
            ? 'rgba(var(--color-accent-rgb), 0.10)'
            : hover ? 'var(--color-surface-2)' : 'transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-2)',
          borderLeft: railCollapsed ? 'none' : `3px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
          paddingLeft: railCollapsed ? '0' : '0.625rem',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
          position: 'relative',
        }}
      >
        <span
          aria-hidden
          style={{
            color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
            display: 'inline-flex', flexShrink: 0,
          }}
        >
          {item.icon}
        </span>
        {!railCollapsed && (
          <>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {item.badge != null && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-accent)',
                  minWidth: 18, textAlign: 'center',
                }}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </button>
    </li>
  )
}

// ═══════════════════════════════════════════════════════════════
// NavGroup — un groupe repliable
// ═══════════════════════════════════════════════════════════════

interface NavGroupProps<Id extends string> {
  group: NavGroup<Id>
  activePage: Id
  isCollapsed: boolean
  railCollapsed: boolean
  containsActive: boolean
  onToggle: () => void
  onSelect: (id: Id) => void
}

function NavGroupSection<Id extends string>({
  group, activePage, isCollapsed, railCollapsed, containsActive, onToggle, onSelect,
}: NavGroupProps<Id>) {
  // Rail collapsé → on masque le header entièrement et on affiche les items en pile
  // (le groupe n'est plus repliable en mode rail collapsed).
  if (railCollapsed) {
    return (
      <div style={{ marginBottom: '0.5rem' }}>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none', margin: 0, padding: 0 }}>
          {group.items.map(item => (
            <NavItemButton
              key={item.id}
              item={item}
              isActive={activePage === item.id}
              railCollapsed
              onClick={() => onSelect(item.id)}
            />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.375rem 0.5rem',
          marginBottom: '0.25rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontSize: '0.6875rem',      // 11px
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-text-3)',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-2)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-3)' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {group.label}
          {isCollapsed && containsActive && (
            <span
              aria-label="Page active dans ce groupe"
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--color-accent)',
                display: 'inline-block',
              }}
            />
          )}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            opacity: 0.7,
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none', margin: 0, padding: 0, marginBottom: '0.75rem' }}>
          {group.items.map(item => (
            <NavItemButton
              key={item.id}
              item={item}
              isActive={activePage === item.id}
              railCollapsed={false}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// AppSidebar
// ═══════════════════════════════════════════════════════════════

export default function AppSidebar<Id extends string>({
  groups, activePage, onPageChange, banner, storageKey, footer,
}: AppSidebarProps<Id>) {
  // Init state from localStorage; fallback = { rail expanded, groups per defaultCollapsed }
  const [state, setState] = useState<SidebarState>(() => {
    const stored = typeof window !== 'undefined' ? readState(storageKey) : { railCollapsed: false, groups: {} }
    const initial: SidebarState = { railCollapsed: stored.railCollapsed, groups: { ...stored.groups } }
    // Seed defaultCollapsed for groups the user hasn't explicitly touched yet
    for (const g of groups) {
      if (!(g.id in initial.groups) && g.defaultCollapsed) initial.groups[g.id] = true
    }
    return initial
  })

  // Persist on any change
  useEffect(() => { writeState(storageKey, state) }, [state, storageKey])

  // Expose current rail width as CSS var so the shell can align its content
  // (marginLeft: 'var(--app-sidebar-width)') without prop drilling or coupling.
  useEffect(() => {
    const w = state.railCollapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED
    document.documentElement.style.setProperty('--app-sidebar-width', `${w}px`)
  }, [state.railCollapsed])

  const toggleRail = useCallback(() => {
    setState(s => ({ ...s, railCollapsed: !s.railCollapsed }))
  }, [])

  const toggleGroup = useCallback((groupId: string) => {
    setState(s => ({ ...s, groups: { ...s.groups, [groupId]: !s.groups[groupId] } }))
  }, [])

  // Map groupId → contient activePage (utile pour l'indicateur "point accent" sur header collapsé)
  const containsActiveByGroup = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const g of groups) map[g.id] = g.items.some(i => i.id === activePage)
    return map
  }, [groups, activePage])

  const railWidth = state.railCollapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED
  const bannerStyle = banner ? BANNER_TONE[banner.tone ?? 'accent'] : null

  return (
    <aside
      style={{
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: railWidth,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border-subtle)',
        zIndex: 40,
        transition: 'width 0.18s ease',
      }}
    >
      {/* Logo + banner */}
      <div
        style={{
          padding: state.railCollapsed ? '1rem 0.5rem' : '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', flexDirection: 'column',
          alignItems: state.railCollapsed ? 'center' : 'flex-start',
          gap: '0.5rem',
        }}
      >
        <img
          src="/logo-atp.png"
          alt="Alpha Trading Pro"
          style={{ height: state.railCollapsed ? 28 : 32, transition: 'height 0.18s ease' }}
        />
        {banner && bannerStyle && !state.railCollapsed && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: bannerStyle.bg,
              color: bannerStyle.color,
              border: `1px solid ${bannerStyle.border}`,
            }}
          >
            {banner.label}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: state.railCollapsed ? '0.75rem 0.5rem' : '0.75rem 0.75rem',
        }}
      >
        {groups.map(group => (
          <NavGroupSection
            key={group.id}
            group={group}
            activePage={activePage}
            isCollapsed={!!state.groups[group.id]}
            railCollapsed={state.railCollapsed}
            containsActive={containsActiveByGroup[group.id]}
            onToggle={() => toggleGroup(group.id)}
            onSelect={onPageChange}
          />
        ))}
      </nav>

      {/* Rail collapse toggle */}
      <button
        type="button"
        onClick={toggleRail}
        title={state.railCollapsed ? 'Déplier le rail' : 'Replier le rail'}
        aria-label={state.railCollapsed ? 'Déplier le rail' : 'Replier le rail'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.5rem',
          margin: state.railCollapsed ? '0 0.5rem' : '0 0.75rem 0.5rem',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-3)',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--color-surface-2)'
          e.currentTarget.style.color = 'var(--color-text-1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-3)'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {state.railCollapsed
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M20 12H4" />}
        </svg>
      </button>

      {/* Footer (avatar + logout injecté par le shell) */}
      {footer && (
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: state.railCollapsed ? '0.75rem 0.5rem' : '0.75rem' }}>
          {footer}
        </div>
      )}
    </aside>
  )
}

/** Largeur courante (utile pour aligner le contenu à droite du rail). */
export const APP_SIDEBAR_WIDTHS = {
  expanded: RAIL_WIDTH_EXPANDED,
  collapsed: RAIL_WIDTH_COLLAPSED,
} as const
