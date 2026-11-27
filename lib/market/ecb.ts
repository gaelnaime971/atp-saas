/**
 * Client de l'API de données de la BCE (ECB Data Portal, SDMX, sans clé).
 * Conditions : réutilisation gratuite, y compris commerciale, à condition
 * de citer la source et de ne pas modifier les données (politique de
 * réutilisation des statistiques du SEBC). Mention affichée : « Source :
 * BCE. Ces données sont disponibles gratuitement sur le site de la BCE. »
 */
import type { Observation } from '@/lib/market/fred'

export interface EcbSeriesDef { code: string; key: string; label: string }

/** Taux directeurs de la BCE (niveau quotidien, « date of changes »). */
export const ECB_SERIES: EcbSeriesDef[] = [
  { code: 'ECB_DFR', key: 'FM/D.U2.EUR.4F.KR.DFR.LEV', label: 'Taux de la facilité de dépôt (BCE)' },
  { code: 'ECB_MRO', key: 'FM/D.U2.EUR.4F.KR.MRR_FR.LEV', label: 'Taux des opérations principales de refinancement (BCE)' },
]

export const ECB_NOTICE = 'Source : Banque centrale européenne (ECB Data Portal). Ces données sont disponibles gratuitement sur le site de la BCE.'

/** Ligne CSV (guillemets doubles gérés). */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

export function parseEcbCsv(text: string): Observation[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean)
  if (lines.length === 0) return []
  const header = splitCsv(lines[0])
  const iDate = header.indexOf('TIME_PERIOD')
  const iValue = header.indexOf('OBS_VALUE')
  if (iDate < 0 || iValue < 0) throw new Error('Réponse BCE inattendue')
  const out: Observation[] = []
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line)
    const date = cols[iDate]
    const value = Number(cols[iValue])
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && cols[iValue] !== '' && Number.isFinite(value)) out.push({ date, value })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchEcbSeries(def: EcbSeriesDef, start: string): Promise<Observation[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('Date de début invalide')
  let res: Response
  try {
    res = await fetch(`https://data-api.ecb.europa.eu/service/data/${def.key}?startPeriod=${start}&format=csvdata`, {
      cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new Error(`BCE ${def.code} : réseau (${(e as Error).name})`)
  }
  if (!res.ok) throw new Error(`BCE ${def.code} : HTTP ${res.status}`)
  return parseEcbCsv(await res.text())
}
