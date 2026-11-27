/**
 * Publications officielles US suivies par le calendrier économique.
 *
 * - Dates : API FRED « releases/dates » (calendrier officiel des agences,
 *   relayé par la Fed de St. Louis), et fichier iCalendar du BEA pour les
 *   heures exactes des publications du BEA.
 * - Heure (New York) : heure de publication habituelle de l'agence. Le
 *   BLS et le Census publient à 8:30 ou 10:00 ET, la Fed (G.17) à 9:15 ET.
 *   Le fichier du BEA remplace l'heure par défaut quand il la donne.
 * - Impact : « fort » = indicateurs qui font bouger NQ et YM (liste dans
 *   DECISIONS.md). Aucun consensus (sous licence).
 * - Chiffre publié : série FRED et transformation (variation sur un mois,
 *   création d'emplois…), lu au moment de la consultation.
 *
 * Exclus faute de licence ouverte : ISM (propriétaire), confiance du
 * Conference Board, sentiment de l'Université du Michigan.
 */

export type Impact = 'high' | 'medium' | 'low'
export type FigureTransform = 'pct_mom' | 'pct_qoq' | 'change_k' | 'level_pct' | 'level_k' | 'level_thousands' | 'level_m' | 'level_bn'

export interface ReleaseDef {
  /** Identifiant FRED de la publication. */
  releaseId: number
  title: string
  agency: 'BLS' | 'BEA' | 'Census' | 'DOL' | 'Fed' | 'BEA/Census'
  /** Heure habituelle à New York (HH:MM). */
  timeEt: string
  impact: Impact
  /** Chiffre publié : série FRED et transformation. */
  figure?: { series: string; transform: FigureTransform; label: string }
  /** Résumé du fichier iCalendar du BEA qui correspond à cette publication. */
  beaSummary?: RegExp
  /**
   * Dates FRED à ignorer quand elles tombent le jour d'une autre
   * publication : FRED rattache aussi à « New Residential Construction »
   * (27) les jours de « New Residential Sales » (97), où les mises en
   * chantier ne sont pas publiées.
   */
  skipDatesOf?: number
}

export const RELEASES: ReleaseDef[] = [
  { releaseId: 10, title: 'Inflation (IPC)', agency: 'BLS', timeEt: '08:30', impact: 'high', figure: { series: 'CPIAUCSL', transform: 'pct_mom', label: 'sur un mois' } },
  { releaseId: 50, title: 'Rapport sur l’emploi (NFP)', agency: 'BLS', timeEt: '08:30', impact: 'high', figure: { series: 'PAYEMS', transform: 'change_k', label: 'emplois créés' } },
  { releaseId: 54, title: 'Revenus et dépenses · PCE', agency: 'BEA', timeEt: '08:30', impact: 'high', figure: { series: 'PCEPILFE', transform: 'pct_mom', label: 'PCE sous-jacent, sur un mois' }, beaSummary: /^Personal Income and Outlays/i },
  { releaseId: 53, title: 'PIB', agency: 'BEA', timeEt: '08:30', impact: 'high', figure: { series: 'A191RL1Q225SBEA', transform: 'level_pct', label: 'rythme annualisé' }, beaSummary: /^(Gross Domestic Product|GDP \()/i },
  { releaseId: 9, title: 'Ventes au détail', agency: 'Census', timeEt: '08:30', impact: 'high', figure: { series: 'RSAFS', transform: 'pct_mom', label: 'sur un mois' } },
  { releaseId: 46, title: 'Prix à la production (PPI)', agency: 'BLS', timeEt: '08:30', impact: 'medium', figure: { series: 'PPIFIS', transform: 'pct_mom', label: 'sur un mois' } },
  { releaseId: 180, title: 'Inscriptions au chômage', agency: 'DOL', timeEt: '08:30', impact: 'medium', figure: { series: 'ICSA', transform: 'level_k', label: 'nouvelles demandes' } },
  { releaseId: 192, title: 'Offres d’emploi (JOLTS)', agency: 'BLS', timeEt: '10:00', impact: 'medium', figure: { series: 'JTSJOL', transform: 'level_m', label: 'postes ouverts' } },
  { releaseId: 11, title: 'Coût de l’emploi (ECI)', agency: 'BLS', timeEt: '08:30', impact: 'medium', figure: { series: 'ECIALLCIV', transform: 'pct_qoq', label: 'sur un trimestre' } },
  { releaseId: 13, title: 'Production industrielle', agency: 'Fed', timeEt: '09:15', impact: 'low', figure: { series: 'INDPRO', transform: 'pct_mom', label: 'sur un mois' } },
  { releaseId: 27, title: 'Mises en chantier', agency: 'Census', timeEt: '08:30', impact: 'low', figure: { series: 'HOUST', transform: 'level_thousands', label: 'rythme annuel' }, skipDatesOf: 97 },
  { releaseId: 97, title: 'Ventes de logements neufs', agency: 'Census', timeEt: '10:00', impact: 'low', figure: { series: 'HSN1F', transform: 'level_thousands', label: 'rythme annuel' } },
  { releaseId: 51, title: 'Balance commerciale', agency: 'BEA/Census', timeEt: '08:30', impact: 'low', figure: { series: 'BOPGSTB', transform: 'level_bn', label: 'solde' }, beaSummary: /^U\.S\. International Trade in Goods and Services/i },
  { releaseId: 188, title: 'Prix à l’importation', agency: 'BLS', timeEt: '08:30', impact: 'low', figure: { series: 'IR', transform: 'pct_mom', label: 'sur un mois' } },
  { releaseId: 229, title: 'Dépenses de construction', agency: 'Census', timeEt: '10:00', impact: 'low', figure: { series: 'TTLCONS', transform: 'pct_mom', label: 'sur un mois' } },
]

export const RELEASE_BY_ID = new Map(RELEASES.map(r => [r.releaseId, r]))

export const IMPACT_LABEL: Record<Impact, string> = { high: 'Fort', medium: 'Moyen', low: 'Faible' }
