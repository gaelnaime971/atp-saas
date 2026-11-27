import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_PAGE_IDS, findItemByHref, isDashboardPage, isMarketsPath, parsePageParam,
  searchWithoutPage, spaHref, spaceOfSpaPage, withSpaHrefs,
} from '@/lib/nav/spaces'
import { MARKETS_NAV } from '@/lib/nav/markets-nav'
import { TRADER_NAV, TRADER_FOOTER_ITEMS } from '@/lib/nav/trader-nav'
import { buildPaletteItems } from '@/lib/nav/palette'

describe('parsePageParam', () => {
  it('renvoie la page quand l’id est connu', () => {
    expect(parsePageParam('?page=stock-analysis')).toBe('stock-analysis')
    expect(parsePageParam('?x=1&page=compte')).toBe('compte')
  })
  it('ignore un id inconnu ou absent (comportement d’origine)', () => {
    expect(parsePageParam('')).toBeNull()
    expect(parsePageParam('?page=')).toBeNull()
    expect(parsePageParam('?page=marches-cot')).toBeNull()
    expect(parsePageParam('?page=__proto__')).toBeNull()
  })
})

describe('searchWithoutPage', () => {
  it('retire page et garde le reste', () => {
    expect(searchWithoutPage('?page=stats')).toBe('')
    expect(searchWithoutPage('?a=1&page=stats&b=2')).toBe('?a=1&b=2')
  })
})

describe('spaHref / isMarketsPath / spaceOfSpaPage', () => {
  it('construit les URL du SPA', () => {
    expect(spaHref('dashboard')).toBe('/dashboard')
    expect(spaHref('stock-analysis')).toBe('/dashboard?page=stock-analysis')
  })
  it('reconnaît l’espace Marchés sans faux positif', () => {
    expect(isMarketsPath('/dashboard/marches')).toBe(true)
    expect(isMarketsPath('/dashboard/marches/cot')).toBe(true)
    expect(isMarketsPath('/dashboard/marchesx')).toBe(false)
    expect(isMarketsPath('/marches')).toBe(false)
    expect(isMarketsPath('/dashboard')).toBe(false)
  })
  it('toutes les pages du SPA sont dans Mon trading, Analyse d’action comprise', () => {
    expect(spaceOfSpaPage('stock-analysis', true)).toBe('trading')
    expect(spaceOfSpaPage('dashboard', true)).toBe('trading')
  })
  it('Marchés masqué : tout est dans Mon trading', () => {
    expect(spaceOfSpaPage('stock-analysis', false)).toBe('trading')
  })
})

describe('menu Mon trading', () => {
  const ids = TRADER_NAV.flatMap(g => g.items.map(i => i.id))
  const footer = TRADER_FOOTER_ITEMS.map(i => i.id)

  it('suit la maquette 00-menu (5 groupes)', () => {
    expect(TRADER_NAV.map(g => g.label)).toEqual(['Aujourd\'hui', 'Journal', 'Performance', 'Outils', 'Coaching'])
  })
  it('garde Formation dans Coaching et les 3 items de pied de menu', () => {
    expect(TRADER_NAV.find(g => g.id === 'coaching')!.items.map(i => i.id)).toContain('formation')
    expect(footer).toEqual(['compte', 'contrat', 'documents'])
  })
  it('chaque page du SPA reste atteignable depuis un des 2 menus', () => {
    const marketsIds = MARKETS_NAV.flatMap(g => g.items.map(i => i.id))
    const reachable = new Set<string>([...ids, ...footer, ...marketsIds])
    for (const id of DASHBOARD_PAGE_IDS) expect(reachable.has(id), id).toBe(true)
    expect(DASHBOARD_PAGE_IDS).toHaveLength(21)
  })
})

describe('menu Marchés', () => {
  const items = MARKETS_NAV.flatMap(g => g.items)

  it('a les 5 groupes demandés', () => {
    expect(MARKETS_NAV.map(g => g.label)).toEqual(['Global', 'Agenda', 'Flux', 'Positionnement', 'Analyse'])
  })
  it('expose exactement les 8 routes /dashboard/marches/*', () => {
    expect(items.filter(i => i.href).map(i => i.href).sort()).toEqual([
      '/dashboard/marches',
      '/dashboard/marches/banques-centrales',
      '/dashboard/marches/calendrier',
      '/dashboard/marches/cot',
      '/dashboard/marches/macro',
      '/dashboard/marches/saisonnalite',
      '/dashboard/marches/sentiment',
      '/dashboard/marches/sessions',
    ])
  })
  it('les éléments « bientôt » n’ont pas de page', () => {
    const soon = items.filter(i => i.soon)
    expect(soon.map(i => i.label)).toEqual(['Récap de séance', 'Actus & Squawk'])
    for (const i of soon) expect(i.href).toBeUndefined()
  })
  it('hors SPA, une page du SPA sans href devient un lien /dashboard?page=', () => {
    const groups: { items: { id: string; href?: string; soon?: boolean }[] }[] = [{ items: [{ id: 'stock-analysis' }, { id: 'marches-recap', soon: true }] }]
    const routed = withSpaHrefs(groups).flatMap(g => g.items)
    expect(routed.find(i => i.id === 'stock-analysis')!.href).toBe('/dashboard?page=stock-analysis')
    expect(routed.find(i => i.id === 'marches-recap')!.href).toBeUndefined()
  })
  it('retrouve le titre depuis le pathname', () => {
    expect(findItemByHref(MARKETS_NAV, '/dashboard/marches/cot')!.label).toBe('COT')
    expect(findItemByHref(MARKETS_NAV, '/dashboard/marches')!.label).toBe('Vue d\'ensemble')
    expect(findItemByHref(MARKETS_NAV, '/dashboard/marches/inconnu')).toBeNull()
  })
})

describe('palette ⌘K', () => {
  it('cherche dans les 2 espaces avec un badge « espace · groupe »', () => {
    const items = buildPaletteItems('routes', 'marches', 'member')
    expect(items.find(i => i.id === 'marches-cot')!.groupLabel).toBe('Marchés · Positionnement')
    expect(items.find(i => i.id === 'coaching')!.groupLabel).toBe('Mon trading · Coaching')
    expect(items.find(i => i.id === 'compte')!.groupLabel).toBe('Mon trading · Compte')
    expect(items[0].groupLabel?.startsWith('Marchés')).toBe(true)
  })
  it('exclut les éléments « bientôt » et n’a pas de doublon', () => {
    const items = buildPaletteItems('spa', 'trading', 'member')
    const ids = items.map(i => i.id)
    expect(ids).not.toContain('marches-recap')
    expect(ids).not.toContain('marches-squawk')
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('host routes : tout a un href ; host spa : les pages SPA restent par id', () => {
    for (const i of buildPaletteItems('routes', 'marches', 'member')) expect(i.href, i.id).toBeTruthy()
    const spa = buildPaletteItems('spa', 'trading', 'member')
    for (const i of spa) {
      if (isDashboardPage(i.id)) expect(i.href, i.id).toBeUndefined()
      else expect(i.href, i.id).toMatch(/^\/dashboard\/marches/)
    }
  })
})
