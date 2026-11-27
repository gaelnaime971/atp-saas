/**
 * Actus officielles (Marchés › Actus officielles) : calculs purs, testés
 * dans news.test.ts. Sources (DECISIONS.md, lot E2) :
 *
 * - Fed : flux RSS officiels (communiqués, discours, témoignages),
 *   domaine public ;
 * - BCE : flux RSS officiel (communiqués, discours, conférences),
 *   réutilisation libre, source citée ;
 * - Trésor : résultats des adjudications (API TreasuryDirect, déjà
 *   utilisée par le calendrier), lignes rédigées par ATP à partir des
 *   seuls faits (taux retenu, ratio de couverture) ;
 * - agences US : lignes « flash » calculées quand un chiffre du
 *   calendrier tombe (non stockées).
 *
 * Écartés : BoJ (reproduction commerciale interdite sans permission),
 * communiqués de presse du Trésor (aucun flux officiel), presse et
 * dépêches d'agences.
 */
import type { Impact } from '@/lib/market/calendar/releases'
import { RELEASE_BY_ID } from '@/lib/market/calendar/releases'
import type { CalendarEvent } from '@/lib/market/calendar/events'
import type { PublishedFigure } from '@/lib/market/calendar/figure'
import { formatFigure } from '@/lib/market/calendar/view'

export type NewsSource = 'fed' | 'ecb' | 'treasury'
export type NewsKind = 'monetary' | 'press' | 'speech' | 'testimony' | 'auction'

export interface NewsItem {
  /** Clé stable (source + adresse canonique) : dédoublonnage et upsert. */
  id: string
  source: NewsSource
  kind: NewsKind
  title: string
  /** Résumé officiel du flux, s'il apporte plus que le titre. */
  summary: string | null
  url: string
  category: string | null
  impact: Impact
  /** Instant de publication (ms). */
  publishedAt: number
}

export const NEWS_SOURCE_LABEL: Record<NewsSource | 'agencies', string> = {
  fed: 'Fed', ecb: 'BCE', treasury: 'Trésor US', agencies: 'Agences US',
}
export const NEWS_KIND_LABEL: Record<NewsKind | 'flash', string> = {
  monetary: 'Politique monétaire', press: 'Communiqué', speech: 'Discours', testimony: 'Témoignage', auction: 'Adjudication', flash: 'Chiffre publié',
}

// ─── RSS ─────────────────────────────────────────────────────────

export interface RssItem { title: string; link: string; guid: string | null; description: string | null; category: string | null; pubDate: string | null }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** Texte d'un nœud RSS : CDATA, entités HTML, balises retirées, espaces réduits. */
export function rssText(raw: string | undefined | null): string {
  if (!raw) return ''
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    const named = ENTITIES[e.toLowerCase()]
    if (named) return named
    const accents: Record<string, string> = { iacute: 'í', eacute: 'é', egrave: 'è', aacute: 'á', oacute: 'ó', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' }
    return accents[e.toLowerCase()] ?? m
  })
  return s.replace(/\s+/g, ' ').trim()
}

/** Lecture minimale d'un flux RSS 2.0 (title, link, guid, description, category, pubDate). */
export function parseRss(xml: string): RssItem[] {
  const out: RssItem[] = []
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const body = m[1]
    const tag = (name: string) => body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1]
    const title = rssText(tag('title'))
    const link = rssText(tag('link'))
    if (!title || !link) continue
    out.push({
      title, link,
      guid: rssText(tag('guid')) || null,
      description: rssText(tag('description')) || null,
      category: rssText(tag('category')) || null,
      pubDate: rssText(tag('pubDate')) || null,
    })
  }
  return out
}

/** Adresse canonique : https, hôte en minuscules, doubles barres, fragment et requête retirés. */
export function canonicalUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    u.protocol = 'https:'
    u.hash = ''
    u.search = ''
    u.pathname = u.pathname.replace(/\/{2,}/g, '/')
    return u.toString()
  } catch {
    return null
  }
}

export const newsId = (source: NewsSource, url: string) => `${source}:${url}`

function pubTime(s: string | null): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

const sameText = (a: string, b: string) => a.replace(/\W+/g, '').toLowerCase() === b.replace(/\W+/g, '').toLowerCase()

// ─── Fed ─────────────────────────────────────────────────────────

export type FedFeed = 'press' | 'speech' | 'testimony'

/** Impact d'une actu de la Fed (règles simples, voir DECISIONS.md). */
export function fedImpact(kind: NewsKind, title: string, category: string | null): Impact {
  const t = title.toLowerCase()
  if (kind === 'monetary') {
    if (/fomc statement|issues fomc|implementation note|economic projections/.test(t)) return 'high'
    return 'medium'
  }
  if (kind === 'testimony') return /monetary policy report/.test(t) ? 'high' : 'medium'
  if (kind === 'speech') return 'medium'
  return category && /monetary policy/i.test(category) ? 'medium' : 'low'
}

