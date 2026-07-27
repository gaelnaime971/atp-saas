import type { ReactNode } from 'react'

/**
 * Badge — pill/tag pour statuts, résultats, phases, tags métier.
 *
 * Read-only. Un badge cliquable n'est pas un Badge : c'est un chip de sélection
 * (à venir : `ToggleBadge`, voir REFONTE.md). Ne mélange pas les deux.
 *
 * Contrat couleur :
 *   Chaque `tone` mappe vers un couple de tokens sémantiques CSS
 *   (--color-<name> + --color-<name>-rgb). Deux tones peuvent partager la
 *   même valeur aujourd'hui (payout / status-closed sont tous deux violet)
 *   MAIS ils lisent des variables distinctes. Le jour où l'un doit se
 *   distinguer à l'œil, on change UNE variable, pas 40 sites.
 *
 * Le rendu :
 *   text-color = var(--color-<tone>)
 *   background = rgba(var(--color-<tone>-rgb), 0.10)
 *   border     = rgba(var(--color-<tone>-rgb), 0.24)   ← si `bordered`
 */

export type BadgeTone =
  | 'profit'          // Win, Long, gain, up
  | 'loss'            // Loss, Short, perte, down
  | 'warn'            // BE, tiède, en attente
  | 'neutral'         // défaut, absence, générique
  | 'info'            // information neutre — alertes niveau INFO
  | 'accent'          // gold — brand-forward
  | 'payout'          // violet — argent qui rentre (TradingPerso, PropFirm)
  | 'status-closed'   // violet — statut prospect final (Pipeline)

export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps {
  children: ReactNode
  /** Défaut `neutral`. */
  tone?: BadgeTone
  /** Défaut `md` (11px, taille majoritaire des sites recensés). */
  size?: BadgeSize
  /** Bordure semi-transparente autour du badge. Défaut false. */
  bordered?: boolean
  /** Uppercase + letterSpacing 0.08em auto. Défaut false. */
  uppercase?: boolean
  /** Point coloré préfixé (dot indicator). Défaut false. Mutuellement exclusif avec `icon`. */
  dot?: boolean
  /** Icône/emoji préfixé. Mutuellement exclusif avec `dot`. */
  icon?: ReactNode
  className?: string
}

// ═══════════════════════════════════════════════════════════════
// Tone → token mapping
// Chaque tone lit sa propre paire de tokens (color + rgb). Deux tones
// peuvent pointer sur la même valeur, mais ils LISENT des variables
// distinctes.
// ═══════════════════════════════════════════════════════════════

const TONE_TOKENS: Record<BadgeTone, { color: string; rgb: string }> = {
  profit:          { color: 'var(--color-profit)',        rgb: 'var(--color-profit-rgb)'        },
  loss:            { color: 'var(--color-loss)',          rgb: 'var(--color-loss-rgb)'          },
  warn:            { color: 'var(--color-warn)',          rgb: 'var(--color-warn-rgb)'          },
  neutral:         { color: 'var(--color-neutral)',       rgb: 'var(--color-neutral-rgb)'       },
  info:            { color: 'var(--color-info)',          rgb: 'var(--color-info-rgb)'          },
  accent:          { color: 'var(--color-accent)',        rgb: 'var(--color-accent-rgb)'        },
  payout:          { color: 'var(--color-payout)',        rgb: 'var(--color-payout-rgb)'        },
  'status-closed': { color: 'var(--color-status-closed)', rgb: 'var(--color-status-closed-rgb)' },
}

// ═══════════════════════════════════════════════════════════════
// Size → dimensions
// Mesures tirées de l'inventaire (57 sites recensés) :
// sm ≈ 9px dense tables/cards ; md ≈ 11px majoritaire ; lg ≈ 12px hero
// ═══════════════════════════════════════════════════════════════

const SIZE_STYLE: Record<BadgeSize, { fontSize: string; padding: string; gap: string; dotSize: string }> = {
  sm: { fontSize: '0.5625rem', padding: '1px 6px',  gap: '4px', dotSize: '5px' },   // 9px
  md: { fontSize: '0.6875rem', padding: '2px 8px',  gap: '5px', dotSize: '6px' },   // 11px
  lg: { fontSize: '0.75rem',   padding: '3px 10px', gap: '6px', dotSize: '7px' },   // 12px
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  bordered = false,
  uppercase = false,
  dot = false,
  icon,
  className = '',
}: BadgeProps) {
  const tokens = TONE_TOKENS[tone]
  const dims = SIZE_STYLE[size]

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dims.gap,
        padding: dims.padding,
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-display)',
        fontSize: dims.fontSize,
        fontWeight: 600,
        lineHeight: 1.2,
        color: tokens.color,
        background: `rgba(${tokens.rgb}, 0.10)`,
        border: bordered ? `1px solid rgba(${tokens.rgb}, 0.24)` : '1px solid transparent',
        textTransform: uppercase ? 'uppercase' : 'none',
        letterSpacing: uppercase ? '0.08em' : undefined,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {dot && !icon && (
        <span
          aria-hidden
          style={{
            width: dims.dotSize,
            height: dims.dotSize,
            borderRadius: '50%',
            background: tokens.color,
            flexShrink: 0,
          }}
        />
      )}
      {icon && !dot && (
        <span
          aria-hidden
          style={{ display: 'inline-flex', flexShrink: 0, color: tokens.color, lineHeight: 1 }}
        >
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}
