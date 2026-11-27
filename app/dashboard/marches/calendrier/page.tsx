import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import Card from '@/components/ui/Card'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { DataStamp, SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { readAuctionResults, readFigure, readLastSuccess } from '@/lib/market/read'
import { assembleCalendar } from '@/lib/market/calendar/assemble'
import {
  KIND_LABEL, atpWindows, eventsBetween, filterEvents, memberDate, type CalendarEvent, type ImpactFilter, type TypeFilter,
} from '@/lib/market/calendar/events'
import { IMPACT_LABEL } from '@/lib/market/calendar/releases'
import { calendarHref, formatFigure, parseCalendarParams, toggle } from '@/lib/market/calendar/view'
import type { PublishedFigure } from '@/lib/market/calendar/figure'
import { isIngestLate, requestClock } from '@/lib/market/freshness'
import { BEA_ICS_URL } from '@/lib/market/calendar/sources'
import { addDays, dateKey, formatDateKey, formatDayShort, formatDuration, formatTime, timeZoneLabel } from '@/lib/time'
import { fmtNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Calendrier éco · Marchés · ATP' }

const IMPACT_TONE: Record<CalendarEvent['impact'], BadgeTone> = { high: 'loss', medium: 'warn', low: 'neutral', holiday: 'info' }
const IMPACTS: ImpactFilter[] = ['high', 'medium', 'low']
const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'release', label: 'Publications' }, { id: 'fed', label: 'Fed' }, { id: 'auction', label: 'Adjudications' },
  { id: 'earnings', label: 'Résultats' }, { id: 'holiday', label: 'Fériés' },
]

