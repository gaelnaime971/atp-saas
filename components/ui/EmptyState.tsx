import type { ReactNode } from 'react'

/**
 * EmptyState — version minimale.
 *
 * Impose au minimum un titre et une description : jamais "Aucune donnée."
 * tout seul au milieu d'un écran. La primitive s'enrichira à l'étape 5
 * (icône, action, illustration). Pour l'instant : just enough pour éviter
 * les états vides déguisés en bugs.
 */

export interface EmptyStateProps {
  /** Titre court, ex: "Aucune session enregistrée". */
  title: string
  /**
   * Explication concrète — pourquoi c'est vide, quoi faire.
   * Ex: "Ta première session apparaîtra ici dès que tu l'auras créée."
   */
  description: ReactNode
  /** Action optionnelle (Button). Étoffée à l'étape 5. */
  action?: ReactNode
  /** Classe additionnelle sur le wrapper. */
  className?: string
}

export default function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
        background: 'var(--color-surface-1)',
        border: '1px dashed var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
      role="status"
    >
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.9375rem',   // 15px
          fontWeight: 600,
          color: 'var(--color-text-1)',
          margin: 0,
          letterSpacing: '-0.005em',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-body)',
          color: 'var(--color-neutral)',
          lineHeight: 1.5,
          margin: '0.5rem auto 0',
          maxWidth: '40ch',
        }}
      >
        {description}
      </p>
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  )
}
