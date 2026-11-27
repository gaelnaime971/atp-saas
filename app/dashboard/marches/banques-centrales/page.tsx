import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { LineChart } from '@/components/terminal/charts/LineChart'
import { DataStamp, SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { readLastSuccess, readSeries } from '@/lib/market/read'
import {
  ATLANTA_FED_MPT_URL, BANKS, ECB_MEETINGS, MEETINGS, bojObservations, lastMeeting, meetingOutcome, nextMeeting, rateChanges, stepSeries,
  type BankCode, type Meeting, type RateChange,
} from '@/lib/market/central-banks'
import { ECB_NOTICE } from '@/lib/market/ecb'
import { isIngestLate, requestClock } from '@/lib/market/freshness'
import { minusYears } from '@/lib/market/stats'
import { addDays, dateKey, formatDateKey, formatDuration, formatTime, timeZoneLabel, zonedTimeToUtc } from '@/lib/time'
import { fmtNumber } from '@/lib/format'
import type { Observation } from '@/lib/market/fred'

export const metadata: Metadata = { title: 'Banques centrales · Marchés · ATP' }

const BANK_COLOR: Record<BankCode, string> = { FED: 'var(--color-series-1)', ECB: 'var(--color-series-5)', BOJ: 'var(--color-series-3)' }

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const pct = (v: number) => `${fmtNumber(v, 2)} %`
const pts = (c: RateChange) => `${fmtNumber(c.to - c.from, 2, { sign: true })} pt`

interface BankView {
  code: BankCode
  rate: string | null
  series: Observation[]
  changes: RateChange[]
  last: Meeting | null
  next: Meeting | null
}

/** Instant de la décision (heure fixe de la banque) ; BoJ : pas d'heure fixe → null. */
function decisionAt(bank: BankCode, m: Meeting): number | null {
  const b = BANKS[bank]
  return b.decisionTime ? zonedTimeToUtc(m.decisionDate, b.decisionTime, b.zone).getTime() : null
}

export default async function BanquesCentralesPage() {
  await requireMarketsViewer()
  const { timeZone: tz } = await getMemberTimeZone()
  const { now, today } = requestClock()
  const [series, lastOk] = await Promise.all([
    readSeries(['DFEDTARL', 'DFEDTARU', 'ECB_DFR', 'ECB_MRO'], minusYears(today, 4)),
    readLastSuccess(),
  ])
  const d = series.ok ? series.data : {}

  const lower = d.DFEDTARL ?? []
  const upper = d.DFEDTARU ?? []
  const dfr = d.ECB_DFR ?? []
  const mro = d.ECB_MRO ?? []
  const boj = bojObservations()
  const views: BankView[] = [
    {
      code: 'FED', series: upper, changes: rateChanges(upper),
      rate: lower.length && upper.length ? `${fmtNumber(lower.at(-1)!.value, 2)}–${fmtNumber(upper.at(-1)!.value, 2)} %` : null,
      last: lastMeeting('FED', dateKey(now, BANKS.FED.zone)), next: nextMeeting('FED', dateKey(now, BANKS.FED.zone)),
    },
    {
      code: 'ECB', series: dfr, changes: rateChanges(dfr),
      rate: dfr.length ? `${pct(dfr.at(-1)!.value)} (dépôt)${mro.length ? ` · refi ${pct(mro.at(-1)!.value)}` : ''}` : null,
      last: null, next: nextMeeting('ECB', dateKey(now, BANKS.ECB.zone)),
    },
    {
      code: 'BOJ', series: boj, changes: rateChanges(boj),
      rate: pct(boj.at(-1)!.value),
      last: lastMeeting('BOJ', dateKey(now, BANKS.BOJ.zone)), next: nextMeeting('BOJ', dateKey(now, BANKS.BOJ.zone)),
    },
  ]

  const upcoming = views
    .filter(v => v.next)
    .map(v => ({ v, at: decisionAt(v.code, v.next!) ?? zonedTimeToUtc(v.next!.decisionDate, '12:00', BANKS[v.code].zone).getTime() }))
    .sort((a, b) => a.at - b.at)
  const first = upcoming[0]
  const ingestLate = lastOk.ok && (isIngestLate(lastOk.data.fred, now) || isIngestLate(lastOk.data.ecb, now))
  const missing = !series.ok || upper.length === 0 || dfr.length === 0

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader
        breadcrumb={<>Marchés · Agenda</>}
        title="Banques centrales"
        subtitle={`Taux officiels, dernières décisions et prochaines réunions de la Fed, de la BCE et de la BoJ · heures de ${timeZoneLabel(tz)}`}
      />
      <DataStamp label="Taux au" date={today} late={ingestLate || missing} lateReason={missing ? 'Taux de la Fed ou de la BCE pas encore chargés' : 'Mise à jour automatique en retard'} />

      {first && (
        <Card>
          <h2 style={sectionTitle}>Prochaine décision</h2>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-1)' }}>
              {BANKS[first.v.code].label} · {formatDateKey(first.v.next!.decisionDate, { long: true })}
            </span>
            <span style={{ ...mono, fontSize: 14, color: 'var(--color-accent)' }}>
              {first.at > now ? `dans ${formatDuration(first.at - now)}` : 'aujourd’hui'}
            </span>
          </div>
          <KeyTimes bank={first.v.code} meeting={first.v.next!} tz={tz} />
        </Card>
      )}

      <Card>
        <h2 style={sectionTitle}>Les 3 suivies</h2>
        <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
                <th style={{ fontWeight: 500, padding: '0 0 8px 0' }}>Banque</th>
                <th style={{ fontWeight: 500 }}>Taux directeur</th>
                <th style={{ fontWeight: 500 }}>Dernier changement</th>
                <th style={{ fontWeight: 500 }}>Dernière réunion</th>
                <th style={{ fontWeight: 500 }}>Prochaine réunion</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-2.5">
              {views.map(v => {
                const b = BANKS[v.code]
                const lastChange = v.changes.at(-1)
                const outcome = v.last ? meetingOutcome(v.last, v.changes) : null
                const at = v.next ? decisionAt(v.code, v.next) : null
                const days = v.next ? Math.round((Date.parse(`${v.next.decisionDate}T00:00:00Z`) - Date.parse(`${dateKey(now, b.zone)}T00:00:00Z`)) / 86_400_000) : null
                return (
                  <tr key={v.code} style={{ borderTop: '1px solid var(--color-border-subtle)', verticalAlign: 'top' }}>
                    <td><strong style={{ color: 'var(--color-text-1)' }}>{b.label}</strong> <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>{b.currency}</span></td>
                    <td style={{ ...mono, color: 'var(--color-text-1)', fontWeight: 600 }}>
                      {v.rate ?? '—'}
                      <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 11, color: 'var(--color-text-3)' }}>{b.rateLabel}</span>
                    </td>
                    <td style={{ color: 'var(--color-text-2)' }}>
                      {lastChange ? <><span style={{ ...mono, color: lastChange.to > lastChange.from ? 'var(--color-loss)' : 'var(--color-profit)' }}>{pts(lastChange)}</span> en vigueur le {formatDateKey(lastChange.date, { year: true })}</> : '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-2)' }}>
                      {v.last && outcome ? <>{outcome.kind === 'hold' ? 'Maintien' : outcome.kind === 'hike' ? 'Hausse' : 'Baisse'} le {formatDateKey(v.last.decisionDate)}</> : v.code === 'ECB' ? <span style={{ color: 'var(--color-text-3)' }}>calendrier suivi à partir du {formatDateKey(ECB_MEETINGS[0].decisionDate)}</span> : '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-1)' }}>
                      {v.next ? (
                        <>
                          {formatDateKey(v.next.decisionDate)} <span style={{ ...mono, color: 'var(--color-accent)' }}>J−{days}</span>
                          <span style={{ display: 'block', ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                            {at ? `décision à ${formatTime(at, tz)} chez toi` : 'heure de décision non fixée'}
                            {v.next.projections ? ' · avec projections' : ''}{v.next.tentative ? ' · date à confirmer' : ''}
                          </span>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {views.map(v => {
          const start = minusYears(today, 3)
          const startValue = v.series.filter(o => o.date <= start).at(-1)?.value ?? v.series.find(o => o.date >= start)?.value
          const points = startValue === undefined ? [] : stepSeries(v.changes, { date: start, value: startValue }, today)
          const meetings = MEETINGS[v.code].filter(m => m.decisionDate >= dateKey(now, BANKS[v.code].zone) && m.decisionDate <= addDays(today, 365))
          return (
            <Card key={v.code}>
              <h2 style={sectionTitle}>{BANKS[v.code].label} · taux sur 3 ans</h2>
              {points.length > 1 ? (
                <LineChart ariaLabel={`Taux directeur de la ${BANKS[v.code].label} sur 3 ans`} height={160} format={x => `${fmtNumber(x, 2)} %`}
                  series={[{ id: v.code, label: BANKS[v.code].label, color: BANK_COLOR[v.code], points }]} />
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Historique pas encore chargé.</p>
              )}
              <h3 style={{ ...sectionTitle, margin: '1.25rem 0 0.5rem 0' }}>Réunions des 12 prochains mois</h3>
              <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {meetings.map(m => (
                  <li key={m.decisionDate} style={{ ...mono, fontSize: 11, color: 'var(--color-text-1)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '0.375rem 0.5rem' }}>
                    {formatDateKey(m.decisionDate, { year: m.decisionDate.slice(0, 4) !== today.slice(0, 4) })}
                    {m.projections && <span style={{ color: 'var(--color-accent)' }}> · projections</span>}
                    {m.tentative && <span style={{ color: 'var(--color-text-3)' }}> · à confirmer</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>

      <Card>
        <h2 style={sectionTitle}>Probabilités · Fed</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: 0, lineHeight: 1.6 }}>
          Les probabilités implicites de la prochaine décision de la Fed sont publiées par le{' '}
          <a href={ATLANTA_FED_MPT_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>Market Probability Tracker de la Fed d’Atlanta</a>.
          Nous n’affichons pas ses chiffres ici : ses conditions d’utilisation n’autorisent leur reprise que sans but commercial. Pas de probabilités pour la BCE et la BoJ (aucune source officielle gratuite).
        </p>
        {missing && <Badge tone="warn" size="sm" className="mt-3">Taux de la Fed ou de la BCE en attente de la première mise à jour</Badge>}
      </Card>

      <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7 }}>
        Sources : calendriers officiels des réunions (<a href={BANKS.FED.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>Fed</a>, BCE, <a href="https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>BoJ</a>) ; taux de la Fed via FRED (Board of Governors) ; décisions de la BoJ : <a href={BANKS.BOJ.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>communiqués de la Bank of Japan</a>.
        {' '}{ECB_NOTICE}
      </footer>
      <SourceMentions fred />
    </div>
  )
}

/** Heures clés de la décision chez le membre + fenêtre ATP (±15 min autour de la décision et de la conférence). */
function KeyTimes({ bank, meeting, tz }: { bank: BankCode; meeting: Meeting; tz: string }) {
  const b = BANKS[bank]
  if (!b.decisionTime) {
    return <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '8px 0 0 0' }}>La BoJ ne fixe pas d’heure : la décision tombe en fin de réunion (matinée à Tokyo).</p>
  }
  const decision = zonedTimeToUtc(meeting.decisionDate, b.decisionTime, b.zone).getTime()
  const press = b.pressTime ? zonedTimeToUtc(meeting.decisionDate, b.pressTime, b.zone).getTime() : null
  const start = decision - 15 * 60_000
  const end = (press ?? decision) + 15 * 60_000
  return (
    <ul style={{ listStyle: 'none', margin: '12px 0 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <li style={{ fontSize: 13, color: 'var(--color-text-1)' }}><span style={{ ...mono, display: 'inline-block', width: 56 }}>{formatTime(decision, tz)}</span>Décision{meeting.projections ? ' et projections' : ''}</li>
      {press && <li style={{ fontSize: 13, color: 'var(--color-text-1)' }}><span style={{ ...mono, display: 'inline-block', width: 56 }}>{formatTime(press, tz)}</span>Conférence de presse</li>}
      <li style={{ fontSize: 13, color: 'var(--color-accent)' }}><span style={{ ...mono, display: 'inline-block', width: 56 }}>{formatTime(start, tz)}</span>Fenêtre ATP jusqu’à {formatTime(end, tz)} : aucune position</li>
    </ul>
  )
}
