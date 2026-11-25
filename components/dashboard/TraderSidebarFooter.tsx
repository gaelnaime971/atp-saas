'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import Avatar from '@/components/ui/Avatar'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import { TRADER_FOOTER_ITEMS } from '@/lib/nav/trader-nav'
import { spaHref } from '@/lib/nav/spaces'

/**
 * Pied du menu trader (avatar, Mon compte / Contrat / Documents,
 * déconnexion), partagé par les 2 espaces. Extrait à l'identique du SPA
 * app/dashboard/page.tsx.
 *
 * - Dans le SPA : `onSelect` fourni → boutons qui changent de page.
 * - Hors SPA (espace Marchés) : pas de `onSelect` → liens /dashboard?page=…
 * - `accountLinks={false}` (admin dans Marchés) : avatar + déconnexion
 *   seulement, ces liens le renverraient vers /admin/dashboard.
 */
export interface TraderSidebarFooterProps {
  name: string
  avatarUrl: string | null
  logout: () => void
  activePage?: DashboardPage | null
  onSelect?: (id: DashboardPage) => void
  accountLinks?: boolean
}

export default function TraderSidebarFooter({ name, avatarUrl, logout, activePage, onSelect, accountLinks = true }: TraderSidebarFooterProps) {
  return (
    <>
      {name && (
        <div className="mb-2 flex items-center gap-3 px-1">
          <Avatar url={avatarUrl} name={name} size={32} />
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-1)' }}>
            {name}
          </p>
        </div>
      )}
      {accountLinks && <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {TRADER_FOOTER_ITEMS.map(item => {
          const isActive = activePage === item.id
          const style: CSSProperties = {
            width: '100%',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.375rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: isActive ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
            color: isActive ? 'var(--color-accent)' : 'var(--color-text-3)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontSize: '0.8125rem',    // 13px, plus discret que la nav principale
            fontWeight: isActive ? 600 : 500,
            textAlign: 'left',
            textDecoration: 'none',
            transition: 'background 0.15s, color 0.15s',
          }
          const handlers = {
            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-1)' },
            onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { if (!isActive) e.currentTarget.style.color = 'var(--color-text-3)' },
          }
          const content = (
            <>
              <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'inherit' }}>
                {item.icon}
              </span>
              {item.label}
            </>
          )
          return (
            <li key={item.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  style={style}
                  {...handlers}
                >
                  {content}
                </button>
              ) : (
                <Link href={spaHref(item.id)} style={style} {...handlers}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ul>}
      <button
        onClick={logout}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all"
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
        Déconnexion
      </button>
    </>
  )
}
