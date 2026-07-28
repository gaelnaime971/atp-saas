'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import {
  latestFreshAnalysis,
  formatAnalysisScope,
  type AiHistoryEntry,
  type AiTiltSignal,
} from '@/lib/ai-history'
import { toneForRate, TONE_COLOR_VAR, type Tone } from '@/lib/format'

/**
 * Insight IA #3 — Psychologie & Mental.
 *
 * Le facteur différenciant ATP. Le LLM reçoit mood_stats +
 * meilleur_mood + notes_psycho_recentes + correlation_plan_score
 * (aucun outil concurrent ne donne ces données à son IA) et retourne
 * un bloc `analyse_mentale` structuré (verdict / tilt_signal /
 * tilt_explication / regularite_emotionnelle_note_sur_10 /
 * conseil_mental).
 *
 * Structure jumelle strict d'InsightIAPerf/Market pour former une
 * rangée cohérente. Border-left du conseil = accent (or) car c'est
 * une invite à agir, pas une alerte de perte (règle produit ATP
 * "gold = invite à agir, vert = donnée acquise, rouge = perte").
 */

interface Props {
  onGoToAnalysis: () => void
}

export default function InsightIAMental({ onGoToAnalysis }: Props) {
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
      ) : !entry.analyse_mentale ? (
        <StaleFallback onGoToAnalysis={onGoToAnalysis} />
      ) : (
        <Content entry={entry} onGoToAnalysis={onGoToAnalysis} />
      )}
    </Card>
  )
}

function Header({ entry }: { entry: AiHistoryEntry | null }) {
  const scope = entry ? formatAnalysisScope(entry) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>💭</span>
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
          Psychologie & Mental
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
  // Miroir strict des 2 autres cartes (verdict + row 2 pills + bloc + bouton).
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
        Génère ton analyse IA pour voir ton état mental et ton niveau de tilt.
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

/**
 * Fallback spécifique quand une analyse existe mais date d'AVANT
 * l'enrichissement prompt (pas de champ analyse_mentale). On invite
 * à régénérer plutôt qu'à "lancer une analyse" — le message est
 * différent, c'est un cas dégradé rétrocompat, pas une absence totale.
 */
function StaleFallback({ onGoToAnalysis }: { onGoToAnalysis: () => void }) {
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
        Régénère ton analyse pour débloquer le bloc mental (ta dernière analyse est antérieure à cet enrichissement).
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
        → Régénérer
      </button>
    </div>
  )
}

// Enum → tone sémantique. Note: FORT mappé sur 'loss' (rouge) alors que
// ce n'est pas une perte financière — décision produit assumée : un tilt
// fort est un red flag visuel critique, la couleur d'alarme prend le pas
// sur la règle stricte "loss = argent".
const TONE_FOR_TILT: Record<AiTiltSignal, Tone> = {
  AUCUN:  'profit',
  FAIBLE: 'neutral',
  MODERE: 'warn',
  FORT:   'loss',
}

// Affichage avec accent français quand pertinent (le prompt renvoie
// des enums sans accent pour éviter les soucis d'encoding JSON).
const TILT_LABEL: Record<AiTiltSignal, string> = {
  AUCUN:  'AUCUN',
  FAIBLE: 'FAIBLE',
  MODERE: 'MODÉRÉ',
  FORT:   'FORT',
}

function Content({ entry, onGoToAnalysis }: { entry: AiHistoryEntry; onGoToAnalysis: () => void }) {
  const mental = entry.analyse_mentale!  // gardé par le check parent
  const tiltTone = TONE_FOR_TILT[mental.tilt_signal] ?? 'neutral'
  const tiltColor = TONE_COLOR_VAR[tiltTone]
  const regTone = toneForRate(mental.regularite_emotionnelle_note_sur_10, 7)
  const regColor = TONE_COLOR_VAR[regTone]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Verdict mental — italique, tronqué à 3 lignes proprement */}
      <p style={{
        fontSize: 14, color: 'var(--color-text-1)',
        lineHeight: 1.55, margin: 0,
        fontStyle: 'italic',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        “{mental.verdict}”
      </p>

      {/* 2 pills : Tilt (enum coloré) + Régularité (note /10) */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ValuePill label="Tilt" value={TILT_LABEL[mental.tilt_signal] ?? mental.tilt_signal} color={tiltColor} />
        <ScorePill label="Régularité" value={mental.regularite_emotionnelle_note_sur_10} color={regColor} />
      </div>

      {/* Conseil mental — border-left accent (or = invite à agir) */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--color-surface-2)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 'var(--radius-md)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-3)',
          marginBottom: 4,
        }}>
          Conseil mental
        </div>
        <div style={{
          fontSize: 13, color: 'var(--color-text-1)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {mental.conseil_mental}
        </div>
      </div>

      {/* Bouton nav — même style que les 2 autres cartes */}
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

// Pill pour une valeur enum affichée telle quelle (ex TILT: MODÉRÉ).
function ValuePill({ label, value, color }: { label: string; value: string; color: string }) {
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
        fontSize: 16, fontWeight: 700, color,
        marginTop: 2, letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  )
}

// Pill pour une note /10 (miroir strict du ScorePill de InsightIAPerf).
function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
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
        fontSize: 16, fontWeight: 700, color,
        marginTop: 2, letterSpacing: '-0.01em',
      }}>
        {value}<span style={{ fontSize: 11, color: 'var(--color-text-3)', fontWeight: 500 }}>/10</span>
      </div>
    </div>
  )
}
