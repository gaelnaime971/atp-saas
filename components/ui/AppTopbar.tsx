'use client'

import type { ReactNode } from 'react'

export interface AppTopbarProps {
  title: string
  /** Cluster à droite : KPI stats + boutons + date. Chaque host injecte ce qu'il veut. */
  actions?: ReactNode
}

/**
 * Header sticky au top de la zone de contenu. Absorbe les 2 <header> quasi-
 * identiques des shells admin et trader. Ne connaît aucune donnée : le host
 * passe le titre courant + le cluster d'actions à droite.
 */
export default function AppTopbar({ title, actions }: AppTopbarProps) {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.75rem',
        background: 'var(--color-surface-0)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-body)',       // 14px, aligné shells actuels
          fontWeight: 600,
          color: 'var(--color-text-1)',
          margin: 0,
          flexShrink: 0,
        }}
      >
        {title}
      </h1>
      {actions && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            overflowX: 'auto',
          }}
        >
          {actions}
        </div>
      )}
    </header>
  )
}
