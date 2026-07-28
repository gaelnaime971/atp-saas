/**
 * Helpers motion — SSR-safe.
 *
 * Les tokens motion (--motion-fast, --motion-ease-out, etc.) vivent dans
 * globals.css et sont accessibles via var(...) en CSS. Pour GSAP qui
 * anime en JS, on duplique les valeurs numériques ici — durées en
 * SECONDES (unit GSAP) pour éviter les conversions à chaque tween.
 *
 * Règle produit : garder ce fichier ALIGNÉ avec les tokens CSS. Si tu
 * changes --motion-count-up dans globals.css, change MOTION.countUp ici.
 */

/**
 * Détecte si l'utilisateur a demandé "reduced motion" dans son OS
 * (macOS: Accessibilité › Affichage › Réduire les animations,
 *  Windows: Paramètres › Options d'ergonomie › Effets visuels).
 *
 * SSR-safe : renvoie false côté serveur (aucun accès à window).
 * À appeler dans un useEffect ou côté event handler, pas au render SSR.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Durées motion en SECONDES pour GSAP. Miroir des tokens CSS
 * --motion-* de globals.css. Ne pas modifier séparément.
 */
export const MOTION = {
  fast:      0.12,   // hover, focus
  base:      0.20,   // state change
  slow:      0.32,   // reveal, exit
  countUp:   0.60,   // count-up KPI
  chartDraw: 0.70,   // dessin chart
} as const

/**
 * Easing GSAP équivalent au token CSS --motion-ease-out
 * (cubic-bezier(0.16, 1, 0.3, 1) = "power expo out", départ franc,
 * arrivée douce, ZÉRO bounce). GSAP a un alias direct : 'power2.out'
 * ou 'power3.out' selon la courbure voulue. On utilise power2.out par
 * défaut (proche visuellement de la cubic-bezier CSS), power3.out pour
 * les mouvements qui doivent glisser longuement (halo parallaxe).
 */
export const EASE = {
  out:      'power2.out',
  outLong:  'power3.out',
} as const
