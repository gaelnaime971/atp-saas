/**
 * Vue d'ensemble : briefing du jour rédigé par des règles simples, à
 * partir des données des autres pages (aucune IA, aucun appel payant).
 * Pur, testé dans briefing.test.ts. Heures et dates dans le fuseau du
 * membre ; jours fériés et séance US en date de New York.
 */
import type { CalendarEvent } from '@/lib/market/calendar/events'
import type { MarketSpecialDay } from '@/lib/terminal/market-holidays'
import { addDays, dateKey, formatDateKey, formatTime, zonedTimeToUtc } from '@/lib/time'
import { fmtNumber } from '@/lib/format'

const ET = 'America/New_York'
const MIN = 60_000
const ATP_MIN = 15

export interface BriefingDecision {
  bank: string
  /** Jour de la décision (date locale de la banque). */
  date: string
  /** Instant de la décision si l'heure est fixe (Fed, BCE), sinon null (BoJ). */
  at: number | null
}

export interface BriefingInput {
  now: number
  tz: string
  /** Jours spéciaux (avec confirmations CME appliquées). */
  specialDays: readonly MarketSpecialDay[]
  /** Événements du calendrier (publications, Fed, fériés…), toutes dates. */
  events: readonly CalendarEvent[]
  nextDecision: BriefingDecision | null
  sentiment: { score: number; zone: string; weekAgo: number | null } | null
  /** Positions extrêmes (percentile ≤ 10 ou ≥ 90 sur 3 ans). */
  cotExtremes: { market: string; category: string; reading: string }[]
  /** Saisonnalité du mois en cours (S&P 500). */
  season: { month: string; upCount: number; n: number; mean: number } | null
  /** Prochain roll conseillé (date ET). */
  roll: { date: string; contract: string; code: string } | null
}

export type BriefingKey = 'agenda' | 'taux' | 'sentiment' | 'cot' | 'saison' | 'echeances'

export interface Briefing {
  headline: string
  lines: { key: BriefingKey; label: string; text: string }[]
}

const special = (days: readonly MarketSpecialDay[], date: string) => days.find(d => d.date === date)
const time = (at: number, tz: string) => formatTime(at, tz)
const dayOf = (at: number, tz: string) => dateKey(at, tz)

/** « aujourd’hui », « demain » ou « jeu. 10 déc. » (dates du membre). */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'aujourd’hui'
  if (date === addDays(today, 1)) return 'demain'
  return formatDateKey(date)
}

/** Jours entiers entre deux dates AAAA-MM-JJ. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Fenêtre ATP (±15 min) d'une annonce forte, en heure du membre. */
export function atpWindowText(at: number, tz: string): string {
  return `${time(at - ATP_MIN * MIN, tz)}–${time(at + ATP_MIN * MIN, tz)}`
}

/** Annonces à fort impact à venir, triées. */
export function upcomingHigh(events: readonly CalendarEvent[], now: number, horizonDays = 7): CalendarEvent[] {
  const until = now + horizonDays * 86_400_000
  return events
    .filter(e => e.impact === 'high' && e.at !== null && e.at >= now - ATP_MIN * MIN && e.at <= until)
    .sort((a, b) => (a.at as number) - (b.at as number))
}

