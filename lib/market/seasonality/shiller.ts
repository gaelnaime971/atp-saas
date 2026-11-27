/**
 * Série mensuelle du S&P 500 de Robert Shiller (https://shillerdata.com/,
 * fichier ie_data.xls, feuille « Data »). Les prix y sont des MOYENNES
 * MENSUELLES des clôtures quotidiennes ; le rendement d'un mois est donc
 * la variation d'une moyenne mensuelle à la suivante.
 *
 * Le repo ne garde que les rendements mensuels calculés (jamais les
 * niveaux de l'indice) : lib/market/seasonality/sp500-returns.ts,
 * régénéré une fois par an par scripts/seasonality-shiller.ts (voir
 * DECISIONS.md, « Saisonnalité »).
 */

export interface MonthlyPrice { month: string; price: number }

/**
 * Lit un export CSV de la feuille « Data » (colonnes Date et P en tête).
 * Dates au format de Shiller : 2026.01 … 2026.09, 2026.1 (= octobre),
 * 2026.11, 2026.12. Lignes d'en-tête, de notes et vides ignorées.
 */
export function parseShillerCsv(text: string): MonthlyPrice[] {
  const out: MonthlyPrice[] = []
  for (const raw of text.split(/\r?\n/)) {
    const cells = splitCsvLine(raw)
    if (cells.length < 2) continue
    const m = /^(\d{4})\.(\d{1,2})$/.exec(cells[0].trim())
    if (!m) continue
    const frac = m[2].length === 1 ? `${m[2]}0` : m[2]
    const month = Number(frac)
    const price = Number(cells[1].trim().replace(/\s/g, '').replace(',', '.'))
    if (month < 1 || month > 12 || !Number.isFinite(price) || price <= 0) continue
    out.push({ month: `${m[1]}-${String(month).padStart(2, '0')}`, price })
  }
  out.sort((a, b) => a.month.localeCompare(b.month))
  return out
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if ((ch === ',' || ch === ';') && !quoted) { cells.push(cur); cur = '' }
    else cur += ch
  }
  cells.push(cur)
  return cells
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * Rendements mensuels en %, par année (12 cases, janv. → déc., null si
 * le mois ou le précédent manque). `lastMonth` exclut les mois partiels
 * (Shiller publie le mois en cours sur une seule clôture).
 */
export function monthlyReturns(prices: readonly MonthlyPrice[], fromYear: number, lastMonth: string): Record<number, (number | null)[]> {
  const byMonth = new Map(prices.map(p => [p.month, p.price]))
  const lastYear = Number(lastMonth.slice(0, 4))
  const out: Record<number, (number | null)[]> = {}
  for (let y = fromYear; y <= lastYear; y++) {
    out[y] = Array.from({ length: 12 }, (_, i) => {
      const month = `${y}-${String(i + 1).padStart(2, '0')}`
      if (month > lastMonth) return null
      const cur = byMonth.get(month)
      const prev = byMonth.get(previousMonth(month))
      return cur !== undefined && prev !== undefined ? Math.round((cur / prev - 1) * 100_000) / 1000 : null
    })
  }
  return out
}
