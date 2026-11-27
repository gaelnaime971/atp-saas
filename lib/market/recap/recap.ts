/**
 * Récap de séance (Marchés › Récap de séance) : calculs purs, testés dans
 * recap.test.ts. Aucune cotation : la séance est racontée par les
 * publications, la Fed, les adjudications, le sentiment de risque, le
 * COT et le journal du membre. Synthèse rédigée par des règles (pas d'IA).
 *
 * Jour affiché : après la clôture du cash US (16:00 à New York, 13:00 les
 * jours de clôture anticipée), la séance du jour ; avant, la précédente.
 * Les jours de fermeture de Wall Street ne sont pas des séances.
 */
import type { MarketSpecialDay } from '@/lib/terminal/market-holidays'
import { addDays, dateKey, formatDateKey, formatTime, weekdayOf, zonedTimeToUtc } from '@/lib/time'
import { fmtNumber, fmtUsd } from '@/lib/format'

const ET = 'America/New_York'

type Days = readonly MarketSpecialDay[]
const special = (days: Days, date: string) => days.find(d => d.date === date)

/** Jour de séance du cash US : lundi-vendredi, Wall Street ouverte. */
export function isTradingDay(date: string, days: Days): boolean {
  const w = weekdayOf(date)
  return w >= 1 && w <= 5 && special(days, date)?.nyse !== 'closed'
}

export function previousTradingDay(date: string, days: Days): string {
  let d = addDays(date, -1)
  for (let i = 0; i < 15 && !isTradingDay(d, days); i++) d = addDays(d, -1)
  return d
}

export function nextTradingDay(date: string, days: Days): string {
  let d = addDays(date, 1)
  for (let i = 0; i < 15 && !isTradingDay(d, days); i++) d = addDays(d, 1)
  return d
}

/** Instant de clôture du cash US d'une séance (13:00 si clôture anticipée). */
export function cashCloseAt(date: string, days: Days): number {
  return zonedTimeToUtc(date, special(days, date)?.nyse === 'early' ? '13:00' : '16:00', ET).getTime()
}

/** Séance à récapituler : celle du jour après sa clôture, sinon la précédente. */
export function recapDay(now: number, days: Days): string {
  const today = dateKey(now, ET)
  if (isTradingDay(today, days) && now >= cashCloseAt(today, days)) return today
  return previousTradingDay(today, days)
}

/** Registre : les `count` dernières séances récapitulables, la plus récente d'abord. */
export function recentSessions(now: number, days: Days, count = 5): string[] {
  const out = [recapDay(now, days)]
  while (out.length < count) out.push(previousTradingDay(out[out.length - 1], days))
  return out
}

/** Jour demandé dans l'URL (?jour=) s'il fait partie du registre, sinon la séance par défaut. */
export function pickRecapDay(requested: string | undefined, now: number, days: Days): string {
  const list = recentSessions(now, days, 20)
  return requested && list.includes(requested) ? requested : list[0]
}

// ─── Ta séance (journal) ─────────────────────────────────────────

export interface JournalDay {
  sessions: number
  pnl: number
  trades: number
  /** R cumulé, null si aucune session ne le renseigne. */
  r: number | null
  /** Respect du plan (0 à 10), moyenne des sessions qui le renseignent. */
  plan: number | null
  /** Taux de réussite des trades (%), si saisi. */
  winRate: number | null
}

export interface JournalRow { session_date: string | null; pnl: number | string | null; trades_count: number | null; setup: string | null }

/** Sessions saisies pour la séance `day` (plusieurs comptes possibles) ; null si aucune. */
export function journalDay(rows: readonly JournalRow[], day: string): JournalDay | null {
  const mine = rows.filter(r => r.session_date?.slice(0, 10) === day)
  if (!mine.length) return null
  let r: number | null = null
  const plans: number[] = []
  const rates: number[] = []
  for (const row of mine) {
    let s: { r_value?: unknown; plan_score?: unknown; win_rate?: unknown } = {}
    try { s = row.setup ? JSON.parse(row.setup) : {} } catch { /* setup non JSON */ }
    const rv = Number(s.r_value)
    if (s.r_value !== undefined && s.r_value !== null && Number.isFinite(rv)) r = (r ?? 0) + rv
    const plan = Number(s.plan_score)
    if (s.plan_score !== undefined && s.plan_score !== null && Number.isFinite(plan)) plans.push(plan)
    const wr = Number(s.win_rate)
    if (s.win_rate !== undefined && s.win_rate !== null && Number.isFinite(wr)) rates.push(wr)
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    sessions: mine.length,
    pnl: Math.round(mine.reduce((a, row) => a + (Number(row.pnl) || 0), 0) * 100) / 100,
    trades: mine.reduce((a, row) => a + (Number(row.trades_count) || 0), 0),
    r: r === null ? null : Math.round(r * 100) / 100,
    plan: avg(plans),
    winRate: avg(rates),
  }
}

/** Libellé du respect du plan (mêmes seuils que la Saisie de session). */
export function planLabel(score: number): string {
  if (score < 5) return 'Hors plan'
  if (score < 8) return 'Partiel'
  return 'Dans le plan'
}

