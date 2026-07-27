import type { ReactNode } from 'react'
import { fmtEur } from '@/lib/format'

/**
 * EntityCard — carte d'entité à sous-KPI imbriqués (compte propfirm,
 * challenge, funded, etc.). Extraite À PARTIR du restyle des 3 cartes
 * TradingPerso (AccountCard / ChallengeCard / FundedCard, commit 502dfd3)
 * pour préserver leur apparence pixel-près.
 *
 * Structure :
 *   ┌──────────────────────────────────────┐
 *   │ ┌──────────┐          [cornerBadge]  │  wrapper (variant)
 *   │ │ title    │          [topRight]     │  header
 *   │ │ subtitle │                         │
 *   │ └──────────┘                         │
 *   │                                      │
 *   │  [ hero — BalanceHero par défaut ]   │
 *   │                                      │
 *   │  [ children — milieu métier         ]│  (progress, ring, payout box…)
 *   │                                      │
 *   │  [ perfCells — PerfCells auto      ] │  (weekPnl/todayPnl)
 *   │                                      │
 *   │  [ Éditer ] [ ✕ ]                    │  actions
 *   └──────────────────────────────────────┘
 *
 * Trois variants d'enveloppe :
 *   - `default`   : wrapper standard, borderTop = accentColor
 *   - `success`   : gradient profit + halo verts, borderTop = profit (override)
 *   - `highlight` : gradient payout + halo violets, borderTop = payout (override)
 *
 * Pas de prop `background` libre — un variant nomme une INTENTION métier,
 * pas une couleur. Besoin d'un nouvel état → nouveau variant nommé.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type EntityCardVariant = 'default' | 'success' | 'highlight'

export interface EntityCardProps {
  /** Titre principal, ex nom du compte. Rendu en 18px 800 letterSpacing -0.01em. */
  title: string
  /**
   * Sous-titre en ligne sous le titre — propfirm · size · phase inline…
   * Accepte du JSX pour composer facilement séparateurs et badges.
   */
  subtitle?: ReactNode
  /** Contenu à droite du header (typiquement un stack phase + status badges). */
  topRight?: ReactNode
  /**
   * Couleur du liseré haut 4px. Peut être un hex (`phase.color`) ou un token
   * CSS var. IGNORÉE quand `variant='success'` (→ profit) ou `variant='highlight'`
   * (→ payout) — le variant impose la couleur.
   */
  accentColor: string
  /** Défaut `default`. */
  variant?: EntityCardVariant
  /**
   * Badge en position absolue top-right (au-dessus du header).
   * Ex : `<span>✓ VALIDÉ</span>`, `<span>💰 PAYOUT ELIGIBLE</span>`.
   * L'appelant fournit son propre badge stylé.
   */
  cornerBadge?: ReactNode

  /**
   * Slot pour le BALANCE HERO. Typiquement `<BalanceHero currentBalance
   * startingBalance />`. Peut être omis (rien rendu) ou personnalisé
   * (n'importe quel ReactNode).
   */
  hero?: ReactNode

  /** Rendu auto de `<PerfCells weekPnl todayPnl />` si les 2 sont fournis. */
  weekPnl?: number
  todayPnl?: number
  /** Override : slot custom au lieu du rendu auto perfCells. */
  perfCells?: ReactNode

  /**
   * Contenu métier spécifique de la carte : progress bars, ring donut,
   * payout box, meta grids… Rendu entre hero et perfCells.
   */
  children?: ReactNode

  /** Bouton "✎ Éditer" en actions. Auto-rendu si `onEdit` fourni. */
  onEdit?: () => void
  /** Bouton "✕" (loss outlined) en actions. Auto-rendu si `onDelete` fourni. */
  onDelete?: () => void

  /**
   * Affaiblit visuellement la carte (opacity 0.75). Sémantique : carte
   * inactive, échouée, fermée — signale un état terminal négatif sans
   * exiger un variant `failed` complet.
   */
  dimmed?: boolean

  /**
   * Feedback visuel au survol : montée 2px, ombre douce renforcée. À passer
   * UNIQUEMENT quand la carte est réellement cliquable (onClick global,
   * navigation vers un détail). La bordure accent NE s'ajoute PAS pour
   * préserver le liseré `accentColor` déjà présent en haut. Défaut false.
   */
  interactive?: boolean
  /** Handler de clic (auto-attaché au wrapper si interactive). */
  onClick?: () => void

  className?: string
}

