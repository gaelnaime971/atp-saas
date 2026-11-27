import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { getMemberTimeZone } from '@/lib/time-server'
import { readFigure, readNews } from '@/lib/market/read'
import { assembleCalendar } from '@/lib/market/calendar/assemble'
import { IMPACT_LABEL, type Impact } from '@/lib/market/calendar/releases'
import { toggle } from '@/lib/market/calendar/view'
import { requestClock } from '@/lib/market/freshness'
import {
  NEWS_KIND_LABEL, NEWS_SOURCE_LABEL, flashLine, isFresh, matchesNews, newsHref, parseNewsParams,
  type FlashLine, type SourceFilter,
} from '@/lib/market/news/news'
import { addDays, dateKey, formatDateKey, formatTime, timeZoneLabel } from '@/lib/time'

export const metadata: Metadata = { title: 'Actus officielles · Marchés · ATP' }

const BASE = '/dashboard/marches/actus'
const SOURCES: SourceFilter[] = ['fed', 'ecb', 'treasury', 'agencies']
const IMPACTS: Impact[] = ['high', 'medium', 'low']
const IMPACT_TONE: Record<Impact, 'loss' | 'warn' | 'neutral'> = { high: 'loss', medium: 'warn', low: 'neutral' }
const NEWS_DAYS = 14
const FLASH_DAYS = 7

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }
const chip = (active: boolean): CSSProperties => ({
  fontSize: 12, padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-md)', textDecoration: 'none',
  border: '1px solid var(--color-border-subtle)', whiteSpace: 'nowrap',
  background: active ? 'var(--color-accent)' : 'var(--color-surface-1)',
  color: active ? 'var(--color-surface-0)' : 'var(--color-text-2)', fontWeight: active ? 600 : 500,
})
const link: CSSProperties = { color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }

