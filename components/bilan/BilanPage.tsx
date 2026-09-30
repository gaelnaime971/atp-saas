'use client'

/**
 * BilanPage — page trader qui embarque l'outil bilan (fichier HTML statique
 * dans /public) et synchronise son state avec Supabase via postMessage.
 *
 * L'iframe est isolée : elle garde toute sa logique interne (rendering,
 * calculs, animations) et communique avec React via 2 messages seulement :
 *   - iframe → parent : { type: 'BILAN_STATE', payload: S }
 *   - parent → iframe : { type: 'BILAN_LOAD',  payload: (mapping BilanState → S) }
 *
 * Le mapping S ↔ BilanState est appliqué ICI (pas dans le hook, qui parle
 * exclusivement le format Supabase).
 *   S.ans          ↔ answers        S.res?.alpha  ↔ alpha_score
 *   S.hz           ↔ horizon_weeks  S.res?.arch?.n↔ archetype
 *   S.res?.scores  ↔ scores         S.checks      ↔ checks
 *   S.completedAt  ↔ completed_at   S.profile     ↔ profile
 */

import { useCallback, useEffect, useRef } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import { useBilan, type BilanState } from '@/lib/bilan/useBilan'

const IFRAME_SRC = '/bilan_trader_2027.html'
const TOTAL_QUESTIONS = 71

// ─────────────────────────────────────────────────────────────────────
// Types minimaux du state côté HTML (S) — pour typer les postMessage
// ─────────────────────────────────────────────────────────────────────

interface SFromIframe {
  profile?: Record<string, unknown>
  ans?: Record<string, Record<string, number>>
  hz?: number
  checks?: Record<string, boolean>
  res?: {
    alpha?: number
    arch?: { n?: string }
    scores?: Record<string, number>
  } | null
  completedAt?: string | null
}

// ─────────────────────────────────────────────────────────────────────
// Mappings S ↔ BilanState
// ─────────────────────────────────────────────────────────────────────

function sToBilanPatch(s: SFromIframe): Partial<BilanState> {
  const rawHz = s.hz ?? 8
  const hz = (rawHz === 4 || rawHz === 8 || rawHz === 12 ? rawHz : 8) as 4 | 8 | 12
  return {
    profile: s.profile as Partial<BilanState['profile']>,
    answers: (s.ans ?? {}) as Record<number, Record<number, number>>,
    horizon_weeks: hz,
    checks: s.checks ?? {},
    scores: s.res?.scores ?? {},
    alpha_score: s.res?.alpha ?? null,
    archetype: s.res?.arch?.n ?? null,
    completed_at: s.completedAt ?? null,
  }
}

/** Convertit BilanState → payload BILAN_LOAD pour l'iframe. Le HTML re-calcule
 *  S.res à partir de S.ans dans son handler (via calcResults) si completedAt. */
function bilanToLoadPayload(b: BilanState) {
  return {
    profile: b.profile,
    ans: b.answers,
    hz: b.horizon_weeks,
    checks: b.checks,
    completedAt: b.completed_at,
  }
}

function countAnswers(answers: Record<number, Record<number, number>> | undefined): number {
  if (!answers) return 0
  let n = 0
  for (const themeKey in answers) {
    n += Object.keys(answers[themeKey] ?? {}).length
  }
  return n
}

// ─────────────────────────────────────────────────────────────────────
// Composant
// ─────────────────────────────────────────────────────────────────────

export default function BilanPage() {
  const { bilan, isLoading, saveBilan, resetBilan } = useBilan()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  /** Empêche de re-émettre BILAN_LOAD à chaque render — remis à false après reset. */
  const hasLoadedRef = useRef(false)

  // ─── Listener : iframe → parent (BILAN_STATE) ──────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return
      if ((e.data as { type?: string }).type !== 'BILAN_STATE') return
      const payload = (e.data as { payload?: SFromIframe }).payload
      if (!payload) return
      saveBilan(sToBilanPatch(payload))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [saveBilan])

  // ─── Émission BILAN_LOAD dès que bilan ET iframe sont prêts ────────
  // Le bilan (Supabase) et l'iframe (HTML) chargent en parallèle. On tente
  // d'envoyer BILAN_LOAD à chaque changement de bilan, mais UNE SEULE FOIS
  // (hasLoadedRef). handleIframeLoad couvre le cas "iframe prête après bilan",
  // ce useEffect couvre "bilan prêt après iframe".
  useEffect(() => {
    if (hasLoadedRef.current) return
    if (!bilan) return
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage({ type: 'BILAN_LOAD', payload: bilanToLoadPayload(bilan) }, '*')
    hasLoadedRef.current = true
  }, [bilan])

  const handleIframeLoad = useCallback(() => {
    if (hasLoadedRef.current) return
    if (!bilan) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'BILAN_LOAD', payload: bilanToLoadPayload(bilan) },
      '*',
    )
    hasLoadedRef.current = true
  }, [bilan])

  // ─── Reset : re-arme BILAN_LOAD pour rafraîchir l'iframe au nouveau bilan ─
  const handleReset = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm(
      'Recommencer un nouveau bilan ? Le bilan actuel sera archivé et un nouveau vide sera créé.',
    )) return
    hasLoadedRef.current = false
    await resetBilan()
  }, [resetBilan])

  // ─── Progression + badge ───────────────────────────────────────────
  const answered = countAnswers(bilan?.answers)
  const isCompleted = !!bilan?.completed_at
  const percent = Math.min(100, Math.round((answered / TOTAL_QUESTIONS) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Bilan Trader 2027"
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Badge tone={isCompleted ? 'profit' : 'accent'}>
              {isCompleted ? 'Complété' : 'En cours'}
            </Badge>
            {isLoading ? (
              <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>Chargement…</span>
            ) : (
              <span
                style={{
                  color: 'var(--color-text-3)',
                  fontSize: 12,
                  fontFamily: 'var(--font-data)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {answered} / {TOTAL_QUESTIONS} réponses · {percent} %
              </span>
            )}
          </span>
        }
        actions={
          isCompleted ? (
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent)',
                color: 'var(--color-surface-0)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                transition: 'background var(--motion-fast, 120ms) var(--motion-ease-out, ease-out)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)' }}
            >
              Nouveau bilan 2027
            </button>
          ) : undefined
        }
      />

      {/* Barre de progression globale (--color-accent) */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progression du bilan : ${answered} sur ${TOTAL_QUESTIONS} réponses`}
        style={{
          height: 4,
          background: 'var(--color-surface-2)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: 'var(--color-accent)',
            transition: 'width var(--motion-base, 200ms) var(--motion-ease-out, ease-out)',
          }}
        />
      </div>

      {/* Iframe plein écran — height calc(100vh - 120px) selon spec.
          Le shell trader (padding p-7 = 28px, topbar ~60px) laisse ~110px
          de chrome — 120 sécurise sans overflow. */}
      <div
        style={{
          height: 'calc(100vh - 120px)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle)',
          background: 'var(--color-surface-1)',
        }}
      >
        <iframe
          ref={iframeRef}
          src={IFRAME_SRC}
          title="Bilan Trader 2027"
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    </div>
  )
}
