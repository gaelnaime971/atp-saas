import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { readCot, readSeries } from '@/lib/market/read'
import { assembleCalendar } from '@/lib/market/calendar/assemble'
import { IMPACT_LABEL } from '@/lib/market/calendar/releases'
import { BANKS, bojObservations, nextMeeting, type BankCode } from '@/lib/market/central-banks'
import { CFTC_SOURCE, CFTC_URL, COT_MARKETS, FRED_EXCLUDED, FRED_NOTICE, FRED_TERMS_URL } from '@/lib/market/catalog'
import { COT_CATEGORIES, cotSnapshot, marketRows, percentileReading } from '@/lib/market/cot'
import { fedLiquidity, macroFigure } from '@/lib/market/macro'
import {
  SENTIMENT_COMPONENTS, SENTIMENT_FRED_CODES, SENTIMENT_YEARS, ZONE_LABEL, buildSentimentInputs, sentimentAt, type SentimentZone,
} from '@/lib/market/sentiment'
import { SP500_MONTHLY_RETURNS, SP500_SOURCE } from '@/lib/market/seasonality/sp500-returns'
import { CYCLE_LABEL } from '@/lib/market/seasonality/stats'
import { MONTH_NAMES_CAP, pct, seasonalitySummary } from '@/lib/market/seasonality/summary'
import { atpWindowText, buildBriefing, daysBetween, relativeDay, upcomingHigh, type BriefingKey } from '@/lib/market/overview/briefing'
import { requestClock } from '@/lib/market/freshness'
import { minusDays, minusYears } from '@/lib/market/stats'
import { SESSIONS, allSessionStates, monthlyOpex, quarterlyExpirations, type SessionStatus } from '@/lib/terminal/sessions'
import { addDays, dateKey, formatDateKey, formatDayLong, formatTime, timeZoneLabel, zonedTimeToUtc } from '@/lib/time'
import { fmtNumber } from '@/lib/format'

export const metadata: Metadata = { title: 'Vue d’ensemble · Marchés · ATP' }

const BASE = '/dashboard/marches'
const HREF: Record<BriefingKey, string> = {
  agenda: `${BASE}/calendrier`, taux: `${BASE}/banques-centrales`, sentiment: `${BASE}/sentiment`,
  cot: `${BASE}/cot`, saison: `${BASE}/saisonnalite`, echeances: `${BASE}/sessions`,
}
const ZONE_COLOR: Record<SentimentZone, string> = { aversion: 'var(--color-loss)', neutre: 'var(--color-neutral)', appetit: 'var(--color-profit)' }
const STATUS: Record<SessionStatus, { label: string; color: string }> = {
  open: { label: 'Ouverte', color: 'var(--color-profit)' },
  pause: { label: 'Pause', color: 'var(--color-warn)' },
  closed: { label: 'Fermée', color: 'var(--color-text-3)' },
}
const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const row: CSSProperties = { borderTop: '1px solid var(--color-border-subtle)', padding: '0.625rem 0' }

