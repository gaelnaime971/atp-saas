'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import Card from '@/components/ui/Card'
import { fmtUsd, fmtPct, TONE_COLOR_VAR } from '@/lib/format'
import type { TradingSession } from '@/lib/types'

/**
 * Répartition par instrument — donut catégoriel.
 *
 * Répond à "d'où vient mon argent" (au sens : où est concentrée mon
 * activité financière). Chaque part = |PnL| de l'instrument sur la
 * fenêtre 3 mois (alignée avec Best/Worst Day pour éviter le flou de
 * périmètre — deux cartes voisines avec des fenêtres différentes non
 * explicites, c'est ce qui a créé le bug de confiance "89 vs -1322").
 *
 * Choix |PnL| au lieu de PnL signé : un donut somme des valeurs
 * positives, on ne peut pas mélanger un instrument gagnant et perdant
 * dans le même cercle. Chaque label affiche le signe réel + montant,
 * l'ambiguïté est levée au label, pas au segment.
 *
 * Palette : --color-series-1..6 (or-ancrées, non-sémantiques). Bucket
 * "Non renseigné" force series-4 (gris ardoise) pour signaler au user
 * qu'il manque de la data instrument sur certaines sessions.
 *
 * Toggle "P&L / Trades" documenté v2 (validé user : le mode P&L seul
 * est suffisant pour la question "d'où vient mon argent").
 */

interface Props {
  sessions: TradingSession[]
  scopeLabel: string
}

interface Slice {
  instrument: string
  pnl: number         // signé — pour l'affichage label
  weight: number      // |pnl| — pour le donut
  count: number       // nb sessions
  color: string       // CSS var
}

// Palette catégorielle — cycle sur >6 instruments (rare).
const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
]

// Bucket "Non renseigné" = toujours gris ardoise (series-4) pour
// signaler la data manquante, même s'il n'est pas 4ᵉ par volume.
const NULL_INST_LABEL = 'Non renseigné'
const NULL_INST_COLOR = 'var(--color-series-4)'

function computeSlices(sessions: TradingSession[]): Slice[] {
  // Fenêtre 3 mois — même logique que BestWorstDay pour cohérence.
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  cutoff.setHours(0, 0, 0, 0)

  const inWindow = sessions.filter(s => {
    const d = new Date(s.session_date + 'T00:00:00')
    return d >= cutoff
  })

  if (inWindow.length === 0) return []

  // Agrège par instrument (null → bucket "Non renseigné").
  const agg = new Map<string, { pnl: number; count: number }>()
  for (const s of inWindow) {
    const inst = s.instrument ?? NULL_INST_LABEL
    const prev = agg.get(inst) ?? { pnl: 0, count: 0 }
    agg.set(inst, { pnl: prev.pnl + Number(s.pnl), count: prev.count + 1 })
  }

  // Trie décroissant par |pnl| — les instruments qui pèsent le plus
  // apparaissent en tête de légende + de la première part visible.
  const sorted: Array<Slice> = Array.from(agg.entries())
    .map(([instrument, { pnl, count }]) => ({
      instrument, pnl, weight: Math.abs(pnl), count,
      color: '',  // assigné juste après
    }))
    .sort((a, b) => b.weight - a.weight)

  // Assigne les couleurs. "Non renseigné" force series-4 quel que
  // soit son rang — signal visuel de data incomplète.
  let paletteIdx = 0
  for (const slice of sorted) {
    if (slice.instrument === NULL_INST_LABEL) {
      slice.color = NULL_INST_COLOR
    } else {
      // Skip series-4 si déjà réservé pour "Non renseigné" éventuel.
      const isNullInStack = sorted.some(s => s.instrument === NULL_INST_LABEL)
      const palette = isNullInStack ? SERIES.filter(c => c !== NULL_INST_COLOR) : SERIES
      slice.color = palette[paletteIdx % palette.length]
      paletteIdx++
    }
  }
  return sorted
}

