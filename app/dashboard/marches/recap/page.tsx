import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { createClient } from '@/lib/supabase/server'
import { readAuctionResults, readCot, readFigure, readNews, readSeries } from '@/lib/market/read'
import { assembleCalendar } from '@/lib/market/calendar/assemble'
import { IMPACT_LABEL, type Impact } from '@/lib/market/calendar/releases'
import { formatFigure } from '@/lib/market/calendar/view'
import { requestClock } from '@/lib/market/freshness'
import { minusYears } from '@/lib/market/stats'
import { COT_MARKETS, FRED_EXCLUDED } from '@/lib/market/catalog'
import { COT_CATEGORIES, cotSnapshot, marketRows, percentileReading, usualPublicationDate } from '@/lib/market/cot'
import { SENTIMENT_COMPONENTS, SENTIMENT_FRED_CODES, SENTIMENT_YEARS, buildSentimentInputs, sentimentAt } from '@/lib/market/sentiment'
import { NEWS_KIND_LABEL, NEWS_SOURCE_LABEL, termFr } from '@/lib/market/news/news'
import {
  cashCloseAt, journalDay, nextTradingDay, pickRecapDay, planLabel, previousTradingDay, recapSummary, recentSessions,
  type JournalRow, type RecapRelease,
} from '@/lib/market/recap/recap'
import { MARKET_SPECIAL_DAYS } from '@/lib/terminal/market-holidays'
import { addDays, dateKey, formatDateKey, formatTime, timeZoneLabel } from '@/lib/time'
import { fmtNumber, fmtUsd } from '@/lib/format'

export const metadata: Metadata = { title: 'Récap de séance · Marchés · ATP' }

const ET = 'America/New_York'
const BASE = '/dashboard/marches/recap'
const IMPACT_TONE: Record<Impact, 'loss' | 'warn' | 'neutral'> = { high: 'loss', medium: 'warn', low: 'neutral' }
const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const row: CSSProperties = { borderTop: '1px solid var(--color-border-subtle)', padding: '0.625rem 0' }

