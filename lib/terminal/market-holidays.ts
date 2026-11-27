/**
 * Jours fériés et clôtures anticipées 2026-2027, table statique.
 * Rien n'est récupéré automatiquement : à prolonger à la main chaque année.
 *
 * Dates en heure de New York (date civile ET).
 *
 * ─── Cash US (NYSE) : CONFIRMÉ ─────────────────────────────────────
 * Source : NYSE, « Holidays & Trading Hours »
 *   https://www.nyse.com/trade/hours-calendars (relevé le 27/11/2026).
 * Clôture anticipée = 13:00 ET (« close early at 1:00 p.m. »).
 * Notes de la page : pas de clôture anticipée la veille de Noël 2027
 * (Noël observé le vendredi 24/12/2027) ; pas de férié pour le Jour de
 * l'an 2028 (samedi), donc le 31/12/2027 est une séance normale.
 *
 * ─── CME Globex, NQ et YM : SCHÉMA HABITUEL, À CONFIRMER ────────────
 * Les horaires de fêtes du CME ne sont publiés qu'environ deux semaines
 * avant chaque fête (https://www.cmegroup.com/trading-hours.html) et la
 * page n'a pas pu être lue au moment de saisir cette table. Les plages
 * ci-dessous suivent le schéma habituel des futures indices US, à vérifier
 * avant chaque fête (`cmeConfirmed: false`) :
 *   - férié US en semaine (MLK, Presidents, Memorial, Juneteenth,
 *     Independence, Labor, Thanksgiving) : arrêt à 12:00 CT (13:00 ET),
 *     réouverture à 17:00 CT (18:00 ET) si le lendemain est ouvré ;
 *   - lendemain de Thanksgiving et veille de Noël : clôture à 12:15 CT
 *     (13:15 ET), pas de réouverture le soir ;
 *   - Noël, Jour de l'an, Vendredi saint : fermé toute la journée, pas de
 *     séance du soir la veille.
 */

export type HHMM = `${number}${number}:${number}${number}`

export interface MarketSpecialDay {
  /** Date civile à New York, AAAA-MM-JJ. */
  date: string
  /** Libellé français. */
  name: string
  /** Cash US (NYSE) : fermé, ou clôture anticipée à 13:00 ET. Absent = séance normale. */
  nyse?: 'closed' | 'early'
  /** Plages Globex de cette date ET (fin '24:00' = minuit suivant). Absent = horaires normaux. */
  globex?: [HHMM, HHMM][]
  /** Faux tant que les horaires CME de cette fête n'ont pas été vérifiés sur cmegroup.com. */
  cmeConfirmed: boolean
}

const HALT: [HHMM, HHMM][] = [['00:00', '13:00'], ['18:00', '24:00']]   // férié en semaine, lendemain ouvré
const HALT_FRI: [HHMM, HHMM][] = [['00:00', '13:00']]                   // férié un vendredi
const EARLY: [HHMM, HHMM][] = [['00:00', '13:15']]                      // clôture anticipée, pas de soir
const NO_EVENING: [HHMM, HHMM][] = [['00:00', '17:00']]                 // veille d'un jour fermé
const CLOSED_THEN_EVENING: [HHMM, HHMM][] = [['18:00', '24:00']]        // fermé, réouverture le soir

