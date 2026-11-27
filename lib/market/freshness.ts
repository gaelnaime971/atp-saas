/**
 * Fraîcheur des données Terminal : une donnée est « en retard » quand sa
 * dernière date est plus ancienne que ce que sa fréquence de publication
 * laisse attendre (week-ends et jours fériés compris), ou quand la
 * dernière mise à jour réussie date de plus de 2 jours.
 */
import type { FredFrequency } from '@/lib/market/catalog'

/** Âge maximal normal de la dernière observation, en jours calendaires. */
export const MAX_AGE_DAYS: Record<FredFrequency | 'COT', number> = {
  D: 6,      // quotidien : week-end + férié + publication le lendemain
  W: 13,     // hebdomadaire : publication décalée de quelques jours
  M: 70,     // mensuel : daté du 1er du mois, publié début du mois suivant (≈ 60 j)
  Q: 125,    // GDPNow : daté du 1er jour du trimestre en cours
  COT: 11,   // positions du mardi, publiées le vendredi (+ fériés)
}

const DAY = 86_400_000

export function ageInDays(lastDate: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / DAY)
}

export function isDataLate(lastDate: string | null, frequency: FredFrequency | 'COT', today: string): boolean {
  if (!lastDate) return true
  return ageInDays(lastDate, today) > MAX_AGE_DAYS[frequency]
}

/** Dernière mise à jour réussie trop ancienne (cron en panne) ? */
export function isIngestLate(lastSuccessIso: string | null, now: number): boolean {
  if (!lastSuccessIso) return true
  return now - Date.parse(lastSuccessIso) > 2 * DAY
}
