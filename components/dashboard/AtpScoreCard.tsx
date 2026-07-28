'use client'

import { useMemo } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import Card from '@/components/ui/Card'
import { atpScore, type AtpTone } from '@/lib/session-stats'
import type { TradingSession } from '@/lib/types'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * ATP Score — carte data pure, sans dépendance IA.
 *
 * Calcule 6 axes normalisés 0-100 sur les sessions passées (Win Rate,
 * Profit Factor, Respect plan, Régularité, R:R, Gestion du risque),
 * dérive une note globale (moyenne des axes valides, minimum 3 axes)
 * et attribue un palier qualitatif :
 *
 *   score < 40  → "À travailler"  (warn ambre)
 *   score < 60  → "Correct"       (warn ambre)
 *   score < 80  → "Solide"        (profit vert)
 *   score ≥ 80  → "Excellent"     (accent or) — rareté sémantique voulue
 *
 * Formules dans lib/session-stats.ts, tooltip "?" expose chaque formule
 * au user.
 *
 * Recharts (SVG) → les tokens CSS var sont résolus nativement, pas
 * besoin de chartTokens() (contrairement aux Chart.js du reste du
 * Dashboard qui dessinent sur canvas).
 */

interface Props {
  sessions: TradingSession[]
  /**
   * Sous-titre de périmètre — ex "Profil global · tous comptes" ou
   * "Profil global · 2 comptes". Affiché sous le titre pour éviter la
   * contradiction apparente avec les cartes Insight IA (qui portent
   * sur une fenêtre glissante). L'ATP Score, lui, calcule TOUJOURS
   * sur toute l'historique disponible des `sessions` reçues — c'est
   * un profil, pas un instantané. Voir REFONTE.md § "Périmètres
   * explicites Dashboard".
   */
  scopeLabel: string
}

// Mapping tone → CSS var. TONE_COLOR_VAR de format.ts ne couvre pas
// `accent`, on complète ici (le palier ≥80 utilise l'or ATP).
const TONE_COLOR: Record<AtpTone, string> = {
  warn:    'var(--color-warn)',
  profit:  'var(--color-profit)',
  accent:  'var(--color-accent)',
  neutral: 'var(--color-text-3)',
}
const TONE_RGB: Record<AtpTone, string> = {
  warn:    'var(--color-warn-rgb)',
  profit:  'var(--color-profit-rgb)',
  accent:  'var(--color-accent-rgb)',
  neutral: '148, 148, 148',
}

export default function AtpScoreCard({ sessions, scopeLabel }: Props) {
  const result = useMemo(() => atpScore(sessions), [sessions])

  // Data pour Recharts : chaque axe null → 0 sur le radar (visuellement
  // honnête : "pas mesuré = zéro contribution") + suffixe "·" sur le
  // label pour signaler la data manquante.
  const radarData = result.axes.map(a => ({
    axis: a.score == null ? `${shortLabel(a.label)}·` : shortLabel(a.label),
    value: a.score ?? 0,
  }))

  const tooltipText = buildTooltip(result.axes)

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Header tooltipText={tooltipText} scopeLabel={scopeLabel} />

      {result.score == null ? (
        <EmptyBody validCount={result.validCount} />
      ) : (
        <Body result={result} radarData={radarData} />
      )}
    </Card>
  )
}

function Header({ tooltipText, scopeLabel }: { tooltipText: string; scopeLabel: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 14, gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🎯</span>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--color-text-3)',
          }}>
            ATP Score
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
            marginTop: 2,
          }}>
            Ton profil trader
          </div>
          <div style={{
            fontSize: 10, color: 'var(--color-text-3)',
            marginTop: 2, fontVariantNumeric: 'tabular-nums',
          }}>
            {scopeLabel}
          </div>
        </div>
      </div>

      {/* Tooltip natif — v1 sans popover custom */}
      <span
        title={tooltipText}
        aria-label="Explication des 6 axes"
        style={{
          width: 22, height: 22, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface-2)',
          color: 'var(--color-text-3)',
          fontSize: 12, fontWeight: 700,
          cursor: 'help',
          border: '1px solid var(--color-border-subtle)',
          userSelect: 'none',
        }}
      >
        ?
      </span>
    </div>
  )
}

function EmptyBody({ validCount }: { validCount: number }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '20px 12px', gap: 8, minHeight: 220,
    }}>
      <div style={{ fontSize: 32, opacity: 0.4 }}>🎯</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.5, maxWidth: '32ch' }}>
        Trade encore un peu pour débloquer ton ATP Score.
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
        {validCount}/6 axes disponibles · minimum 3 requis
      </div>
    </div>
  )
}

function Body({
  result,
  radarData,
}: {
  result: ReturnType<typeof atpScore>
  radarData: Array<{ axis: string; value: number }>
}) {
  const color = TONE_COLOR[result.tone]
  const rgb = TONE_RGB[result.tone]

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
      gap: 12, alignItems: 'center', minHeight: 0,
    }}>
      {/* Colonne gauche : score + label */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: 56, fontWeight: 700, color,
          lineHeight: 1, letterSpacing: '-0.03em',
        }}>
          {result.score}
          <span style={{
            fontSize: 20, fontWeight: 500, color: 'var(--color-text-3)',
            letterSpacing: 0,
          }}>
            /100
          </span>
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15, fontWeight: 700, color,
          marginTop: 4,
        }}>
          {result.label}
        </div>
        {result.validCount < 6 && (
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>
            {result.validCount}/6 axes évalués
          </div>
        )}
      </div>

      {/* Colonne droite : radar hexagonal */}
      <div style={{ height: 180, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
            <PolarGrid stroke="var(--color-border-subtle)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fontSize: 10, fill: 'var(--color-text-2)' }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              dataKey="value"
              stroke={color}
              fill={`rgba(${rgb}, 0.25)`}
              strokeWidth={2}
              // Anim d'entrée : 700ms ease-out, cohérent avec les charts
              // du dashboard. reduced-motion → isAnimationActive=false
              // (radar rendu direct sans tween Recharts).
              isAnimationActive={!prefersReducedMotion()}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Abrège les labels d'axes pour qu'ils tiennent autour du radar sans
 * chevauchement (2 mots max hors du radar visuellement).
 */
function shortLabel(label: string): string {
  const map: Record<string, string> = {
    'Win Rate':        'Win Rate',
    'Profit Factor':   'PF',
    'Respect plan':    'Plan',
    'Régularité':      'Régul.',
    'Ratio R:R':       'R:R',
    'Gestion risque':  'Risque',
  }
  return map[label] ?? label
}

/**
 * Construit le tooltip natif "?" : chaque axe + son état + sa formule.
 * Séparateurs \n\n car un tooltip HTML natif ne rend que du texte brut.
 */
function buildTooltip(axes: ReturnType<typeof atpScore>['axes']): string {
  const header = 'ATP Score = moyenne des 6 axes suivants (minimum 3 axes valides pour afficher un score global).\n\n'
  const lines = axes.map(a => {
    const val = a.score == null ? 'N/A' : `${a.score}/100`
    return `• ${a.label} — ${val}\n  ${a.explain}`
  }).join('\n\n')
  const footer = '\n\nPaliers : <40 À travailler · <60 Correct · <80 Solide · ≥80 Excellent'
  return header + lines + footer
}
