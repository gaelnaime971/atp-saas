// ═══════════════════════════════════════════════════════════════
// Menu latéral : où faire défiler la nav pour montrer l'élément actif.
// Logique pure (aucun DOM), testée dans sidebar-scroll.test.ts ;
// appelée par components/ui/AppSidebar.tsx.
// ═══════════════════════════════════════════════════════════════

export interface RevealGeometry {
  /** Haut visible de la zone qui défile (getBoundingClientRect().top). */
  containerTop: number
  /** Hauteur visible de la zone qui défile (clientHeight). */
  containerHeight: number
  /** Défilement actuel (scrollTop). */
  scrollTop: number
  /** Haut de l'élément actif (getBoundingClientRect().top). */
  itemTop: number
  /** Hauteur de l'élément actif. */
  itemHeight: number
  /** Marge à garder autour de l'élément, en px. */
  margin?: number
}

/**
 * Nouveau scrollTop qui centre l'élément actif, ou null s'il est déjà
 * entièrement visible (on ne bouge pas un menu qui montre déjà la page).
 */
export function scrollTopToReveal(g: RevealGeometry): number | null {
  const margin = g.margin ?? 8
  const top = g.itemTop - g.containerTop
  const bottom = top + g.itemHeight
  if (top >= margin && bottom <= g.containerHeight - margin) return null
  const centered = g.scrollTop + top - (g.containerHeight - g.itemHeight) / 2
  return Math.max(0, Math.round(centered))
}
