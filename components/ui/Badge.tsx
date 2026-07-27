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
  | 'warn'            // BE, tiède UI, en attente
  | 'neutral'         // défaut, absence, générique
  | 'info'            // information neutre — alertes niveau INFO
  | 'accent'          // gold — brand-forward
  | 'payout'          // violet — argent qui rentre (TradingPerso, PropFirm)
  // ─── Pipeline : statuts prospect ───
  | 'status-nouveau'
  | 'status-contacte'
  | 'status-call-booke'
  | 'status-closed'   // violet — statut prospect final
  | 'status-disqualifie'
  // ─── Pipeline : températures prospect ───
  | 'temp-chaud'
  | 'temp-tiede'
  | 'temp-froid'
  // ─── Pipeline : programmes ───
  | 'program-ultra'
  | 'program-coaching'
  | 'program-seminaire'
  | 'program-autre'
  // ─── Pipeline : sources acquisition ───
  | 'source-methode-atp'
  | 'source-trading-night'
  | 'source-preinscription'
  | 'source-video-methode'
  | 'source-whop-lt1k'
  | 'source-whop-1k-2k'
  | 'source-whop-gt2k'
  | 'source-instagram'
  | 'source-x-twitter'
  | 'source-reference-client'
  | 'source-manual'
  | 'source-csv-import'
  // ─── Pipeline : méthodes paiement ───
  | 'pay-stripe'
  | 'pay-virement'
  | 'pay-especes'
  | 'pay-mixed'
  // ─── Pipeline : outcomes call ───
  | 'outcome-pas-repondu'
  | 'outcome-rappel'
  | 'outcome-interesse'
  | 'outcome-tres-interesse'
  | 'outcome-objection'
  | 'outcome-pas-interesse'
  | 'outcome-closed'

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
  // ─── Tones sémantiques génériques ───
  profit:  { color: 'var(--color-profit)',  rgb: 'var(--color-profit-rgb)'  },
  loss:    { color: 'var(--color-loss)',    rgb: 'var(--color-loss-rgb)'    },
  warn:    { color: 'var(--color-warn)',    rgb: 'var(--color-warn-rgb)'    },
  neutral: { color: 'var(--color-neutral)', rgb: 'var(--color-neutral-rgb)' },
  info:    { color: 'var(--color-info)',    rgb: 'var(--color-info-rgb)'    },
  accent:  { color: 'var(--color-accent)',  rgb: 'var(--color-accent-rgb)'  },
  payout:  { color: 'var(--color-payout)',  rgb: 'var(--color-payout-rgb)'  },
  // ─── Pipeline : statuts prospect ───
  'status-nouveau':     { color: 'var(--color-status-nouveau)',     rgb: 'var(--color-status-nouveau-rgb)'     },
  'status-contacte':    { color: 'var(--color-status-contacte)',    rgb: 'var(--color-status-contacte-rgb)'    },
  'status-call-booke':  { color: 'var(--color-status-call-booke)',  rgb: 'var(--color-status-call-booke-rgb)'  },
  'status-closed':      { color: 'var(--color-status-closed)',      rgb: 'var(--color-status-closed-rgb)'      },
  'status-disqualifie': { color: 'var(--color-status-disqualifie)', rgb: 'var(--color-status-disqualifie-rgb)' },
  // ─── Pipeline : températures ───
  'temp-chaud': { color: 'var(--color-temp-chaud)', rgb: 'var(--color-temp-chaud-rgb)' },
  'temp-tiede': { color: 'var(--color-temp-tiede)', rgb: 'var(--color-temp-tiede-rgb)' },
  'temp-froid': { color: 'var(--color-temp-froid)', rgb: 'var(--color-temp-froid-rgb)' },
  // ─── Pipeline : programmes ───
  'program-ultra':     { color: 'var(--color-program-ultra)',     rgb: 'var(--color-program-ultra-rgb)'     },
  'program-coaching':  { color: 'var(--color-program-coaching)',  rgb: 'var(--color-program-coaching-rgb)'  },
  'program-seminaire': { color: 'var(--color-program-seminaire)', rgb: 'var(--color-program-seminaire-rgb)' },
  'program-autre':     { color: 'var(--color-program-autre)',     rgb: 'var(--color-program-autre-rgb)'     },
  // ─── Pipeline : sources acquisition ───
  'source-methode-atp':      { color: 'var(--color-source-methode-atp)',      rgb: 'var(--color-source-methode-atp-rgb)'      },
  'source-trading-night':    { color: 'var(--color-source-trading-night)',    rgb: 'var(--color-source-trading-night-rgb)'    },
  'source-preinscription':   { color: 'var(--color-source-preinscription)',   rgb: 'var(--color-source-preinscription-rgb)'   },
  'source-video-methode':    { color: 'var(--color-source-video-methode)',    rgb: 'var(--color-source-video-methode-rgb)'    },
  'source-whop-lt1k':        { color: 'var(--color-source-whop-lt1k)',        rgb: 'var(--color-source-whop-lt1k-rgb)'        },
  'source-whop-1k-2k':       { color: 'var(--color-source-whop-1k-2k)',       rgb: 'var(--color-source-whop-1k-2k-rgb)'       },
  'source-whop-gt2k':        { color: 'var(--color-source-whop-gt2k)',        rgb: 'var(--color-source-whop-gt2k-rgb)'        },
  'source-instagram':        { color: 'var(--color-source-instagram)',        rgb: 'var(--color-source-instagram-rgb)'        },
  'source-x-twitter':        { color: 'var(--color-source-x-twitter)',        rgb: 'var(--color-source-x-twitter-rgb)'        },
  'source-reference-client': { color: 'var(--color-source-reference-client)', rgb: 'var(--color-source-reference-client-rgb)' },
  'source-manual':           { color: 'var(--color-source-manual)',           rgb: 'var(--color-source-manual-rgb)'           },
  'source-csv-import':       { color: 'var(--color-source-csv-import)',       rgb: 'var(--color-source-csv-import-rgb)'       },
  // ─── Pipeline : méthodes paiement ───
  'pay-stripe':   { color: 'var(--color-pay-stripe)',   rgb: 'var(--color-pay-stripe-rgb)'   },
  'pay-virement': { color: 'var(--color-pay-virement)', rgb: 'var(--color-pay-virement-rgb)' },
  'pay-especes':  { color: 'var(--color-pay-especes)',  rgb: 'var(--color-pay-especes-rgb)'  },
  'pay-mixed':    { color: 'var(--color-pay-mixed)',    rgb: 'var(--color-pay-mixed-rgb)'    },
  // ─── Pipeline : outcomes call ───
  'outcome-pas-repondu':    { color: 'var(--color-outcome-pas-repondu)',    rgb: 'var(--color-outcome-pas-repondu-rgb)'    },
  'outcome-rappel':         { color: 'var(--color-outcome-rappel)',         rgb: 'var(--color-outcome-rappel-rgb)'         },
  'outcome-interesse':      { color: 'var(--color-outcome-interesse)',      rgb: 'var(--color-outcome-interesse-rgb)'      },
  'outcome-tres-interesse': { color: 'var(--color-outcome-tres-interesse)', rgb: 'var(--color-outcome-tres-interesse-rgb)' },
  'outcome-objection':      { color: 'var(--color-outcome-objection)',      rgb: 'var(--color-outcome-objection-rgb)'      },
  'outcome-pas-interesse':  { color: 'var(--color-outcome-pas-interesse)',  rgb: 'var(--color-outcome-pas-interesse-rgb)'  },
  'outcome-closed':         { color: 'var(--color-outcome-closed)',         rgb: 'var(--color-outcome-closed-rgb)'         },
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
