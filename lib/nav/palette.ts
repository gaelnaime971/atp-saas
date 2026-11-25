import { flattenNavForPalette, type CommandItem } from '@/components/ui/CommandPalette'
import type { DashboardPage } from '@/components/dashboard/DashboardSidebar'
import { TRADER_NAV, TRADER_FOOTER_ITEMS } from '@/lib/nav/trader-nav'
import { MARKETS_NAV, type MarketsNavId } from '@/lib/nav/markets-nav'
import { SPACE_LABELS, spaHref, withSpaHrefs, type SpaceId } from '@/lib/nav/spaces'

export type AnyNavId = DashboardPage | MarketsNavId

/**
 * Items ⌘K des 2 espaces, badge « espace · groupe ».
 *
 * - host 'spa' (app/dashboard) : les pages du SPA restent sans href (le
 *   SPA change de page par id), les routes Marchés gardent leur href.
 * - host 'routes' (/dashboard/marches/*) : tout a un href, les pages du
 *   SPA pointent vers /dashboard?page=…
 *
 * L'espace courant est listé en premier.
 */
export function buildPaletteItems(host: 'spa' | 'routes', currentSpace: SpaceId): CommandItem<AnyNavId>[] {
  const trading = host === 'routes' ? withSpaHrefs(TRADER_NAV) : TRADER_NAV
  const footer = host === 'routes'
    ? TRADER_FOOTER_ITEMS.map(i => ({ ...i, href: spaHref(i.id) }))
    : TRADER_FOOTER_ITEMS
  const markets = host === 'routes' ? withSpaHrefs(MARKETS_NAV) : MARKETS_NAV

  const tradingItems = flattenNavForPalette<AnyNavId>(trading, footer, 'Compte', SPACE_LABELS.trading)
  const marketsItems = flattenNavForPalette<AnyNavId>(markets, [], 'Compte', SPACE_LABELS.marches)
  return currentSpace === 'marches'
    ? [...marketsItems, ...tradingItems]
    : [...tradingItems, ...marketsItems]
}
