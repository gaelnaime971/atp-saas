/**
 * Assemblage des événements du calendrier côté serveur (pages Calendrier
 * et Sessions) : publications et adjudications stockées + FOMC (table
 * officielle) + fériés (table du code complétée par les confirmations de
 * l'admin) + agenda saisi par l'admin. À appeler après
 * requireMarketsViewer().
 */
import { addDays } from '@/lib/time'
import { agendaEvents, dedupe, fomcEvents, holidayEvents, type CalendarEvent } from '@/lib/market/calendar/events'
import { readAgenda, readCalendar, readHolidayConfirmations } from '@/lib/market/read'
import { MARKET_SPECIAL_DAYS, applyConfirmations, type MarketSpecialDay } from '@/lib/terminal/market-holidays'

export interface AssembledCalendar {
  events: CalendarEvent[]
  /** Jours spéciaux avec les confirmations CME de l'admin. */
  specialDays: MarketSpecialDay[]
  /** Au moins une source illisible (tables absentes, réseau). */
  degraded: boolean
}

/** Événements dont la date à New York est dans [from − 1 j ; to + 1 j] (marge de fuseau). */
export async function assembleCalendar(from: string, to: string): Promise<AssembledCalendar> {
  const lo = addDays(from, -1)
  const hi = addDays(to, 1)
  const [stored, agenda, confirmations] = await Promise.all([readCalendar(lo, hi), readAgenda(lo, hi), readHolidayConfirmations()])
  const specialDays = applyConfirmations(MARKET_SPECIAL_DAYS, confirmations.ok ? confirmations.data : [])
  const inRange = (e: CalendarEvent) => e.date >= lo && e.date <= hi
  const events = dedupe([
    ...(stored.ok ? stored.data : []),
    ...fomcEvents().filter(inRange),
    ...holidayEvents(specialDays).filter(inRange),
    ...(agenda.ok ? agendaEvents(agenda.data) : []),
  ])
  return { events, specialDays, degraded: !stored.ok || !agenda.ok || !confirmations.ok }
}
