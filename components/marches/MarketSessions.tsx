'use client'

import { useEffect, useState } from 'react'

/**
 * MarketSessions — statut live des 3 sessions majeures (Tokyo, Londres,
 * New York). Client-only strict (rendu vide au SSR pour éviter le
 * hydration mismatch #418 — les heures dépendent du fuseau).
 *
 * Ouverture / fermeture calculées sur les heures UTC des marchés
 * cash (approximation pour l'usage marketing — pas de gestion fine
 * des jours fériés / DST fin de scope).
 *
 *   Tokyo    : 00:00 → 06:00 UTC (09:00-15:00 JST)
 *   Londres  : 08:00 → 16:30 UTC (LSE)
 *   New York : 14:30 → 21:00 UTC (NYSE cash 09:30-16:00 ET, DST ignoré)
 *
 * Les futures US (ES/NQ/YM) tournent quasi 24h avec petite maintenance
 * en semaine — hors scope de cette carte (futures = watchlist plus bas).
 */

interface Session {
  id: string
  label: string
  city: string
  emoji: string
  openUtc: number   // heure UTC début (0-24)
  closeUtc: number  // heure UTC fin
}

const SESSIONS: Session[] = [
  { id: 'tokyo',  label: 'Tokyo',    city: 'Asie',     emoji: '🗼', openUtc: 0,    closeUtc: 6 },
  { id: 'london', label: 'Londres',  city: 'Europe',   emoji: '🇬🇧', openUtc: 8,    closeUtc: 16.5 },
  { id: 'ny',     label: 'New York', city: 'Amérique', emoji: '🗽', openUtc: 14.5, closeUtc: 21 },
]

function isOpen(session: Session, nowUtcHours: number): boolean {
  return nowUtcHours >= session.openUtc && nowUtcHours < session.closeUtc
}

function formatOpenClose(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} UTC`
}

export default function MarketSessions() {
  const [nowUtcHours, setNowUtcHours] = useState<number | null>(null)

  useEffect(() => {
    const update = () => {
      const d = new Date()
      setNowUtcHours(d.getUTCHours() + d.getUTCMinutes() / 60)
    }
    update()
    // Rafraîchit chaque minute (les sessions changent à la demi-heure max).
    const iv = window.setInterval(update, 60_000)
    return () => window.clearInterval(iv)
  }, [])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 16,
    }}>
      {SESSIONS.map(s => {
        // Rendu neutre au SSR (state null) — évite tout mismatch d'hydratation.
        const open = nowUtcHours == null ? null : isOpen(s, nowUtcHours)
        return <SessionCard key={s.id} session={s} open={open} />
      })}
    </div>
  )
}

function SessionCard({ session, open }: { session: Session; open: boolean | null }) {
  const color = open === null ? 'var(--color-text-3)'
    : open ? 'var(--color-profit)' : 'var(--color-text-3)'
  const label = open === null ? '—'
    : open ? 'Ouverte' : 'Fermée'

  return (
    <div style={{
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{session.emoji}</span>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)',
            }}>
              {session.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {session.city}
            </div>
          </div>
        </div>
        <StatusPill color={color} label={label} pulsing={open === true} />
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: 11, color: 'var(--color-text-3)',
        letterSpacing: '-0.01em',
      }}>
        {formatOpenClose(session.openUtc)} → {formatOpenClose(session.closeUtc)}
      </div>
    </div>
  )
}

function StatusPill({ color, label, pulsing }: { color: string; label: string; pulsing: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px',
      borderRadius: 999,
      background: color === 'var(--color-profit)'
        ? 'rgba(var(--color-profit-rgb), 0.10)'
        : 'var(--color-surface-2)',
      border: `1px solid ${color === 'var(--color-profit)' ? 'rgba(var(--color-profit-rgb), 0.30)' : 'var(--color-border-subtle)'}`,
      fontSize: 11, fontWeight: 600, color,
      letterSpacing: '0.02em',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        animation: pulsing ? 'atp-pulse 2s ease-in-out infinite' : 'none',
      }} />
      {label}
      <style>{`
        @keyframes atp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}
