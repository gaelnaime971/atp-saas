/**
 * Banques centrales : calendriers officiels des réunions (tables
 * statiques, à prolonger chaque année) et décisions de la BoJ.
 * Les taux de la Fed et de la BCE viennent de leurs séries officielles
 * (FRED DFEDTARL/DFEDTARU, API de données de la BCE), voir ingestion.
 */

export type BankCode = 'FED' | 'ECB' | 'BOJ'

export interface Meeting {
  bank: BankCode
  /** Jour de la décision (date locale de la banque), AAAA-MM-JJ. */
  decisionDate: string
  /** Premier jour si la réunion dure deux jours. */
  startDate?: string
  /** Fed : réunion avec projections économiques (SEP, « dot plot »). */
  projections?: boolean
  /** Fed : date de publication du compte rendu (minutes), si annoncée. */
  minutesDate?: string
  /** Date à confirmer par la banque (ex. calendrier FOMC de l'année suivante). */
  tentative?: boolean
}

/**
 * FOMC — https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 * (relevé le 27/11/2026, « Last Update: November 18, 2026 »). Réunions avec
 * projections marquées d'un astérisque. 2027 : « Each meeting date is
 * tentative until confirmed at the meeting immediately preceding it »,
 * projections 2027 non indiquées. Minutes du 9 déc. 2026 : 30 déc. (page
 * calendrier de décembre de la Fed).
 */
export const FOMC_MEETINGS: Meeting[] = [
  { bank: 'FED', startDate: '2026-01-27', decisionDate: '2026-01-28', minutesDate: '2026-02-18' },
  { bank: 'FED', startDate: '2026-03-17', decisionDate: '2026-03-18', projections: true, minutesDate: '2026-04-08' },
  { bank: 'FED', startDate: '2026-04-28', decisionDate: '2026-04-29', minutesDate: '2026-05-20' },
  { bank: 'FED', startDate: '2026-06-16', decisionDate: '2026-06-17', projections: true, minutesDate: '2026-07-08' },
  { bank: 'FED', startDate: '2026-07-28', decisionDate: '2026-07-29', minutesDate: '2026-08-19' },
  { bank: 'FED', startDate: '2026-09-15', decisionDate: '2026-09-16', projections: true, minutesDate: '2026-10-07' },
  { bank: 'FED', startDate: '2026-10-27', decisionDate: '2026-10-28', minutesDate: '2026-11-18' },
  { bank: 'FED', startDate: '2026-12-08', decisionDate: '2026-12-09', projections: true, minutesDate: '2026-12-30' },
  { bank: 'FED', startDate: '2027-01-26', decisionDate: '2027-01-27', tentative: true },
  { bank: 'FED', startDate: '2027-03-16', decisionDate: '2027-03-17', tentative: true },
  { bank: 'FED', startDate: '2027-04-27', decisionDate: '2027-04-28', tentative: true },
  { bank: 'FED', startDate: '2027-06-08', decisionDate: '2027-06-09', tentative: true },
  { bank: 'FED', startDate: '2027-07-27', decisionDate: '2027-07-28', tentative: true },
  { bank: 'FED', startDate: '2027-09-14', decisionDate: '2027-09-15', tentative: true },
  { bank: 'FED', startDate: '2027-10-26', decisionDate: '2027-10-27', tentative: true },
  { bank: 'FED', startDate: '2027-11-16', decisionDate: '2027-11-17', tentative: true },
]

/**
 * BCE — https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html
 * (relevé le 27/11/2026 ; la page commence au 16/12/2026). Décision le
 * 2e jour, communiqué 14:15 et conférence de presse 14:45 (Francfort).
 */
export const ECB_MEETINGS: Meeting[] = [
  { bank: 'ECB', startDate: '2026-12-16', decisionDate: '2026-12-17' },
  { bank: 'ECB', startDate: '2027-02-03', decisionDate: '2027-02-04' },
  { bank: 'ECB', startDate: '2027-03-17', decisionDate: '2027-03-18' },
  { bank: 'ECB', startDate: '2027-04-28', decisionDate: '2027-04-29' },
  { bank: 'ECB', startDate: '2027-06-09', decisionDate: '2027-06-10' },
  { bank: 'ECB', startDate: '2027-07-21', decisionDate: '2027-07-22' },
  { bank: 'ECB', startDate: '2027-09-08', decisionDate: '2027-09-09' },
  { bank: 'ECB', startDate: '2027-10-27', decisionDate: '2027-10-28' },
  { bank: 'ECB', startDate: '2027-12-15', decisionDate: '2027-12-16' },
]