export default async function ActusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMarketsViewer()
  const [{ timeZone: tz }, sp] = await Promise.all([getMemberTimeZone(), searchParams])
  const p = parseNewsParams(sp)
  const { now, today } = requestClock()
  const memberToday = dateKey(now, tz)
  const etToday = dateKey(now, 'America/New_York')

  const [news, cal] = await Promise.all([
    readNews(addDays(today, -NEWS_DAYS)),
    assembleCalendar(addDays(etToday, -FLASH_DAYS), etToday),
  ])

  // Lignes flash : publications passées des 7 derniers jours dont le chiffre est en ligne.
  const released = cal.events.filter(e => e.kind === 'release' && e.figure && e.at !== null && e.at <= now && e.at >= now - FLASH_DAYS * 86_400_000)
  const flashes = (await Promise.all(released.map(async e => flashLine(e, await readFigure(e, now)))))
    .filter((f): f is FlashLine => f !== null)
    .sort((a, b) => b.at - a.at)
  const flashShown = flashes.filter(f => matchesNews(p, 'agencies', f.impact))

  const items = news.ok ? news.data.items : []
  const shown = items.filter(i => matchesNews(p, i.source, i.impact)).slice(0, 80)
  const freshCount = shown.filter(i => isFresh(i.publishedAt, now)).length + flashShown.filter(f => isFresh(f.at, now)).length
  const byDay = new Map<string, typeof shown>()
  for (const i of shown) {
    const d = dateKey(i.publishedAt, tz)
    byDay.set(d, [...(byDay.get(d) ?? []), i])
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader
        breadcrumb={<>Marchés · Flux</>}
        title="Actus officielles"
        subtitle={`Communiqués, discours et résultats officiels de la Fed, de la BCE et du Trésor US, et les chiffres des agences US dès leur publication · heures de ${timeZoneLabel(tz)}`}
      />
      <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
        <span>{news.ok && news.data.refreshedAt ? `Flux relus à ${formatTime(news.data.refreshedAt, tz)} · mise à jour à la consultation (90 s)` : 'Flux en attente de mise à jour'}</span>
        {freshCount > 0 && <Badge tone="accent" size="sm" bordered>{freshCount} {freshCount > 1 ? 'nouveautés' : 'nouveauté'} en 24 h</Badge>}
        {news.ok && news.data.failedFeeds > 0 && <Badge tone="warn" size="sm" bordered>{news.data.failedFeeds} flux indisponible{news.data.failedFeeds > 1 ? 's' : ''} pour le moment</Badge>}
      </div>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par source">
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginRight: 4 }}>Source</span>
            {SOURCES.map(s => (
              <Link key={s} href={newsHref(BASE, { ...p, sources: toggle(p.sources, s) })} aria-pressed={p.sources.includes(s)} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.sources.includes(s))}>{NEWS_SOURCE_LABEL[s]}</Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par impact">
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginRight: 4 }}>Impact</span>
            {IMPACTS.map(i => (
              <Link key={i} href={newsHref(BASE, { ...p, impacts: toggle(p.impacts, i) })} aria-pressed={p.impacts.includes(i)} className="inline-flex items-center min-h-11 md:min-h-0" style={chip(p.impacts.includes(i))}>{IMPACT_LABEL[i]}</Link>
            ))}
            {(p.sources.length > 0 || p.impacts.length > 0) && (
              <Link href={BASE} className="inline-flex items-center min-h-11 md:min-h-0" style={{ fontSize: 12, color: 'var(--color-text-2)', padding: '0 0.5rem' }}>Tout afficher</Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>Chiffres publiés · {FLASH_DAYS} jours</h2>
          {flashShown.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {flashShown.map(f => (
                <li key={f.id} style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '0.75rem 0' }}>
                  <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                    <span style={{ color: 'var(--color-text-1)' }}>{formatTime(f.at, tz)}</span>
                    <span>{dayLabel(dateKey(f.at, tz), memberToday)}</span>
                    <span>{f.agency}</span>
                    <Badge tone={IMPACT_TONE[f.impact]} size="sm">{IMPACT_LABEL[f.impact]}</Badge>
                    {isFresh(f.at, now) && <Badge tone="accent" size="sm">Nouveau</Badge>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-1)', margin: '0.375rem 0 0 0', lineHeight: 1.5 }}>{f.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>
              {p.sources.length && !p.sources.includes('agencies') ? 'Source « Agences US » non sélectionnée.' : 'Aucun chiffre publié sur la période (ou pas encore en ligne).'}
            </p>
          )}
          <p style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0', lineHeight: 1.6 }}>
            Lignes rédigées par ATP dès qu’un chiffre du calendrier est en ligne (BLS, BEA, Census, DOL, Fed, via FRED). Sans consensus.
          </p>
          <Link href="/dashboard/marches/calendrier" style={{ ...link, display: 'inline-block', marginTop: 10 }}>Calendrier complet →</Link>
        </Card>

        <Card>
          <h2 style={sectionTitle}>Actus · {NEWS_DAYS} jours</h2>
          {!news.ok ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Actus indisponibles pour le moment.</p>
          ) : shown.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Aucune actu pour ces filtres.</p>
          ) : (
            [...byDay.entries()].map(([day, list]) => (
              <section key={day} style={{ marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)', margin: '0.75rem 0 0.25rem 0' }}>
                  {dayLabel(day, memberToday, true)}
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {list.map(i => (
                    <li key={i.id} style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '0.75rem 0' }}>
                      <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                        <span style={{ color: 'var(--color-text-1)' }}>{formatTime(i.publishedAt, tz)}</span>
                        <span style={{ color: 'var(--color-text-2)', fontWeight: 600 }}>{NEWS_SOURCE_LABEL[i.source]}</span>
                        <span>{NEWS_KIND_LABEL[i.kind]}</span>
                        <Badge tone={IMPACT_TONE[i.impact]} size="sm">{IMPACT_LABEL[i.impact]}</Badge>
                        {isFresh(i.publishedAt, now) && <Badge tone="accent" size="sm">Nouveau</Badge>}
                      </div>
                      <a href={i.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', textDecoration: 'none', margin: '0.375rem 0 0 0', lineHeight: 1.4 }}>
                        {i.title}
                      </a>
                      {i.summary && <p style={{ fontSize: 12, color: 'var(--color-text-2)', margin: '0.25rem 0 0 0', lineHeight: 1.5 }}>{i.summary}</p>}
                      <a href={i.url} target="_blank" rel="noopener noreferrer" style={{ ...link, display: 'inline-block', marginTop: 6 }}>
                        Voir le texte officiel <span aria-hidden>↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </Card>
      </div>

      <Card>
        <h2 style={sectionTitle}>Sources et conditions</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
          <li><strong style={{ color: 'var(--color-text-1)' }}>Fed</strong> · flux RSS officiels (communiqués, discours, témoignages) de <a href="https://www.federalreserve.gov/feeds/feeds.htm" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-1)' }}>federalreserve.gov</a>, domaine public.</li>
          <li><strong style={{ color: 'var(--color-text-1)' }}>BCE</strong> · flux RSS officiel de <a href="https://www.ecb.europa.eu/home/html/rss.en.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-1)' }}>ecb.europa.eu</a>. Source : Banque centrale européenne ; ces informations sont disponibles gratuitement sur le site de la BCE.</li>
          <li><strong style={{ color: 'var(--color-text-1)' }}>Trésor US</strong> · résultats des adjudications de notes et d’obligations d’après <a href="https://www.treasurydirect.gov/auctions/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-1)' }}>TreasuryDirect</a> (Bureau of the Fiscal Service), lignes rédigées par ATP.</li>
          <li><strong style={{ color: 'var(--color-text-1)' }}>Agences US</strong> · chiffres du calendrier via FRED (BLS, BEA, Census, DOL, Fed).</li>
          <li><strong style={{ color: 'var(--color-text-1)' }}>BoJ</strong> · pas de reprise (ses conditions excluent la reproduction commerciale) : <a href="https://www.boj.or.jp/en/whatsnew/index.htm" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-1)' }}>nouveautés sur le site de la BoJ</a>.</li>
        </ul>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0.75rem 0 0 0' }}>Titres et résumés tels que publiés par chaque institution (souvent en anglais), avec un lien vers le texte officiel. Aucune presse, aucune dépêche d’agence.</p>
      </Card>
      <SourceMentions fred />
    </div>
  )
}

/** « Aujourd’hui », « Hier » ou « jeu. 26 nov. » (date du membre). */
function dayLabel(day: string, today: string, long = false): string {
  if (day === today) return 'Aujourd’hui'
  if (day === addDays(today, -1)) return 'Hier'
  return long ? formatDateKey(day, { long: true }) : formatDateKey(day)
}