/** Tournure pour la synthèse : « plan respecté », « plan en partie respecté », « hors plan ». */
export function planPhrase(score: number): string {
  if (score < 5) return 'hors plan'
  if (score < 8) return 'plan en partie respecté'
  return 'plan respecté'
}

// ─── Synthèse (règles) ───────────────────────────────────────────

export interface RecapRelease { title: string; impact: 'high' | 'medium' | 'low'; at: number; figure: string | null }
export interface RecapInput {
  day: string
  tz: string
  specialDays: Days
  releases: readonly RecapRelease[]
  /** Textes de la Fed du jour (communiqués, discours, témoignages) et décisions FOMC. */
  fed: readonly { title: string; kind: string }[]
  auctions: readonly { label: string; yield: number }[]
  sentiment: { score: number; previous: number | null } | null
  /** Nouveau rapport COT publié ce jour-là (positions extrêmes, ex. « Spéculateurs sur ES (proche du plus haut sur 3 ans) »). */
  cot: { reportDate: string; extremes: readonly string[] } | null
  tomorrow: { day: string; high: readonly { title: string; at: number }[] }
  journal: JournalDay | null
}

export interface RecapSummary { headline: string; paragraphs: string[]; tomorrow: string }

const join = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs.at(-1)}`)

export function recapSummary(i: RecapInput): RecapSummary {
  const s = special(i.specialDays, i.day)
  const high = i.releases.filter(r => r.impact === 'high')
  const highWithFigure = high.filter(r => r.figure)

  let headline: string
  if (s?.nyse === 'early') headline = `Séance écourtée (${s.name}) : clôture du cash US à ${formatTime(cashCloseAt(i.day, i.specialDays), i.tz)}.`
  else if (highWithFigure.length) headline = `${highWithFigure[0].title} : ${highWithFigure[0].figure}.`
  else if (i.fed.some(f => f.kind === 'fomc')) headline = `Décision de la Fed : ${i.fed.find(f => f.kind === 'fomc')!.title}.`
  else if (high.length) headline = `${join(high.map(r => r.title))} au programme.`
  else if (i.releases.length) headline = 'Séance sans publication à fort impact.'
  else headline = 'Séance sans publication officielle US.'

  const paragraphs: string[] = []
  if (i.releases.length) {
    const details = i.releases.filter(r => r.figure).slice(0, 4).map(r => `${r.title} ${r.figure}`)
    paragraphs.push(`${i.releases.length} ${i.releases.length > 1 ? 'publications' : 'publication'}${high.length ? `, dont ${high.length} à fort impact` : ''}${details.length ? ` : ${join(details)}` : ''}.`)
  }
  const fedBits: string[] = []
  if (i.fed.length) fedBits.push(`Fed : ${join(i.fed.slice(0, 3).map(f => f.title))}`)
  if (i.auctions.length) fedBits.push(join(i.auctions.map(a => `adjudication à ${a.label} au taux de ${fmtNumber(a.yield, 3)} %`)))
  if (fedBits.length) paragraphs.push(`${fedBits.join(' ; ')}.`)
  if (i.sentiment) {
    const d = i.sentiment.previous === null ? null : i.sentiment.score - i.sentiment.previous
    paragraphs.push(`Sentiment de risque à ${i.sentiment.score} sur 100${d === null ? '' : d === 0 ? ', stable sur la séance' : ` (${fmtNumber(d, 0, { sign: true })} sur la séance)`}.`)
  }
  if (i.cot) {
    paragraphs.push(`Nouveau rapport COT (positions du ${formatDateKey(i.cot.reportDate)}) : ${i.cot.extremes.length ? `positions extrêmes : ${join(i.cot.extremes)}` : 'aucune position extrême sur 3 ans'}.`)
  }
  if (i.journal) {
    const j = i.journal
    paragraphs.push(`Ta séance : ${fmtUsd(j.pnl, 0, { sign: true })} sur ${j.trades} trade${j.trades > 1 ? 's' : ''}${j.r !== null ? `, ${fmtNumber(j.r, 1, { sign: true })} R` : ''}${j.plan !== null ? `, ${planPhrase(j.plan)}` : ''}.`)
  }

  const next = i.tomorrow
  const ns = special(i.specialDays, next.day)
  const parts: string[] = []
  if (ns?.nyse === 'early') parts.push(`${ns.name}, clôture anticipée de Wall Street à ${formatTime(cashCloseAt(next.day, i.specialDays), i.tz)}`)
  if (next.high.length) parts.push(join(next.high.map(h => `${h.title} à ${formatTime(h.at, i.tz)} (fenêtre ATP ${formatTime(h.at - 15 * 60_000, i.tz)}–${formatTime(h.at + 15 * 60_000, i.tz)})`)))
  else parts.push('pas d’annonce à fort impact')
  const tomorrow = `${capitalize(formatDateKey(next.day, { long: true }))} : ${parts.join(' ; ')}.`

  return { headline, paragraphs, tomorrow }
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
