'use client'

/**
 * BloombergLive — embed YouTube du live Bloomberg TV.
 *
 * URL fournie par le user (stream fixe) : QB5BNdBFujE. YouTube-nocookie
 * pour privacy (n'attache pas de cookies tracking sur le domaine). Muted
 * par défaut (obligatoire pour l'autoplay policy de tous les navigateurs
 * modernes). Le user active le son à la volée via les controls YouTube.
 *
 * Ratio 16:9 préservé via aspect-ratio CSS — le parent définit la
 * largeur, la hauteur suit. Pas de layout shift.
 */

const BLOOMBERG_LIVE_ID = 'QB5BNdBFujE'

export default function BloombergLive() {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '16 / 9',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      border: '1px solid var(--color-border-subtle)',
      background: '#000',
    }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${BLOOMBERG_LIVE_ID}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1&iv_load_policy=3`}
        title="Bloomberg TV en direct"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
    </div>
  )
}