export function buildBriefing(input: BriefingInput): Briefing {
  const { now, tz, specialDays, events } = input
  const today = dayOf(now, tz)
  const etToday = dateKey(now, ET)
  const etTomorrow = addDays(etToday, 1)
  const high = upcomingHigh(events, now)
  const highToday = high.filter(e => dayOf(e.at as number, tz) === today)
  const sToday = special(specialDays, etToday)
  const sTomorrow = special(specialDays, etTomorrow)

  // ─── Titre : la première règle qui s'applique ───
  let headline: string
  if (sToday?.nyse === 'closed') {
    headline = `${sToday.name} : Wall Street fermée aujourd’hui.`
  } else if (sToday?.nyse === 'early') {
    const close = zonedTimeToUtc(etToday, '13:00', ET).getTime()
    headline = `${sToday.name} : clôture anticipée de Wall Street à ${time(close, tz)}, volume mince attendu.`
  } else if (highToday.length === 1) {
    const e = highToday[0]
    headline = `${e.title} à ${time(e.at as number, tz)} : aucune position de ${atpWindowText(e.at as number, tz).replace('–', ' à ')}.`
  } else if (highToday.length > 1) {
    headline = `Journée chargée : ${highToday.length} annonces à fort impact, dont ${highToday[0].title} à ${time(highToday[0].at as number, tz)}.`
  } else if (sTomorrow?.nyse === 'closed') {
    headline = `Veille de ${sTomorrow.name} : Wall Street fermée demain.`
  } else if (sTomorrow?.nyse === 'early') {
    headline = `Demain, ${sTomorrow.name} : clôture anticipée de Wall Street.`
  } else {
    headline = 'Pas d’annonce à fort impact aujourd’hui.'
  }

  const lines: Briefing['lines'] = []

  // AGENDA : 3 prochaines annonces fortes (7 jours) avec leur fenêtre ATP.
  const next3 = high.slice(0, 3)
  lines.push({
    key: 'agenda', label: 'Agenda',
    text: next3.length
      ? next3.map(e => `${e.title} ${relativeDay(dayOf(e.at as number, tz), today)} à ${time(e.at as number, tz)} (fenêtre ATP ${atpWindowText(e.at as number, tz)})`).join(' · ') + '.'
      : 'Aucune annonce à fort impact dans les 7 prochains jours.',
  })

  // TAUX : prochaine décision de banque centrale.
  const d = input.nextDecision
  if (d) {
    const n = daysBetween(today, d.at !== null ? dayOf(d.at, tz) : d.date)
    const when = d.at !== null ? `${relativeDay(dayOf(d.at, tz), today)} à ${time(d.at, tz)}` : `${relativeDay(d.date, today)} (heure non fixée)`
    lines.push({ key: 'taux', label: 'Taux', text: `Prochaine décision : ${d.bank} ${when}${n > 1 ? `, dans ${n} jours` : ''}.` })
  }

  // SENTIMENT : score, zone, il y a une semaine.
  const s = input.sentiment
  if (s) {
    const trend = s.weekAgo === null ? '' : s.weekAgo === s.score ? ', stable sur une semaine' : `, ${s.weekAgo} il y a une semaine`
    lines.push({ key: 'sentiment', label: 'Sentiment', text: `Score de ${s.score} sur 100 (${s.zone.toLowerCase()})${trend}.` })
  }

  // COT : positions extrêmes.
  lines.push({
    key: 'cot', label: 'Positionnement',
    text: input.cotExtremes.length
      ? input.cotExtremes.map(x => `${x.category} sur ${x.market} : ${x.reading.toLowerCase()}`).join(' · ') + '.'
      : 'Aucune position extrême sur 3 ans dans le dernier rapport COT.',
  })

  // SAISONNALITÉ : mois en cours.
  if (input.season) {
    const m = input.season
    lines.push({ key: 'saison', label: 'Saisonnalité', text: `${m.month} : S&P 500 en hausse ${m.upCount} années sur ${m.n}, ${fmtNumber(m.mean, 2, { sign: true })} % en moyenne.` })
  }

  // ÉCHÉANCES : prochain roll.
  if (input.roll) {
    const n = daysBetween(etToday, input.roll.date)
    lines.push({
      key: 'echeances', label: 'Échéances',
      text: n === 0
        ? `Roll conseillé aujourd’hui vers ${input.roll.contract} (${input.roll.code}).`
        : `Prochain roll ${n === 1 ? 'demain' : `le ${formatDateKey(input.roll.date)}`} vers ${input.roll.contract} (${input.roll.code})${n > 1 && n <= 7 ? `, dans ${n} jours` : ''}.`,
    })
  }

  return { headline, lines }
}