export const MARKET_SPECIAL_DAYS: MarketSpecialDay[] = [
  // ── 2026 ── NYSE : https://www.nyse.com/trade/hours-calendars
  { date: '2026-01-01', name: 'Jour de l’an', nyse: 'closed', globex: CLOSED_THEN_EVENING, cmeConfirmed: false },
  { date: '2026-01-19', name: 'Martin Luther King Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2026-02-16', name: 'Presidents’ Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2026-04-02', name: 'Veille du Vendredi saint', globex: NO_EVENING, cmeConfirmed: false },
  // CME a annoncé une séance écourtée sur les indices ce jour-là (horaires non relevés).
  { date: '2026-04-03', name: 'Vendredi saint', nyse: 'closed', globex: [], cmeConfirmed: false },
  { date: '2026-05-25', name: 'Memorial Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2026-06-19', name: 'Juneteenth', nyse: 'closed', globex: HALT_FRI, cmeConfirmed: false },
  { date: '2026-07-03', name: 'Independence Day (observé)', nyse: 'closed', globex: HALT_FRI, cmeConfirmed: false },
  { date: '2026-09-07', name: 'Labor Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2026-11-26', name: 'Thanksgiving', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2026-11-27', name: 'Lendemain de Thanksgiving', nyse: 'early', globex: EARLY, cmeConfirmed: false },
  { date: '2026-12-24', name: 'Veille de Noël', nyse: 'early', globex: EARLY, cmeConfirmed: false },
  { date: '2026-12-25', name: 'Noël', nyse: 'closed', globex: [], cmeConfirmed: false },
  { date: '2026-12-31', name: 'Veille du Jour de l’an', globex: NO_EVENING, cmeConfirmed: false },
  // ── 2027 ── NYSE : https://www.nyse.com/trade/hours-calendars
  { date: '2027-01-01', name: 'Jour de l’an', nyse: 'closed', globex: [], cmeConfirmed: false },
  { date: '2027-01-18', name: 'Martin Luther King Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-02-15', name: 'Presidents’ Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-03-25', name: 'Veille du Vendredi saint', globex: NO_EVENING, cmeConfirmed: false },
  { date: '2027-03-26', name: 'Vendredi saint', nyse: 'closed', globex: [], cmeConfirmed: false },
  { date: '2027-05-31', name: 'Memorial Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-06-18', name: 'Juneteenth (observé)', nyse: 'closed', globex: HALT_FRI, cmeConfirmed: false },
  { date: '2027-07-05', name: 'Independence Day (observé)', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-09-06', name: 'Labor Day', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-11-25', name: 'Thanksgiving', nyse: 'closed', globex: HALT, cmeConfirmed: false },
  { date: '2027-11-26', name: 'Lendemain de Thanksgiving', nyse: 'early', globex: EARLY, cmeConfirmed: false },
  // Noël observé le vendredi 24/12/2027 (25 = samedi). NYSE : pas de clôture anticipée le 23.
  { date: '2027-12-23', name: 'Veille de Noël (observé)', globex: NO_EVENING, cmeConfirmed: false },
  { date: '2027-12-24', name: 'Noël (observé)', nyse: 'closed', globex: [], cmeConfirmed: false },
]

/** Fin de la table : au-delà, aucun férié n'est connu (affiché comme tel). */
export const SPECIAL_DAYS_UNTIL = '2027-12-31'

const BY_DATE = new Map(MARKET_SPECIAL_DAYS.map(d => [d.date, d]))

export function specialDay(date: string): MarketSpecialDay | undefined {
  return BY_DATE.get(date)
}

/** Cash US fermé ce jour (date ET) ? Week-end non compris. */
export function isNyseHoliday(date: string): boolean {
  return BY_DATE.get(date)?.nyse === 'closed'
}

// ─── Confirmations de l'admin (Agenda Terminal) ─────────────────

export interface HolidayConfirmation {
  date: string
  cmeConfirmed: boolean
  /** Plages Globex saisies (« 00:00-13:15,18:00-24:00 ») ; '' = fermé ; null = schéma du code. */
  globexRanges: string | null
  note: string | null
}

const RANGE = /^([01]\d|2[0-4]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/

/** « 00:00-13:15,18:00-24:00 » → plages ; '' → [] (fermé) ; invalide → null. */
export function parseGlobexRanges(text: string): [HHMM, HHMM][] | null {
  const t = text.replace(/\s+/g, '')
  if (t === '') return []
  const out: [HHMM, HHMM][] = []
  for (const part of t.split(',')) {
    const m = RANGE.exec(part)
    if (!m) return null
    const [a, b] = part.split('-') as [HHMM, HHMM]
    if (a >= b) return null
    out.push([a, b])
  }
  return out.sort((x, y) => x[0].localeCompare(y[0]))
}

/** Table du code + confirmations de l'admin (horaires CME vérifiés, plages corrigées). */
export function applyConfirmations(days: readonly MarketSpecialDay[], confirmations: readonly HolidayConfirmation[]): MarketSpecialDay[] {
  const byDate = new Map(confirmations.map(c => [c.date, c]))
  return days.map(d => {
    const c = byDate.get(d.date)
    if (!c) return d
    const ranges = c.globexRanges === null ? null : parseGlobexRanges(c.globexRanges)
    return { ...d, cmeConfirmed: c.cmeConfirmed, ...(ranges ? { globex: ranges } : {}) }
  })
}

const lookups = new WeakMap<readonly MarketSpecialDay[], Map<string, MarketSpecialDay>>()

/** Recherche par date dans une table (mémorisée). */
export function specialDayIn(days: readonly MarketSpecialDay[], date: string): MarketSpecialDay | undefined {
  let map = lookups.get(days)
  if (!map) { map = new Map(days.map(d => [d.date, d])); lookups.set(days, map) }
  return map.get(date)
}
