/**
 * Heure et fuseaux : la référence unique de l'app.
 *
 * - Fuseau du membre : profiles.timezone, sinon le navigateur, sinon
 *   Europe/Paris. Un fuseau invalide (en base ou ailleurs) ne fait jamais
 *   planter : il est ignoré, on passe au suivant.
 * - Heures de marché : une heure est définie dans le fuseau de sa place
 *   (America/New_York, America/Chicago, Europe/London, Asia/Tokyo) pour une
 *   date de cette place, puis convertie. Les changements d'heure sont ceux
 *   de la base IANA embarquée par Intl : États-Unis et Europe ne changent
 *   pas le même jour, la Guadeloupe ne change jamais.
 * - Formats français : 14:30, « mer. 25 nov. », « UTC−4 ».
 *
 * API Intl native uniquement, aucune dépendance.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Paris'

/** Zones des places de marché utilisées dans l'espace Marchés. */
export const MARKET_ZONES = {
  newYork: 'America/New_York',
  chicago: 'America/Chicago',
  london: 'Europe/London',
  tokyo: 'Asia/Tokyo',
} as const

const LOCALE = 'fr-FR'

// ─── Validation et choix du fuseau ──────────────────────────────

const validity = new Map<string, boolean>()

/** Vrai si `tz` est un identifiant IANA reconnu par le moteur Intl. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string') return false
  const value = tz.trim()
  if (!value || value.length > 64) return false
  const known = validity.get(value)
  if (known !== undefined) return known
  let ok = false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    ok = true
  } catch {
    ok = false
  }
  validity.set(value, ok)
  return ok
}

/** Fuseau du navigateur, ou null s'il est absent ou invalide (SSR compris). */
export function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(tz) ? tz : null
  } catch {
    return null
  }
}

export type TimeZoneSource = 'profile' | 'browser' | 'default'

/** Profil vide = null, undefined ou chaîne blanche. */
export function isEmptyTimeZone(tz: string | null | undefined): boolean {
  return tz == null || tz.trim() === ''
}

/**
 * Profil, sinon navigateur, sinon Europe/Paris. Ne lève jamais.
 * Profil vide → navigateur. Profil rempli mais invalide → Europe/Paris
 * (on ne devine pas à partir d'une valeur cassée).
 */
export function resolveTimeZone(
  profileTz: string | null | undefined,
  browserTz: string | null | undefined,
): { timeZone: string; source: TimeZoneSource } {
  if (isValidTimeZone(profileTz)) return { timeZone: profileTz.trim(), source: 'profile' }
  if (isEmptyTimeZone(profileTz) && isValidTimeZone(browserTz)) return { timeZone: browserTz.trim(), source: 'browser' }
  return { timeZone: DEFAULT_TIME_ZONE, source: 'default' }
}

/** Fuseau sûr pour un formateur Intl : `tz` s'il est valide, sinon Paris. */
export function safeTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz.trim() : DEFAULT_TIME_ZONE
}

// ─── Décomposition d'un instant dans un fuseau ──────────────────

export interface ZonedParts {
  year: number
  month: number   // 1-12
  day: number
  hour: number    // 0-23
  minute: number
  second: number
  weekday: number // 0 = dimanche … 6 = samedi
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      weekday: 'short',
    })
    partsFormatters.set(tz, f)
  }
  return f
}

export function zonedParts(date: Date | number, tz: string): ZonedParts {
  const out: Record<string, string> = {}
  for (const p of partsFormatter(safeTimeZone(tz)).formatToParts(date)) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  }
}

/** Décalage du fuseau par rapport à UTC à cet instant, en minutes (Paris l'hiver : +60). */
export function offsetMinutes(date: Date | number, tz: string): number {
  const t = typeof date === 'number' ? date : date.getTime()
  const p = zonedParts(t, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60_000)
}

// ─── Dates civiles (clé AAAA-MM-JJ) ─────────────────────────────

/** Date civile « AAAA-MM-JJ » de cet instant dans le fuseau. */
export function dateKey(date: Date | number, tz: string): string {
  const p = zonedParts(date, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month, day }
}

