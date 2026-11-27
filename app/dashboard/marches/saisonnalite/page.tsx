import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { BarChart } from '@/components/terminal/charts/BarChart'
import { LineChart } from '@/components/terminal/charts/LineChart'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { createClient } from '@/lib/supabase/server'
import { requestClock } from '@/lib/market/freshness'
import { dateKey } from '@/lib/time'
import { fmtNumber, fmtUsd } from '@/lib/format'
import { SP500_MONTHLY_RETURNS, SP500_SOURCE } from '@/lib/market/seasonality/sp500-returns'
import {
  CYCLE_LABEL, JOURNAL_MIN_SESSIONS, JOURNAL_MIN_TIMED_TRADES, cycleMonthlyMeans, journalFromRows, journalSeasonality,
  type Bucket, type CycleYear, type SeriesStats,
} from '@/lib/market/seasonality/stats'
import { MONTH_NAMES, MONTH_NAMES_CAP, pct, seasonalityReading, seasonalitySummary } from '@/lib/market/seasonality/summary'

export const metadata: Metadata = { title: 'Saisonnalité · Marchés · ATP' }

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const th: CSSProperties = { fontWeight: 500, padding: '0 0 8px 0' }
const SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTHS_ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const tone = (v: number | null | undefined) => (v == null ? 'var(--color-text-3)' : v > 0 ? 'var(--color-profit)' : v < 0 ? 'var(--color-loss)' : 'var(--color-text-2)')
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`

/** Points d'une trajectoire (13 valeurs) sur l'axe des dates de l'année. */
function pathPoints(path: number[], year: number) {
  return path.map((value, i) => ({ date: i === 12 ? `${year + 1}-01-01` : `${year}-${String(i + 1).padStart(2, '0')}-01`, value }))
}

export default async function SaisonnalitePage() {
  const { userId } = await requireMarketsViewer()
  const { timeZone: tz } = await getMemberTimeZone()
  const { now } = requestClock()
  const today = dateKey(now, tz)
  const memberYear = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  const next = (month + 1) % 12

  const sum = seasonalitySummary(SP500_MONTHLY_RETURNS, SP500_SOURCE.lastMonth, memberYear)
  const { from, to, cycleFrom, partialYear } = sum.window
  const reading = seasonalityReading(sum, month)
  const cycleMonths = cycleMonthlyMeans(SP500_MONTHLY_RETURNS, sum.currentCycle, cycleFrom, to)

  // Journal du membre (ses propres sessions, règle RLS « ses lignes » + filtre explicite).
  const supabase = await createClient()
  const { data: rows, error: journalError } = await supabase
    .from('trading_sessions').select('session_date, pnl, setup').eq('trader_id', userId).limit(5000)
  const journal = journalSeasonality(journalFromRows((rows ?? []) as { session_date: string | null; pnl: number | string | null; setup: string | null }[]))

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader
        breadcrumb={<>Marchés · Analyse</>}
        title="Saisonnalité"
        subtitle={`S&P 500 sur ${to - from + 1} ans (${from}–${to}) : performance moyenne par mois, part des années en hausse, cycle présidentiel, et ta propre saisonnalité`}
      />
      <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
        <span>S&P 500 jusqu’à {monthLabel(SP500_SOURCE.lastMonth)} · données figées, mises à jour une fois par an</span>
        <Badge tone="neutral" size="sm" bordered>NQ · ES : licence CME à prévoir</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>S&P 500 · performance moyenne par mois · {from}–{to}</h2>
          <BarChart
            ariaLabel={`Rendement moyen du S&P 500 par mois, ${from} à ${to}`}
            highlight={month}
            format={v => fmtNumber(v, 1, { sign: true })}
            bars={sum.months.map((s, i) => ({ key: i, label: MONTHS_ABBR[i], short: SHORT[i], value: s?.mean ?? null, sub: s ? `${Math.round(s.upShare)} %` : undefined }))}
          />
          <p style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0' }}>
            Rendement moyen en %. Ligne du bas : part des années en hausse. Encadré : le mois en cours.
          </p>
        </Card>
        <Card>
          <h2 style={sectionTitle}>Ce mois-ci et le prochain</h2>
          <MonthBlock name={MONTH_NAMES_CAP[month]} s={sum.months[month]} />
          <div style={{ height: 16 }} />
          <MonthBlock name={MONTH_NAMES_CAP[next]} s={sum.months[next]} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>Trajectoire saisonnière{partialYear ? ` vs ${partialYear}` : ''}</h2>
          <LineChart
            ariaLabel={`Trajectoire cumulée d’une année moyenne${partialYear ? ` et de ${partialYear}` : ''}`}
            height={220} zeroLine format={v => `${fmtNumber(v, 0, { sign: true })} %`}
            series={[
              { id: 'avg', label: `Année moyenne ${from}–${to}`, color: 'var(--color-series-5)', dashed: true, points: pathPoints(sum.averagePath, partialYear ?? to) },
              ...(sum.partialPath && partialYear ? [{ id: 'cur', label: `${partialYear} (jusqu’à ${MONTH_NAMES[sum.partialPath.length - 2]})`, color: 'var(--color-accent)', points: pathPoints(sum.partialPath, partialYear) }] : []),
            ]}
          />
        </Card>
        <Card>
          <h2 style={sectionTitle}>Lecture</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reading.map((r, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: i === reading.length - 1 ? 'var(--color-text-3)' : 'var(--color-text-1)' }}>{r}</li>
            ))}
          </ul>
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '12px 0 0 0' }}>Rédigé automatiquement à partir des chiffres de la page.</p>
        </Card>
      </div>

      <Card>
        <h2 style={sectionTitle}>Cycle présidentiel · {cycleFrom}–{to}</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: '0 0 1rem 0', lineHeight: 1.55 }}>
          Rendement du S&P 500 sur l’année civile selon sa place dans le mandat présidentiel américain.{' '}
          <strong style={{ color: 'var(--color-text-1)' }}>{memberYear} est une année {sum.currentCycle === 2 ? 'de mi-mandat' : `« ${CYCLE_LABEL[sum.currentCycle].toLowerCase()} »`}.</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {([1, 2, 3, 4] as CycleYear[]).map(c => {
            const s = sum.cycle[c]
            const on = c === sum.currentCycle
            return (
              <div key={c} style={{ borderRadius: 'var(--radius-lg)', padding: '0.875rem 1rem', background: on ? 'var(--color-accent-soft)' : 'var(--color-surface-2)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>{CYCLE_LABEL[c]}</span>
                  {on && <span style={{ ...mono, fontSize: 10, color: 'var(--color-accent)' }}>{memberYear}</span>}
                </div>
                {s ? (
                  <dl className="grid gap-y-1" style={{ gridTemplateColumns: '1fr auto', margin: '0.625rem 0 0 0', fontSize: 12 }}>
                    <StatRow label="Moyenne" value={<span style={{ color: tone(s.mean) }}>{pct(s.mean, 1)}</span>} />
                    <StatRow label="Médiane" value={pct(s.median, 1)} />
                    <StatRow label="En hausse" value={`${s.upCount}/${s.n} · ${Math.round(s.upShare)} %`} />
                    <StatRow label="Meilleure" value={`${s.best.year} · ${pct(s.best.value, 1)}`} />
                    <StatRow label="Pire" value={`${s.worst.year} · ${pct(s.worst.value, 1)}`} />
                  </dl>
                ) : <p style={{ fontSize: 12, color: 'var(--color-text-3)' }}>—</p>}
              </div>
            )
          })}
        </div>
        <h3 style={{ ...sectionTitle, margin: '1.5rem 0 0.75rem 0' }}>Mois par mois en année {sum.currentCycle === 2 ? 'de mi-mandat' : CYCLE_LABEL[sum.currentCycle].toLowerCase()} · moyenne {cycleFrom}–{to}</h3>
        <BarChart
          ariaLabel={`Rendement moyen par mois en année ${CYCLE_LABEL[sum.currentCycle].toLowerCase()}`}
          height={120} highlight={month}
          format={v => fmtNumber(v, 1, { sign: true })}
          bars={cycleMonths.map((v, i) => ({ key: i, label: MONTHS_ABBR[i], short: SHORT[i], value: v }))}
        />
      </Card>

      <Card>
        <h2 style={sectionTitle}>S&P 500 · détail mois par mois · {from}–{to}</h2>
        {/* Mobile : 4 colonnes ; à partir de md : le détail complet. */}
        <table className="md:hidden" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
              <th style={{ ...th, textAlign: 'left' }}>Mois</th><th style={th}>Moyenne</th><th style={th}>En hausse</th>{partialYear && <th style={th}>{partialYear}</th>}
            </tr>
          </thead>
          <tbody>
            {sum.months.map((s, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--color-border-subtle)', background: i === month ? 'var(--color-surface-2)' : undefined, textAlign: 'right' }}>
                <td style={{ padding: '7px 0', textAlign: 'left', color: 'var(--color-text-1)' }}>{MONTH_NAMES_CAP[i]}</td>
                <td style={{ ...mono, color: tone(s?.mean) }}>{s ? pct(s.mean) : '—'}</td>
                <td style={mono}>{s ? `${Math.round(s.upShare)} %` : '—'}</td>
                {partialYear && <td style={{ ...mono, color: tone(SP500_MONTHLY_RETURNS[partialYear]?.[i]) }}>{fmtYear(SP500_MONTHLY_RETURNS[partialYear]?.[i])}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hidden md:block" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>
                <th style={{ ...th, textAlign: 'left' }}>Mois</th><th style={th}>Moyenne</th><th style={th}>Médiane</th><th style={th}>En hausse</th>
                <th style={th}>Volatilité</th><th style={th}>Meilleur</th><th style={th}>Pire</th>{partialYear && <th style={th}>{partialYear}</th>}
              </tr>
            </thead>
            <tbody>
              {sum.months.map((s, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--color-border-subtle)', background: i === month ? 'var(--color-surface-2)' : undefined, textAlign: 'right' }}>
                  <td style={{ padding: '9px 0 9px 8px', textAlign: 'left', color: 'var(--color-text-1)' }}>{MONTH_NAMES_CAP[i]}</td>
                  <td style={{ ...mono, color: tone(s?.mean) }}>{s ? pct(s.mean) : '—'}</td>
                  <td style={mono}>{s ? pct(s.median) : '—'}</td>
                  <td style={mono}>{s ? `${Math.round(s.upShare)} %` : '—'}</td>
                  <td style={mono}>{s ? `${fmtNumber(s.volatility, 2)} %` : '—'}</td>
                  <td style={mono}>{s ? `${s.best.year} · ${pct(s.best.value, 1)}` : '—'}</td>
                  <td style={mono}>{s ? `${s.worst.year} · ${pct(s.worst.value, 1)}` : '—'}</td>
                  {partialYear && <td style={{ ...mono, paddingRight: 8, color: tone(SP500_MONTHLY_RETURNS[partialYear]?.[i]) }}>{fmtYear(SP500_MONTHLY_RETURNS[partialYear]?.[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0' }}>
          Volatilité : écart type des rendements du mois d’une année à l’autre.
        </p>
      </Card>

      <Card>
        <h2 style={sectionTitle}>Ta saisonnalité · ton journal</h2>
        {journalError ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', margin: 0 }}>Ton journal est indisponible pour le moment.</p>
        ) : !journal.enough ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: 0, lineHeight: 1.6 }}>
            Il faut au moins <strong style={{ color: 'var(--color-text-1)' }}>{JOURNAL_MIN_SESSIONS} sessions</strong> saisies dans ton journal pour une saisonnalité qui ait du sens.
            {' '}Tu en as {journal.sessions}. Continue à saisir tes sessions (Mon trading › Saisie de session ou Session live) : cette partie se remplira toute seule.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: '0 0 1rem 0' }}>
              {journal.sessions} sessions saisies. P&L en $, taux de réussite = part des sessions (ou des trades, par heure) en gain.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <BucketTable title="Par mois" buckets={journal.byMonth} unit="sessions" />
              <BucketTable title="Par jour de la semaine" buckets={journal.byWeekday} unit="sessions" />
              {journal.byHour ? (
                <BucketTable title={`Par heure · ton fuseau`} buckets={journal.byHour} unit="trades" />
              ) : (
                <div>
                  <h3 style={{ ...sectionTitle, margin: '0 0 0.5rem 0' }}>Par heure</h3>
                  <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0, lineHeight: 1.6 }}>
                    L’heure n’est connue que pour les trades saisis en Session live. Il en faut au moins {JOURNAL_MIN_TIMED_TRADES} ; tu en as {journal.timedTrades}.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7 }}>
        S&P 500 : statistiques calculées par ATP à partir des données de{' '}
        <a href={SP500_SOURCE.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>Robert J. Shiller</a>{' '}
        (moyennes mensuelles des clôtures quotidiennes, téléchargées le {SP500_SOURCE.downloaded.split('-').reverse().join('/')}). Les niveaux de l’indice ne sont pas affichés.
        Ta saisonnalité : sessions de ton journal ATP. Outil d’analyse, pas un conseil en investissement.
      </footer>
    </div>
  )
}

function fmtYear(v: number | null | undefined) {
  return v == null ? '—' : pct(v, 1)
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--color-text-3)' }}>{label}</dt>
      <dd style={{ ...mono, margin: 0, textAlign: 'right', color: 'var(--color-text-1)' }}>{value}</dd>
    </>
  )
}

function MonthBlock({ name, s }: { name: string; s: SeriesStats | null }) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 0.5rem 0' }}>{name}</h3>
      {s ? (
        <dl className="grid gap-y-1.5" style={{ gridTemplateColumns: '1fr auto', margin: 0, fontSize: 13 }}>
          <StatRow label="Moyenne" value={<span style={{ color: tone(s.mean) }}>{pct(s.mean)}</span>} />
          <StatRow label="Médiane" value={pct(s.median)} />
          <StatRow label="En hausse" value={`${s.upCount}/${s.n} ans · ${Math.round(s.upShare)} %`} />
          <StatRow label="Volatilité" value={`${fmtNumber(s.volatility, 2)} %`} />
          <StatRow label="Meilleur" value={`${s.best.year} · ${pct(s.best.value, 1)}`} />
          <StatRow label="Pire" value={`${s.worst.year} · ${pct(s.worst.value, 1)}`} />
        </dl>
      ) : <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>—</p>}
    </div>
  )
}

function BucketTable({ title, buckets, unit }: { title: string; buckets: Bucket[]; unit: string }) {
  return (
    <div>
      <h3 style={{ ...sectionTitle, margin: '0 0 0.5rem 0' }}>{title}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>
            <th style={{ ...th, textAlign: 'left' }} />
            <th style={th}>{unit}</th><th style={th}>P&L</th><th style={th}>Réussite</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(b => (
            <tr key={b.key} style={{ borderTop: '1px solid var(--color-border-subtle)', textAlign: 'right', color: b.count ? 'var(--color-text-1)' : 'var(--color-text-3)' }}>
              <td style={{ padding: '6px 0', textAlign: 'left' }}>{b.label}</td>
              <td style={mono}>{b.count}</td>
              <td style={{ ...mono, color: b.count ? tone(b.pnl) : undefined }}>{b.count ? fmtUsd(b.pnl, 0, { sign: true }) : '—'}</td>
              <td style={mono}>{b.winRate === null ? '—' : `${Math.round(b.winRate)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
