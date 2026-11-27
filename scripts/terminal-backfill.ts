/**
 * Historique initial des données Terminal — à lancer UNE fois, en local,
 * après création des tables (migration 20261127000002) :
 *
 *   npx vite-node --config vitest.config.ts scripts/terminal-backfill.ts
 *
 * 10 ans pour FRED, depuis 2010 pour le COT (lib/market/catalog.ts).
 * Même code que le cron (ingestion incrémentale et idempotente) : le
 * relancer ne crée aucun doublon, il complète seulement ce qui manque.
 *
 * Option `--dry-run` : appels réels à FRED et à la CFTC, rien n'est écrit
 * en base (store en mémoire), affiche seulement des comptes.
 *
 * Lit .env.local (FRED_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY) sans jamais afficher une valeur.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvLocal() {
  const text = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

async function main() {
  loadEnvLocal()
  const dryRun = process.argv.includes('--dry-run')
  const { ingestAll, todayUtc } = await import('@/lib/market/ingest')
  const { liveFetchers } = await import('@/lib/market/run')
  const { FRED_SERIES, COT_MARKETS } = await import('@/lib/market/catalog')

  const started = Date.now()
  if (dryRun) {
    const { memoryMarketStore } = await import('@/lib/market/store-memory')
    const mem = memoryMarketStore()
    const results = await ingestAll(mem.store, liveFetchers, { trigger: 'backfill', today: todayUtc() })
    console.log('Essai à blanc (rien écrit en base) :')
    for (const s of FRED_SERIES) {
      const obs = mem.observations(s.code)
      console.log(`  FRED ${s.code.padEnd(11)} ${String(obs.length).padStart(5)} obs.  ${obs[0]?.date ?? '—'} → ${obs.at(-1)?.date ?? '—'}`)
    }
    for (const m of COT_MARKETS) {
      const rows = mem.cotRows().filter(r => r.market === m.code)
      console.log(`  COT  ${m.code.padEnd(11)} ${String(rows.length).padStart(5)} rapports  ${rows[0]?.reportDate ?? '—'} → ${rows.at(-1)?.reportDate ?? '—'}`)
    }
    for (const r of results) console.log(`  ${r.source} : ${r.status}, ${r.rows} lignes${r.errors.length ? `, erreurs : ${r.errors.join(' | ')}` : ''}`)
  } else {
    const { runIngestion } = await import('@/lib/market/run')
    const results = await runIngestion('backfill')
    for (const r of results) console.log(`${r.source} : ${r.status}, ${r.rows} lignes écrites${r.errors.length ? `, erreurs : ${r.errors.join(' | ')}` : ''}`)
  }
  console.log(`Durée : ${Math.round((Date.now() - started) / 1000)} s`)
}

main().catch(e => {
  console.error('Échec :', (e as Error).message)
  process.exit(1)
})
