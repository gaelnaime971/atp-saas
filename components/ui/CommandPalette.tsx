'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CommandItem<Id extends string> {
  id: Id
  label: string
  /** Nom du groupe d'origine (ex "Aujourd'hui") — affiché en badge discret à droite. */
  groupLabel?: string
  icon?: ReactNode
}

export interface CommandPaletteProps<Id extends string> {
  open: boolean
  onClose: () => void
  items: CommandItem<Id>[]
  onSelect: (id: Id) => void
  /** Placeholder de l'input. Défaut : "Aller à…" */
  placeholder?: string
}

// ═══════════════════════════════════════════════════════════════
// Fuzzy-ish filter (substring case-insensitive, ordre préservé)
// ═══════════════════════════════════════════════════════════════

function filterItems<Id extends string>(items: CommandItem<Id>[], query: string): CommandItem<Id>[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(i => i.label.toLowerCase().includes(q) || (i.groupLabel?.toLowerCase().includes(q) ?? false))
}

// ═══════════════════════════════════════════════════════════════
// CommandPalette
// ═══════════════════════════════════════════════════════════════

export default function CommandPalette<Id extends string>({
  open, onClose, items, onSelect, placeholder = 'Aller à…',
}: CommandPaletteProps<Id>) {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerElRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => filterItems(items, query), [items, query])

  // Reset state on open, save trigger, lock body scroll
  useEffect(() => {
    if (!open) return
    triggerElRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setHighlightIndex(0)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prevOverflow
      const trigger = triggerElRef.current
      if (trigger && document.body.contains(trigger)) {
        requestAnimationFrame(() => trigger.focus())
      }
    }
  }, [open])

  // Clamp highlightIndex when filter changes
  useEffect(() => {
    if (highlightIndex >= filtered.length) setHighlightIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, highlightIndex])

  // Keep highlighted item in view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  const commit = useCallback((index: number) => {
    const item = filtered[index]
    if (!item) return
    onSelect(item.id)
    onClose()
  }, [filtered, onSelect, onClose])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(highlightIndex)
    }
  }, [filtered.length, highlightIndex, commit, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Palette de navigation"
      onKeyDown={onKeyDown}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        padding: '15vh 1rem 1rem',
        background: 'var(--color-scrim, rgba(0, 0, 0, 0.6))',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          width: 'min(38rem, calc(100vw - 2rem))',
          maxHeight: '60vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-3)',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.875rem 1rem',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--color-text-3)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlightIndex(0) }}
            placeholder={placeholder}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none', outline: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: '0.9375rem',   // 15px
              color: 'var(--color-text-1)',
            }}
          />
          <kbd
            style={{
              fontSize: '0.6875rem',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-3)',
              fontFamily: 'var(--font-data)',
              flexShrink: 0,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 'var(--text-body)' }}>
            Aucun résultat pour <span style={{ color: 'var(--color-text-2)' }}>« {query} »</span>
          </div>
        ) : (
          <ul
            ref={listRef}
            style={{ listStyle: 'none', margin: 0, padding: '0.375rem', overflowY: 'auto', flex: 1 }}
          >
            {filtered.map((item, i) => {
              const active = i === highlightIndex
              return (
                <li key={item.id} data-index={i}>
                  <button
                    type="button"
                    onClick={() => commit(i)}
                    onMouseMove={() => setHighlightIndex(i)}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'transparent',
                      color: active ? 'var(--color-accent)' : 'var(--color-text-1)',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-body)',
                      textAlign: 'left',
                      transition: 'background 0.10s',
                    }}
                  >
                    {item.icon && (
                      <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: active ? 'var(--color-accent)' : 'var(--color-text-3)' }}>
                        {item.icon}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {item.groupLabel && (
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: 'var(--color-text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          flexShrink: 0,
                        }}
                      >
                        {item.groupLabel}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Footer hint */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.5rem 1rem',
            borderTop: '1px solid var(--color-border-subtle)',
            fontSize: '0.6875rem',
            color: 'var(--color-text-3)',
            fontFamily: 'var(--font-display)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span><kbd style={kbdStyle}>↑</kbd> <kbd style={kbdStyle}>↓</kbd> Naviguer</span>
            <span><kbd style={kbdStyle}>↵</kbd> Ouvrir</span>
          </div>
          <span>{filtered.length} {filtered.length === 1 ? 'résultat' : 'résultats'}</span>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border-subtle)',
  fontFamily: 'var(--font-data)',
  fontSize: '0.6875rem',
}

// ═══════════════════════════════════════════════════════════════
// Helpers pour aplatir groupes + items footer en une liste plate
// ═══════════════════════════════════════════════════════════════

interface GroupLike<Id extends string> {
  label: string
  items: { id: Id; label: string; icon?: ReactNode }[]
}

interface FooterItemLike<Id extends string> {
  id: Id
  label: string
  icon?: ReactNode
}

export function flattenNavForPalette<Id extends string>(
  groups: GroupLike<Id>[],
  footerItems: FooterItemLike<Id>[] = [],
  footerGroupLabel: string = 'Compte',
): CommandItem<Id>[] {
  const out: CommandItem<Id>[] = []
  for (const g of groups) {
    for (const item of g.items) {
      out.push({ id: item.id, label: item.label, icon: item.icon, groupLabel: g.label })
    }
  }
  for (const item of footerItems) {
    out.push({ id: item.id, label: item.label, icon: item.icon, groupLabel: footerGroupLabel })
  }
  return out
}
