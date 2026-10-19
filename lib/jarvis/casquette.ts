/**
 * Calcul de la casquette du moment, basée sur l'Open US (9:30
 * America/New_York) — DST-aware, jamais 15:30 Paris en dur. Fin
 * octobre et jusqu'à la bascule DST européenne, l'Open est à 14:30
 * Paris, pas 15:30.
 *
 * Casquettes :
 *   Avant Open −45 min  → hors-session
 *   Open −45 → Open −30 → MANAGER   (rappel règles / objectifs)
 *   Open −30 → Open     → ANALYSTE  (cadrage / plan)
 *   Open     → Open +1h30 → TRADER  (exécution / anti-tilt)
 *   Open +1h30 → fin de journée NY → COMPTABLE (journal)
 *   Week-end NY         → marché-ferme
 */

export type Casquette =
  | 'marché-fermé'
  | 'hors-session'
  | 'MANAGER'
  | 'ANALYSTE'
  | 'TRADER'
  | 'COMPTABLE'

export interface CasquetteInfo {
  casquette: Casquette
  usOpenParisISO: string | null  // date ISO en Europe/Paris
  usOpenParisLabel: string | null // ex: "15:30" ou "14:30"
  minutesToOpen: number | null    // négatif = déjà passé
  weekdayNY: number               // 0=dim, 6=sam (dans NY)
}

/**
 * Résout "9:30 NY" un jour donné en UTC, en tenant compte du DST
 * courant à NY ce jour-là. Approche robuste : construit un timestamp
 * UTC provisoire avec les mêmes composants, mesure comment Intl le
 * rend dans la TZ cible, et corrige le delta en une passe.
 */
function zonedTimeToUtc(
  y: number, m: number, d: number, hh: number, mm: number,
  timeZone: string,
): Date {
  const provisional = Date.UTC(y, m - 1, d, hh, mm, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(provisional))
  const got = {
    y:  Number(parts.find(p => p.type === 'year')!.value),
    m:  Number(parts.find(p => p.type === 'month')!.value),
    d:  Number(parts.find(p => p.type === 'day')!.value),
    hh: Number(parts.find(p => p.type === 'hour')!.value),
    mm: Number(parts.find(p => p.type === 'minute')!.value),
  }
  const wanted = Date.UTC(y, m - 1, d, hh, mm, 0)
  const got_ms = Date.UTC(got.y, got.m - 1, got.d, got.hh, got.mm, 0)
  return new Date(provisional + (wanted - got_ms))
}

/** Date du jour en America/New_York (year, month 1-12, day, weekday 0-6). */
function todayInNY(now: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    y: Number(parts.find(p => p.type === 'year')!.value),
    m: Number(parts.find(p => p.type === 'month')!.value),
    d: Number(parts.find(p => p.type === 'day')!.value),
    weekday: wdMap[parts.find(p => p.type === 'weekday')!.value] ?? 0,
  }
}

/** Format HH:MM dans Europe/Paris. */
function formatParis(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

export function getCasquette(now: Date = new Date()): CasquetteInfo {
  const ny = todayInNY(now)

  // Week-end NY → fermé
  if (ny.weekday === 0 || ny.weekday === 6) {
    return {
      casquette: 'marché-fermé',
      usOpenParisISO: null,
      usOpenParisLabel: null,
      minutesToOpen: null,
      weekdayNY: ny.weekday,
    }
  }

  const openUtc = zonedTimeToUtc(ny.y, ny.m, ny.d, 9, 30, 'America/New_York')
  const diffMs = openUtc.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60000)

  let casquette: Casquette
  if (diffMin > 45)         casquette = 'hors-session'
  else if (diffMin > 30)    casquette = 'MANAGER'
  else if (diffMin > 0)     casquette = 'ANALYSTE'
  else if (diffMin > -90)   casquette = 'TRADER'            // Open .. Open+1h30
  else                      casquette = 'COMPTABLE'         // Open+1h30 et au-delà

  return {
    casquette,
    usOpenParisISO: openUtc.toISOString(),
    usOpenParisLabel: formatParis(openUtc),
    minutesToOpen: diffMin,
    weekdayNY: ny.weekday,
  }
}
