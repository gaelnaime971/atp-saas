#!/usr/bin/env node
/**
 * codemod-colors.mjs — remap hardcoded hex + rgba to ATP semantic tokens.
 *
 * Two modes:
 *   node scripts/codemod-colors.mjs             → dry-run (default), writes REFONTE-couleurs.md
 *   node scripts/codemod-colors.mjs --apply     → performs the replacement in place, file by file
 *
 * Extra flags:
 *   --file <path>     restrict to one file (relative to repo root)
 *   --show-first-diff show the diff of the first modified file and stop (in --apply mode)
 *
 * Safety:
 *   - Skips node_modules, .next, .git, scratchpad, this script itself
 *   - Skips app/(lab)/** (shadcn lab, isolated)
 *   - Skips components/shadcn/** (shadcn primitives, isolated)
 *   - Skips components/admin/pages/TradingPerso.tsx (2919 lines, 401 inline styles — asks first)
 *   - Skips *.md / *.json / *.lock / *.css files
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, extname, relative, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/* ─── Correspondance hex → var() ─────────────────────────────
 * Toutes les valeurs canoniques du système ATP.
 * La clé est la forme minuscule sans espace, sans prefix (#).
 */
const HEX_MAP = {
  // Surfaces
  '09090b': 'var(--color-surface-0)',
  '111113': 'var(--color-surface-1)',
  '18181b': 'var(--color-surface-2)',
  '222225': 'var(--color-surface-3)',
  // Texte
  'f0f0f3': 'var(--color-text-1)',
  'a1a1aa': 'var(--color-text-2)',
  '52525b': 'var(--color-text-3)',
  // Data semantic
  '22c55e': 'var(--color-profit)',
  'ef4444': 'var(--color-loss)',
  'f59e0b': 'var(--color-warn)',
  '5a6a82': 'var(--color-neutral)',
  // Brand
  'c9a574': 'var(--color-accent)',
}

/* Formes RGBA acceptées : rgba(R,G,B,A) et rgba(R, G, B, A) */
const RGBA_MAP = {
  // profit
  '34,197,94':   'var(--color-profit-rgb)',
  // loss
  '239,68,68':   'var(--color-loss-rgb)',
  // warn
  '245,158,11':  'var(--color-warn-rgb)',
  // neutral
  '90,106,130':  'var(--color-neutral-rgb)',
  // accent
  '201,165,116': 'var(--color-accent-rgb)',
}

/* Fichiers/dirs à ignorer */
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', '.vercel', 'scratchpad',
  'coverage', 'dist', 'build',
])
const SKIP_PATH_INCLUDES = [
  'app/(lab)/',              // shadcn lab isolated
  'components/shadcn/',      // shadcn primitives isolated
  'components/admin/pages/TradingPerso.tsx',  // asks first (2919 lignes, 401 inline styles)
]
const ONLY_EXT = new Set(['.tsx', '.ts', '.jsx', '.js'])

/* ─── Regexes ─────────────────────────────────────────────── */
// Match #RRGGBB or #RGB (case-insensitive), avoiding capture inside urls or long hex tokens
const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
// Match rgba(R, G, B, A) with optional spaces
const RGBA_RE = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([0-9.]+)\s*\)/g

/* ─── CLI parse ───────────────────────────────────────────── */
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const SHOW_FIRST_DIFF = args.includes('--show-first-diff')
const fileIdx = args.indexOf('--file')
const ONLY_FILE = fileIdx >= 0 ? args[fileIdx + 1] : null

/* ─── Walk filesystem ─────────────────────────────────────── */
async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(p, files)
    } else if (entry.isFile()) {
      const rel = relative(ROOT, p)
      if (SKIP_PATH_INCLUDES.some(s => rel.includes(s))) continue
      if (!ONLY_EXT.has(extname(entry.name))) continue
      if (entry.name.startsWith('.')) continue
      files.push(p)
    }
  }
  return files
}

/* ─── Transform one file's content ───────────────────────── */
function transform(src) {
  const changes = []          // { kind, from, to, index }
  const unmapped = new Map()  // hex → count

  // Hex replacements
  let out = src.replace(HEX_RE, (match, hex, offset) => {
    let normalized = hex.toLowerCase()
    // Expand #RGB → #RRGGBB
    if (normalized.length === 3) {
      normalized = normalized.split('').map(c => c + c).join('')
    }
    if (HEX_MAP[normalized]) {
      changes.push({ kind: 'hex', from: match, to: HEX_MAP[normalized], index: offset })
      return HEX_MAP[normalized]
    }
    // #000 and #fff are semantic in a lot of contexts (pure black/white) — do not map,
    // do not warn.
    if (normalized === '000000' || normalized === 'ffffff') return match
    unmapped.set('#' + normalized, (unmapped.get('#' + normalized) || 0) + 1)
    return match
  })

  // rgba() replacements
  out = out.replace(RGBA_RE, (match, r, g, b, a, offset) => {
    const key = `${r},${g},${b}`
    if (RGBA_MAP[key]) {
      const replaced = `rgba(${RGBA_MAP[key]}, ${a})`
      changes.push({ kind: 'rgba', from: match, to: replaced, index: offset })
      return replaced
    }
    unmapped.set(`rgba(${key},…)`, (unmapped.get(`rgba(${key},…)`) || 0) + 1)
    return match
  })

  return { out, changes, unmapped }
}

