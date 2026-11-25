import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'

// ═══════════════════════════════════════════════════════════════
// Les 2 espaces du menu : « Mon trading » (SPA /dashboard) et
// « Marchés » (vraies routes /dashboard/marches/*).
// Logique pure, sans JSX : testée dans spaces.test.ts.
// Voir docs/design/terminal/DECISIONS.md.
// ═══════════════════════════════════════════════════════════════

export type SpaceId = 'trading' | 'marches'

export const SPACE_LABELS: Record<SpaceId, string> = {
  trading: 'Mon trading',
  marches: 'Marchés',
}

export const MARKETS_BASE_PATH = '/dashboard/marches'

/** Liste runtime des pages du SPA. Doit couvrir tout le type DashboardPage. */
export const DASHBOARD_PAGE_IDS = [
  'dashboard', 'session', 'sessions-history', 'stats', 'pre-market', 'backtest',
  'analyse-ia', 'analyse-graphique', 'notebook', 'propfirm', 'calculateur',
  'stock-analysis', 'coaching', 'progression', 'recap-live', 'classement',
  'bilan-2027', 'formation', 'documents', 'contrat', 'compte',
] as const satisfies readonly DashboardPage[]

// Garde-fou de compilation : si une page est ajoutée au type sans être
// ajoutée à la liste, `_exhaustive` ne compile plus.
type MissingPage = Exclude<DashboardPage, (typeof DASHBOARD_PAGE_IDS)[number]>
const _exhaustive: [MissingPage] extends [never] ? true : MissingPage = true
void _exhaustive

const DASHBOARD_PAGE_SET: ReadonlySet<string> = new Set(DASHBOARD_PAGE_IDS)

export function isDashboardPage(id: string): id is DashboardPage {
  return DASHBOARD_PAGE_SET.has(id)
}

/** Pages du SPA rangées dans l'espace Marchés. */
export const MARKETS_SPA_PAGES: readonly DashboardPage[] = ['stock-analysis']

/** URL qui ouvre une page du SPA depuis l'extérieur (⌘K, sélecteur d'espace). */
export function spaHref(id: DashboardPage): string {
  return id === 'dashboard' ? '/dashboard' : `/dashboard?page=${id}`
}

/**
 * Lit le paramètre ?page= d'une query string. Renvoie null si absent ou
 * inconnu : le SPA garde alors son comportement d'origine (Dashboard).
 */
export function parsePageParam(search: string): DashboardPage | null {
  const value = new URLSearchParams(search).get('page')
  return value && isDashboardPage(value) ? value : null
}

/** Query string sans le paramètre page (à remettre dans l'URL après lecture). */
export function searchWithoutPage(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('page')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

export function isMarketsPath(pathname: string): boolean {
  return pathname === MARKETS_BASE_PATH || pathname.startsWith(`${MARKETS_BASE_PATH}/`)
}

/** Espace d'un écran du SPA. */
export function spaceOfSpaPage(id: DashboardPage): SpaceId {
  return MARKETS_SPA_PAGES.includes(id) ? 'marches' : 'trading'
}

// ─── Transformations de groupes de nav ────────────────────────

interface NavItemLike<Id extends string> {
  id: Id
  href?: string
  soon?: boolean
}

interface NavGroupLike<Id extends string, Item extends NavItemLike<Id>> {
  items: Item[]
}

/**
 * Hors du SPA, les items sans href qui sont des pages du SPA reçoivent
 * leur URL /dashboard?page=… pour devenir des liens.
 */
export function withSpaHrefs<
  Id extends string,
  Item extends NavItemLike<Id>,
  Group extends NavGroupLike<Id, Item>,
>(groups: Group[]): Group[] {
  return groups.map(g => ({
    ...g,
    items: g.items.map(item =>
      !item.href && !item.soon && isDashboardPage(item.id)
        ? { ...item, href: spaHref(item.id) }
        : item,
    ),
  }))
}

/** Titre de la barre du haut pour une route Marchés (match exact sur href). */
export function findItemByHref<Item extends { href?: string }>(
  groups: { items: Item[] }[],
  pathname: string,
): Item | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (item.href === pathname) return item
    }
  }
  return null
}