/** Ajoute n jours à une date civile (sans fuseau, donc sans piège d'heure d'été). */
export function addDays(key: string, n: number): string {
  const { year, month, day } = parseDateKey(key)
  const d = new Date(Date.UTC(year, month - 1, day + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Jour de la semaine d'une date civile (0 = dimanche). */
export function weekdayOf(key: string): number {
  const { year, month, day } = parseDateKey(key)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// ─── Heure murale → instant ─────────────────────────────────────

/**
 * Instant correspondant à `date` (AAAA-MM-JJ) à `time` (HH:MM) dans le
 * fuseau `tz`. Heure inexistante (saut de printemps) : on avance de
 * l'écart, comme le fait la place. Heure ambiguë (retour d'automne) : la
 * première occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const zone = safeTimeZone(tz)
  const { year, month, day } = parseDateKey(date)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // Deux passes suffisent : le décalage est relu à l'instant estimé.
  const first = wall - offsetMinutes(wall, zone) * 60_000
  const second = wall - offsetMinutes(first, zone) * 60_000
  if (first === second) return new Date(first)
  // Changement d'heure entre les deux estimations : garder celle qui
  // retombe sur l'heure murale demandée, sinon la plus tardive (saut).
  const hits = [first, second].filter(t => {
    const p = zonedParts(t, zone)
    return p.hour === hour && p.minute === minute && p.day === day
  })
  return new Date(hits.length ? Math.min(...hits) : Math.max(first, second))
}

/**
 * Heure de marché `time`, définie dans `marketTz` pour la date de marché
 * `date`, exprimée dans le fuseau du membre : { instant, heure, date }.
 */
export function marketTimeIn(date: string, time: string, marketTz: string, memberTz: string) {
  const instant = zonedTimeToUtc(date, time, marketTz)
  return { instant, time: formatTime(instant, memberTz), date: dateKey(instant, memberTz) }
}

// ─── Formats français ───────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>()
function cached(key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let f = formatters.get(key)
  if (!f) { f = make(); formatters.set(key, f) }
  return f
}

/** « 14:30 » (24 h, deux chiffres). */
export function formatTime(date: Date | number, tz: string): string {
  const zone = safeTimeZone(tz)
  const p = zonedParts(date, zone)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** « mer. 25 nov. » */
export function formatDayShort(date: Date | number, tz: string): string {
  const zone = safeTimeZone(tz)
  return cached(`day|${zone}`, () => new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
  })).format(date)
}

/** « mercredi 25 novembre 2026 » */
export function formatDayLong(date: Date | number, tz: string): string {
  const zone = safeTimeZone(tz)
  return cached(`long|${zone}`, () => new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })).format(date)
}

/** Date civile AAAA-MM-JJ → « ven. 18 déc. » (ou avec l'année). */
export function formatDateKey(key: string, opts?: { year?: boolean; long?: boolean }): string {
  const { year, month, day } = parseDateKey(key)
  const noon = Date.UTC(year, month - 1, day, 12)
  return cached(`key|${opts?.year ? 'y' : ''}${opts?.long ? 'l' : ''}`, () => new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    weekday: opts?.long ? 'long' : 'short',
    day: 'numeric',
    month: opts?.long ? 'long' : 'short',
    ...(opts?.year ? { year: 'numeric' } : {}),
  })).format(noon)
}