export function fedItems(items: readonly RssItem[], feed: FedFeed): NewsItem[] {
  return items.flatMap(it => {
    const url = canonicalUrl(it.link)
    const at = pubTime(it.pubDate)
    if (!url || at === null || !/(^|\.)federalreserve\.gov$/.test(new URL(url).hostname)) return []
    const kind: NewsKind = feed === 'speech' ? 'speech' : feed === 'testimony' ? 'testimony'
      : it.category && /monetary policy/i.test(it.category) ? 'monetary' : 'press'
    const summary = it.description && !sameText(it.description, it.title) ? it.description : null
    return [{ id: newsId('fed', url), source: 'fed' as const, kind, title: it.title, summary, url, category: it.category, impact: fedImpact(kind, it.title, it.category), publishedAt: at }]
  })
}

// ─── BCE ─────────────────────────────────────────────────────────

/** Nature et impact d'une actu de la BCE, d'après l'adresse officielle. */
export function ecbClassify(url: string, title: string): { kind: NewsKind; impact: Impact } {
  const p = new URL(url).pathname
  if (/\/press\/pr\/date\/\d{4}\/html\/ecb\.mp\d/.test(p) || /monetary-policy-statement|\/press\/pressconf\//.test(p)) return { kind: 'monetary', impact: 'high' }
  if (/\/press\/accounts\//.test(p)) return { kind: 'monetary', impact: 'medium' }
  if (/\/press\/key\/|\/press\/inter\//.test(p)) return { kind: 'speech', impact: /lagarde/i.test(title) ? 'medium' : 'low' }
  return { kind: 'press', impact: 'low' }
}

export function ecbItems(items: readonly RssItem[]): NewsItem[] {
  return items.flatMap(it => {
    const url = canonicalUrl(it.link)
    const at = pubTime(it.pubDate)
    if (!url || at === null || !/(^|\.)ecb\.europa\.eu$/.test(new URL(url).hostname)) return []
    const { kind, impact } = ecbClassify(url, it.title)
    const summary = it.description && !sameText(it.description, it.title) ? it.description : null
    return [{ id: newsId('ecb', url), source: 'ecb' as const, kind, title: it.title, summary, url, category: null, impact, publishedAt: at }]
  })
}

// ─── Trésor : résultats d'adjudications (TreasuryDirect) ────────

interface TdAuctionRow {
  cusip?: string; securityType?: string; securityTerm?: string; originalSecurityTerm?: string
  highYield?: string; bidToCoverRatio?: string; reopening?: string; floatingRate?: string; tips?: string
  competitiveAuctionCloseDate?: string; competitiveAuctionCloseTime?: string; treasuryAuctionResultsXmlFileName?: string
  updatedTimestamp?: string
}

const TERM_FR: Record<string, string> = { Year: 'ans', Month: 'mois', Week: 'semaines' }

/** « 10-Year » → « 10 ans » ; « 9-Year 10-Month » → « 9 ans 10 mois ». */
export function termFr(term: string): string {
  return term.replace(/(\d+)-(Year|Month|Week)/g, (_, n: string, u: string) => `${n} ${n === '1' && u === 'Year' ? 'an' : TERM_FR[u]}`)
}

/** Heure ET « 01:00 PM » → « 13:00 ». */
function to24(t: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t ?? '')
  if (!m) return '13:00'
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/**
 * Lignes d'adjudication rédigées par ATP (faits seulement) : notes et
 * obligations avec un taux retenu. Lien vers le communiqué de résultats
 * officiel (PDF). `closeAt` convertit date + heure ET en instant.
 */
export function treasuryItems(rows: unknown, closeAt: (date: string, timeEt: string) => number): NewsItem[] {
  if (!Array.isArray(rows)) return []
  return (rows as TdAuctionRow[]).flatMap(r => {
    const y = Number(r.highYield)
    const date = r.competitiveAuctionCloseDate?.slice(0, 10)
    if (!r.cusip || !date || !r.highYield || !Number.isFinite(y) || !r.treasuryAuctionResultsXmlFileName) return []
    if (r.securityType !== 'Note' && r.securityType !== 'Bond') return []
    const original = r.originalSecurityTerm ?? r.securityTerm ?? ''
    const label = `${r.tips === 'Yes' ? 'TIPS ' : r.floatingRate === 'Yes' ? 'FRN ' : ''}${termFr(original)}`
    const reopening = r.reopening === 'Yes' ? ' (réouverture)' : ''
    const cover = Number(r.bidToCoverRatio)
    const file = r.treasuryAuctionResultsXmlFileName.replace(/\.xml$/i, '.pdf')
    const url = `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${date.slice(0, 4)}/${file}`
    const impact: Impact = (original === '10-Year' || original === '30-Year') && r.tips !== 'Yes' && r.floatingRate !== 'Yes' ? 'medium' : 'low'
    return [{
      id: newsId('treasury', url), source: 'treasury' as const, kind: 'auction' as const,
      title: `Adjudication à ${label}${reopening} : taux retenu ${y.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} %`,
      summary: Number.isFinite(cover) && cover > 0 ? `Ratio de couverture ${cover.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` : null,
      url, category: null, impact,
      publishedAt: closeAt(date, to24(r.competitiveAuctionCloseTime)),
    }]
  })
}

// ─── Dédoublonnage ───────────────────────────────────────────────

/**
 * Un même texte peut arriver deux fois (même flux relu, adresse écrite
 * différemment) : une seule ligne par clé, la publication la plus
 * ancienne, le résumé le plus complet.
 */
export function dedupeNews(items: readonly NewsItem[]): NewsItem[] {
  const byId = new Map<string, NewsItem>()
  for (const it of items) {
    const prev = byId.get(it.id)
    if (!prev) { byId.set(it.id, it); continue }
    byId.set(it.id, {
      ...prev,
      publishedAt: Math.min(prev.publishedAt, it.publishedAt),
      summary: (it.summary?.length ?? 0) > (prev.summary?.length ?? 0) ? it.summary : prev.summary,
      impact: rank(it.impact) > rank(prev.impact) ? it.impact : prev.impact,
    })
  }
  return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt)
}
const rank = (i: Impact) => (i === 'high' ? 3 : i === 'medium' ? 2 : 1)

// ─── Lignes flash (agences US, calendrier) ───────────────────────

export interface FlashLine {
  id: string
  title: string
  /** Libellé de la publication (ex. « Inflation (IPC) »). */
  release: string
  agency: string
  impact: Impact
  at: number
  text: string
}

/** Pluriel et genre de « publié » selon la publication. */
function published(label: string): string {
  if (/^(Ventes|Mises|Inscriptions|Offres|Dépenses)\b/.test(label)) return 'publiées'
  if (/^(Balance|Production|Inflation)\b/.test(label)) return 'publiée'
  if (/^(Prix|Revenus)\b/.test(label)) return 'publiés'
  return 'publié'
}

/**
 * « Inflation (IPC) publiée : +0,3 % sur un mois (précédent +0,2 %) ».
 * null tant que le chiffre n'est pas en ligne.
 */
export function flashLine(e: CalendarEvent, fig: PublishedFigure | null): FlashLine | null {
  if (e.kind !== 'release' || !e.figure || e.at === null || !fig || fig.status !== 'published') return null
  const label = e.title
  const prev = fig.previous === null ? '' : ` (précédent ${formatFigure(fig.previous, e.figure.transform)})`
  return {
    id: `flash:${e.id}`, title: label, release: label, agency: e.agency,
    impact: e.impact === 'holiday' ? 'low' : e.impact, at: e.at,
    text: `${label} ${published(label)} : ${formatFigure(fig.actual, e.figure.transform)} ${e.figure.label}${prev}`,
  }
}

/** Libellé court de publication connu (garde-fou pour les tests). */
export const releaseLabel = (releaseId: number) => RELEASE_BY_ID.get(releaseId)?.title ?? null

// ─── Filtres de la page (?source=fed,bce,tresor,agences&impact=fort,moyen,faible) ──

export type SourceFilter = NewsSource | 'agencies'
const SOURCE_SLUG: Record<SourceFilter, string> = { fed: 'fed', ecb: 'bce', treasury: 'tresor', agencies: 'agences' }
const SLUG_SOURCE = Object.fromEntries(Object.entries(SOURCE_SLUG).map(([k, v]) => [v, k])) as Record<string, SourceFilter>
const IMPACT_SLUG: Record<Impact, string> = { high: 'fort', medium: 'moyen', low: 'faible' }
const SLUG_IMPACT = Object.fromEntries(Object.entries(IMPACT_SLUG).map(([k, v]) => [v, k])) as Record<string, Impact>

export interface NewsParams { sources: SourceFilter[]; impacts: Impact[] }

export function parseNewsParams(sp: Record<string, string | string[] | undefined>): NewsParams {
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return {
    sources: [...new Set(list(sp.source).map(s => SLUG_SOURCE[s]).filter(Boolean))],
    impacts: [...new Set(list(sp.impact).map(s => SLUG_IMPACT[s]).filter(Boolean))],
  }
}

export function newsHref(base: string, p: NewsParams): string {
  const q = new URLSearchParams()
  if (p.sources.length) q.set('source', p.sources.map(s => SOURCE_SLUG[s]).join(','))
  if (p.impacts.length) q.set('impact', p.impacts.map(i => IMPACT_SLUG[i]).join(','))
  const s = q.toString().replace(/%2C/g, ',')
  return s ? `${base}?${s}` : base
}

export function matchesNews(p: NewsParams, source: SourceFilter, impact: Impact): boolean {
  return (p.sources.length === 0 || p.sources.includes(source)) && (p.impacts.length === 0 || p.impacts.includes(impact))
}

/** Nouveauté : publiée depuis moins de `hours` heures. */
export const isFresh = (at: number, now: number, hours = 24) => now - at >= -5 * 60_000 && now - at < hours * 3_600_000
