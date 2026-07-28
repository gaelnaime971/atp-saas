'use client'

import { useMemo } from 'react'
import Card from '@/components/ui/Card'
import { fmtUsd, fmtPct, TONE_COLOR_VAR } from '@/lib/format'
import type { TradingSession } from '@/lib/types'

/**
 * Meilleure/Pire journée — 2 mini-cards jumelles.
 *
 * Fenêtre 3 derniers mois (pas "depuis le début") : décision produit —
 * un record datant de 6 mois devient déprimant sur un dashboard ouvert
 * chaque matin avant de trader. 3 mois = record récent et atteignable,
 * donc motivant. La pire journée est TOUJOURS affichée (pas de masquage
 * paternaliste) mais avec un ton visuel doux (icône 🩹, pas 💀).
 *
 * Contrat :
 *   - `sessions` : déjà filtrées par comptes côté Dashboard. Le
 *     composant filtre lui-même sur la fenêtre 3 mois.
 *   - `scopeLabel` : sous-titre passé par le parent pour cohérence
 *     avec les autres cartes (ex "3 derniers mois · tous comptes").
 *   - Aucun fetch.
 */

interface Props {
  sessions: TradingSession[]
  scopeLabel: string
}

interface DayDetail {
  date: string           // 'YYYY-MM-DD'
  pnl: number
  tradesCount: number    // somme trades_count sur les sessions du jour
  sessionsCount: number  // nombre de sessions loggées ce jour
  topInstrument: string  // instrument avec le plus grand |PnL| ce jour
  winRate: number        // 0-100 sur sessionsCount
}

function computeBestWorst(sessions: TradingSession[]): {
  best: DayDetail | null
  worst: DayDetail | null
} {
  // Fenêtre : 3 derniers mois (au sens "3 mois calendaires en arrière").
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  cutoff.setHours(0, 0, 0, 0)

  const inWindow = sessions.filter(s => {
    const d = new Date(s.session_date + 'T00:00:00')
    return d >= cutoff
  })

  if (inWindow.length === 0) return { best: null, worst: null }

  // Group by day
  const groups = new Map<string, TradingSession[]>()
  for (const s of inWindow) {
    const arr = groups.get(s.session_date)
    if (arr) arr.push(s)
    else groups.set(s.session_date, [s])
  }

  const details: DayDetail[] = []
  for (const [date, dayS] of groups) {
    const pnl = dayS.reduce((a, s) => a + Number(s.pnl), 0)
    const tradesCount = dayS.reduce((a, s) => a + (Number(s.trades_count) || 0), 0)
    const wins = dayS.filter(s => s.result === 'win').length
    const winRate = dayS.length > 0 ? Math.round((wins / dayS.length) * 100) : 0

    // Instrument dominant : celui qui a fait la journée (max |PnL|,
    // pas fréquence — 1 gros trade YM pèse plus que 5 petits scalps NQ).
    const byInst = new Map<string, number>()
    for (const s of dayS) {
      const inst = s.instrument ?? '—'
      byInst.set(inst, (byInst.get(inst) ?? 0) + Number(s.pnl))
    }
    let topInstrument = '—'
    let topAbs = -1
    for (const [inst, p] of byInst) {
      const abs = Math.abs(p)
      if (abs > topAbs) { topAbs = abs; topInstrument = inst }
    }

    details.push({ date, pnl, tradesCount, sessionsCount: dayS.length, topInstrument, winRate })
  }

  // Tri décroissant sur pnl — premier = best, dernier = worst.
  // Cas égalité : premier trouvé (comportement stable par ordre d'insertion Map).
  details.sort((a, b) => b.pnl - a.pnl)
  return { best: details[0], worst: details[details.length - 1] }
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTradesCount(n: number): string {
  return `${n} trade${n > 1 ? 's' : ''}`
}

export default function BestWorstDay({ sessions, scopeLabel }: Props) {
  const { best, worst } = useMemo(() => computeBestWorst(sessions), [sessions])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <DayCard
        variant="best"
        icon="🏆"
        title="Meilleure journée"
        scopeLabel={scopeLabel}
        day={best}
      />
      <DayCard
        variant="worst"
        icon="🩹"
        title="Pire journée"
        scopeLabel={scopeLabel}
        day={worst}
      />
    </div>
  )
}

interface DayCardProps {
  variant: 'best' | 'worst'
  icon: string
  title: string
  scopeLabel: string
  day: DayDetail | null
}

function DayCard({ variant, icon, title, scopeLabel, day }: DayCardProps) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Header icon={icon} title={title} scopeLabel={scopeLabel} />
      {day ? <Body day={day} variant={variant} /> : <EmptyBody />}
    </Card>
  )
}

function Header({ icon, title, scopeLabel }: { icon: string; title: string; scopeLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-text-3)',
        }}>
          Record
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
          marginTop: 2,
        }}>
          {title}
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

function Body({ day, variant }: { day: DayDetail; variant: 'best' | 'worst' }) {
  // Sécurité : on affiche la couleur selon signe RÉEL, pas selon variant.
  // Cas edge : "meilleure journée" négative (trader en drawdown → même
  // le "moins pire" est rouge). Un affichage vert par principe mentirait.
  const color = day.pnl > 0 ? TONE_COLOR_VAR.profit
    : day.pnl < 0 ? TONE_COLOR_VAR.loss
    : TONE_COLOR_VAR.neutral

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: 'center', gap: 6, minHeight: 0,
    }}>
      {/* P&L dominant (28px) */}
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: 28, fontWeight: 700, color,
        lineHeight: 1, letterSpacing: '-0.03em',
      }}>
        {fmtUsd(day.pnl, 2, { sign: true })}
      </div>

      {/* Date fr-FR longue */}
      <div style={{
        fontSize: 13, color: 'var(--color-text-2)',
        lineHeight: 1.3,
      }}>
        {formatDateLong(day.date)}
      </div>

      {/* Sub-line factuelle : trades · instrument · WR */}
      <div style={{
        fontSize: 12, color: 'var(--color-text-3)',
        marginTop: 4,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {fmtTradesCount(day.tradesCount)}
        {' · '}
        <span style={{ color: 'var(--color-text-2)', fontWeight: 500 }}>{day.topInstrument}</span>
        {' · WR '}{fmtPct(day.winRate, 0)}
      </div>
    </div>
  )
}

function EmptyBody() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '16px 12px', gap: 6,
    }}>
      <div style={{ fontSize: 26, opacity: 0.4 }}>📅</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.4, maxWidth: '30ch' }}>
        Aucune session sur les 3 derniers mois — trade pour révéler ton record.
      </div>
    </div>
  )
}
