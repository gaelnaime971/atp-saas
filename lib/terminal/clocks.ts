import { MARKET_ZONES } from '@/lib/time'

/** Places de la barre du haut Marchés, à côté de « Ton heure ». */
export const CLOCK_PLACES = [
  { id: 'london', label: 'Londres', timeZone: MARKET_ZONES.london },
  { id: 'newYork', label: 'New York', timeZone: MARKET_ZONES.newYork },
  { id: 'tokyo', label: 'Tokyo', timeZone: MARKET_ZONES.tokyo },
] as const satisfies readonly { id: 'london' | 'newYork' | 'tokyo'; label: string; timeZone: string }[]

export type ClockPlace = (typeof CLOCK_PLACES)[number]

/** Sans doublon : si le membre vit à Londres, New York ou Tokyo, « Ton heure » suffit. */
export function placesFor(memberTz: string): ClockPlace[] {
  return CLOCK_PLACES.filter(p => p.timeZone !== memberTz)
}