/** BoJ — https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm (relevé le 27/11/2026). Décision le dernier jour, heure non fixée. */
export const BOJ_MEETINGS: Meeting[] = [
  { bank: 'BOJ', startDate: '2026-01-22', decisionDate: '2026-01-23' },
  { bank: 'BOJ', startDate: '2026-03-18', decisionDate: '2026-03-19' },
  { bank: 'BOJ', startDate: '2026-04-27', decisionDate: '2026-04-28' },
  { bank: 'BOJ', startDate: '2026-06-15', decisionDate: '2026-06-16' },
  { bank: 'BOJ', startDate: '2026-07-30', decisionDate: '2026-07-31' },
  { bank: 'BOJ', startDate: '2026-09-17', decisionDate: '2026-09-18' },
  { bank: 'BOJ', startDate: '2026-10-29', decisionDate: '2026-10-30' },
  { bank: 'BOJ', startDate: '2026-12-17', decisionDate: '2026-12-18' },
  { bank: 'BOJ', startDate: '2027-01-21', decisionDate: '2027-01-22' },
  { bank: 'BOJ', startDate: '2027-03-17', decisionDate: '2027-03-18' },
  { bank: 'BOJ', startDate: '2027-04-27', decisionDate: '2027-04-28' },
  { bank: 'BOJ', startDate: '2027-06-10', decisionDate: '2027-06-11' },
  { bank: 'BOJ', startDate: '2027-07-21', decisionDate: '2027-07-22' },
  { bank: 'BOJ', startDate: '2027-09-21', decisionDate: '2027-09-22' },
  { bank: 'BOJ', startDate: '2027-10-28', decisionDate: '2027-10-29' },
  { bank: 'BOJ', startDate: '2027-12-16', decisionDate: '2027-12-17' },
]

/**
 * BoJ — taux directeur (cible du taux au jour le jour non garanti), par
 * décision. Source : communiqués de politique monétaire de la BoJ
 * (https://www.boj.or.jp/en/mopo/mpmdeci/index.htm). Recoupé avec la
 * série officielle du taux de base des prêts de la BoJ (API Time-Series
 * Data Search, série IR01/MADR1M), qui suit chaque décision avec un
 * écart de 0,25 pt : 0,75 % (janv. 2025), 1 % (déc. 2025), 1,25 % (juin
 * 2026), 1,5 % (sept. 2026).
 */
export const BOJ_DECISIONS: { date: string; rate: number }[] = [
  { date: '2024-07-31', rate: 0.25 },
  { date: '2025-01-24', rate: 0.5 },
  { date: '2025-12-19', rate: 0.75 },
  { date: '2026-06-16', rate: 1.0 },
  { date: '2026-09-18', rate: 1.25 },
]

export const BANKS: Record<BankCode, {
  label: string
  currency: string
  /** Fuseau de la banque (date et heure de la décision). */
  zone: string
  /** Heure de la décision, si fixe (heure locale de la banque). */
  decisionTime?: string
  /** Heure de la conférence de presse, si fixe. */
  pressTime?: string
  rateLabel: string
  source: string
  sourceUrl: string
}> = {
  FED: { label: 'Fed', currency: 'USD', zone: 'America/New_York', decisionTime: '14:00', pressTime: '14:30', rateLabel: 'Fourchette des fed funds', source: 'Federal Reserve (taux : FRED DFEDTARL, DFEDTARU)', sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
  ECB: { label: 'BCE', currency: 'EUR', zone: 'Europe/Berlin', decisionTime: '14:15', pressTime: '14:45', rateLabel: 'Taux de dépôt', source: 'Banque centrale européenne (ECB Data Portal)', sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html' },
  BOJ: { label: 'BoJ', currency: 'JPY', zone: 'Asia/Tokyo', rateLabel: 'Taux au jour le jour (cible)', source: 'Bank of Japan (communiqués)', sourceUrl: 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm' },
}

export const MEETINGS: Record<BankCode, Meeting[]> = { FED: FOMC_MEETINGS, ECB: ECB_MEETINGS, BOJ: BOJ_MEETINGS }

/** Prochaine réunion (décision le jour même ou après `today`, date locale de la banque). */
export function nextMeeting(bank: BankCode, today: string): Meeting | null {
  return MEETINGS[bank].find(m => m.decisionDate >= today) ?? null
}

/** Dernière réunion passée (décision avant `today`). */
export function lastMeeting(bank: BankCode, today: string): Meeting | null {
  return [...MEETINGS[bank]].reverse().find(m => m.decisionDate < today) ?? null
}

/** Atlanta Fed Market Probability Tracker : lien seulement (conditions : pas d'usage commercial). */
export const ATLANTA_FED_MPT_URL = 'https://www.atlantafed.org/cenfis/market-probability-tracker'
