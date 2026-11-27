'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { useMemberTimeZone } from '@/components/time/MemberTimeZone'
import { matchesTimeZone, offsetLabel, timeZoneLabel, timeZoneOptions } from '@/lib/time'

/**
 * Mon compte › Fuseau horaire. Les fuseaux des membres en tête (Paris,
 * Antilles, Guyane, Réunion, Bruxelles, Genève, Montréal), puis la liste
 * complète du moteur Intl, filtrable. Chaque libellé porte le décalage
 * actuel (« Guadeloupe · UTC−4 »).
 *
 * Ancre #fuseau : la barre du haut de Marchés y mène (« Ton heure »).
 */
export default function TimeZoneSettings() {
  const { timeZone, source, ready, saveTimeZone } = useMemberTimeZone()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const searchRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const searchId = useId()
  const listId = useId()

  // Instant de référence des décalages, figé au montage (ils changent
  // 2 fois par an) : rendu pur.
  const [now] = useState(() => Date.now())
  const options = useMemo(
    () => timeZoneOptions().map(o => ({ ...o, offset: offsetLabel(now, o.id) })),
    [now],
  )
  const filtered = useMemo(() => options.filter(o => matchesTimeZone(o, query)), [options, query])
  const featured = filtered.filter(o => o.featured)
  const others = filtered.filter(o => !o.featured)

  const current = selected ?? timeZone

  useEffect(() => {
    if (window.location.hash !== '#fuseau') return
    sectionRef.current?.scrollIntoView({ block: 'start' })
    searchRef.current?.focus({ preventScroll: true })
  }, [])

  async function handleSave() {
    if (!selected || selected === timeZone) return
    setStatus('saving')
    try {
      await saveTimeZone(selected)
      setSelected(null)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setStatus('error')
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-label)', fontWeight: 500,
    color: 'var(--color-text-2)', marginBottom: 6,
  }
  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    background: 'var(--color-surface-2)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-1)', fontSize: 13, outline: 'none',
  }

  return (
    <Card>
      <div id="fuseau" ref={sectionRef} style={{ scrollMarginTop: 80 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--color-border-subtle)' }}>
          Fuseau horaire
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-2)', margin: '0 0 4px 0', lineHeight: 1.5 }}>
          Ton heure : <strong style={{ color: 'var(--color-text-1)' }}>{ready ? `${timeZoneLabel(timeZone)} (${offsetLabel(now, timeZone)})` : '…'}</strong>
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
          {source === 'browser' && 'Détecté depuis ton navigateur. '}
          {source === 'default' && ready && 'Par défaut. '}
          Toutes les heures de l’espace Marchés (sessions, ouvertures, annonces) s’affichent dans ce fuseau, changements d’heure compris.
        </p>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor={searchId} style={labelStyle}>Rechercher une ville ou un fuseau</label>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ex. Guadeloupe, Montréal, Dakar"
            autoComplete="off"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor={listId} style={labelStyle}>Fuseau</label>
          <select
            id={listId}
            size={8}
            value={filtered.some(o => o.id === current) ? current : ''}
            onChange={e => { setSelected(e.target.value); setStatus('idle') }}
            style={{ ...fieldStyle, padding: 4, fontFamily: 'var(--font-data)', fontSize: 12 }}
          >
            {featured.length > 0 && (
              <optgroup label="Membres ATP">
                {featured.map(o => <option key={o.id} value={o.id}>{o.label} · {o.offset}</option>)}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Tous les fuseaux">
                {others.map(o => <option key={o.id} value={o.id}>{o.label} · {o.offset}</option>)}
              </optgroup>
            )}
          </select>
          {filtered.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '6px 0 0 0' }}>Aucun fuseau ne correspond.</p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={status === 'saving'}
            disabled={!ready || !selected || selected === timeZone}
          >
            {status === 'saved' ? 'Fuseau enregistré' : 'Enregistrer'}
          </Button>
          {selected && selected !== timeZone && (
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
              {timeZoneLabel(selected)} · {offsetLabel(now, selected)}
            </span>
          )}
          {status === 'error' && (
            <span role="alert" style={{ fontSize: 11, color: 'var(--color-loss)' }}>Enregistrement impossible, réessaie.</span>
          )}
        </div>
      </div>
    </Card>
  )
}