const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const chip = (active: boolean): CSSProperties => ({
  fontSize: 12, padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-md)', textDecoration: 'none',
  border: '1px solid var(--color-border-subtle)', whiteSpace: 'nowrap',
  background: active ? 'var(--color-accent)' : 'var(--color-surface-1)',
  color: active ? 'var(--color-surface-0)' : 'var(--color-text-2)', fontWeight: active ? 600 : 500,
})

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMarketsViewer()
  const [{ timeZone: tz }, sp] = await Promise.all([getMemberTimeZone(), searchParams])
  const { now } = requestClock()
  const today = dateKey(now, tz)
  const p = parseCalendarParams(sp, today)

  const [cal, lastOk, auctions] = await Promise.all([assembleCalendar(p.from, p.to), readLastSuccess(), readAuctionResults()])
  const visible = filterEvents(eventsBetween(cal.events, p.from, p.to, tz), p.impacts, p.types)
  const windows = atpWindows(visible)

  // Chiffres publiés : seulement les publications déjà passées (cache court partagé).
  const figures = new Map<string, PublishedFigure | null>()
  await Promise.all(visible.filter(e => e.figure && e.at !== null && e.at <= now).map(async e => { figures.set(e.id, await readFigure(e, now)) }))
  const auctionYield = new Map((auctions.ok ? auctions.data : []).map(a => [`${a.cusip}:${a.date}`, a.highYield]))

  const days: string[] = []
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d)
  const ingestLate = lastOk.ok && isIngestLate(lastOk.data.calendar, now)

  const header = (
    <PageHeader
      breadcrumb={<>Marchés · Agenda</>}
      title="Calendrier économique"
      subtitle={`Heures de ${timeZoneLabel(tz)} · publications officielles US, sans consensus · fenêtres ATP de ±15 min autour des annonces fortes`}
      actions={
        <nav aria-label="Vue" className="flex flex-wrap items-center gap-1.5">
          <Link href={calendarHref(p, { view: 'jour', from: today })} aria-current={p.view === 'jour' ? 'page' : undefined} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.view === 'jour')}>Aujourd’hui</Link>
          <Link href={calendarHref(p, { view: 'semaine', from: p.view === 'semaine' ? p.from : today })} aria-current={p.view === 'semaine' ? 'page' : undefined} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.view === 'semaine')}>Semaine</Link>
        </nav>
      }
    />
  )

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      {header}
      <DataStamp label="Calendrier mis à jour, données au" date={today} late={ingestLate || cal.degraded} lateReason={cal.degraded ? 'Une source est indisponible' : 'Mise à jour automatique en retard'} />

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Link href={calendarHref(p, { from: addDays(p.from, p.view === 'semaine' ? -7 : -1) })} aria-label={p.view === 'semaine' ? 'Semaine précédente' : 'Jour précédent'} className="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0" style={chip(false)}>‹</Link>
            <span className="flex-1 md:flex-none min-w-0 text-center md:text-left" style={{ ...mono, fontSize: 13, color: 'var(--color-text-1)', fontWeight: 600 }}>
              {p.view === 'semaine' ? `${formatDateKey(p.from)} → ${formatDateKey(p.to, { year: true })}` : formatDateKey(p.from, { long: true, year: true })}
            </span>
            <Link href={calendarHref(p, { from: addDays(p.from, p.view === 'semaine' ? 7 : 1) })} aria-label={p.view === 'semaine' ? 'Semaine suivante' : 'Jour suivant'} className="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0" style={chip(false)}>›</Link>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par impact">
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginRight: 4 }}>Impact</span>
            {IMPACTS.map(i => (
              <Link key={i} href={calendarHref(p, { impacts: toggle(p.impacts, i) })} aria-pressed={p.impacts.includes(i)} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.impacts.includes(i))}>{IMPACT_LABEL[i]}</Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par type">
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginRight: 4 }}>Type</span>
            {TYPES.map(t => (
              <Link key={t.id} href={calendarHref(p, { types: toggle(p.types, t.id) })} aria-pressed={p.types.includes(t.id)} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.types.includes(t.id))}>{t.label}</Link>
            ))}
            {(p.impacts.length > 0 || p.types.length > 0) && (
              <Link href={calendarHref(p, { impacts: [], types: [] })} className="inline-flex items-center min-h-11 md:min-h-0" style={{ fontSize: 12, color: 'var(--color-text-2)', padding: '0 0.5rem' }}>Tout afficher</Link>
            )}
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState title="Aucun événement" description={cal.degraded ? 'Les données du calendrier ne sont pas encore disponibles.' : 'Rien ne correspond à cette période et à ces filtres.'} />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
                  <th style={{ fontWeight: 500, padding: '0 0 8px 0', width: 64 }}>Heure</th>
                  <th style={{ fontWeight: 500 }}>Événement</th>
                  <th style={{ fontWeight: 500 }}>Impact</th>
                  <th style={{ fontWeight: 500, textAlign: 'right' }}>Publié</th>
                  <th style={{ fontWeight: 500, textAlign: 'right' }}>Précédent</th>
                  <th style={{ fontWeight: 500, textAlign: 'right' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {days.map(day => {
                  const list = visible.filter(e => memberDate(e, tz) === day)
                  if (list.length === 0 && p.view === 'semaine') return null
                  return [
                    <tr key={`h-${day}`}>
                      <td colSpan={6} style={{ padding: '14px 0 6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>{formatDateKey(day, { long: true })}</span>
                        {day === today && <Badge tone="accent" size="sm" className="ml-2">aujourd’hui</Badge>}
                      </td>
                    </tr>,
                    ...(list.length === 0 ? [
                      <tr key={`e-${day}`}><td colSpan={6} style={{ padding: '10px 0', color: 'var(--color-text-3)', fontSize: 12 }}>Aucun événement ce jour-là.</td></tr>,
                    ] : list.flatMap(e => {
                      const fig = figures.get(e.id)
                      const yieldKey = e.auction ? `${e.auction.cusip}:${e.date}` : ''
                      const auctionYield = e.auction ? auctionYieldOf(yieldKey) : null
                      const win = windows.find(w => w.ids[w.ids.length - 1] === e.id)
                      const rows = [
                        <tr key={e.id} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                          <td style={{ ...mono, padding: '8px 0', color: 'var(--color-text-1)', verticalAlign: 'top' }}>{e.at === null ? '—' : formatTime(e.at, tz)}</td>
                          <td style={{ padding: '8px 12px 8px 0', verticalAlign: 'top' }}>
                            <span style={{ display: 'block', color: 'var(--color-text-1)', fontWeight: e.impact === 'high' ? 600 : 500 }}>
                              {e.title}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-3)' }}>
                              {[...new Set([KIND_LABEL[e.kind], e.agency, e.figure?.label, e.detail, e.timeOfficial ? null : 'heure habituelle'].filter(Boolean))].join(' · ')}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: 8 }}>
                            <Badge tone={IMPACT_TONE[e.impact]} size="sm" uppercase>{e.impact === 'holiday' ? 'Férié' : IMPACT_LABEL[e.impact]}</Badge>
                          </td>
                          <td style={{ ...mono, textAlign: 'right', verticalAlign: 'top', paddingTop: 8, color: 'var(--color-text-1)', fontWeight: 600 }}>
                            {e.auction ? (auctionYield === null ? '—' : `${fmtNumber(auctionYield, 3)} %`)
                              : fig?.status === 'published' && e.figure ? formatFigure(fig.actual, e.figure.transform) : '—'}
                          </td>
                          <td style={{ ...mono, textAlign: 'right', verticalAlign: 'top', paddingTop: 8, color: 'var(--color-text-2)' }}>
                            {fig?.status === 'published' && e.figure ? formatFigure(fig.previous, e.figure.transform) : '—'}
                          </td>
                          <td style={{ ...mono, textAlign: 'right', verticalAlign: 'top', paddingTop: 8, fontSize: 12, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
                            {statusOf(e, fig ?? null, auctionYield, now, tz)}
                          </td>
                        </tr>,
                      ]
                      if (win) {
                        rows.push(
                          <tr key={`w-${e.id}`}>
                            <td />
                            <td colSpan={5} style={{ padding: '0 0 8px 0', fontSize: 12, color: 'var(--color-accent)' }}>
                              Fenêtre ATP : aucune position de {formatTime(win.start, tz)} à {formatTime(win.end, tz)}
                            </td>
                          </tr>,
                        )
                      }
                      return rows
                    })),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: 0, lineHeight: 1.6 }}>
        Chiffres officiels uniquement, mis à jour quelques minutes après l’annonce ; pas de consensus des économistes (données sous licence). Heures : celles des agences (fichier du BEA quand il les donne, sinon l’heure habituelle de publication). Résultats d’entreprises et discours de la Fed : saisis par l’équipe ATP.
      </p>
      <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7 }}>
        Sources : dates des publications et chiffres via FRED (BLS, BEA, Census, Département du Travail, Fed) ; heures du BEA (<a href={BEA_ICS_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>calendrier officiel</a>) ; adjudications : TreasuryDirect (Trésor américain) ; réunions de la Fed : federalreserve.gov ; fériés : NYSE.
      </footer>
      <SourceMentions fred />
    </div>
  )

  function auctionYieldOf(key: string): number | null {
    return auctionYield.get(key) ?? null
  }
}

function statusOf(e: CalendarEvent, fig: PublishedFigure | null, auctionYield: number | null, now: number, tz: string): string {
  if (e.kind === 'holiday') return e.at === null ? 'journée' : 'clôture anticipée'
  if (e.at === null) return formatDayShort(Date.parse(`${e.date}T12:00:00Z`), 'UTC')
  if (e.at > now) {
    const ms = e.at - now
    return ms < 24 * 3_600_000 ? `dans ${formatDuration(ms)}` : formatDayShort(e.at, tz)
  }
  if (e.figure) return fig?.status === 'published' ? 'publié' : 'en attente du chiffre'
  if (e.auction) return auctionYield !== null ? 'résultat publié' : 'en attente du résultat'
  return 'passé'
}
