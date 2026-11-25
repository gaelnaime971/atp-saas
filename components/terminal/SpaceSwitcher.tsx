'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { SPACE_LABELS, type SpaceId } from '@/lib/nav/spaces'

/**
 * Sélecteur d'espace « Mon trading / Marchés » + bouton « Rechercher ⌘K »,
 * rendus dans le slot `header` d'AppSidebar (maquette 00-menu.html).
 *
 * Chaque espace se rejoint soit par un lien (`href`, changement de route),
 * soit par un callback (`onClick`, changement de page dans le SPA).
 * L'espace actif n'est pas cliquable.
 */

export interface SpaceTarget {
  href?: string
  onClick?: () => void
}

export interface SpaceSwitcherProps {
  active: SpaceId
  targets: Record<SpaceId, SpaceTarget>
  onSearch: () => void
  railCollapsed: boolean
}

const SPACES: SpaceId[] = ['trading', 'marches']

const IconTrading = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
)
const IconMarkets = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3M3.5 9h17M3.5 15h17" />
  </svg>
)
const IconSearch = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ flexShrink: 0 }}>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
  </svg>
)
const SPACE_ICONS: Record<SpaceId, ReactNode> = { trading: IconTrading, marches: IconMarkets }

export default function SpaceSwitcher({ active, targets, onSearch, railCollapsed }: SpaceSwitcherProps) {
  const optionStyle = (isActive: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: railCollapsed ? '0.5rem 0' : '0.5625rem 0',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: isActive ? 'var(--color-accent)' : 'transparent',
    color: isActive ? 'var(--color-surface-1)' : 'var(--color-text-2)',
    fontFamily: 'var(--font-display)',
    fontSize: '0.8125rem',
    fontWeight: isActive ? 700 : 500,
    lineHeight: 1,
    textDecoration: 'none',
    cursor: isActive ? 'default' : 'pointer',
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  })

  return (
    <>
      <div
        role="group"
        aria-label="Espace"
        style={{
          display: 'grid',
          gridTemplateColumns: railCollapsed ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: 4,
          padding: 4,
          background: 'var(--color-surface-0)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        {SPACES.map(space => {
          const isActive = space === active
          const label = SPACE_LABELS[space]
          const inner = railCollapsed ? SPACE_ICONS[space] : label
          const common = {
            style: optionStyle(isActive),
            title: railCollapsed ? label : undefined,
            'aria-label': railCollapsed ? label : undefined,
          }
          if (isActive) {
            return <span key={space} aria-current="page" {...common}>{inner}</span>
          }
          const target = targets[space]
          if (target.href) {
            return <Link key={space} href={target.href} {...common}>{inner}</Link>
          }
          return <button key={space} type="button" onClick={target.onClick} {...common}>{inner}</button>
        })}
      </div>

      <button
        type="button"
        onClick={onSearch}
        aria-label="Rechercher partout (⌘K)"
        title={railCollapsed ? 'Rechercher (⌘K)' : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: railCollapsed ? 'center' : 'flex-start',
          gap: '0.625rem',
          width: '100%',
          padding: railCollapsed ? '0.5rem 0' : '0.5625rem 0.75rem',
          background: 'transparent',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--color-text-3)',
          fontFamily: 'var(--font-display)',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-1)'; e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-3)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)' }}
      >
        {IconSearch}
        {!railCollapsed && (
          <>
            <span>Rechercher</span>
            <kbd
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-data)',
                fontSize: '0.6875rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-3)',
              }}
            >
              ⌘K
            </kbd>
          </>
        )}
      </button>
    </>
  )
}