/** « UTC+1 », « UTC−4 », « UTC+5:30 », « UTC » (signe moins typographique). */
export function offsetLabel(date: Date | number, tz: string): string {
  const off = offsetMinutes(date, safeTimeZone(tz))
  if (off === 0) return 'UTC'
  const sign = off > 0 ? '+' : '−'
  const abs = Math.abs(off)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`
}

/** Durée lisible : « 45 min », « 5 h 18 », « 2 j 4 h ». */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000))
  if (totalMin < 60) return `${totalMin} min`
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const min = totalMin % 60
  if (days > 0) return hours ? `${days} j ${hours} h` : `${days} j`
  return min ? `${hours} h ${pad(min)}` : `${hours} h`
}

// ─── Liste des fuseaux (réglage Mon compte) ─────────────────────

export interface TimeZoneOption {
  id: string
  label: string
  featured?: boolean
}

/** En tête de liste, dans cet ordre. */
export const FEATURED_TIME_ZONES: TimeZoneOption[] = [
  { id: 'Europe/Paris', label: 'Paris', featured: true },
  { id: 'America/Guadeloupe', label: 'Guadeloupe', featured: true },
  { id: 'America/Martinique', label: 'Martinique', featured: true },
  { id: 'America/Cayenne', label: 'Guyane', featured: true },
  { id: 'Indian/Reunion', label: 'La Réunion', featured: true },
  { id: 'Europe/Brussels', label: 'Bruxelles', featured: true },
  { id: 'Europe/Zurich', label: 'Genève', featured: true },
  { id: 'America/Toronto', label: 'Montréal', featured: true },
]

const REGIONS: Record<string, string> = {
  Africa: 'Afrique', America: 'Amériques', Antarctica: 'Antarctique', Arctic: 'Arctique',
  Asia: 'Asie', Atlantic: 'Atlantique', Australia: 'Australie', Europe: 'Europe',
  Indian: 'Océan Indien', Pacific: 'Pacifique', Etc: 'Autres',
}

/** Noms français des villes les plus courantes ; les autres gardent le nom IANA. */
const CITY_FR: Record<string, string> = {
  'Europe/London': 'Londres', 'America/New_York': 'New York', 'America/Chicago': 'Chicago',
  'Asia/Tokyo': 'Tokyo', 'Europe/Berlin': 'Berlin', 'Europe/Madrid': 'Madrid', 'Europe/Rome': 'Rome',
  'Europe/Lisbon': 'Lisbonne', 'Europe/Amsterdam': 'Amsterdam', 'Europe/Luxembourg': 'Luxembourg',
  'Europe/Monaco': 'Monaco', 'Europe/Vienna': 'Vienne', 'Europe/Athens': 'Athènes', 'Europe/Moscow': 'Moscou',
  'Europe/Warsaw': 'Varsovie', 'Europe/Prague': 'Prague', 'Europe/Copenhagen': 'Copenhague',
  'Europe/Stockholm': 'Stockholm', 'Europe/Oslo': 'Oslo', 'Europe/Helsinki': 'Helsinki', 'Europe/Dublin': 'Dublin',
  'Europe/Istanbul': 'Istanbul', 'Africa/Casablanca': 'Casablanca', 'Africa/Algiers': 'Alger', 'Africa/Tunis': 'Tunis',
  'Africa/Dakar': 'Dakar', 'Africa/Abidjan': 'Abidjan', 'Africa/Douala': 'Douala', 'Africa/Kinshasa': 'Kinshasa',
  'Africa/Johannesburg': 'Johannesburg', 'Africa/Cairo': 'Le Caire', 'Asia/Dubai': 'Dubaï',
  'Asia/Singapore': 'Singapour', 'Asia/Hong_Kong': 'Hong Kong', 'Asia/Shanghai': 'Shanghai',
  'Asia/Bangkok': 'Bangkok', 'Asia/Kolkata': 'Calcutta', 'Australia/Sydney': 'Sydney',
  'America/Los_Angeles': 'Los Angeles', 'America/Denver': 'Denver', 'America/Montreal': 'Montréal',
  'America/Mexico_City': 'Mexico', 'America/Sao_Paulo': 'São Paulo', 'America/Port-au-Prince': 'Port-au-Prince',
  'America/Miquelon': 'Saint-Pierre-et-Miquelon', 'America/St_Barthelemy': 'Saint-Barthélemy',
  'America/Marigot': 'Saint-Martin', 'Indian/Mayotte': 'Mayotte', 'Indian/Mauritius': 'Maurice',
  'Pacific/Noumea': 'Nouméa', 'Pacific/Tahiti': 'Tahiti', 'Pacific/Wallis': 'Wallis',
}

/** Libellé français d'un fuseau : « Guadeloupe », « Europe · Lisbonne », « Amériques · Bogota ». */
export function timeZoneLabel(tz: string): string {
  const featured = FEATURED_TIME_ZONES.find(z => z.id === tz)
  if (featured) return featured.label
  const [region, ...rest] = tz.split('/')
  const city = CITY_FR[tz] ?? rest.join(' / ').replace(/_/g, ' ')
  if (!city) return tz
  const regionFr = REGIONS[region] ?? region
  return `${regionFr} · ${city}`
}

/** Fuseaux en tête, puis tous les autres connus du moteur, triés par libellé. */
export function timeZoneOptions(): TimeZoneOption[] {
  let all: string[] = []
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    all = supported ? supported('timeZone') : []
  } catch {
    all = []
  }
  const featuredIds = new Set(FEATURED_TIME_ZONES.map(z => z.id))
  const rest = all
    .filter(id => !featuredIds.has(id) && isValidTimeZone(id))
    .map(id => ({ id, label: timeZoneLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, LOCALE))
  return [...FEATURED_TIME_ZONES, ...rest]
}

/** Recherche insensible aux accents et à la casse, sur le libellé et l'identifiant. */
export function matchesTimeZone(option: TimeZoneOption, query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return fold(option.label).includes(q) || fold(option.id.replace(/_/g, ' ')).includes(q)
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
