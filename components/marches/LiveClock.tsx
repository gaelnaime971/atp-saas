'use client'

import { useEffect, useState } from 'react'

/**
 * LiveClock — horloge live du hero /marches.
 *
 * Client-only strict (initial vide au SSR + set côté client via useEffect
 * + interval 1s). Affiche l'heure locale du visiteur + une note du fuseau,
 * pour situer immédiatement les sessions marchés relatives à sa propre
 * heure. Zéro contenu date sérialisé au SSR → zéro hydration mismatch.
 *
 * Format compact : "15:42:07 · Europe/Paris" (fuseau détecté via
 * Intl.DateTimeFormat().resolvedOptions().timeZone). Le tick chaque
 * seconde n'anime PAS les KPI environnants (règle produit : les valeurs
 * réactives ne réanimation pas à chaque tick).
 */

export default function LiveClock() {
  const [state, setState] = useState<{ time: string; tz: string } | null>(null)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const update = () => {
      const now = new Date()
      const time = now.toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
      setState({ time, tz })
    }
    update()
    const iv = window.setInterval(update, 1000)
    return () => window.clearInterval(iv)
  }, [])

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      minWidth: '18ch',   // évite le layout shift au premier render vide
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--color-profit)',
        animation: 'atp-live-dot 2s ease-in-out infinite',
      }} />
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
        letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {state?.time ?? '--:--:--'}
      </span>
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 11, color: 'var(--color-text-3)',
      }}>
        · {state?.tz ?? '—'}
      </span>
      <style>{`
        @keyframes atp-live-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
