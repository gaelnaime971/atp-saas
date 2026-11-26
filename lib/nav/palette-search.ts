// ═══════════════════════════════════════════════════════════════
// Recherche ⌘K : filtre + classement par pertinence. Logique pure,
// testée dans palette-search.test.ts.
//
// Rangs (le plus petit d'abord) :
//   0. le nom commence par la recherche          « co » → COT, Contrat
//   1. un mot du nom commence par la recherche   « co » → Sessions coaching
//   2. le nom contient la recherche              « co » → Calendrier éco
//   3. seul le groupe correspond                 « co » → Formation (groupe « Coaching »)
// À rang égal, l'ordre d'origine est conservé (tri stable).
// Casse et accents ignorés : « eco » trouve « Calendrier éco ».
// ═══════════════════════════════════════════════════════════════

export interface SearchableItem {
  label: string
  groupLabel?: string
}

/** Minuscules sans accents (é → e, ô → o…). */
export function foldForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Séparateurs de mots d'un nom : espaces, apostrophes, tirets, &, ·, /.
const WORD_SEPARATORS = /[\s'’\-&·/]+/

/** Rang de pertinence, ou null si l'item ne correspond pas. */
export function matchRank(item: SearchableItem, query: string): number | null {
  const q = foldForSearch(query.trim())
  if (!q) return 0
  const label = foldForSearch(item.label)
  if (label.startsWith(q)) return 0
  if (label.split(WORD_SEPARATORS).some(w => w.startsWith(q))) return 1
  if (label.includes(q)) return 2
  if (item.groupLabel && foldForSearch(item.groupLabel).includes(q)) return 3
  return null
}

/** Items correspondants, classés par rang puis dans l'ordre d'origine. */
export function rankPaletteItems<T extends SearchableItem>(items: T[], query: string): T[] {
  if (!query.trim()) return items
  return items
    .map((item, index) => ({ item, index, rank: matchRank(item, query) }))
    .filter((x): x is { item: T; index: number; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(x => x.item)
}
