'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { latestFreshAnalysis, formatAnalysisScope, type AiHistoryEntry } from '@/lib/ai-history'
import { toneForRate, TONE_COLOR_VAR } from '@/lib/format'

/**
 * Insight IA #1 — Performance & Discipline.
 *
 * Répond à "qu'est-ce que je corrige dans mon trading".
 *
 * Data source : localStorage (`atp_analyses_history`) via
 * `latestFreshAnalysis(3)`. Fraîcheur = 3 jours (le user trade
 * quotidiennement, une analyse > 3j ignore déjà plusieurs
 * sessions et devient obsolète).
 *
 * Fallback : "Génère ton analyse IA" + bouton nav si absent
 * ou périmé. Persister en base = chantier séparé documenté
 * dans REFONTE.md § "Persister les analyses IA en base".
 */

interface Props {
  /**
   * Callback SPA — le shell trader utilise switch(activePage), pas
   * de routes. Le bouton "→ Analyse complète" appelle ce callback
   * avec 'analyse-ia' pour changer d'onglet.
   */
  onGoToAnalysis: () => void
}

export default function InsightIAPerf({ onGoToAnalysis }: Props) {
  // Lit localStorage côté client uniquement (SSR safe via useEffect).
  const [entry, setEntry] = useState<AiHistoryEntry | null | undefined>(undefined)

  useEffect(() => {
    setEntry(latestFreshAnalysis(3))
  }, [])

  return (
    <Card>
      <Header entry={entry ?? null} />
      {entry === undefined ? (
        <Skeleton />
      ) : entry === null ? (
        <Fallback onGoToAnalysis={onGoToAnalysis} />
      ) : (
        <Content entry={entry} onGoToAnalysis={onGoToAnalysis} />
      )}
    </Card>
  )
}

function Header({ entry }: { entry: AiHistoryEntry | null }) {
  // Sous-titre de périmètre — ne s'affiche que si une analyse est
  // chargée, sinon le fallback "génère ton analyse" prend le relais.
  const scope = entry ? formatAnalysisScope(entry) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>🧠</span>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-text-3)',
        }}>
          Insight IA
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
          marginTop: 2,
        }}>
          Performance & Discipline
        </div>
        {scope && (
          <div style={{
            fontSize: 10, color: 'var(--color-text-3)',
            marginTop: 2, fontVariantNumeric: 'tabular-nums',
          }}>
            {scope}
          </div>
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  // Aux dimensions du contenu final : verdict (2 lignes), scores row,
  // point à corriger (1 ligne), bouton. Pas de layout shift.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="animate-pulse" style={{ height: 40, background: 'var(--color-surface-2)', borderRadius: 6 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse flex-1" style={{ height: 44, background: 'var(--color-surface-2)', borderRadius: 6 }} />
        ))}
      </div>
      <div className="animate-pulse" style={{ height: 32, background: 'var(--color-surface-2)', borderRadius: 6 }} />
    </div>
  )
}

function Fallback({ onGoToAnalysis }: { onGoToAnalysis: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '20px 12px', gap: 12,
    }}>
      <p style={{
        fontSize: 13, color: 'var(--color-text-2)',
        lineHeight: 1.5, margin: 0, maxWidth: '32ch',
      }}>
        Génère ton analyse IA pour voir tes insights de performance et discipline.
      </p>
      <button
        type="button"
        onClick={onGoToAnalysis}
        style={{
          padding: '8px 16px', borderRadius: 8,
          background: 'var(--color-accent)',
          color: 'var(--color-surface-0)',
          border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 700,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-strong)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)' }}
      >
        Lancer une analyse
      </button>
    </div>
  )
}

function Content({ entry, onGoToAnalysis }: { entry: AiHistoryEntry; onGoToAnalysis: () => void }) {
  // Point à corriger : faiblesse principale en priorité, sinon stop_doing top,
  // sinon rien (les 2 sont optionnels sur les vieilles entrées).
  const point = entry.faiblesse_principale || entry.stop_doing_top

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Verdict général — tronqué à 3 lignes en col 1/3 pour cohérence
          de hauteur avec les 2 autres cartes de la rangée. */}
      <p style={{
        fontSize: 14, color: 'var(--color-text-1)',
        lineHeight: 1.55, margin: 0,
        fontStyle: 'italic',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        “{entry.verdict_general}”
      </p>

      {/* 3 mini-notes en ligne */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ScorePill label="Discipline" value={entry.scores.discipline} />
        <ScorePill label="Méthode"    value={entry.scores.methode} />
        <ScorePill label="Risque"     value={entry.scores.risk} />
      </div>

      {/* Point à corriger */}
      {point && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-surface-2)',
          borderLeft: '3px solid var(--color-warn)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--color-text-3)',
            marginBottom: 4,
          }}>
            Point à corriger
          </div>
          <div style={{
            fontSize: 13, color: 'var(--color-text-1)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {point}
          </div>
        </div>
      )}

      {/* Bouton nav */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
        <button
          type="button"
          onClick={onGoToAnalysis}
          style={{
            padding: '6px 12px', borderRadius: 6,
            background: 'transparent',
            color: 'var(--color-accent)',
            border: '1px solid rgba(var(--color-accent-rgb), 0.3)',
            cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(var(--color-accent-rgb), 0.10)'
            e.currentTarget.style.borderColor = 'var(--color-accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(var(--color-accent-rgb), 0.3)'
          }}
        >
          → Analyse complète
        </button>
      </div>
    </div>
  )
}

function ScorePill({ label, value }: { label: string; value: number }) {
  // Règle "zéro/faible n'est pas rouge" : toneForRate(value, 7) →
  //   ≥ 7 profit, sinon warn. JAMAIS loss pour une note basse
  //   (une note faible n'est pas une perte financière).
  const tone = toneForRate(value, 7)
  const color = TONE_COLOR_VAR[tone]
  return (
    <div style={{
      flex: 1,
      padding: '8px 10px',
      background: 'var(--color-surface-2)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border-subtle)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--color-text-3)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: 16, fontWeight: 700, color,
        marginTop: 2, letterSpacing: '-0.01em',
      }}>
        {value}<span style={{ fontSize: 11, color: 'var(--color-text-3)', fontWeight: 500 }}>/10</span>
      </div>
    </div>
  )
}
