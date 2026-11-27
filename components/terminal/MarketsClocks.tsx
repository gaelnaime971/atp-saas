'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { useMemberTimeZone } from '@/components/time/MemberTimeZone'
import { formatTime, offsetLabel, timeZoneLabel } from '@/lib/time'
import { placesFor } from '@/lib/terminal/clocks'

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
 * « Ton heure » = fuseau du membre (lib/time.ts : profil, sinon
 * navigateur, sinon Paris). Un clic mène au réglage dans Mon compte
 * (`settingsHref`, absent pour l'admin qui n'a pas cette page). Si le
 * fuseau du membre est celui d'une des places, cette place n'est pas
 * affichée en double.
 */

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

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: '0.6875rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-3)',
}

function timeStyle(own: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-data)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: own ? 'var(--color-accent)' : 'var(--color-text-1)',
    display: 'inline-block',
    minWidth: '5ch',   // évite le layout shift au premier render vide
    fontVariantNumeric: 'tabular-nums',
  }
}

const itemStyle = (first: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'baseline', gap: '0.5rem',
  padding: '0 0.875rem',
  borderLeft: first ? 'none' : '1px solid var(--color-border-subtle)',
  whiteSpace: 'nowrap',
})

export interface MarketsClocksProps {
  /** Lien vers le réglage du fuseau (routes Marchés). */
  settingsHref?: string
  /** Variante SPA /dashboard : ouvre Mon compte sans changer de route. */
  onSettings?: () => void
}

export default function MarketsClocks({ settingsHref, onSettings }: MarketsClocksProps) {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute)
  const { timeZone, ready } = useMemberTimeZone()
  const now = minute === null || !ready ? null : new Date(minute * 60_000)
  const places = placesFor(timeZone)
  const ownTitle = now ? `${timeZoneLabel(timeZone)} (${offsetLabel(now, timeZone)})` : undefined

  const own = (
    <>
      <span style={labelStyle}>Ton heure</span>
      <span style={timeStyle(true)}>{now ? formatTime(now, timeZone) : ' '}</span>
    </>
  )

  return (
    <ul
      aria-label="Horloges des places de marché"
      style={{ display: 'flex', alignItems: 'center', listStyle: 'none', margin: 0, padding: 0 }}
    >
      <li style={itemStyle(true)}>
        {onSettings ? (
          <button
            type="button"
            onClick={onSettings}
            title={ownTitle ? `${ownTitle} · changer de fuseau` : 'Changer de fuseau'}
            aria-label={ownTitle ? `Ton heure, ${ownTitle}. Changer de fuseau` : 'Changer de fuseau'}
            style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {own}
          </button>
        ) : settingsHref ? (
          <Link
            href={settingsHref}
            title={ownTitle ? `${ownTitle} · changer de fuseau` : 'Changer de fuseau'}
            aria-label={ownTitle ? `Ton heure, ${ownTitle}. Changer de fuseau` : 'Changer de fuseau'}
            style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', textDecoration: 'none' }}
          >
            {own}
          </Link>
        ) : (
          <span title={ownTitle} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>{own}</span>
        )}
      </li>
      {places.map(place => (
        <li key={place.label} style={itemStyle(false)}>
          <span style={labelStyle}>{place.label}</span>
          <span style={timeStyle(false)}>{now ? formatTime(now, place.timeZone) : ' '}</span>
        </li>
      ))}
    </ul>
  )
}
