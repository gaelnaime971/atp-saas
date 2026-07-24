import type { ReactNode } from 'react'

/**
 * PageHeader — en-tête standard d'une page du dashboard.
 *
 * Unifie l'en-tête des pages admin ET trader. Chaque page se contente de
 * fournir title / subtitle / actions ; la primitive porte la typo, les
 * espacements, l'alignement et le comportement responsive.
 *
 * Zéro hex, zéro valeur en dur : uniquement les tokens ATP
 * (--color-text-1/2, --font-display, --text-*).
 */

export interface PageHeaderProps {
  /** Titre principal — accepte du JSX pour émojis, spans stylés, etc. */
  title: ReactNode
  /** Sous-titre optionnel (date, description courte de la page). */
  subtitle?: ReactNode
  /** Contenu à droite (boutons, filtres, actions). Auto-wrap sous 768px. */
  actions?: ReactNode
  /** Fil d'ariane optionnel affiché AU-DESSUS du titre (mono uppercase tracked). */
  breadcrumb?: ReactNode
  /** Classe additionnelle sur le wrapper. */
  className?: string
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6 ${className}`}
    >
      <div className="min-w-0">
        {breadcrumb && (
          <div
            className="mb-2 flex items-center gap-1.5"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--text-label)',
              fontWeight: 500,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
            }}
          >
            {breadcrumb}
          </div>
        )}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',           // 24px — unifié
            fontWeight: 700,
            color: 'var(--color-text-1)',
            margin: 0,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-body)',
              color: 'var(--color-text-3)',
              margin: '0.25rem 0 0 0',
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  )
}
