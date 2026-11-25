import { flattenNavForPalette, type CommandItem } from '@/components/ui/CommandPalette'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import { traderNavFor, TRADER_FOOTER_ITEMS } from '@/lib/nav/trader-nav'
import { marketsNavFor, type MarketsNavId } from '@/lib/nav/markets-nav'
import { SPACE_LABELS, spaHref, withSpaHrefs, type SpaceId } from '@/lib/nav/spaces'
import type { TerminalViewer } from '@/lib/terminal/access'

export type AnyNavId = DashboardPage | MarketsNavId

/**
 * Items ⌘K, badge « espace · groupe ».
 *
 * - host 'spa' (app/dashboard) : les pages du SPA restent sans href (le
 *   SPA change de page par id), les routes Marchés gardent leur href.
 * - host 'routes' (/dashboard/marches/*) : tout a un href, les pages du
 *   SPA pointent vers /dashboard?page=…
 *
 * Selon le spectateur (TERMINAL_ACCESS + rôle) :
 * - 'hidden' : Mon trading seul, sans préfixe d'espace (comme avant) ;
 * - 'member' : les 2 espaces, l'espace courant en premier ;
 * - 'admin'  : Marchés seul (le SPA /dashboard lui est fermé).
 */
export function buildPaletteItems(
  host: 'spa' | 'routes',
  currentSpace: SpaceId,
  viewer: TerminalViewer,
): CommandItem<AnyNavId>[] {
  const tradingNav = traderNavFor(viewer !== 'hidden')
  const trading = host === 'routes' ? withSpaHrefs(tradingNav) : tradingNav
  const footer = host === 'routes'
    ? TRADER_FOOTER_ITEMS.map(i => ({ ...i, href: spaHref(i.id) }))
    : TRADER_FOOTER_ITEMS

  if (viewer === 'hidden') {
    return flattenNavForPalette<AnyNavId>(trading, footer, 'Compte')
  }

  const marketsNav = marketsNavFor(viewer)
  const markets = host === 'routes' ? withSpaHrefs(marketsNav) : marketsNav
  const marketsItems = flattenNavForPalette<AnyNavId>(markets, [], 'Compte', SPACE_LABELS.marches)
  if (viewer === 'admin') return marketsItems

  const tradingItems = flattenNavForPalette<AnyNavId>(trading, footer, 'Compte', SPACE_LABELS.trading)
  return currentSpace === 'marches'
    ? [...marketsItems, ...tradingItems]
    : [...tradingItems, ...marketsItems]
}
