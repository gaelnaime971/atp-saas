import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated'
  /**
   * Active un feedback visuel au survol : montée 2px, ombre douce, bordure
   * accent. À passer UNIQUEMENT quand la carte est réellement cliquable
   * (onClick global, ou wrap dans un `<button>`/`<a>`). Sur une carte
   * statique de lecture, le hover promettrait une interaction qui n'existe
   * pas — même logique que le cursor pointer de DataTable conditionné à
   * onRowClick. Défaut `false`.
   */
  interactive?: boolean
}

/**
 * Card — surface conteneur.
 *
 * Lit les tokens sémantiques ATP (--color-surface-*, --color-border-subtle,
 * --radius-xl). Importé dans 32 fichiers → porte à lui seul une grande part
 * du look de l'app.
 *
 * Note visuelle : la bordure passe de rgba(255,255,255,0.07) à
 * rgba(255,255,255,0.08) (--color-border-subtle). Écart d'alpha de 0.01,
 * sous le seuil de perception. Voir REFONTE.md.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', interactive = false, className = '', children, ...props }, ref) => {
    const variants = {
      default:
        'bg-[color:var(--color-surface-1)] border border-[color:var(--color-border-subtle)] rounded-xl p-5',
      elevated:
        'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-subtle)] rounded-xl p-5 shadow-lg',
    }
    const interactiveClasses = interactive
      ? 'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] hover:border-[color:rgba(var(--color-accent-rgb),0.4)] cursor-pointer'
      : ''

    return (
      <div
        ref={ref}
        className={`${variants[variant]} ${interactiveClasses} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export default Card
