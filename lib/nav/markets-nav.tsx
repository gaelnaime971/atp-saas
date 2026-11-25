import type { NavGroup } from '@/components/ui/AppSidebar'
import { MARKETS_BASE_PATH } from '@/lib/nav/spaces'
import type { TerminalViewer } from '@/lib/terminal/access'

// ═══════════════════════════════════════════════════════════════
// Espace « Marchés » — vraies routes sous /dashboard/marches/*.
// Les items `soon` sont visibles mais sans page (ni lien, ni ⌘K).
// `stock-analysis` est une page du SPA : sans href ici, le SPA la
// gère par id ; hors SPA, withSpaHrefs() lui donne son URL.
// Icônes : SVG inline 16×16, même format que trader-nav.
// ═══════════════════════════════════════════════════════════════

export type MarketsPageId =
  | 'marches-overview'
  | 'marches-sessions'
  | 'marches-recap'
  | 'marches-calendrier'
  | 'marches-banques-centrales'
  | 'marches-squawk'
  | 'marches-cot'
  | 'marches-sentiment'
  | 'marches-macro'
  | 'marches-saisonnalite'

export type MarketsNavId = MarketsPageId | 'stock-analysis'

const svg = (d: string) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
  </svg>
)

const IconGlobe     = svg('M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3M3.5 9h17M3.5 15h17')
const IconClock     = svg('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z')
const IconReport    = svg('M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z')
const IconCalendar  = svg('M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5')
const IconBank      = svg('M12 3l9 4.5H3L12 3zM4.5 10.5v7.5m5-7.5v7.5m5-7.5v7.5m5-7.5v7.5M3 21h18')
const IconSignal    = svg('M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 18.75h.008v.008H12v-.008z')
const IconPositions = svg('M3.75 6h10.5M3.75 12h16.5M3.75 18h7.5')
const IconGauge     = svg('M3.75 16.5a8.25 8.25 0 0116.5 0M12 16.5l3.75-4.5M12 16.5h.008')
const IconMacro     = svg('M4 19.5h16M7 15.75V12m5 3.75V7.5m5 8.25v-5.25')
const IconWave      = svg('M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0')
const IconTrending  = svg('M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941')

export const MARKETS_NAV: NavGroup<MarketsNavId>[] = [
  {
    id: 'marches-global',
    label: 'Global',
    items: [
      { id: 'marches-overview', label: 'Vue d\'ensemble',     icon: IconGlobe, href: MARKETS_BASE_PATH },
      { id: 'marches-sessions', label: 'Sessions & horaires', icon: IconClock, href: `${MARKETS_BASE_PATH}/sessions` },
      { id: 'marches-recap',    label: 'Récap de séance',     icon: IconReport, soon: true },
    ],
  },
  {
    id: 'marches-agenda',
    label: 'Agenda',
    items: [
      { id: 'marches-calendrier',        label: 'Calendrier éco',    icon: IconCalendar, href: `${MARKETS_BASE_PATH}/calendrier` },
      { id: 'marches-banques-centrales', label: 'Banques centrales', icon: IconBank,     href: `${MARKETS_BASE_PATH}/banques-centrales` },
    ],
  },
  {
    id: 'marches-flux',
    label: 'Flux',
    items: [
      { id: 'marches-squawk', label: 'Actus & Squawk', icon: IconSignal, soon: true },
    ],
  },
  {
    id: 'marches-positionnement',
    label: 'Positionnement',
    items: [
      { id: 'marches-cot',       label: 'COT',                 icon: IconPositions, href: `${MARKETS_BASE_PATH}/cot` },
      { id: 'marches-sentiment', label: 'Sentiment de risque', icon: IconGauge,     href: `${MARKETS_BASE_PATH}/sentiment` },
    ],
  },
  {
    id: 'marches-analyse',
    label: 'Analyse',
    items: [
      { id: 'marches-macro',        label: 'Macro US',          icon: IconMacro,    href: `${MARKETS_BASE_PATH}/macro` },
      { id: 'marches-saisonnalite', label: 'Saisonnalité',      icon: IconWave,     href: `${MARKETS_BASE_PATH}/saisonnalite` },
      { id: 'stock-analysis',       label: 'Analyse d\'action', icon: IconTrending },
    ],
  },
]

/**
 * Menu Marchés selon le spectateur. L'admin n'a pas Analyse d'action :
 * c'est une page du SPA /dashboard, d'où proxy.ts le redirige.
 */
export function marketsNavFor(viewer: Exclude<TerminalViewer, 'hidden'>): NavGroup<MarketsNavId>[] {
  if (viewer === 'member') return MARKETS_NAV
  return MARKETS_NAV.map(g => ({ ...g, items: g.items.filter(i => i.id !== 'stock-analysis') }))
}
