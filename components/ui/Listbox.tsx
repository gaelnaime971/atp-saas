'use client'

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { listboxNextIndex } from '@/lib/ui/listbox'

/**
 * Listbox — liste de choix aux couleurs de l'app, à la place d'un
 * <select size> natif (sélection gris clair, police système).
 *
 * Motif ARIA « listbox » : le conteneur prend le focus, l'option active
 * est annoncée par aria-activedescendant ; ↑ ↓ Début Fin Page↑ Page↓
 * déplacent, Entrée ou Espace choisissent, clic ou toucher aussi.
 * Groupes facultatifs (en-têtes collants). Uniquement des tokens.
 */

export interface ListboxOption {
  value: string
  label: ReactNode
  /** Texte secondaire à droite (ex. « UTC−4 »). */
  hint?: ReactNode
  /** Texte pour les lecteurs d'écran si `label` n'est pas une chaîne. */
  textValue?: string
}

export interface ListboxGroup {
  label: string
  options: ListboxOption[]
}

export interface ListboxProps {
  groups: ListboxGroup[]
  value: string | null
  onChange: (value: string) => void
  /** id de l'élément qui nomme la liste (label visible). */
  labelledBy?: string
  id?: string
  /** Hauteur maximale avant défilement interne. */
  maxHeight?: number
  emptyText?: ReactNode
}

export default function Listbox({ groups, value, onChange, labelledBy, id, maxHeight = 264, emptyText }: ListboxProps) {
  const autoId = useId()
  const baseId = id ?? autoId
  const flat = useMemo(() => groups.flatMap(g => g.options), [groups])
  const selectedIndex = flat.findIndex(o => o.value === value)
  const [active, setActive] = useState<number>(-1)
  const activeIndex = active >= 0 && active < flat.length ? active : selectedIndex
  const optionId = (i: number) => `${baseId}-opt-${i}`

  // Garde l'option active visible (clavier, ou sélection hors champ).
  useEffect(() => {
    if (activeIndex < 0) return
    const el = document.getElementById(optionId(activeIndex))
    el?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) {
      e.preventDefault()
      onChange(flat[activeIndex].value)
      return
    }
    const next = listboxNextIndex(e.key, activeIndex, flat.length)
    if (next === null) return
    e.preventDefault()
    setActive(next)
  }

  if (flat.length === 0) {
    return (
      <div style={{ padding: '0.75rem', fontSize: 12, color: 'var(--color-text-3)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
        {emptyText ?? 'Aucun résultat.'}
      </div>
    )
  }

  let index = -1
  return (
    <div
      id={baseId}
      role="listbox"
      tabIndex={0}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(-1)}
      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
      style={{
        maxHeight, overflowY: 'auto', overscrollBehavior: 'contain',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 4,
      }}
    >
      {groups.filter(g => g.options.length > 0).map(group => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div
            aria-hidden
            style={{
              position: 'sticky', top: -4, zIndex: 1,
              background: 'var(--color-surface-2)',
              padding: '8px 10px 4px',
              fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--color-text-3)',
            }}
          >
            {group.label}
          </div>
          {group.options.map(option => {
            index += 1
            const i = index
            const selected = option.value === value
            const isActive = i === activeIndex
            return (
              <div
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setActive(i); onChange(option.value) }}
                onMouseEnter={() => setActive(i)}
                className="min-h-11 md:min-h-9"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '6px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: selected ? 'var(--color-accent-soft)' : isActive ? 'var(--color-surface-3)' : 'transparent',
                  color: selected ? 'var(--color-accent)' : 'var(--color-text-1)',
                  fontSize: 13, fontWeight: selected ? 600 : 400,
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden style={{ width: 12, flexShrink: 0, color: 'var(--color-accent)' }}>{selected ? '✓' : ''}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.label}</span>
                </span>
                {option.hint && (
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: selected ? 'var(--color-accent)' : 'var(--color-text-3)', flexShrink: 0 }}>
                    {option.hint}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
