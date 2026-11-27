/**
 * Navigation clavier d'une liste de choix (motif ARIA « listbox ») :
 * index de l'option active après une touche. Pur, testé dans
 * listbox.test.ts. `count` = nombre d'options visibles.
 */
export function listboxNextIndex(key: string, index: number, count: number, page = 8): number | null {
  if (count <= 0) return null
  const last = count - 1
  const from = index < 0 ? -1 : Math.min(index, last)
  switch (key) {
    case 'ArrowDown': return from < 0 ? 0 : Math.min(from + 1, last)
    case 'ArrowUp': return from < 0 ? last : Math.max(from - 1, 0)
    case 'Home': return 0
    case 'End': return last
    case 'PageDown': return Math.min((from < 0 ? 0 : from) + page, last)
    case 'PageUp': return Math.max((from < 0 ? 0 : from) - page, 0)
    default: return null
  }
}
