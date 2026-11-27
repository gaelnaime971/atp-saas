/**
 * Catalogue des données Terminal : séries FRED, marchés du COT, mentions.
 *
 * Règle (DECISIONS.md) : uniquement des sources officielles gratuites et
 * autorisées en usage commercial. Licence de chaque série FRED relevée
 * dans ses métadonnées (tags « public domain » / « copyrighted ») le
 * 27/11/2026 : aucune n'est la propriété d'un tiers (pas de copyright
 * nommé dans les notes, pas de tag « pre-approval required »). Les séries
 * « copyrighted: citation required » sont produites par la Fed elle-même
 * (St. Louis, Atlanta, Chicago) : usage permis avec citation.
 */

export type FredFrequency = 'D' | 'W' | 'M' | 'Q'
export type FredUnit = 'pct' | 'index' | 'usd_millions' | 'usd_billions' | 'count'

export interface FredSeriesDef {
  code: string
  /** Libellé français affiché. */
  label: string
  unit: FredUnit
  frequency: FredFrequency
  /** Organisme qui produit la série (citation). */
  provider: string
  /** Tag de licence FRED relevé. */
  license: 'public domain: citation requested' | 'copyrighted: citation required'
}

export const FRED_SERIES: FredSeriesDef[] = [
  { code: 'DGS2', label: 'Taux à 2 ans', unit: 'pct', frequency: 'D', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'DGS10', label: 'Taux à 10 ans', unit: 'pct', frequency: 'D', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'DFII10', label: 'Taux réel à 10 ans', unit: 'pct', frequency: 'D', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'T10YIE', label: 'Inflation attendue à 10 ans', unit: 'pct', frequency: 'D', provider: 'Federal Reserve Bank of St. Louis', license: 'copyrighted: citation required' },
  { code: 'WALCL', label: 'Bilan de la Fed', unit: 'usd_millions', frequency: 'W', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'WTREGEN', label: 'Compte du Trésor à la Fed', unit: 'usd_millions', frequency: 'W', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'RRPONTSYD', label: 'Reverse repo de la Fed', unit: 'usd_billions', frequency: 'D', provider: 'Federal Reserve Bank of New York', license: 'copyrighted: citation required' },
  { code: 'ICSA', label: 'Inscriptions hebdomadaires au chômage', unit: 'count', frequency: 'W', provider: 'U.S. Employment and Training Administration', license: 'public domain: citation requested' },
  { code: 'UNRATE', label: 'Taux de chômage', unit: 'pct', frequency: 'M', provider: 'U.S. Bureau of Labor Statistics', license: 'public domain: citation requested' },
  { code: 'GDPNOW', label: 'GDPNow (croissance du trimestre)', unit: 'pct', frequency: 'Q', provider: 'Federal Reserve Bank of Atlanta', license: 'copyrighted: citation required' },
  { code: 'DFEDTARL', label: 'Fed funds, borne basse de la fourchette', unit: 'pct', frequency: 'D', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'DFEDTARU', label: 'Fed funds, borne haute de la fourchette', unit: 'pct', frequency: 'D', provider: 'Board of Governors of the Federal Reserve System', license: 'public domain: citation requested' },
  { code: 'STLFSI4', label: 'Stress financier', unit: 'index', frequency: 'W', provider: 'Federal Reserve Bank of St. Louis', license: 'copyrighted: citation required' },
  { code: 'NFCIRISK', label: 'Risque de marché', unit: 'index', frequency: 'W', provider: 'Federal Reserve Bank of Chicago', license: 'copyrighted: citation required' },
  { code: 'NFCICREDIT', label: 'Conditions de crédit', unit: 'index', frequency: 'W', provider: 'Federal Reserve Bank of Chicago', license: 'copyrighted: citation required' },
]

export const FRED_BY_CODE: Record<string, FredSeriesDef> = Object.fromEntries(FRED_SERIES.map(s => [s.code, s]))

/** Séries écartées pour cause de copyright d'un tiers (aucune à ce jour). */
export const FRED_EXCLUDED: { code: string; reason: string }[] = []

// ─── COT (CFTC, Traders in Financial Futures) ───────────────────

export type CotMarketCode = 'NQ' | 'ES' | 'YM' | 'ZN'

export interface CotMarketDef {
  code: CotMarketCode
  label: string
  /** Code de contrat CFTC (stable depuis 2006, malgré le renommage des marchés en 2022). */
  cftcCode: string
}

export const COT_MARKETS: CotMarketDef[] = [
  { code: 'NQ', label: 'E-mini Nasdaq-100', cftcCode: '209742' },
  { code: 'ES', label: 'E-mini S&P 500', cftcCode: '13874A' },
  { code: 'YM', label: 'E-mini Dow ($5)', cftcCode: '124603' },
  { code: 'ZN', label: 'T-Note 10 ans', cftcCode: '043602' },
]

export const COT_BY_CODE = Object.fromEntries(COT_MARKETS.map(m => [m.code, m])) as Record<CotMarketCode, CotMarketDef>

/** « Futures seuls » partout (DECISIONS.md). */
export const COT_REPORT_TYPE = 'FutOnly' as const

/** Dataset Socrata du rapport TFF (futures seuls et futures + options dans la même table). */
export const CFTC_TFF_DATASET = 'udgc-27he'

// ─── Historique initial ─────────────────────────────────────────

export const FRED_HISTORY_YEARS = 10
export const COT_HISTORY_SINCE = '2010-01-01'

// ─── Mentions ───────────────────────────────────────────────────

/** Texte exact exigé par les conditions de l'API FRED (« Requirements »). */
export const FRED_NOTICE = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.'
export const FRED_TERMS_URL = 'https://fred.stlouisfed.org/docs/api/terms_of_use.html'
export const CFTC_SOURCE = 'CFTC, rapport Traders in Financial Futures (futures seuls)'
export const CFTC_URL = 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm'
