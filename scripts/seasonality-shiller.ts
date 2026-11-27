/**
 * Saisonnalité — mise à jour annuelle des rendements mensuels du S&P 500
 * (Shiller). À lancer en local, une fois par an (en janvier, quand
 * l'année écoulée est complète) :
 *
 *   1. Télécharger ie_data.xls sur https://shillerdata.com/
 *   2. Ouvrir la feuille « Data » et l'exporter en CSV (Numbers, Excel ou
 *      LibreOffice), sans rien modifier.
 *   3. npx vite-node --config vitest.config.ts scripts/seasonality-shiller.ts \
 *        -- <chemin du CSV> <dernier mois complet AAAA-MM> <date du téléchargement AAAA-MM-JJ>
 *
 * Réécrit lib/market/seasonality/sp500-returns.ts : rendements mensuels
 * en % depuis 1950, jamais les niveaux de l'indice. Vérifier le diff,
 * lancer les tests, puis committer.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--')
  const [csvPath, lastMonth, downloaded] = args
  if (!csvPath || !/^\d{4}-\d{2}$/.test(lastMonth ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(downloaded ?? '')) {
    throw new Error('Usage : <CSV> <dernier mois complet AAAA-MM> <date du téléchargement AAAA-MM-JJ>')
  }
  const { parseShillerCsv, monthlyReturns } = await import('@/lib/market/seasonality/shiller')
  const prices = parseShillerCsv(readFileSync(csvPath, 'utf8'))
  if (prices.length < 1000) throw new Error(`Export inattendu : ${prices.length} mois lus`)
  const returns = monthlyReturns(prices, 1950, lastMonth)
  const years = Object.keys(returns).map(Number).sort((a, b) => a - b)
  const missing = years.flatMap(y => returns[y].flatMap((v, i) => v === null && `${y}-${String(i + 1).padStart(2, '0')}` <= lastMonth ? [`${y}-${i + 1}`] : []))
  if (missing.length) throw new Error(`Mois manquants : ${missing.join(', ')}`)

  const body = years.map(y => `  ${y}: [${returns[y].map(v => (v === null ? 'null' : String(v))).join(', ')}],`).join('\n')
  const file = `/**
 * S&P 500 — rendements mensuels en % (variation de la moyenne mensuelle
 * des clôtures quotidiennes, mois sur mois), calculés depuis la série
 * de Robert Shiller (https://shillerdata.com/, ie_data.xls).
 * Fichier GÉNÉRÉ par scripts/seasonality-shiller.ts : ne pas modifier à
 * la main. Aucun niveau de l'indice n'est conservé.
 */
export const SP500_SOURCE = {
  label: 'Robert J. Shiller, données du S&P 500 (moyennes mensuelles)',
  url: 'https://shillerdata.com/',
  /** Date du téléchargement du fichier. */
  downloaded: '${downloaded}',
  /** Dernier mois complet pris en compte. */
  lastMonth: '${lastMonth}',
} as const

/** Année → 12 rendements (janv. → déc.), null = mois pas encore connu. */
export const SP500_MONTHLY_RETURNS: Record<number, readonly (number | null)[]> = {
${body}
}
`
  const out = join(process.cwd(), 'lib/market/seasonality/sp500-returns.ts')
  writeFileSync(out, file)
  console.log(`Écrit : ${years.length} années (${years[0]}–${years.at(-1)}), dernier mois ${lastMonth}.`)
}

main().catch(e => {
  console.error('Échec :', (e as Error).message)
  process.exit(1)
})
