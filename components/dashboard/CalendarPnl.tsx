'use client'

import { useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import type { TradingSession } from '@/lib/types'
import { groupByDay, toDateKey } from '@/lib/session-stats'

/**
 * CalendarPnl — calendrier mensuel style TopstepX.
 *
 * Grille semaines × jours (lun→dim, format FR) + 8ᵉ colonne total
 * semaine. Intensité couleur relative au % du capital des comptes
 * filtrés (paliers 0.25% / 0.75% / 2% / ≥2%) — insensible au niveau
 * de capital du trader.
 *
 * Contrat :
 *   - `sessions` : déjà filtrées par comptes/période côté appelant.
 *   - `totalCapital` : somme des capitaux des comptes filtrés (pour
 *     paliers relatifs). Si 0/absent, tous les jours sont en palier
 *     minimum (fallback lisible mais moins informatif).
 *   - Fetch aucune donnée : composant read-only.
 */

interface Props {
  sessions: TradingSession[]
  totalCapital: number
}

interface DayCell {
  date: Date
  key: string
  inMonth: boolean
  isToday: boolean
  pnl: number
  count: number
  hasSession: boolean
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
// Paliers d'intensité en % du capital. Validé user : "% capital est la vraie
// lecture d'un trader, marche quel que soit le compte sans recalibrage".
const INTENSITY_STOPS = [0.25, 0.75, 2] as const
const ALPHAS = [0, 0.15, 0.30, 0.55, 0.80] as const

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

/**
 * Format complet fr-FR avec 2 décimales : 1000 → "+1 000,00 $".
 * Utilisé dans les cases jour et semaine — le trader lit un vrai
 * montant, pas un abrégé "1,0k" qui pouvait laisser croire à une
 * marge d'arrondi. Le "+" n'apparaît que sur les gains (pas sur 0).
 */
function fmtFull(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

/**
 * Total du header (mois) — pas de décimales, plus lisible pour un
 * cumul global (le trader s'intéresse à l'ordre de grandeur mensuel,
 * pas au centime près).
 */
function fmtExact(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${Math.round(n).toLocaleString('fr-FR')} $`
}

/**
 * "1 trade" (singulier) / "N trades" (pluriel) / "0 trades" possible
 * mais non affiché car les cases sans session sont vides. Idem pour
 * la col SEM.
 */
function fmtTradesCount(n: number): string {
  return `${n} trade${n > 1 ? 's' : ''}`
}

function intensityFor(pnl: number, totalCapital: number): number {
  if (totalCapital <= 0 || pnl === 0) return 1
  const pct = Math.abs(pnl) / totalCapital * 100
  if (pct < INTENSITY_STOPS[0]) return 1
  if (pct < INTENSITY_STOPS[1]) return 2
  if (pct < INTENSITY_STOPS[2]) return 3
  return 4
}

export default function CalendarPnl({ sessions, totalCapital }: Props) {
  const [monthShown, setMonthShown] = useState<Date>(() => new Date())

  const byDay = useMemo(() => groupByDay(sessions), [sessions])

  // Construit les semaines lun→dim couvrant tout le mois affiché.
  // Peut inclure jusqu'à 6 semaines (5-6 selon débordement).
  const weeks = useMemo<DayCell[][]>(() => {
    const year = monthShown.getFullYear()
    const month = monthShown.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const lastOfMonth = new Date(year, month + 1, 0)

    // Trouver le lundi de la 1ère semaine (peut être en mois précédent)
    const cursor = new Date(firstOfMonth)
    const dow = firstOfMonth.getDay()  // 0 = dimanche, 1 = lundi
    const daysToPreviousMonday = dow === 0 ? 6 : dow - 1
    cursor.setDate(firstOfMonth.getDate() - daysToPreviousMonday)

    const today = new Date()
    const result: DayCell[][] = []
    for (let w = 0; w < 6; w++) {
      const week: DayCell[] = []
      for (let d = 0; d < 7; d++) {
        const key = toDateKey(cursor)
        const stats = byDay.get(key)
        week.push({
          date: new Date(cursor),
          key,
          inMonth: cursor.getMonth() === month,
          isToday: isSameDay(cursor, today),
          pnl: stats?.pnl ?? 0,
          count: stats?.count ?? 0,
          hasSession: !!stats && stats.count > 0,
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      result.push(week)
      // Arrêt anticipé si on a dépassé le mois ET on entame une nouvelle semaine hors mois
      if (cursor > lastOfMonth && week.every(c => !c.inMonth || c.date > lastOfMonth)) break
    }
    return result
  }, [monthShown, byDay])

  // Total mois — uniquement les jours vraiment dans le mois affiché
  const monthTotal = useMemo(() => {
    let pnl = 0, count = 0
    for (const w of weeks) for (const d of w) {
      if (d.inMonth) { pnl += d.pnl; count += d.count }
    }
    return { pnl, count }
  }, [weeks])

  const now = new Date()
  const isCurrentMonth = monthShown.getFullYear() === now.getFullYear()
    && monthShown.getMonth() === now.getMonth()

  const monthLabelRaw = monthShown.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1)

  function shiftMonth(delta: number) {
    setMonthShown(prev => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + delta)
      return next
    })
  }

  const monthColor = monthTotal.pnl > 0 ? 'var(--color-profit)'
    : monthTotal.pnl < 0 ? 'var(--color-loss)'
    : 'var(--color-text-1)'

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Mois précédent"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
          >
            ◀
          </button>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600,
            color: 'var(--color-text-1)', margin: 0, minWidth: 160, textAlign: 'center',
          }}>
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Mois suivant"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => setMonthShown(new Date())}
            disabled={isCurrentMonth}
            className="ml-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text-2)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            Aujourd&apos;hui
          </button>
        </div>

        <div style={{
          fontFamily: 'var(--font-data)', fontSize: 18, fontWeight: 700,
          color: monthColor, letterSpacing: '-0.01em',
        }}>
          {fmtExact(monthTotal.pnl)}
          <span style={{ fontSize: 12, color: 'var(--color-text-3)', fontWeight: 500, marginLeft: 8 }}>
            · {monthTotal.count} trades
          </span>
        </div>
      </div>

      {/* Grid header : L M M J V S D + SEM */}
      <div className="grid grid-cols-[repeat(7,1fr)_1.2fr] gap-1 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center',
            fontSize: 10, fontWeight: 600,
            color: 'var(--color-text-3)',
            letterSpacing: '0.1em',
            padding: '4px 0',
          }}>
            {d}
          </div>
        ))}
        <div style={{
          textAlign: 'center',
          fontSize: 10, fontWeight: 600,
          color: 'var(--color-text-3)',
          letterSpacing: '0.1em',
          padding: '4px 0',
        }}>
          SEM
        </div>
      </div>

      {/* Weeks */}
      <div className="flex flex-col gap-1">
        {weeks.map((week, wIdx) => {
          const weekTotal = week.reduce(
            (s, d) => ({ pnl: s.pnl + d.pnl, count: s.count + d.count }),
            { pnl: 0, count: 0 },
          )
          // Total semaine coloré selon signe. Cas break-even exact
          // (pnl === 0 avec trades) → text-1 (blanc net), PAS text-3
          // qui rendait le total illisible sur fond surface-2 gris.
          const weekColor = weekTotal.pnl > 0 ? 'var(--color-profit)'
            : weekTotal.pnl < 0 ? 'var(--color-loss)'
            : 'var(--color-text-1)'

          return (
            <div key={wIdx} className="grid grid-cols-[repeat(7,1fr)_1.2fr] gap-1">
              {week.map(day => {
                const intensity = day.hasSession ? intensityFor(day.pnl, totalCapital) : 0
                const alpha = ALPHAS[intensity]
                const bg = !day.hasSession ? 'transparent'
                  : day.pnl > 0 ? `rgba(var(--color-profit-rgb), ${alpha})`
                  : day.pnl < 0 ? `rgba(var(--color-loss-rgb), ${alpha})`
                  : `rgba(var(--color-neutral-rgb), ${alpha})`
                const border = day.isToday
                  ? '2px solid var(--color-accent)'
                  : '1px solid var(--color-border-subtle)'
                const pctCapital = totalCapital > 0 ? (day.pnl / totalCapital * 100) : 0
                const pctLabel = totalCapital > 0
                  ? `${pctCapital >= 0 ? '+' : ''}${pctCapital.toFixed(2)}%`
                  : ''
                const tooltip = day.hasSession
                  ? pctLabel
                    ? `${fmtExact(day.pnl)} · ${pctLabel} · ${day.count} trades`
                    : `${fmtExact(day.pnl)} · ${day.count} trades`
                  : ''
                const pnlColor = day.pnl > 0 ? 'var(--color-profit)'
                  : day.pnl < 0 ? 'var(--color-loss)'
                  : 'var(--color-text-2)'

                return (
                  <div
                    key={day.key}
                    title={tooltip}
                    style={{
                      background: bg,
                      border,
                      borderRadius: 6,
                      padding: '3px 5px',
                      height: 78,
                      opacity: day.inMonth ? 1 : 0.3,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div style={{
                      fontSize: 10,
                      color: 'var(--color-text-3)',
                      fontFamily: 'var(--font-display)',
                      lineHeight: 1,
                    }}>
                      {day.date.getDate()}
                    </div>
                    {day.hasSession && (
                      <div style={{
                        flex: 1, minWidth: 0,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 3,
                      }}>
                        {/* Montant : 16px pour tenir "1 000,00 $" dans
                            une case ~90px. ellipsis en filet si un jour
                            à 5 chiffres saturait la largeur. */}
                        <div style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 16, fontWeight: 700,
                          color: pnlColor,
                          letterSpacing: '-0.03em',
                          lineHeight: 1.05,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {fmtFull(day.pnl)}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: 'var(--color-text-3)',
                          fontFamily: 'var(--font-data)',
                          lineHeight: 1,
                        }}>
                          {fmtTradesCount(day.count)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Week total (8e col) — tooltip pour lire le montant
                  exact si l'ellipsis a tronqué (cas 5 chiffres). */}
              <div
                title={weekTotal.count > 0
                  ? `Semaine ${wIdx + 1} : ${fmtFull(weekTotal.pnl)} · ${fmtTradesCount(weekTotal.count)}`
                  : ''}
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 6,
                  padding: '4px 6px',
                  minHeight: 60,
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{
                  fontSize: 10,
                  color: 'var(--color-text-3)',
                  fontFamily: 'var(--font-display)',
                  lineHeight: 1,
                  letterSpacing: '0.05em',
                }}>
                  Sem {wIdx + 1}
                </div>
                {weekTotal.count > 0 ? (
                  <div style={{
                    flex: 1, minWidth: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 3,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 16, fontWeight: 700,
                      color: weekColor,
                      letterSpacing: '-0.03em',
                      lineHeight: 1.05,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {fmtFull(weekTotal.pnl)}
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: 'var(--color-text-3)',
                      fontFamily: 'var(--font-data)',
                      lineHeight: 1,
                    }}>
                      {fmtTradesCount(weekTotal.count)}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-3)', fontSize: 12,
                  }}>
                    —
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
