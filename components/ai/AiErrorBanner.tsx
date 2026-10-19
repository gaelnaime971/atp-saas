'use client'

import type { AiErrorInfo } from '@/lib/ai/client-errors'

/**
 * Bandeau d'erreur unifié pour les routes IA — aligné sur le style
 * d'erreur de PropFirm (bandeau rouge inline sous bouton) et Bilan
 * (bandeau "⚠ ..." horizontal). Un seul composant pour les 4 pages.
 *
 * Jamais afficher d'erreur IA en texte brut : passer par readAiError()
 * puis ce composant.
 */
export function AiErrorBanner({
  error,
  compact = false,
  style,
}: {
  error: AiErrorInfo | null
  compact?: boolean
  style?: React.CSSProperties
}) {
  if (!error) return null

  const icon = error.kind === 'auth' ? '🔒' : error.kind === 'quota' ? '⏳' : '⚠'

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: compact ? 8 : 10,
        padding: compact ? '8px 10px' : '10px 14px',
        borderRadius: 8,
        background: 'rgba(var(--color-loss-rgb), 0.08)',
        border: '1px solid rgba(var(--color-loss-rgb), 0.35)',
        color: 'var(--color-text-1)',
        fontSize: compact ? 12 : 13,
        lineHeight: 1.4,
        alignItems: 'flex-start',
        ...style,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, color: 'var(--color-loss)', fontSize: compact ? 13 : 15, lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--color-loss)', marginBottom: 2 }}>{error.title}</div>
        <div style={{ color: 'var(--color-text-2)' }}>{error.message}</div>
        {error.actionLabel && error.actionHref && (
          <a
            href={error.actionHref}
            style={{
              display: 'inline-block',
              marginTop: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--color-loss)',
              color: 'var(--color-surface-0)',
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {error.actionLabel}
          </a>
        )}
      </div>
    </div>
  )
}