export default async function OverviewPage() {
  await requireMarketsViewer()
  const { timeZone: tz } = await getMemberTimeZone()
  const { now, today } = requestClock()
  const memberToday = dateKey(now, tz)
  const etToday = dateKey(now, 'America/New_York')
  const since = minusYears(today, SENTIMENT_YEARS + 2)

  const [series, cot, cal] = await Promise.all([
    readSeries([...SENTIMENT_FRED_CODES, 'DFEDTARL', 'DFEDTARU', 'ECB_DFR'], since),
    readCot(since),
    assembleCalendar(addDays(etToday, -1), addDays(etToday, 9)),
  ])
  const d = series.ok ? series.data : {}
  const cotRows = cot.ok ? cot.data : []

  // ─── Sentiment ───
  const inputs = buildSentimentInputs(d, cotRows)
  // Mêmes composantes écartées que la page Sentiment (catalogue FRED).
  const excluded = SENTIMENT_COMPONENTS.filter(c => FRED_EXCLUDED.some(x => c.source.includes(x.code))).map(c => c.id)
  const round = (v: number | null) => (v === null ? null : Math.round(v))
  const sentiment = sentimentAt(inputs, today, excluded)
  const score = round(sentiment.score)
  const weekAgo = round(sentimentAt(inputs, minusDays(today, 7), excluded).score)
  const monthAgo = round(sentimentAt(inputs, minusDays(today, 30), excluded).score)

  // ─── COT : dernier rapport par marché, positions extrêmes ───
  const cotView = COT_MARKETS.map(m => ({ code: m.code, snap: cotSnapshot(marketRows(cotRows, m.code)) }))
  const cotExtremes = cotView.flatMap(({ code, snap }) => (snap ? COT_CATEGORIES.flatMap(c => {
    const r = percentileReading(snap.categories[c.id].percentile)
    return r.extreme ? [{ market: code, category: c.label, reading: r.label }] : []
  }) : []))
  const cotDate = cotView.map(v => v.snap?.reportDate).filter((x): x is string => !!x).sort().at(-1) ?? null

  // ─── Banques centrales : prochaine réunion de chacune ───
  const rateOf: Record<BankCode, string | null> = {
    FED: d.DFEDTARL?.length && d.DFEDTARU?.length ? `${fmtNumber(d.DFEDTARL.at(-1)!.value, 2)}–${fmtNumber(d.DFEDTARU.at(-1)!.value, 2)} %` : null,
    ECB: d.ECB_DFR?.length ? `${fmtNumber(d.ECB_DFR.at(-1)!.value, 2)} %` : null,
    BOJ: `${fmtNumber(bojObservations().at(-1)!.value, 2)} %`,
  }
  const banks = (['FED', 'ECB', 'BOJ'] as BankCode[]).flatMap(code => {
    const b = BANKS[code]
    const m = nextMeeting(code, dateKey(now, b.zone))
    if (!m) return []
    const at = b.decisionTime ? zonedTimeToUtc(m.decisionDate, b.decisionTime, b.zone).getTime() : null
    return [{ code, label: b.label, date: m.decisionDate, at, sortAt: at ?? zonedTimeToUtc(m.decisionDate, '12:00', b.zone).getTime(), tentative: !!m.tentative }]
  }).sort((a, b) => a.sortAt - b.sortAt)

  // ─── Saisonnalité du mois ───
  const month = Number(memberToday.slice(5, 7)) - 1
  const season = seasonalitySummary(SP500_MONTHLY_RETURNS, SP500_SOURCE.lastMonth, Number(memberToday.slice(0, 4)))
  const monthStats = season.months[month]
  const cycle = season.cycle[season.currentCycle]

  // ─── Échéances : prochain roll (vers le contrat suivant), prochaine échéance, OPEX ───
  const exps = quarterlyExpirations(etToday, 3)
  const rollIdx = exps.findIndex(e => e.roll >= etToday)
  const roll = rollIdx >= 0 && exps[rollIdx + 1] ? { date: exps[rollIdx].roll, contract: exps[rollIdx + 1].contract, code: exps[rollIdx + 1].code } : null
  const expiry = exps[0]
  const opex = monthlyOpex(etToday, 1)[0]

  // ─── Sessions (état au chargement de la page) ───
  const states = allSessionStates(now, cal.specialDays)
  const openNames = SESSIONS.filter(s => ['tokyo', 'london', 'newYork'].includes(s.id) && states[s.id].status === 'open').map(s => s.short)

  // ─── Macro : chiffres clés ───
  const macro = [
    { id: 'DGS10', label: 'Taux à 10 ans', fig: macroFigure(d.DGS10 ?? []), unit: '%', digits: 2, deltaUnit: 'pt' },
    { id: 'DFII10', label: 'Taux réel à 10 ans', fig: macroFigure(d.DFII10 ?? []), unit: '%', digits: 2, deltaUnit: 'pt' },
    { id: 'LIQ', label: 'Liquidité de la Fed', fig: macroFigure(fedLiquidity(d.WALCL ?? [], d.WTREGEN ?? [], d.RRPONTSYD ?? [])), unit: 'Md$', digits: 0, deltaUnit: 'Md$' },
  ]

  // ─── Publications fortes à venir ───
  const high = upcomingHigh(cal.events, now).slice(0, 5)

  const briefing = buildBriefing({
    now, tz, specialDays: cal.specialDays, events: cal.events,
    nextDecision: banks[0] ? { bank: banks[0].label, date: banks[0].date, at: banks[0].at } : null,
    sentiment: score !== null && sentiment.zone ? { score, zone: ZONE_LABEL[sentiment.zone], weekAgo } : null,
    cotExtremes,
    season: monthStats ? { month: MONTH_NAMES_CAP[month], upCount: monthStats.upCount, n: monthStats.n, mean: monthStats.mean } : null,
    roll,
  })

  const subtitle = `${capitalize(formatDayLong(now, tz))} · ${formatTime(now, tz)} (${timeZoneLabel(tz)}) · ${
    openNames.length ? `${openNames.join(' et ')} ${openNames.length > 1 ? 'ouvertes' : 'ouverte'}` : 'grandes places fermées'}`

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader breadcrumb={<>Marchés · Global</>} title="Vue d’ensemble" subtitle={subtitle} />
      {(!series.ok || !cot.ok || cal.degraded) && (
        <p role="status" style={{ fontSize: 12, color: 'var(--color-warn)', margin: 0 }}>Une partie des données est indisponible pour le moment : les blocs concernés sont vides.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <Card>
          <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Briefing du jour</h2>
            <span style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)' }}>rédigé à {formatTime(now, tz)} par des règles simples</span>
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--color-text-1)', margin: '0 0 1rem 0' }}>{briefing.headline}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-5 gap-y-1 sm:gap-y-2.5" style={{ margin: 0 }}>
            {briefing.lines.map(l => (
              <div key={l.key} className="contents">
                <dt style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-3)', paddingTop: 3 }}>
                  <Link href={HREF[l.key]} style={{ color: 'inherit', textDecoration: 'none' }}>{l.label}</Link>
                </dt>
                <dd className="pb-2 sm:pb-0" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-1)' }}>{l.text}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Sentiment de risque</h2>
          {score !== null && sentiment.zone ? (
            <>
              <div className="flex items-baseline gap-3">
                <span style={{ ...mono, fontSize: 48, fontWeight: 700, lineHeight: 1, color: ZONE_COLOR[sentiment.zone] }}>{score}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>{ZONE_LABEL[sentiment.zone]}</span>
              </div>
              <Gauge score={score} />
              <div className="flex gap-4" style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginTop: 12 }}>
                <span>1 sem. {weekAgo ?? '—'} → {score}</span>
                <span>1 mois {monthAgo ?? '—'} → {score}</span>
              </div>
            </>
          ) : <Empty>Score pas encore disponible.</Empty>}
          <More href={`${BASE}/sentiment`}>Les 7 composantes</More>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Card>
          <h2 style={sectionTitle}>Prochaines annonces fortes · {timeZoneLabel(tz)}</h2>
          {high.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {high.map(e => (
                <li key={e.id} style={row}>
                  <div className="flex items-baseline gap-3">
                    <span style={{ ...mono, fontSize: 13, color: 'var(--color-text-1)', minWidth: 44 }}>{formatTime(e.at as number, tz)}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-1)', flex: 1, minWidth: 0 }}>{e.title}</span>
                    <Badge tone="loss" size="sm">{IMPACT_LABEL.high}</Badge>
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginLeft: 56, marginTop: 2 }}>
                    {relativeDay(dateKey(e.at as number, tz), memberToday)} · <span style={{ color: 'var(--color-accent)' }}>fenêtre ATP {atpWindowText(e.at as number, tz)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Aucune annonce à fort impact dans les 7 prochains jours.</Empty>}
          <More href={`${BASE}/calendrier`}>Calendrier complet</More>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Banques centrales · prochaines décisions</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {banks.map(b => {
              const day = b.at !== null ? dateKey(b.at, tz) : b.date
              return (
                <li key={b.code} style={row} className="flex items-baseline justify-between gap-3">
                  <span>
                    <strong style={{ color: 'var(--color-text-1)', fontSize: 14 }}>{b.label}</strong>{' '}
                    <span style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)' }}>{rateOf[b.code] ?? '—'}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-1)' }}>{formatDateKey(day)}</span>{' '}
                    <span style={{ ...mono, fontSize: 12, color: 'var(--color-accent)' }}>J−{Math.max(0, daysBetween(memberToday, day))}</span>
                    <span style={{ display: 'block', ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                      {b.at !== null ? `décision à ${formatTime(b.at, tz)}` : 'heure non fixée'}{b.tentative ? ' · à confirmer' : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          <More href={`${BASE}/banques-centrales`}>Taux et calendriers</More>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Sessions et échéances · NQ · YM</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {SESSIONS.map(s => {
              const st = states[s.id]
              return (
                <li key={s.id} style={{ ...row, padding: '0.5rem 0' }} className="flex items-baseline justify-between gap-3">
                  <span style={{ fontSize: 13, color: 'var(--color-text-1)' }}>{s.short}</span>
                  <span style={{ ...mono, fontSize: 12 }}>
                    <span style={{ color: STATUS[st.status].color }}>{STATUS[st.status].label}</span>
                    {st.nextChange && (
                      <span style={{ color: 'var(--color-text-3)' }}>
                        {' · '}{st.status === 'open' ? 'ferme' : 'ouvre'} {relativeDay(dateKey(st.nextChange, tz), memberToday) === 'aujourd’hui' ? '' : `${relativeDay(dateKey(st.nextChange, tz), memberToday)} `}à {formatTime(st.nextChange, tz)}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <dl className="grid gap-y-1.5" style={{ gridTemplateColumns: '1fr auto', margin: '0.75rem 0 0 0', fontSize: 12 }}>
            {roll && <KeyVal label={`Prochain roll → ${roll.code}`} value={`${formatDateKey(roll.date)} · J−${daysBetween(etToday, roll.date)}`} />}
            {expiry && <KeyVal label={`Échéance ${expiry.contract}`} value={`${formatDateKey(expiry.date)} · J−${daysBetween(etToday, expiry.date)}`} />}
            {opex && <KeyVal label="OPEX mensuelle" value={`${formatDateKey(opex)} · J−${daysBetween(etToday, opex)}`} />}
          </dl>
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '0.5rem 0 0 0' }}>État à {formatTime(now, tz)}, au chargement de la page.</p>
          <More href={`${BASE}/sessions`}>Sessions & horaires</More>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Card>
          <h2 style={sectionTitle}>Positionnement COT{cotDate ? ` · rapport du ${formatDateKey(cotDate)}` : ''}</h2>
          {cotView.some(v => v.snap) ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>
                  <th style={{ fontWeight: 500, padding: '0 12px 6px 0' }}>Marché</th>
                  <th style={{ fontWeight: 500 }}>Institutionnels</th>
                  <th style={{ fontWeight: 500 }}>Spéculateurs</th>
                </tr>
              </thead>
              <tbody>
                {cotView.map(({ code, snap }) => (
                  <tr key={code} style={{ borderTop: '1px solid var(--color-border-subtle)', verticalAlign: 'top' }}>
                    <td style={{ ...mono, padding: '7px 12px 7px 0', fontWeight: 600, color: 'var(--color-text-1)' }}>{code}</td>
                    {(['assetMgr', 'levMoney'] as const).map(cat => {
                      const c = snap?.categories[cat]
                      const r = percentileReading(c?.percentile ?? null)
                      return (
                        <td key={cat} style={{ padding: '7px 6px 7px 0', color: r.extreme ? 'var(--color-accent)' : 'var(--color-text-2)' }}>
                          <span style={mono}>{c?.percentile == null ? '—' : `${Math.round(c.percentile)}e pct`}</span>
                          <span style={{ display: 'block', fontSize: 11, color: r.extreme ? 'var(--color-accent)' : 'var(--color-text-3)' }}>{r.label}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>Rapports COT pas encore chargés.</Empty>}
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '0.5rem 0 0 0' }}>Percentile de la position nette (% de l’OI) sur 3 ans. En couleur : extrême.</p>
          <More href={`${BASE}/cot`}>Analyse COT</More>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Macro US · chiffres clés</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {macro.map(m => (
              <li key={m.id} style={row} className="flex items-baseline justify-between gap-3">
                <span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-1)', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span style={{ display: 'block', ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>{m.fig.last ? `au ${formatDateKey(m.fig.last.date)}` : 'pas encore chargé'}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'var(--color-text-1)' }}>{m.fig.last ? `${fmtNumber(m.fig.last.value, m.digits)} ${m.unit}` : '—'}</span>
                  {m.fig.change !== null && (
                    <span style={{ display: 'block', ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>{fmtNumber(m.fig.change, m.digits, { sign: true })} {m.deltaUnit} vs précédent</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <More href={`${BASE}/macro`}>Macro US</More>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Saisonnalité · {MONTH_NAMES_CAP[month].toLowerCase()}</h2>
          {monthStats ? (
            <dl className="grid gap-y-2" style={{ gridTemplateColumns: '1fr auto', margin: 0, fontSize: 13 }}>
              <KeyVal label="S&P 500 · moyenne" value={<span style={{ color: monthStats.mean >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>{pct(monthStats.mean)}</span>} />
              <KeyVal label="Médiane" value={pct(monthStats.median)} />
              <KeyVal label="Années en hausse" value={`${monthStats.upCount}/${monthStats.n} · ${Math.round(monthStats.upShare)} %`} />
              {cycle && <KeyVal label={`${CYCLE_LABEL[season.currentCycle]} (année)`} value={`${pct(cycle.mean, 1)} · ${cycle.upCount}/${cycle.n}`} />}
            </dl>
          ) : <Empty>—</Empty>}
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0' }}>
            {season.window.from}–{season.window.to} · cycle depuis {season.window.cycleFrom} · données Shiller
          </p>
          <More href={`${BASE}/saisonnalite`}>Saisonnalité détaillée</More>
        </Card>
      </div>

      <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ margin: 0 }}>
          Sources : publications officielles US (BLS, BEA, Census, DOL, Fed, Trésor) ; Fed, BCE, BoJ ; séries FRED ;{' '}
          <a href={CFTC_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>{CFTC_SOURCE}</a> ;
          S&P 500 : statistiques calculées d’après Robert J. Shiller. Aucune cotation. Outil d’analyse, pas un conseil en investissement.
        </p>
        <p style={{ margin: 0 }}>
          {FRED_NOTICE} En utilisant ces pages, tu acceptes les{' '}
          <a href={FRED_TERMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>conditions d’utilisation de l’API FRED</a>.
        </p>
      </footer>
    </div>
  )
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function Gauge({ score }: { score: number }) {
  return (
    <div style={{ position: 'relative', marginTop: 14 }} aria-hidden>
      <div className="flex" style={{ height: 6, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
        <span style={{ flex: 40, background: 'var(--color-loss)', opacity: 0.7 }} />
        <span style={{ flex: 20, background: 'var(--color-neutral)' }} />
        <span style={{ flex: 40, background: 'var(--color-profit)', opacity: 0.7 }} />
      </div>
      <span style={{ position: 'absolute', top: -4, left: `calc(${Math.min(100, Math.max(0, score))}% - 1px)`, width: 2, height: 14, background: 'var(--color-text-1)', borderRadius: 1 }} />
      <div className="flex justify-between" style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', marginTop: 6 }}>
        <span>0 aversion</span><span>100 appétit</span>
      </div>
    </div>
  )
}

function KeyVal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--color-text-3)' }}>{label}</dt>
      <dd style={{ ...mono, margin: 0, textAlign: 'right', color: 'var(--color-text-1)' }}>{value}</dd>
    </>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>{children}</p>
}

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5" style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}>
      {children} <span aria-hidden>→</span>
    </Link>
  )
}
