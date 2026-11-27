/**
 * Shell responsive du dashboard (Mon trading, Marchés, admin) : règles
 * pures, testées dans shell.test.ts.
 *
 * - < 768 px (mobile) : pas de rail ; barre du haut compacte, menu dans
 *   un tiroir, barre d'onglets en bas.
 * - 768 à 1279 px (tablette) : rail replié en icônes par défaut.
 * - ≥ 1280 px (bureau) : comportement historique (rail ouvert par défaut).
 *
 * Les seuils sont ceux de Tailwind (md = 768, xl = 1280) : la mise en page
 * passe par les classes `md:` (pas de flash au chargement), le JS ne sert
 * qu'aux comportements (repli par défaut, fermeture du tiroir).
 */

export const MOBILE_MAX = 767
export const TABLET_MAX = 1279

export type ViewportKind = 'mobile' | 'tablet' | 'desktop'

export function viewportKind(width: number): ViewportKind {
  if (width <= MOBILE_MAX) return 'mobile'
  if (width <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

// ─── Repli du rail ──────────────────────────────────────────────

export interface RailPrefs {
  /** Choix du membre sur bureau (historique, défaut : ouvert). */
  railCollapsed: boolean
  /** Choix du membre sur tablette. Absent = replié par défaut. */
  railCollapsedTablet?: boolean
}

/**
 * Rail replié ? Tablette : replié sauf si le membre l'a déplié sur
 * tablette. Bureau ou taille inconnue (rendu serveur) : son choix
 * historique. Mobile : sans objet (tiroir), toujours déplié.
 */
export function effectiveRailCollapsed(kind: ViewportKind | null, prefs: RailPrefs): boolean {
  if (kind === 'mobile') return false
  if (kind === 'tablet') return prefs.railCollapsedTablet ?? true
  return prefs.railCollapsed
}

/** Bouton « replier / déplier » : ne change que le choix de la taille d'écran courante. */
export function toggleRail(kind: ViewportKind | null, prefs: RailPrefs): RailPrefs {
  if (kind === 'tablet') return { ...prefs, railCollapsedTablet: !effectiveRailCollapsed('tablet', prefs) }
  if (kind === 'mobile') return prefs
  return { ...prefs, railCollapsed: !prefs.railCollapsed }
}

// ─── Tiroir (menu mobile) ───────────────────────────────────────

export type DrawerAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'toggle' }
  | { type: 'escape' }
  /** Un lien ou une page du menu a été choisi. */
  | { type: 'navigate' }
  /** La taille d'écran a changé. */
  | { type: 'viewport'; kind: ViewportKind | null }

export function drawerReducer(open: boolean, action: DrawerAction): boolean {
  switch (action.type) {
    case 'open': return true
    case 'toggle': return !open
    case 'close':
    case 'escape':
    case 'navigate': return false
    // Le tiroir n'existe que sur mobile : passer en tablette ou bureau le ferme.
    case 'viewport': return action.kind === 'mobile' ? open : false
  }
}

// ─── Barre d'onglets ────────────────────────────────────────────

/** Raccourci de la barre d'onglets : un élément du menu, libellé court. */
export interface ShellTab<Id extends string> {
  id: Id
  label: string
}

export const MENU_TAB = 'menu' as const

/**
 * Onglet actif : « Menu » tant que le tiroir est ouvert ; sinon l'onglet
 * de la page affichée ; aucun si la page n'a pas d'onglet (elle reste
 * marquée dans le menu).
 */
export function activeTabId<Id extends string>(tabIds: readonly Id[], activeId: string | null, drawerOpen: boolean): Id | typeof MENU_TAB | null {
  if (drawerOpen) return MENU_TAB
  return tabIds.find(id => id === activeId) ?? null
}
