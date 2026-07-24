import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated'
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
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    const variants = {
      default:
        'bg-[color:var(--color-surface-1)] border border-[color:var(--color-border-subtle)] rounded-xl p-5',
      elevated:
        'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-subtle)] rounded-xl p-5 shadow-lg',
    }

    return (
      <div
        ref={ref}
        className={`${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export default Card
