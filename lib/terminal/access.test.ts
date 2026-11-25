import { describe, expect, it } from 'vitest'
import { canSeeTerminal, terminalOpenToMembers, terminalViewer } from '@/lib/terminal/access'
import { buildPaletteItems } from '@/lib/nav/palette'
import { traderNavFor, TRADER_NAV } from '@/lib/nav/trader-nav'
import { marketsNavFor } from '@/lib/nav/markets-nav'
import { ADMIN_NAV } from '@/lib/nav/admin-nav'

// Les 3 cas de l'interrupteur TERMINAL_ACCESS : membre sans la variable,
// membre avec « all », admin.

const ids = (groups: { items: { id: string }[] }[]) => groups.flatMap(g => g.items.map(i => i.id))
const outils = (groups: { id: string; items: { id: string }[] }[]) =>
  groups.find(g => g.id === 'outils')!.items.map(i => i.id)

describe('règle TERMINAL_ACCESS', () => {
  it('seule la valeur exacte « all » ouvre aux membres', () => {
    expect(terminalOpenToMembers('all')).toBe(true)
    for (const v of [undefined, '', 'ALL', 'All', 'true', '1', ' all', 'admins']) {
      expect(terminalOpenToMembers(v), String(v)).toBe(false)
    }
  })
})

describe('membre, TERMINAL_ACCESS absente', () => {
  const opts = { isAdmin: false, access: undefined }

  it('ne voit pas Marchés (proxy + layout le renvoient sur /dashboard)', () => {
    expect(terminalViewer(opts)).toBe('hidden')
    expect(canSeeTerminal(opts)).toBe(false)
  })
  it('⌘K : rien de Marchés, Mon trading sans préfixe d’espace', () => {
    const items = buildPaletteItems('spa', 'trading', 'hidden')
    expect(items.some(i => i.id.startsWith('marches-'))).toBe(false)
    expect(items.some(i => i.groupLabel?.includes('Marchés'))).toBe(false)
    expect(items.find(i => i.id === 'stats')!.groupLabel).toBe('Performance')
  })
  it('Analyse d’action revient dans Mon trading › Outils (une seule fois)', () => {
    expect(outils(traderNavFor(false))).toEqual(['backtest', 'analyse-graphique', 'calculateur', 'stock-analysis'])
    const items = buildPaletteItems('spa', 'trading', 'hidden')
    expect(items.filter(i => i.id === 'stock-analysis')).toHaveLength(1)
    expect(items.find(i => i.id === 'stock-analysis')!.groupLabel).toBe('Outils')
  })
  it('garde le menu Mon trading réorganisé', () => {
    expect(traderNavFor(false).map(g => g.label)).toEqual(TRADER_NAV.map(g => g.label))
  })
})

describe('membre, TERMINAL_ACCESS=all', () => {
  const opts = { isAdmin: false, access: 'all' }

  it('voit Marchés', () => {
    expect(terminalViewer(opts)).toBe('member')
    expect(canSeeTerminal(opts)).toBe(true)
  })
  it('Analyse d’action est dans Marchés, pas dans Outils', () => {
    expect(traderNavFor(true)).toBe(TRADER_NAV)
    expect(outils(traderNavFor(true))).not.toContain('stock-analysis')
    expect(ids(marketsNavFor('member'))).toContain('stock-analysis')
  })
  it('⌘K cherche dans les 2 espaces', () => {
    const labels = buildPaletteItems('spa', 'trading', 'member').map(i => i.groupLabel ?? '')
    expect(labels.some(l => l.startsWith('Marchés'))).toBe(true)
    expect(labels.some(l => l.startsWith('Mon trading'))).toBe(true)
  })
})

describe('admin', () => {
  it('voit Marchés quelle que soit la variable', () => {
    for (const access of [undefined, 'all', 'nope']) {
      expect(terminalViewer({ isAdmin: true, access })).toBe('admin')
      expect(canSeeTerminal({ isAdmin: true, access })).toBe(true)
    }
  })
  it('Marchés sans Analyse d’action (page du SPA, fermée à l’admin)', () => {
    expect(ids(marketsNavFor('admin'))).not.toContain('stock-analysis')
    expect(ids(marketsNavFor('admin'))).toContain('marches-cot')
  })
  it('⌘K : Marchés seulement, aucun lien vers le SPA /dashboard', () => {
    const items = buildPaletteItems('routes', 'marches', 'admin')
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) expect(i.href, i.id).toMatch(/^\/dashboard\/marches/)
  })
  it('le menu admin a un lien « Terminal Marchés » vers /dashboard/marches', () => {
    const item = ADMIN_NAV.flatMap(g => g.items).find(i => i.id === 'terminal-marches')!
    expect(item.label).toBe('Terminal Marchés')
    expect(item.href).toBe('/dashboard/marches')
  })
})
