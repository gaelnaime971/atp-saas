/**
 * Client FRED (API St. Louis Fed), côté serveur uniquement : la clé
 * FRED_API_KEY ne quitte jamais le serveur et n'apparaît dans aucun
 * message d'erreur ni journal.
 */

export interface Observation {
  /** AAAA-MM-JJ */
  date: string
  value: number
}

const BASE = 'https://api.stlouisfed.org/fred/series/observations'

/** Observations FRED → valeurs numériques ; les valeurs manquantes (« . ») sont ignorées. */
export function parseFredObservations(json: unknown): Observation[] {
  const list = (json as { observations?: { date?: unknown; value?: unknown }[] } | null)?.observations
  if (!Array.isArray(list)) throw new Error('Réponse FRED inattendue')
  const out: Observation[] = []
  for (const o of list) {
    if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue
    const value = typeof o.value === 'string' ? Number(o.value) : NaN
    if (!Number.isFinite(value)) continue
    out.push({ date: o.date, value })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchFredObservations(code: string, start: string, fetchImpl: typeof fetch = fetch): Promise<Observation[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY absente')
  const params = new URLSearchParams({
    series_id: code, api_key: key, file_type: 'json', observation_start: start,
  })
  let res: Response
  try {
    res = await fetchImpl(`${BASE}?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new Error(`FRED ${code} : réseau (${(e as Error).name})`)
  }
  if (!res.ok) throw new Error(`FRED ${code} : HTTP ${res.status}`)
  return parseFredObservations(await res.json())
}