export default async function RecapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId, viewer } = await requireMarketsViewer()
  const [{ timeZone: tz }, sp] = await Promise.all([getMemberTimeZone(), searchParams])
  const { now, today } = requestClock()
  const days = MARKET_SPECIAL_DAYS
  const requested = typeof sp.jour === 'string' ? sp.jour : undefined
  const day = pickRecapDay(requested, now, days)
  const registry = recentSessions(now, days, 5)
  const next = nextTradingDay(day, days)
  const prev = previousTradingDay(day, days)
  const since = minusYears(today, SENTIMENT_YEARS + 2)

  const supabase = await createClient()
  const [cal, news, auctions, series, cot, journalRes] = await Promise.all([
    assembleCalendar(day, next),
    readNews(addDays(day, -1)),
    readAuctionResults(),
    readSeries(SENTIMENT_FRED_CODES, since),
    readCot(since),
    viewer === 'member'
      ? supabase.from('trading_sessions').select('session_date, pnl, trades_count, setup').eq('trader_id', userId).gte('session_date', registry.at(-1)!).lte('session_date', registry[0])
      : Promise.resolve({ data: [] as JournalRow[], error: null }),
  ])

  // ─── Publications de la séance (date de New York) et chiffres ───
  const dayEvents = cal.events.filter(e => e.date === day)
  const releasesRaw = dayEvents.filter(e => e.kind === 'release' && e.at !== null).sort((a, b) => (a.at as number) - (b.at as number))
  const figures = await Promise.all(releasesRaw.map(e => readFigure(e, now)))
  const releases: (RecapRelease & { id: string; agency: string; previous: string | null })[] = releasesRaw.map((e, k) => {
    const f = figures[k]
    const pub = f && f.status === 'published' && e.figure
    return {
      id: e.id, title: e.title, agency: e.agency, impact: e.impact === 'holiday' ? 'low' : e.impact, at: e.at as number,
      figure: pub ? `${formatFigure(f.actual, e.figure!.transform)} ${e.figure!.label}` : null,
      previous: pub && f.previous !== null ? formatFigure(f.previous, e.figure!.transform) : null,
    }
  })

  // ─── Fed (décisions FOMC du calendrier + textes du jour), BCE, Trésor ───
  const fomc = dayEvents.filter(e => e.kind === 'fomc' && e.at !== null)
  const dayNews = (news.ok ? news.data.items : []).filter(n => dateKey(n.publishedAt, ET) === day)
  const fedNews = dayNews.filter(n => n.source === 'fed')
  const otherNews = dayNews.filter(n => n.source === 'ecb' && n.impact !== 'low')
  const treasuryNews = dayNews.filter(n => n.source === 'treasury')
  const yields = new Map((auctions.ok ? auctions.data : []).map(a => [`${a.cusip}:${a.date}`, a.highYield]))
  const auctionLines = dayEvents.filter(e => e.kind === 'auction' && e.auction).flatMap(e => {
    const y = yields.get(`${e.auction!.cusip}:${e.date}`)
    return y === undefined ? [] : [{ label: termFr(e.auction!.term), yield: y }]
  })

  // ─── Sentiment : fin de séance contre la séance précédente ───
  const inputs = series.ok && cot.ok ? buildSentimentInputs(series.data, cot.data) : null
  const excluded = SENTIMENT_COMPONENTS.filter(c => FRED_EXCLUDED.some(x => c.source.includes(x.code))).map(c => c.id)
  const scoreOf = (d: string) => { const s = inputs ? sentimentAt(inputs, d, excluded).score : null; return s === null ? null : Math.round(s) }
  const score = scoreOf(day)
  const scorePrev = scoreOf(prev)

  // ─── COT : rapport publié ce jour-là (en principe le vendredi) ───
  const cotRows = cot.ok ? cot.data : []
  const cotToday = COT_MARKETS.flatMap(m => {
    const rows = marketRows(cotRows, m.code)
    const idx = rows.findIndex(r => usualPublicationDate(r.reportDate) === day)
    const snap = idx >= 0 ? cotSnapshot(rows, idx) : null
    return snap ? [{ market: m.code, snap }] : []
  })
  const cotExtremes = cotToday.flatMap(({ market, snap }) => COT_CATEGORIES.flatMap(c => {
    const r = percentileReading(snap.categories[c.id].percentile)
    return r.extreme ? [`${c.label} sur ${market} (${r.label.toLowerCase()})`] : []
  }))

  // ─── Séance suivante ───
  const nextEvents = cal.events.filter(e => e.date === next && e.at !== null && (e.impact === 'high' || e.impact === 'medium')).sort((a, b) => (a.at as number) - (b.at as number))

  // ─── Journal ───
  const journalRows = (journalRes.data ?? []) as JournalRow[]
  const mine = viewer === 'member' ? journalDay(journalRows, day) : null

  const summary = recapSummary({
    day, tz, specialDays: cal.specialDays, releases,
    fed: [...fomc.map(e => ({ title: e.title, kind: 'fomc' })), ...fedNews.map(n => ({ title: n.title, kind: n.kind }))],
    auctions: auctionLines,
    sentiment: score === null ? null : { score, previous: scorePrev },
    cot: cotToday.length ? { reportDate: cotToday[0].snap.reportDate, extremes: cotExtremes } : null,
    tomorrow: { day: next, high: nextEvents.filter(e => e.impact === 'high').map(e => ({ title: e.title, at: e.at as number })) },
    journal: mine,
  })

  const closeAt = cashCloseAt(day, days)
  // Fermetures de Wall Street (hors week-end) entre cette séance et la suivante.
  const closedBefore = cal.specialDays.filter(s => s.date > day && s.date < next && s.nyse === 'closed')
  const special = cal.specialDays.find(d => d.date === day)
  const highCount = releases.filter(r => r.impact === 'high').length

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader
        breadcrumb={<>Marchés · Global</>}
        title="Récap de séance"
        subtitle={`La séance de New York racontée par les publications officielles, la Fed, le Trésor, le sentiment de risque, le COT et ton journal · heures de ${timeZoneLabel(tz)}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1.2fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>Registre des récaps</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {registry.map(d => {
              const on = d === day
              return (
                <li key={d}>
                  <Link href={d === registry[0] ? BASE : `${BASE}?jour=${d}`} aria-current={on ? 'page' : undefined} className="flex items-center justify-between min-h-11 md:min-h-0" style={{
                    padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: 13,
                    background: on ? 'var(--color-accent-soft)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-2)',
                    border: `1px solid ${on ? 'var(--color-accent)' : 'transparent'}`, fontWeight: on ? 600 : 500,
                  }}>
                    <span>{formatDateKey(d)}</span>
                    <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)' }}>{d === registry[0] ? 'dernière' : ''}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0', lineHeight: 1.6 }}>
            Après la clôture du cash US, la séance du jour ; avant, la précédente.
          </p>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 style={{ ...sectionTitle, margin: 0 }}>Fiche de séance · New York</h2>
              {special?.nyse === 'early' && <Badge tone="warn" size="sm" bordered>Clôture anticipée</Badge>}
            </div>
            <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-1)', margin: '0.75rem 0 0.25rem 0' }}>Séance du {formatDateKey(day, { long: true })}</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: 0 }}>
              Cash US clôturé à {formatTime(closeAt, tz)}{special ? ` · ${special.name}` : ''}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginTop: '1rem' }}>
              <Tile label="Publications" value={String(releases.length)} />
              <Tile label="Fort impact" value={String(highCount)} />
              <Tile label="Textes de la Fed" value={String(fomc.length + fedNews.length)} />
              <Tile label="Sentiment" value={score === null ? '—' : String(score)} sub={score !== null && scorePrev !== null ? (score === scorePrev ? 'stable sur la séance' : `${fmtNumber(score - scorePrev, 0, { sign: true })} sur la séance`) : undefined} />
            </div>
          </Card>

          <Card>
            <h2 style={sectionTitle}>Synthèse · rédigée par des règles</h2>
            <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35, color: 'var(--color-text-1)', margin: '0 0 0.75rem 0' }}>{summary.headline}</p>
            {summary.paragraphs.map((p, k) => (
              <p key={k} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-1)', margin: '0 0 0.5rem 0' }}>{p}</p>
            ))}
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0', lineHeight: 1.6 }}>
              Les mouvements de prix (NQ, YM, ES…) arriveront avec une licence de données CME : pas de cotation ici.
            </p>
          </Card>

          <Card>
            <h2 style={sectionTitle}>Ta séance · ton journal</h2>
            {viewer !== 'member' ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Le journal est propre à chaque membre (non disponible en vue admin).</p>
            ) : journalRes.error ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Ton journal est indisponible pour le moment.</p>
            ) : mine ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Tile label="P&L" value={fmtUsd(mine.pnl, 0, { sign: true })} tone={mine.pnl > 0 ? 'var(--color-profit)' : mine.pnl < 0 ? 'var(--color-loss)' : undefined} />
                <Tile label="Trades" value={String(mine.trades)} sub={mine.winRate !== null ? `${Math.round(mine.winRate)} % gagnants` : undefined} />
                <Tile label="R" value={mine.r === null ? '—' : fmtNumber(mine.r, 1, { sign: true })} />
                <Tile label="Respect du plan" value={mine.plan === null ? '—' : `${fmtNumber(mine.plan, 1)}/10`} sub={mine.plan === null ? undefined : planLabel(mine.plan)} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: 0 }}>Pas de session saisie pour cette séance.</p>
                <Link href="/dashboard?page=session" className="inline-flex items-center min-h-11 md:min-h-0" style={{
                  padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-surface-0)',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>Saisir ma session</Link>
              </div>
            )}
          </Card>

          <div style={{ border: '1px dashed var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.125rem' }}>
            <p style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', margin: '0 0 0.375rem 0' }}>Séance suivante</p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-1)', margin: 0 }}>{summary.tomorrow}</p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 style={sectionTitle}>Publications de la séance</h2>
            {releases.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {releases.map(r => (
                  <li key={r.id} style={row}>
                    <div className="flex items-baseline gap-3">
                      <span style={{ ...mono, fontSize: 12, color: 'var(--color-text-1)', minWidth: 40 }}>{formatTime(r.at, tz)}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-1)', flex: 1, minWidth: 0 }}>{r.title}</span>
                      <Badge tone={IMPACT_TONE[r.impact]} size="sm">{IMPACT_LABEL[r.impact]}</Badge>
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginLeft: 52, marginTop: 2 }}>
                      {r.figure ? <><span style={{ color: 'var(--color-text-1)' }}>{r.figure}</span>{r.previous ? ` · précédent ${r.previous}` : ''}</> : 'chiffre pas encore en ligne'} · {r.agency}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>Aucune publication officielle US ce jour-là.</Empty>}
          </Card>

          <Card>
            <h2 style={sectionTitle}>Fed, BCE et Trésor</h2>
            {fomc.length + fedNews.length + otherNews.length + treasuryNews.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {fomc.map(e => (
                  <li key={e.id} style={row}><Line time={formatTime(e.at as number, tz)} who="Fed" what={e.title} /></li>
                ))}
                {[...fedNews, ...otherNews, ...treasuryNews].sort((a, b) => a.publishedAt - b.publishedAt).map(n => (
                  <li key={n.id} style={row}>
                    <Line time={formatTime(n.publishedAt, tz)} who={`${NEWS_SOURCE_LABEL[n.source]} · ${NEWS_KIND_LABEL[n.kind]}`} what={<a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-1)', textDecoration: 'none' }}>{n.title} <span aria-hidden style={{ color: 'var(--color-accent)' }}>↗</span></a>} />
                  </li>
                ))}
              </ul>
            ) : <Empty>Aucun texte officiel de la Fed, de la BCE ni du Trésor ce jour-là.</Empty>}
            <Link href="/dashboard/marches/actus" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}>Toutes les actus →</Link>
          </Card>

          {cotToday.length > 0 && (
            <Card>
              <h2 style={sectionTitle}>Nouveau rapport COT · positions du {formatDateKey(cotToday[0].snap.reportDate)}</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-1)', margin: 0, lineHeight: 1.6 }}>
                {cotExtremes.length ? `Positions extrêmes : ${cotExtremes.join(' · ')}.` : 'Aucune position extrême sur 3 ans.'}
              </p>
              <Link href="/dashboard/marches/cot" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}>Analyse COT →</Link>
            </Card>
          )}

          <Card>
            <h2 style={sectionTitle}>Particularités</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>{special ? `${special.name}${special.nyse === 'early' ? ' : clôture anticipée du cash US' : ''}.` : 'Séance aux horaires habituels.'}</li>
              {closedBefore.map(s => (
                <li key={s.date}>Wall Street fermée le {formatDateKey(s.date, { long: true })} ({s.name}).</li>
              ))}
              {nextEvents.length > 0 && (
                <li>Séance suivante : {nextEvents.map(e => `${e.title} à ${formatTime(e.at as number, tz)}`).join(', ')}.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7 }}>
        Sources : publications officielles US via FRED (BLS, BEA, Census, DOL, Fed) ; Fed et BCE (flux officiels) ; adjudications d’après TreasuryDirect ; CFTC ; ton journal ATP. Aucune cotation. Outil d’analyse, pas un conseil en investissement.
      </footer>
      <SourceMentions fred />
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', padding: '0.75rem 0.875rem', background: 'var(--color-surface-2)' }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-3)' }}>{label}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 600, color: tone ?? 'var(--color-text-1)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Line({ time, who, what }: { time: string; who: string; what: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span style={{ ...mono, fontSize: 12, color: 'var(--color-text-1)', minWidth: 40 }}>{time}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{who}</span>
        <span style={{ fontSize: 13, lineHeight: 1.45 }}>{what}</span>
      </span>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>{children}</p>
}
