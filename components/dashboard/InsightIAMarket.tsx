'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { latestFreshAnalysis, type AiHistoryEntry } from '@/lib/ai-history'

/**
 * Insight IA #2 — Marché & Setup.
 *
 * Répond à "où je concentre mes trades".
 *
 * Structure jumelle de InsightIAPerf (même en-tête, même hauteur,
 * mêmes rythmes visuels) pour former une paire équilibrée dans la
 * rangée 1 du Dashboard.
 *
 * Miroir de #1 : "Point à corriger" ambre → "Ce qui marche" vert.
 * Même source (localStorage `atp_analyses_history`), même seuil
 * de fraîcheur (3 jours), même fallback pattern.
 */

interface Props {
  /** Callback SPA — navigation vers l'onglet AnalyseIA. */
  onGoToAnalysis: () => void
}

export default function InsightIAMarket({ onGoToAnalysis }: Props) {
  const [entry, setEntry] = useState<AiHistoryEntry | null | undefined>(undefined)

  useEffect(() => {
    setEntry(latestFreshAnalysis(3))
  }, [])

  return (
    <Card>
      <Header />
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

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>🎯</span>
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
          Marché & Setup
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  // Dimensions équivalentes à InsightIAPerf (verdict + row + bloc + bouton).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="animate-pulse" style={{ height: 40, background: 'var(--color-surface-2)', borderRadius: 6 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="animate-pulse flex-1" style={{ height: 44, background: 'var(--color-surface-2)', borderRadius: 6 }} />
        <div className="animate-pulse flex-1" style={{ height: 44, background: 'var(--color-surface-2)', borderRadius: 6 }} />
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
        Génère ton analyse IA pour voir sur quel marché et quel setup te concentrer.
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
  const inst = entry.top_instrument
  const pattern = entry.top_pattern
  // "Ce qui marche" utilise `inst.conseil` (axe positif d'action sur le top
  // instrument). keep_doing[0] pourrait être ajouté à AiHistoryEntry en v2
  // si un signal encore plus explicite est voulu.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Verdict du top instrument (miroir du verdict général de #1) */}
      {inst ? (
        <p style={{
          fontSize: 14, color: 'var(--color-text-1)',
          lineHeight: 1.55, margin: 0,
          fontStyle: 'italic',
        }}>
          “{inst.verdict}”
        </p>
      ) : (
        <p style={{
          fontSize: 13, color: 'var(--color-text-3)',
          lineHeight: 1.5, margin: 0,
        }}>
          Pas assez d&apos;instruments distincts dans ton analyse pour un focus marché.
        </p>
      )}

      {/* 2 pills : Top instrument + Top pattern (miroir des 3 scores de #1) */}
      <div style={{ display: 'flex', gap: 8 }}>
        <InfoPill label="Top instrument" value={inst?.instrument ?? '—'} />
        <InfoPill label="Top pattern"    value={pattern ?? '—'} />
      </div>

      {/* Ce qui marche — miroir "Point à corriger" mais tone profit */}
      {inst?.conseil && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-surface-2)',
          borderLeft: '3px solid var(--color-profit)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--color-text-3)',
            marginBottom: 4,
          }}>
            Ce qui marche
          </div>
          <div style={{
            fontSize: 13, color: 'var(--color-text-1)',
            lineHeight: 1.4,
          }}>
            {inst.conseil}
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
          → Voir tous les instruments
        </button>
      </div>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  // Miroir de ScorePill de #1 : même hauteur/padding pour équilibrer la paire.
  return (
    <div style={{
      flex: 1, minWidth: 0,
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
        fontSize: 16, fontWeight: 700, color: 'var(--color-text-1)',
        marginTop: 2, letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  )
}