/* ─── Aggregate + report ─────────────────────────────────── */
async function main() {
  const files = ONLY_FILE
    ? [resolve(ROOT, ONLY_FILE)]
    : await walk(ROOT)

  const report = {
    processed: 0,
    filesWithChanges: [],   // { path, hexCount, rgbaCount, sample: [] }
    unmappedGlobal: new Map(),
  }

  let firstDiffShown = false

  for (const file of files) {
    const st = await stat(file).catch(() => null)
    if (!st || !st.isFile()) continue
    const src = await readFile(file, 'utf-8')
    report.processed++
    const { out, changes, unmapped } = transform(src)
    if (changes.length === 0 && unmapped.size === 0) continue

    if (changes.length > 0) {
      const rel = relative(ROOT, file)
      report.filesWithChanges.push({
        path: rel,
        hexCount: changes.filter(c => c.kind === 'hex').length,
        rgbaCount: changes.filter(c => c.kind === 'rgba').length,
        sample: changes.slice(0, 3).map(c => `${c.from} → ${c.to}`),
      })

      if (APPLY) {
        await writeFile(file, out, 'utf-8')
        if (SHOW_FIRST_DIFF && !firstDiffShown) {
          firstDiffShown = true
          console.log(`\n═══ Diff appliqué au premier fichier : ${rel} ═══`)
          for (const c of changes.slice(0, 12)) {
            console.log(`  ${c.from}  →  ${c.to}`)
          }
          if (changes.length > 12) console.log(`  … et ${changes.length - 12} autres`)
          console.log(`\nSTOP demandé via --show-first-diff. Relance sans ce flag pour tout appliquer.`)
          process.exit(0)
        }
      }
    }

    for (const [k, v] of unmapped) {
      report.unmappedGlobal.set(k, (report.unmappedGlobal.get(k) || 0) + v)
    }
  }

  // Write REFONTE-couleurs.md
  const totalHex = report.filesWithChanges.reduce((s, f) => s + f.hexCount, 0)
  const totalRgba = report.filesWithChanges.reduce((s, f) => s + f.rgbaCount, 0)

  const md = [
    `# Codemod couleurs — rapport ${APPLY ? '(APPLIQUÉ)' : '(dry-run)'}`,
    ``,
    `Généré par \`node scripts/codemod-colors.mjs${APPLY ? ' --apply' : ''}\`.`,
    ``,
    `## Résumé`,
    ``,
    `- Fichiers scannés : **${report.processed}**`,
    `- Fichiers avec au moins un match mappable : **${report.filesWithChanges.length}**`,
    `- Occurrences hex mappables : **${totalHex}**`,
    `- Occurrences rgba() mappables : **${totalRgba}**`,
    `- Formes de couleurs NON mappées (rencontrées mais sans correspondance) : **${report.unmappedGlobal.size}**`,
    ``,
    `## Fichiers exclus`,
    ``,
    `- \`app/(lab)/**\` — lab shadcn isolé`,
    `- \`components/shadcn/**\` — primitives shadcn isolées`,
    `- \`components/admin/pages/TradingPerso.tsx\` — **à confirmer avant** (2919 lignes, 401 inline styles)`,
    ``,
    `## Correspondances utilisées`,
    ``,
    `### Hex → var()`,
    ``,
    ...Object.entries(HEX_MAP).map(([hex, v]) => `- \`#${hex}\` → \`${v}\``),
    ``,
    `### rgba(R,G,B,A) → rgba(var(--…-rgb), A)`,
    ``,
    ...Object.entries(RGBA_MAP).map(([rgb, v]) => `- \`rgba(${rgb}, α)\` → \`rgba(${v}, α)\``),
    ``,
    `## Détail par fichier`,
    ``,
  ]

  report.filesWithChanges
    .sort((a, b) => (b.hexCount + b.rgbaCount) - (a.hexCount + a.rgbaCount))
    .forEach(f => {
      md.push(`### \`${f.path}\``)
      md.push(``)
      md.push(`- Hex à remplacer : ${f.hexCount}`)
      md.push(`- rgba à remplacer : ${f.rgbaCount}`)
      md.push(``)
      md.push(`Exemples :`)
      md.push(`\`\`\``)
      for (const s of f.sample) md.push(s)
      md.push(`\`\`\``)
      md.push(``)
    })

  md.push(`## Couleurs NON mappées (attendent ta décision)`)
  md.push(``)
  md.push(`Ces formes existent dans le code, aucune correspondance dans le codemod.`)
  md.push(`Décide : chacune devient un token sémantique (à ajouter dans globals.css)`)
  md.push(`ou reste en hex (couleur "one-shot" acceptée).`)
  md.push(``)
  const unmappedSorted = [...report.unmappedGlobal.entries()].sort((a, b) => b[1] - a[1])
  if (unmappedSorted.length === 0) {
    md.push(`_(aucune)_`)
  } else {
    md.push(`| Couleur | Occurrences |`)
    md.push(`|---|---|`)
    for (const [k, v] of unmappedSorted) md.push(`| \`${k}\` | ${v} |`)
  }
  md.push(``)

  const reportPath = join(ROOT, 'REFONTE-couleurs.md')
  await writeFile(reportPath, md.join('\n'), 'utf-8')

  console.log(`${APPLY ? '✓ Appliqué' : '✓ Dry-run terminé'}`)
  console.log(`  ${report.processed} fichiers scannés`)
  console.log(`  ${report.filesWithChanges.length} fichiers auraient des changements`)
  console.log(`  ${totalHex} hex + ${totalRgba} rgba mappables`)
  console.log(`  ${report.unmappedGlobal.size} formes non mappées`)
  console.log(`\nRapport : REFONTE-couleurs.md`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