// ═══════════════════════════════════════════════════════════════
// Wrapper style — 3 variants nommés
// ═══════════════════════════════════════════════════════════════

function wrapperStyleFor(variant: EntityCardVariant, accentColor: string): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 14,
    padding: 18,
    position: 'relative',
    overflow: 'hidden',
  }
  if (variant === 'success') {
    return {
      ...base,
      background: 'linear-gradient(135deg, var(--color-surface-1) 0%, rgba(var(--color-profit-rgb), 0.10) 100%)',
      border: '1px solid rgba(var(--color-profit-rgb), 0.4)',
      borderTop: '4px solid var(--color-profit)',
      boxShadow: '0 4px 20px rgba(var(--color-profit-rgb), 0.08)',
    }
  }
  if (variant === 'highlight') {
    return {
      ...base,
      background: 'linear-gradient(135deg, var(--color-surface-1) 0%, rgba(var(--color-payout-rgb), 0.12) 100%)',
      border: '1px solid rgba(var(--color-payout-rgb), 0.45)',
      borderTop: '4px solid var(--color-payout)',
      boxShadow: '0 4px 20px rgba(var(--color-payout-rgb), 0.10)',
    }
  }
  return {
    ...base,
    background: 'var(--color-surface-1)',
    border: '1px solid var(--color-border-subtle)',
    borderTop: `4px solid ${accentColor}`,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  }
}

// ═══════════════════════════════════════════════════════════════
// BalanceHero — sous-composant exporté
// ═══════════════════════════════════════════════════════════════

export interface BalanceHeroProps {
  currentBalance: number
  startingBalance: number
  /** Libellé au-dessus de la value. Défaut "Solde actuel". */
  label?: string
  className?: string
}

/**
 * BIG BALANCE HERO — le pattern répété dans les 3 cartes propfirm.
 * Servira aussi dans le dashboard trader (usage confirmé).
 *
 * Rend le solde courant en gros (32px monospace), le solde de départ
 * en dessous, et un delta badge ▲/▼ tinted profit/loss.
 */
