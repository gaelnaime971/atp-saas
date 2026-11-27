/**
 * Chiffre publié d'une publication du calendrier : lu à la consultation
 * (pas de cron supplémentaire), avec un cache court. Pur pour le calcul
 * et la politique de cache (figure.test.ts) ; lecture FRED côté serveur.
 *
 * - Publié = la dernière observation FRED a été mise en ligne à la date
 *   de la publication ou après (champ realtime_start de FRED). Sinon le
 *   chiffre n'est pas encore sorti : « en attente ».
 * - Précédent = la même mesure sur la période d'avant.
 * - Aucun consensus.
 */
import type { FigureTransform } from '@/lib/market/calendar/releases'

export interface VintageObservation { date: string; value: number; realtimeStart: string }

export type PublishedFigure =
  | { status: 'pending' }
  | { status: 'published'; actual: number; previous: number | null; period: string }

function measure(obs: readonly VintageObservation[], i: number, t: FigureTransform): number | null {
  const cur = obs[i]
  const prev = obs[i - 1]
  switch (t) {
    case 'pct_mom':
    case 'pct_qoq': return prev && prev.value !== 0 ? ((cur.value / prev.value) - 1) * 100 : null
    case 'change_k': return prev ? cur.value - prev.value : null // PAYEMS est déjà en milliers
    case 'level_pct': return cur.value
    case 'level_k': return cur.value / 1000
    case 'level_m': return cur.value / 1000 // JTSJOL en milliers → millions
    case 'level_bn': return cur.value / 1000 // BOPGSTB en millions → milliards
  }
}

/** `obs` triées par date ; `releaseDate` = date de la publication à New York. */
export function publishedFigure(obs: readonly VintageObservation[], releaseDate: string, transform: FigureTransform): PublishedFigure {
  const i = obs.length - 1
  if (i < 0 || obs[i].realtimeStart < releaseDate) return { status: 'pending' }
  const actual = measure(obs, i, transform)
  if (actual === null) return { status: 'pending' }
  return { status: 'published', actual, previous: i > 0 ? measure(obs, i - 1, transform) : null, period: obs[i].date }
}

/**
 * Durée de cache du chiffre (secondes), selon l'heure de publication :
 * - avant la publication : null (on ne demande rien) ;
 * - dans les 3 heures qui suivent : 60 s (le chiffre arrive dans les
 *   minutes qui suivent l'annonce) ;
 * - ensuite : 1 heure.
 */
export function figureTtlSeconds(releaseAt: number, now: number): number | null {
  if (now < releaseAt) return null
  return now - releaseAt < 3 * 3_600_000 ? 60 : 3600
}

/** Clé de cache : la tranche de temps change à chaque durée de cache écoulée. */
export function figureCacheKey(series: string, releaseDate: string, releaseAt: number, now: number): string | null {
  const ttl = figureTtlSeconds(releaseAt, now)
  if (ttl === null) return null
  return `${series}|${releaseDate}|${Math.floor(now / (ttl * 1000))}`
}

export function parseVintageObservations(json: unknown): VintageObservation[] {
  const list = (json as { observations?: { date?: unknown; value?: unknown; realtime_start?: unknown }[] } | null)?.observations
  if (!Array.isArray(list)) throw new Error('Réponse FRED inattendue')
  return list
    .map(o => ({ date: String(o.date), value: Number(o.value), realtimeStart: String(o.realtime_start) }))
    .filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.value))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchVintageObservations(series: string): Promise<VintageObservation[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY absente')
  const params = new URLSearchParams({ series_id: series, api_key: key, file_type: 'json', sort_order: 'desc', limit: '4' })
  const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`FRED ${series} : HTTP ${res.status}`)
  return parseVintageObservations(await res.json())
}
