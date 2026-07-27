import type { TradingSession } from '@/lib/types'

/**
 * Agrégats des trading_sessions côté client.
 *
 * Toutes les fonctions consomment une liste de sessions déjà filtrée
 * par l'appelant (accounts, période, instrument, etc.) — elles ne
 * connaissent aucun filtre métier. Retours en Map keyed par la
 * dimension d'agrégation (jour, semaine, instrument, jour-de-semaine…).
 */

export interface DayStats {
  pnl: number
  count: number   // somme des trades_count sur les sessions du jour
}

/**
 * Convertit une Date en clé "YYYY-MM-DD" en heure locale.
 * NE PAS utiliser toISOString().split('T')[0] car ça décale d'un jour
 * pour les timezones à l'est (le 23h59 local passe au lendemain UTC).
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Groupe les sessions par jour ("YYYY-MM-DD").
 * Somme les pnl + trades_count des sessions du même jour.
 */
export function groupByDay(sessions: TradingSession[]): Map<string, DayStats> {
  const map = new Map<string, DayStats>()
  for (const s of sessions) {
    const key = s.session_date  // déjà au format 'YYYY-MM-DD' en base
    const prev = map.get(key) ?? { pnl: 0, count: 0 }
    map.set(key, {
      pnl: prev.pnl + Number(s.pnl),
      count: prev.count + (Number(s.trades_count) || 0),
    })
  }
  return map
}
