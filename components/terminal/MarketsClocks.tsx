'use client'

import Link from 'next/link'
import { useMemberTimeZone } from '@/components/time/MemberTimeZone'
import { formatTime, offsetLabel, timeZoneLabel } from '@/lib/time'
import { placesFor } from '@/lib/terminal/clocks'
import { sessionState } from '@/lib/terminal/sessions'
import { useMinuteNow } from '@/lib/hooks/useMinuteNow'

/**
 * Horloges de la barre du haut Marchés : ton heure + Londres, New York,
 * Tokyo. Pas de cotations (cf. docs/design/terminal/DECISIONS.md).
 *
 * Rendu UNIQUEMENT côté client (useMinuteNow : piège d'hydratation #418),
 * cases vides de largeur réservée au premier rendu.
 *
 * Pastille ouvert/fermé de chaque place : sessions de
 * lib/terminal/sessions.ts (Londres 08:00–17:00, New York 08:00–17:00 hors
 * fériés NYSE, Tokyo 09:00–18:00, heures locales, week-ends fermés).
 *
 * « Ton heure » = fuseau du membre (lib/time.ts : profil, sinon
 * navigateur, sinon Paris). Un clic mène au réglage dans Mon compte
 * (`settingsHref`, absent pour l'admin qui n'a pas cette page). Si le
 * fuseau du membre est celui d'une des places, cette place n'est pas
 * affichée en double.
 */

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
  const minute = useMinuteNow()
  const { timeZone, ready } = useMemberTimeZone()
  const now = minute === null || !ready ? null : new Date(minute)
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
      {places.map(place => {
        const open = now ? sessionState(place.id, now.getTime()).status === 'open' : null
        return (
        <li key={place.label} style={itemStyle(false)}>
          <span
            aria-hidden
            title={open === null ? undefined : open ? 'Ouverte' : 'Fermée'}
            style={{
              width: 6, height: 6, borderRadius: 'var(--radius-full)', alignSelf: 'center',
              background: open ? 'var(--color-profit)' : 'var(--color-text-3)',
              visibility: open === null ? 'hidden' : 'visible',
            }}
          />
          <span style={labelStyle}>
            {place.label}
            {open !== null && <span className="sr-only">{open ? ', ouverte' : ', fermée'}</span>}
          </span>
          <span style={timeStyle(false)}>{now ? formatTime(now, place.timeZone) : ' '}</span>
        </li>
        )
      })}
    </ul>
  )
}