export function BalanceHero({
  currentBalance,
  startingBalance,
  label = 'Solde actuel',
  className = '',
}: BalanceHeroProps) {
  const delta = currentBalance - startingBalance
  const deltaPct = startingBalance > 0 ? (delta / startingBalance) * 100 : 0
  // Zéro est neutre : pas de ▲/▼, pas de signe, couleur neutre.
  // Règle cohérente avec toneForPnl(0) === 'neutral' depuis l'étape 1.
  const kind: 'profit' | 'loss' | 'zero' = delta > 0 ? 'profit' : delta < 0 ? 'loss' : 'zero'
  const isProfit = kind === 'profit'
  const isZero = kind === 'zero'

  const wrapperGradient = isZero
    ? 'transparent'
    : isProfit
      ? 'linear-gradient(135deg, rgba(var(--color-profit-rgb), 0.10) 0%, rgba(var(--color-profit-rgb), 0.02) 100%)'
      : 'linear-gradient(135deg, rgba(var(--color-loss-rgb), 0.10) 0%, rgba(var(--color-loss-rgb), 0.02) 100%)'
  const wrapperBorder = isZero
    ? '1px solid var(--color-border-subtle)'
    : isProfit
      ? '1px solid rgba(var(--color-profit-rgb), 0.25)'
      : '1px solid rgba(var(--color-loss-rgb), 0.25)'
  const badgeBg = isZero
    ? 'var(--color-surface-2)'
    : isProfit
      ? 'rgba(var(--color-profit-rgb), 0.18)'
      : 'rgba(var(--color-loss-rgb), 0.18)'
  const badgeColor = isZero
    ? 'var(--color-text-2)'
    : isProfit
      ? 'var(--color-profit)'
      : 'var(--color-loss)'

  return (
    <div
      className={className}
      style={{
        padding: '16px 18px',
        background: wrapperGradient,
        border: wrapperBorder,
        borderRadius: 12,
      }}
    >
      <div style={{
        fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 32, fontWeight: 800, color: 'var(--color-text-1)',
        fontFamily: 'var(--font-data)', lineHeight: 1.05, marginTop: 6,
        letterSpacing: '-0.03em',
      }}>
        {fmtEur(currentBalance)}
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)', fontFamily: 'var(--font-data)' }}>
          depuis {fmtEur(startingBalance)}
        </span>
        <span style={{
          padding: '3px 8px', borderRadius: 5,
          background: badgeBg,
          color: badgeColor,
          fontWeight: 700, fontFamily: 'var(--font-data)', fontSize: 12,
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          {isZero ? (
            <>{fmtEur(0)} <span style={{ opacity: 0.75 }}>(0,00%)</span></>
          ) : (
            <>
              {isProfit ? '▲' : '▼'} {isProfit ? '+' : ''}{fmtEur(Math.abs(delta))}
              <span style={{ opacity: 0.75 }}>({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%)</span>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PerfCells — sous-composant exporté
// ═══════════════════════════════════════════════════════════════

export interface PerfCellsProps {
  weekPnl: number
  todayPnl: number
  /** Custom label pour la 1ère cellule. Défaut "P&L semaine". */
  weekLabel?: string
  /** Custom label pour la 2ème cellule. Défaut "Aujourd'hui". */
  todayLabel?: string
  className?: string
}

/** Grille 2 colonnes P&L semaine / Aujourd'hui, cellules bg surface-2. */
export function PerfCells({
  weekPnl, todayPnl,
  weekLabel = 'P&L semaine',
  todayLabel = 'Aujourd\'hui',
  className = '',
}: PerfCellsProps) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <PerfCell label={weekLabel}  value={weekPnl}  />
      <PerfCell label={todayLabel} value={todayPnl} />
    </div>
  )
}

function PerfCell({ label, value }: { label: string; value: number }) {
  const color = value >= 0 ? 'var(--color-profit)' : 'var(--color-loss)'
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--color-surface-2)',
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--color-text-3)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 800, color,
        fontFamily: 'var(--font-data)', marginTop: 3, lineHeight: 1,
      }}>
        {fmtEur(value, 0, { sign: true })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// EntityCard
// ═══════════════════════════════════════════════════════════════

export default function EntityCard({
  title,
  subtitle,
  topRight,
  accentColor,
  variant = 'default',
  cornerBadge,
  hero,
  weekPnl,
  todayPnl,
  perfCells,
  children,
  onEdit,
  onDelete,
  dimmed = false,
  interactive = false,
  onClick,
  className = '',
}: EntityCardProps) {
  const wrapperStyle = { ...wrapperStyleFor(variant, accentColor), opacity: dimmed ? 0.75 : 1 }
  if (interactive) {
    wrapperStyle.cursor = 'pointer'
    wrapperStyle.transition = 'transform 0.15s, box-shadow 0.15s'
  }
  const autoPerfCells = perfCells ?? (
    weekPnl !== undefined && todayPnl !== undefined
      ? <PerfCells weekPnl={weekPnl} todayPnl={todayPnl} />
      : null
  )
  const interactiveHover = interactive
    ? 'hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]'
    : ''

  return (
    <div
      className={`${interactiveHover} ${className}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={wrapperStyle}
    >
      {cornerBadge && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          zIndex: 1,
        }}>
          {cornerBadge}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, marginBottom: 16,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: 'var(--color-text-1)',
            letterSpacing: '-0.01em', lineHeight: 1.15,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 12, color: 'var(--color-text-3)', marginTop: 4,
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {topRight && <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>{topRight}</div>}
      </div>

      {/* Hero (optional) */}
      {hero && <div style={{ marginBottom: 12 }}>{hero}</div>}

      {/* Middle content (business-specific) */}
      {children}

      {/* Perf cells (auto or slot) */}
      {autoPerfCells && <div style={{ marginBottom: 12 }}>{autoPerfCells}</div>}

      {/* Actions */}
      {(onEdit || onDelete) && (
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 px-3 py-2 rounded-lg transition-all hover:opacity-80"
              style={{
                fontSize: 'var(--text-label)', fontWeight: 700,
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-2)',
                border: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
              }}
            >
              ✎ Éditer
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-2 rounded-lg transition-all hover:opacity-80"
              style={{
                fontSize: 'var(--text-label)', fontWeight: 700,
                background: 'transparent',
                color: 'var(--color-loss)',
                border: '1px solid rgba(var(--color-loss-rgb), 0.3)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}