export default function InstrumentDonut({ sessions, scopeLabel }: Props) {
  const slices = useMemo(() => computeSlices(sessions), [sessions])
  const totalWeight = slices.reduce((s, sl) => s + sl.weight, 0)

  return (
    <Card>
      <Header scopeLabel={scopeLabel} />
      {slices.length === 0 ? (
        <EmptyBody />
      ) : slices.length === 1 ? (
        <SingleBody slice={slices[0]} />
      ) : (
        <Body slices={slices} totalWeight={totalWeight} />
      )}
    </Card>
  )
}

function Header({ scopeLabel }: { scopeLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>📊</span>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-text-3)',
        }}>
          Répartition
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
          marginTop: 2,
        }}>
          Par instrument
        </div>
        <div style={{
          fontSize: 10, color: 'var(--color-text-3)',
          marginTop: 2, fontVariantNumeric: 'tabular-nums',
        }}>
          {scopeLabel}
        </div>
      </div>
    </div>
  )
}

function EmptyBody() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '32px 12px', gap: 8,
      minHeight: 220,
    }}>
      <div style={{ fontSize: 32, opacity: 0.4 }}>📊</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.5, maxWidth: '32ch' }}>
        Trade pour voir la répartition de ton activité par instrument sur les 3 derniers mois.
      </div>
    </div>
  )
}

function SingleBody({ slice }: { slice: Slice }) {
  // 1 seul instrument : donut plein + label centré. Pas de segments minables.
  const pnlColor = slice.pnl > 0 ? TONE_COLOR_VAR.profit
    : slice.pnl < 0 ? TONE_COLOR_VAR.loss
    : TONE_COLOR_VAR.neutral
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '16px 12px', gap: 12,
      minHeight: 220,
    }}>
      {/* Cercle plein CSS — pas besoin de Recharts pour 1 segment */}
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        background: slice.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-data)', fontSize: 18, fontWeight: 700,
        color: 'var(--color-surface-0)',
      }}>
        100 %
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)',
      }}>
        {slice.instrument} · 100 % de ton activité
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: 20, fontWeight: 700, color: pnlColor,
        letterSpacing: '-0.02em',
      }}>
        {fmtUsd(slice.pnl, 0, { sign: true })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
        {slice.count} session{slice.count > 1 ? 's' : ''}
      </div>
    </div>
  )
}

function Body({ slices, totalWeight }: { slices: Slice[]; totalWeight: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr',
      gap: 16, alignItems: 'center', minHeight: 220,
    }}>
      {/* Donut Recharts (SVG → CSS vars résolues nativement, pas
          besoin du helper chartTokens comme pour Chart.js). */}
      <div style={{ height: 220, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="weight"
              nameKey="instrument"
              innerRadius="55%"
              outerRadius="95%"
              paddingAngle={2}
              stroke="var(--color-surface-1)"
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.instrument} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Légende dense — 1 ligne par instrument, montant SIGNÉ + %. */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: 8, minWidth: 0,
      }}>
        {slices.map(s => {
          const pct = totalWeight > 0 ? (s.weight / totalWeight) * 100 : 0
          const pnlColor = s.pnl > 0 ? TONE_COLOR_VAR.profit
            : s.pnl < 0 ? TONE_COLOR_VAR.loss
            : TONE_COLOR_VAR.neutral
          return (
            <div key={s.instrument} style={{
              display: 'grid',
              gridTemplateColumns: '10px 1fr auto',
              gap: 8, alignItems: 'center',
              minWidth: 0,
            }}>
              {/* Pastille couleur série */}
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: s.color, flexShrink: 0,
              }} />
              {/* Nom instrument + count */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--color-text-1)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.instrument}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--color-text-3)',
                  fontFamily: 'var(--font-data)', lineHeight: 1,
                  marginTop: 1,
                }}>
                  {fmtPct(pct, 0)}
                </div>
              </div>
              {/* Montant signé — coloré profit/loss/neutral */}
              <div style={{
                fontFamily: 'var(--font-data)',
                fontSize: 13, fontWeight: 700, color: pnlColor,
                letterSpacing: '-0.01em', whiteSpace: 'nowrap',
              }}>
                {fmtUsd(s.pnl, 0, { sign: true })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
