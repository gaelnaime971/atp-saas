'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { scrollTopToReveal } from '@/lib/nav/sidebar-scroll'
import { effectiveRailCollapsed, toggleRail as nextRailPrefs } from '@/lib/ui/shell'
import { useViewportKind } from '@/lib/hooks/useViewportKind'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface NavItem<Id extends string> {
  id: Id
  label: string
  icon: ReactNode
  badge?: number | string
  /**
   * Optionnel. Présent → l'item est un vrai lien (<Link>) vers cette URL,
   * `onPageChange` n'est pas appelé. Absent → comportement historique (id).
   */
  href?: string
  /** Optionnel. `true` → visible mais non cliquable, badge « Bientôt ». */
  soon?: boolean
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
  /**
   * Contenu injecté en bas du rail. Typiquement : avatar + logout du hook
   * `useSidebarProfile`. Fonction → reçoit l'état du rail (replié : icônes).
   */
  footer?: ReactNode | ((railCollapsed: boolean) => ReactNode)
  /**
   * Optionnel. Contenu injecté entre le logo et la nav (sélecteur
   * d'espace, bouton de recherche). Fonction → reçoit l'état du rail.
   */
  header?: ReactNode | ((railCollapsed: boolean) => ReactNode)
  /**
   * 'rail' (défaut) : colonne fixe à gauche, masquée sous 768 px, repliée
   * par défaut de 768 à 1279 px. 'drawer' : même contenu, toujours déplié,
   * dans le tiroir du menu mobile (AppShell).
   */
  variant?: 'rail' | 'drawer'
  /** Appelé quand un élément de navigation est choisi (ferme le tiroir). */
  onNavigate?: () => void
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
  /** Choix sur tablette (768-1279 px). Absent = replié par défaut. */
  railCollapsedTablet?: boolean
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
      ...(typeof parsed.railCollapsedTablet === 'boolean' ? { railCollapsedTablet: parsed.railCollapsedTablet } : {}),
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
  // Rail replié : nom de l'élément au survol (et au focus clavier), à
  // droite de l'icône. Position fixe : la nav défile et masque ses bords.
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null)
  const isSoon = !!item.soon
  const highlight = hover && !isSoon

  const style: CSSProperties = {
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
    textDecoration: 'none',
    background: isActive
      ? 'rgba(var(--color-accent-rgb), 0.10)'
      : highlight ? 'var(--color-surface-2)' : 'transparent',
    color: isActive ? 'var(--color-accent)' : isSoon ? 'var(--color-text-3)' : 'var(--color-text-2)',
    borderLeft: railCollapsed ? 'none' : `3px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
    paddingLeft: railCollapsed ? '0' : '0.625rem',
    cursor: isSoon ? 'default' : 'pointer',
    transition: 'background 0.15s, color 0.15s',
    position: 'relative',
  }

  const content = (
    <>
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
          {isSoon && (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.625rem',     // 10px : tient à côté d'un libellé de 15 caractères
                fontWeight: 600,
                lineHeight: 1.4,
                padding: '0 4px',
                marginLeft: '-0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-3)',
                flexShrink: 0,
              }}
            >
              Bientôt
            </span>
          )}
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
    </>
  )

  const tipLabel = isSoon ? `${item.label} (bientôt)` : item.label
  const showTip = (el: HTMLElement) => {
    if (!railCollapsed) return
    const r = el.getBoundingClientRect()
    setTip({ top: r.top + r.height / 2, left: r.right + 8 })
  }
  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { setHover(true); showTip(e.currentTarget) },
    onMouseLeave: () => { setHover(false); setTip(null) },
    onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget),
    onBlur: () => setTip(null),
  }
  const ariaLabel = railCollapsed ? tipLabel : undefined
  const tooltip = railCollapsed && tip ? (
    <span
      role="tooltip"
      style={{
        position: 'fixed', top: tip.top, left: tip.left, transform: 'translateY(-50%)',
        zIndex: 60, pointerEvents: 'none', whiteSpace: 'nowrap',
        padding: '4px 8px', borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-3)', border: '1px solid var(--color-border-subtle)',
        color: 'var(--color-text-1)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
        boxShadow: 'var(--shadow-2)',
      }}
    >
      {tipLabel}
    </span>
  ) : null

  if (isSoon) {
    return (
      <li>
        <div aria-disabled="true" aria-label={ariaLabel} tabIndex={railCollapsed ? 0 : undefined} {...hoverHandlers} style={style}>
          {content}
        </div>
        {tooltip}
      </li>
    )
  }

  if (item.href) {
    return (
      <li>
        <Link
          href={item.href}
          {...hoverHandlers}
          aria-label={ariaLabel}
          aria-current={isActive ? 'page' : undefined}
          style={style}
        >
          {content}
        </Link>
        {tooltip}
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        {...hoverHandlers}
        aria-label={ariaLabel}
        aria-current={isActive ? 'page' : undefined}
        style={style}
      >
        {content}
      </button>
      {tooltip}
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
        data-drawer-keep-open
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
  groups, activePage, onPageChange, banner, storageKey, footer, header, variant = 'rail', onNavigate,
}: AppSidebarProps<Id>) {
  const isDrawer = variant === 'drawer'
  const kind = useViewportKind()
  // Init state from localStorage; fallback = { rail expanded, groups per defaultCollapsed }
  const [state, setState] = useState<SidebarState>(() => {
    const stored = typeof window !== 'undefined' ? readState(storageKey) : { railCollapsed: false, groups: {} }
    const initial: SidebarState = { ...stored, groups: { ...stored.groups } }
    // Seed defaultCollapsed for groups the user hasn't explicitly touched yet
    for (const g of groups) {
      if (!(g.id in initial.groups) && g.defaultCollapsed) initial.groups[g.id] = true
    }
    return initial
  })

  // Rail replié selon la taille d'écran (lib/ui/shell.ts) : tablette
  // replié par défaut, bureau selon le choix du membre. Tiroir : déplié.
  const railCollapsed = isDrawer ? false : effectiveRailCollapsed(kind, state)

  // Persist on any change
  useEffect(() => { writeState(storageKey, state) }, [state, storageKey])

  // Expose current rail width as CSS var so the shell can align its content
  // (marginLeft: 'var(--app-sidebar-width)') without prop drilling or coupling.
  // Le tiroir ne pilote pas cette largeur.
  useEffect(() => {
    if (isDrawer) return
    const w = railCollapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED
    document.documentElement.style.setProperty('--app-sidebar-width', `${w}px`)
  }, [railCollapsed, isDrawer])

  // L'élément actif hors de vue (menu long, petit écran) : la nav défile
  // jusqu'à lui, au chargement (sans animation) puis à chaque changement
  // de page (défilement doux, sauf « réduire les animations »).
  const navRef = useRef<HTMLElement>(null)
  const firstRevealRef = useRef(true)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const instant = firstRevealRef.current
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    firstRevealRef.current = false
    const frame = requestAnimationFrame(() => {
      const item = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!item) return  // groupe replié ou page hors menu
      const navRect = nav.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      const top = scrollTopToReveal({
        containerTop: navRect.top,
        containerHeight: nav.clientHeight,
        scrollTop: nav.scrollTop,
        itemTop: itemRect.top,
        itemHeight: itemRect.height,
      })
      if (top !== null) nav.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [activePage])

  const toggleRail = useCallback(() => {
    setState(s => ({ ...s, ...nextRailPrefs(kind, s) }))
  }, [kind])

  const toggleGroup = useCallback((groupId: string) => {
    setState(s => ({ ...s, groups: { ...s.groups, [groupId]: !s.groups[groupId] } }))
  }, [])

  // Map groupId → contient activePage (utile pour l'indicateur "point accent" sur header collapsé)
  const containsActiveByGroup = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const g of groups) map[g.id] = g.items.some(i => i.id === activePage)
    return map
  }, [groups, activePage])

  const railWidth = railCollapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED
  const select = (id: Id) => { onPageChange(id); onNavigate?.() }
  const bannerStyle = banner ? BANNER_TONE[banner.tone ?? 'accent'] : null

  return (
    <aside
      // Rail : masqué sous 768 px (menu dans le tiroir, AppShell).
      className={isDrawer ? 'flex flex-col' : 'hidden md:flex md:flex-col'}
      style={isDrawer ? {
        width: '100%', height: '100%', minHeight: 0,
        background: 'var(--color-surface-1)',
      } : {
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: railWidth,
        flexDirection: 'column',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border-subtle)',
        zIndex: 40,
        transition: 'width 0.18s ease',
      }}
    >
      {/* Logo + banner */}
      <div
        style={{
          padding: railCollapsed ? '1rem 0.5rem' : '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border-subtle)',
          display: 'flex', flexDirection: 'column',
          alignItems: railCollapsed ? 'center' : 'flex-start',
          gap: '0.5rem',
        }}
      >
        <img
          src="/logo-atp.png"
          alt="Alpha Trading Pro"
          style={{ height: railCollapsed ? 28 : 32, transition: 'height 0.18s ease' }}
        />
        {banner && bannerStyle && !railCollapsed && (
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

      {/* Slot optionnel : sélecteur d'espace, recherche */}
      {header && (
        <div
          style={{
            padding: railCollapsed ? '0.75rem 0.5rem 0' : '0.75rem 0.75rem 0',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}
        >
          {typeof header === 'function' ? header(railCollapsed) : header}
        </div>
      )}

      {/* Nav */}
      <nav
        ref={navRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: railCollapsed ? '0.75rem 0.5rem' : '0.75rem 0.75rem',
        }}
      >
        {groups.map(group => (
          <NavGroupSection
            key={group.id}
            group={group}
            activePage={activePage}
            isCollapsed={!!state.groups[group.id]}
            railCollapsed={railCollapsed}
            containsActive={containsActiveByGroup[group.id]}
            onToggle={() => toggleGroup(group.id)}
            onSelect={select}
          />
        ))}
      </nav>

      {/* Rail collapse toggle (pas dans le tiroir) */}
      {!isDrawer && <button
        type="button"
        onClick={toggleRail}
        title={railCollapsed ? 'Déplier le rail' : 'Replier le rail'}
        aria-label={railCollapsed ? 'Déplier le rail' : 'Replier le rail'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.5rem',
          margin: railCollapsed ? '0 0.5rem' : '0 0.75rem 0.5rem',
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
          {railCollapsed
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M20 12H4" />}
        </svg>
      </button>}

      {/* Footer (avatar + logout injecté par le shell) */}
      {footer && (
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: railCollapsed ? '0.75rem 0.5rem' : '0.75rem' }}>
          {typeof footer === 'function' ? footer(railCollapsed) : footer}
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
