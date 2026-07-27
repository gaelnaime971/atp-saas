'use client'

import { useEffect, useRef, useCallback, type ReactNode, type KeyboardEvent } from 'react'

/**
 * Modal — shell standard pour toutes les modales admin + trader.
 *
 * A11y non négociable :
 *   1. Focus trap : Tab et Shift+Tab cyclent uniquement dans le modal.
 *   2. Focus initial : le premier élément focusable reçoit le focus à
 *      l'ouverture (ou le container si aucun).
 *   3. Focus retour : à la fermeture, le focus revient à l'élément qui
 *      a déclenché l'ouverture — celui qui avait focus juste avant.
 *   4. Escape : ferme le modal (sauf si `dismissible={false}`).
 *   5. Scroll lock : body devient overflow:hidden pendant que le modal est
 *      ouvert, restauré à la fermeture.
 *   6. Rôle `dialog` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`
 *      quand title/description sont fournis.
 *   7. Click sur le scrim ferme (sauf `dismissible={false}`).
 *
 * Absorbe les 12 wrappers `fixed inset-0 z-50 flex…` du codebase.
 */

export interface ModalProps {
  /** Contrôle l'ouverture. Quand `false`, le composant retourne null. */
  open: boolean
  /** Appelé sur : clic scrim, Escape, bouton close. */
  onClose: () => void

  /** Titre en header. Établit aria-labelledby. */
  title?: ReactNode
  /** Description sous le titre. Établit aria-describedby. */
  description?: ReactNode
  /** Contenu principal (formulaire, texte…). */
  children: ReactNode
  /** Footer typiquement : boutons Annuler + Confirmer. */
  footer?: ReactNode

  /** Largeur max. Défaut `md` (28rem). */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /**
   * Autoriser la fermeture par scrim/Escape.
   * Passer `false` pendant un submit async pour éviter fermeture accidentelle.
   * Défaut `true`.
   */
  dismissible?: boolean
  /** Ajouter/masquer le bouton "✕" en haut à droite. Défaut `true`. */
  showCloseButton?: boolean
  /**
   * Supprimer le padding standard 1.25rem/1.5rem autour de children.
   * Utile pour les layouts full-width : grid 2-cols form+preview,
   * wizard avec stepper header custom, media player. Défaut `false`.
   */
  noPadding?: boolean
  /** Classe additionnelle sur le panel (pas le scrim). */
  className?: string
}

const SIZE_MAP: Record<NonNullable<ModalProps['size']>, string> = {
  sm:   'min(28rem, calc(100vw - 2rem))',
  md:   'min(32rem, calc(100vw - 2rem))',
  lg:   'min(48rem, calc(100vw - 2rem))',
  xl:   'min(64rem, calc(100vw - 2rem))',
  full: 'calc(100vw - 2rem)',
}

// ─────────────────────────────────────────────────────────
// Focus trap helpers
// ─────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    el => !el.hasAttribute('inert') && el.offsetParent !== null,
  )
}

// ═══════════════════════════════════════════════════════════════
// Modal
// ═══════════════════════════════════════════════════════════════

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  showCloseButton = true,
  noPadding = false,
  className = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerElRef = useRef<HTMLElement | null>(null)

  // ─── Save trigger + scroll lock + return focus on close ───
  useEffect(() => {
    if (!open) return

    // Save the element that had focus before opening (typically the trigger button).
    // We restore focus to it on close for keyboard-driven users.
    triggerElRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Body scroll lock — save & restore
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      // Return focus to trigger (guarded — the trigger may no longer be in the DOM)
      const trigger = triggerElRef.current
      if (trigger && document.body.contains(trigger)) {
        // Defer to next tick so React finishes teardown before we move focus.
        requestAnimationFrame(() => trigger.focus())
      }
    }
  }, [open])

  // ─── Initial focus inside the panel ────────────────────────
  useEffect(() => {
    if (!open || !panelRef.current) return
    const focusables = getFocusableElements(panelRef.current)
    // Prefer the first focusable child; fall back to the panel itself.
    const target = focusables[0] ?? panelRef.current
    // Defer so we win against re-renders that happen right after open.
    const id = requestAnimationFrame(() => target.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // ─── Keyboard: Escape + Tab focus trap ─────────────────────
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const root = panelRef.current
      if (!root) return
      const focusables = getFocusableElements(root)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        // Shift+Tab from first → wrap to last
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab from last → wrap to first
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onClose, dismissible],
  )

  if (!open) return null

  // ─── IDs for aria-labelledby / aria-describedby ────────────
  // Deterministic per-render is fine — React reconciler will keep them stable
  // for the lifetime of the open state (component unmounts on close).
  const titleId = title ? 'modal-title' : undefined
  const descId = description ? 'modal-desc' : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onKeyDown={onKeyDown}
      onMouseDown={e => {
        // Click on the scrim (not the panel) closes.
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        background: 'var(--color-scrim, rgba(0, 0, 0, 0.7))',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={className}
        style={{
          width: SIZE_MAP[size],
          maxHeight: 'calc(100vh - 2rem)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-3)',
          outline: 'none',
        }}
      >
        {(title || showCloseButton) && (
          <header
            style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: '1rem',
              padding: '1.25rem 1.5rem',
              borderBottom: title ? '1px solid var(--color-border-subtle)' : 'none',
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              {title && (
                <h2
                  id={titleId}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.0625rem',   // 17px, aligned with card title
                    fontWeight: 600,
                    color: 'var(--color-text-1)',
                    margin: 0,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descId}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-body)',
                    color: 'var(--color-neutral)',
                    margin: title ? '0.25rem 0 0' : 0,
                    lineHeight: 1.5,
                  }}
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                disabled={!dismissible}
                style={{
                  flexShrink: 0,
                  width: 32, height: 32,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-3)',
                  cursor: dismissible ? 'pointer' : 'not-allowed',
                  fontSize: 18,
                  lineHeight: 1,
                  opacity: dismissible ? 1 : 0.4,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (dismissible) e.currentTarget.style.background = 'var(--color-surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        <div
          style={{
            padding: noPadding ? 0 : '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          {children}
        </div>

        {footer && (
          <footer
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              flexShrink: 0,
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
