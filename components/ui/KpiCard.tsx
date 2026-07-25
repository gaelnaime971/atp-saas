import type { ReactNode } from 'react'

/**
 * KpiCard — indicateur numérique standard (P&L, win rate, sessions, etc.).
 *
 * Deux variants :
 * - `default` : carte pleine avec label + value + delta optionnel + sparkline
 *   optionnelle. Utilisation : dashboards en 4-6 colonnes.
 * - `compact` : label + value empilés, sans carte ni padding. Utilisation :
 *   headers de page (SessionsHistory) et rangées denses (TradingPerso KPI strip).
 *
 * Règles fermes :
 * - `value` toujours rendue en `--font-data` (mono, tabular-nums).
 * - `tone` par défaut `neutral`. Un zéro ou une absence de donnée sort en
 *   neutral, jamais en `loss` (bug historique de Stats & Performance).
 *   Le helper `toneForPnl(n)` dans lib/format.ts calcule le tone correct.
 * - `loading` rend un skeleton aux dimensions exactes de la value finale.
 *   Zéro layout shift. Jamais de spinner.
 */

export type KpiTone = 'profit' | 'loss' | 'neutral' | 'warn'
export type KpiVariant = 'default' | 'compact'

export interface KpiCardProps {
  /** Libellé mono uppercase tracked au-dessus de la value. */
  label: string
  /**
   * Valeur formatée (via lib/format helpers).
   * Toujours string — pas de nombre brut, pour forcer le passage par un helper
   * de format et garantir un rendu cohérent.
   */
  value: string
  /**
   * Delta optionnel (ex: "+12,3 %", "-45 €"). Formaté par l'appelant.
   */
  delta?: string
  /** Tone du delta (badge). Défaut `neutral`. */
  deltaTone?: KpiTone
  /** Libellé du delta (ex: "vs. hier"). */
  deltaLabel?: string
  /** Tone de la value. Défaut `neutral` — jamais forcer `loss` sur un zéro. */
  tone?: KpiTone
  /** Variant visuelle. Défaut `default`. */
  variant?: KpiVariant
  /**
   * Sparkline optionnelle. Undefined ou tableau vide = pas de sparkline.
   * Off par défaut.
   */
  sparkline?: number[]
  /**
   * État de chargement. Rend un skeleton aux dimensions exactes de la value
   * finale (pas de layout shift). Défaut `false`.
   */
  loading?: boolean
  /** Slot optionnel en haut à droite (menu ⋮, icône, badge…). */
  action?: ReactNode
  /**
   * Texte descriptif discret sous la value (contexte, période, source).
   * Ex: "Toutes sessions", "septembre 2026", "Moy. 3 mois".
   * Distinct de `delta`+`deltaLabel` qui affichent un badge de variation.
   */
  hint?: ReactNode
  /** Classe additionnelle sur le wrapper. */
  className?: string
}

// ═══════════════════════════════════════════════════════════════
// Tone → CSS variable resolver
// ═══════════════════════════════════════════════════════════════

const TONE_COLOR: Record<KpiTone, string> = {
  profit:  'var(--color-profit)',
  loss:    'var(--color-loss)',
  warn:    'var(--color-warn)',
  neutral: 'var(--color-text-1)',
}

const TONE_BADGE_BG: Record<KpiTone, string> = {
  profit:  'rgba(var(--color-profit-rgb), 0.10)',
  loss:    'rgba(var(--color-loss-rgb), 0.10)',
  warn:    'rgba(var(--color-warn-rgb), 0.10)',
  neutral: 'var(--color-surface-2)',
}

const TONE_BADGE_BORDER: Record<KpiTone, string> = {
  profit:  'rgba(var(--color-profit-rgb), 0.24)',
  loss:    'rgba(var(--color-loss-rgb), 0.24)',
  warn:    'rgba(var(--color-warn-rgb), 0.24)',
  neutral: 'var(--color-border-subtle)',
}

// ═══════════════════════════════════════════════════════════════
// KpiCard
// ═══════════════════════════════════════════════════════════════

export default function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  deltaLabel,
  tone = 'neutral',
  variant = 'default',
  sparkline,
  loading = false,
  action,
  hint,
  className = '',
}: KpiCardProps) {
  const valueColor = TONE_COLOR[tone]

  // ─── Compact variant ────────────────────────────────────────
  // Label + value empilés, sans carte, sans padding, alignés à droite.
  // Dimensionné pour tenir dans le slot `actions` d'un PageHeader.
  if (variant === 'compact') {
    return (
      <div className={`text-right ${className}`}>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--text-label)',
            fontWeight: 500,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 2 }}>
          {loading ? <SkeletonValue compact /> : (
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.875rem',    // 14px — accord avec SessionsHistory
                fontWeight: 700,
                color: valueColor,
              }}
            >
              {value}
            </span>
          )}
        </div>
        {hint && !loading && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-label)',
              color: 'var(--color-text-3)',
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        )}
      </div>
    )
  }

  // ─── Default variant ────────────────────────────────────────
  // Carte pleine, label + value + delta + sparkline.
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.125rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {/* Row 1: label + optional action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--text-label)',
            fontWeight: 500,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--color-text-3)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>

      {/* Row 2: value */}
      <div>
        {loading ? <SkeletonValue /> : (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--text-data)',   // 24px
              fontWeight: 700,
              lineHeight: 1.1,
              color: valueColor,
              letterSpacing: '-0.01em',
            }}
          >
            {value}
          </span>
        )}
      </div>

      {/* Row 3: hint (optional descriptive text under value) */}
      {hint && !loading && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-label)',
            color: 'var(--color-text-3)',
            marginTop: -2,
          }}
        >
          {hint}
        </div>
      )}

      {/* Row 4: delta (optional) */}
      {delta && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-data)',
              fontSize: '0.6875rem',   // 11px
              fontWeight: 600,
              background: TONE_BADGE_BG[deltaTone],
              border: `1px solid ${TONE_BADGE_BORDER[deltaTone]}`,
              color: TONE_COLOR[deltaTone],
              lineHeight: 1.4,
            }}
          >
            {delta}
          </span>
          {deltaLabel && (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-label)',
                color: 'var(--color-text-3)',
              }}
            >
              {deltaLabel}
            </span>
          )}
        </div>
      )}

      {/* Row 4: sparkline (optional) */}
      {sparkline && sparkline.length >= 2 && !loading && (
        <div style={{ height: 44, marginTop: 4 }}>
          <Sparkline data={sparkline} color={valueColor} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Skeleton — dimensions exactes de la value finale
// ═══════════════════════════════════════════════════════════════

function SkeletonValue({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden
      className="animate-pulse motion-reduce:animate-none"
      style={{
        display: 'inline-block',
        width: compact ? '5ch' : '7ch',
        height: compact ? '1.05em' : '1.5em',       // matches value line-height
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface-2)',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════
// Sparkline (SVG inline, léger, pas de dépendance chart)
// ═══════════════════════════════════════════════════════════════

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 100
  const h = 40
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  })
  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`

  // stable-ish id per data (avoid collisions with concurrent KpiCards on same page)
  const gradId = `spk-${Math.abs(data.reduce((a, b) => a + b, 0) * 1000 + data.length).toString(36)}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
