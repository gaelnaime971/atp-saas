'use client'

import { useSyncExternalStore } from 'react'

/**
 * Horloges de la barre du haut Marchés : ton heure + Londres, New York,
 * Tokyo. Pas de cotations (cf. docs/design/terminal/DECISIONS.md).
 *
 * Rendu UNIQUEMENT côté client, comme TopbarDate dans app/dashboard :
 * au SSR le serveur (UTC chez Vercel) et le navigateur n'ont pas la même
 * heure → HTML différent → React hydration mismatch #418. Ici via
 * useSyncExternalStore : le snapshot serveur vaut null, React hydrate
 * avec des cases vides (largeur réservée) puis passe à l'heure client.
 *
 * « Ton heure » = fuseau du navigateur en attendant profiles.timezone
 * (étape 2, couche fuseau).
 */

const CLOCKS: { label: string; timeZone?: string }[] = [
  { label: 'Ton heure' },
  { label: 'Londres', timeZone: 'Europe/London' },
  { label: 'New York', timeZone: 'America/New_York' },
  { label: 'Tokyo', timeZone: 'Asia/Tokyo' },
]

function fmt(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone }).format(date)
}

// Store « minute courante » : le snapshot (n° de minute) ne change
// qu'une fois par minute, le tic est calé sur le changement de minute.
function subscribeMinute(onChange: () => void) {
  let interval: ReturnType<typeof setInterval> | undefined
  const timeout = setTimeout(() => {
    onChange()
    interval = setInterval(onChange, 60_000)
  }, 60_000 - (Date.now() % 60_000) + 50)
  return () => {
    clearTimeout(timeout)
    if (interval) clearInterval(interval)
  }
}
const getMinute = () => Math.floor(Date.now() / 60_000)
const getServerMinute = () => null

export default function MarketsClocks() {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute)
  const now = minute === null ? null : new Date(minute * 60_000)

  return (
    <ul
      aria-label="Horloges des places de marché"
      style={{ display: 'flex', alignItems: 'center', listStyle: 'none', margin: 0, padding: 0 }}
    >
      {CLOCKS.map((clock, i) => (
        <li
          key={clock.label}
          style={{
            display: 'flex', alignItems: 'baseline', gap: '0.5rem',
            padding: '0 0.875rem',
            borderLeft: i === 0 ? 'none' : '1px solid var(--color-border-subtle)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: '0.6875rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
            }}
          >
            {clock.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: i === 0 ? 'var(--color-accent)' : 'var(--color-text-1)',
              display: 'inline-block',
              minWidth: '5ch',   // évite le layout shift au premier render vide
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {now ? fmt(now, clock.timeZone) : ' '}
          </span>
        </li>
      ))}
    </ul>
  )
}
