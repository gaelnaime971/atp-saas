import { describe, expect, it } from 'vitest'
import { MENU_TAB, activeTabId, drawerReducer, effectiveRailCollapsed, toggleRail, viewportKind } from './shell'

describe('tailles d’écran', () => {
  it('mobile < 768, tablette 768-1279, bureau ≥ 1280', () => {
    expect(viewportKind(390)).toBe('mobile')
    expect(viewportKind(767)).toBe('mobile')
    expect(viewportKind(768)).toBe('tablet')
    expect(viewportKind(1279)).toBe('tablet')
    expect(viewportKind(1280)).toBe('desktop')
    expect(viewportKind(1440)).toBe('desktop')
  })
})

describe('repli du rail', () => {
  it('tablette : replié par défaut', () => {
    expect(effectiveRailCollapsed('tablet', { railCollapsed: false })).toBe(true)
  })
  it('bureau : inchangé (ouvert par défaut, choix du membre respecté)', () => {
    expect(effectiveRailCollapsed('desktop', { railCollapsed: false })).toBe(false)
    expect(effectiveRailCollapsed('desktop', { railCollapsed: true })).toBe(true)
    expect(effectiveRailCollapsed(null, { railCollapsed: false })).toBe(false) // rendu serveur
  })
  it('mobile : jamais replié (le menu est dans le tiroir)', () => {
    expect(effectiveRailCollapsed('mobile', { railCollapsed: true, railCollapsedTablet: true })).toBe(false)
  })
  it('déplier sur tablette ne touche pas au choix bureau, et inversement', () => {
    const tablet = toggleRail('tablet', { railCollapsed: false })
    expect(tablet).toEqual({ railCollapsed: false, railCollapsedTablet: false })
    expect(effectiveRailCollapsed('tablet', tablet)).toBe(false)
    expect(effectiveRailCollapsed('desktop', tablet)).toBe(false)
    const desktop = toggleRail('desktop', tablet)
    expect(desktop).toEqual({ railCollapsed: true, railCollapsedTablet: false })
    expect(effectiveRailCollapsed('tablet', desktop)).toBe(false)
  })
  it('replier à nouveau sur tablette', () => {
    expect(toggleRail('tablet', { railCollapsed: false, railCollapsedTablet: false }).railCollapsedTablet).toBe(true)
  })
})

describe('tiroir du menu mobile', () => {
  it('ouvre, ferme, bascule', () => {
    expect(drawerReducer(false, { type: 'open' })).toBe(true)
    expect(drawerReducer(true, { type: 'close' })).toBe(false)
    expect(drawerReducer(false, { type: 'toggle' })).toBe(true)
    expect(drawerReducer(true, { type: 'toggle' })).toBe(false)
  })
  it('se ferme avec Échap et quand on choisit une page', () => {
    expect(drawerReducer(true, { type: 'escape' })).toBe(false)
    expect(drawerReducer(true, { type: 'navigate' })).toBe(false)
  })
  it('se ferme en passant en tablette ou bureau, reste ouvert sur mobile', () => {
    expect(drawerReducer(true, { type: 'viewport', kind: 'tablet' })).toBe(false)
    expect(drawerReducer(true, { type: 'viewport', kind: 'desktop' })).toBe(false)
    expect(drawerReducer(true, { type: 'viewport', kind: 'mobile' })).toBe(true)
  })
})

describe('onglet actif', () => {
  const tabs = ['dashboard', 'session', 'sessions-history', 'stats'] as const
  it('la page affichée', () => {
    expect(activeTabId(tabs, 'stats', false)).toBe('stats')
    expect(activeTabId(tabs, 'dashboard', false)).toBe('dashboard')
  })
  it('page sans onglet : aucun', () => {
    expect(activeTabId(tabs, 'compte', false)).toBeNull()
    expect(activeTabId(tabs, null, false)).toBeNull()
  })
  it('tiroir ouvert : « Menu »', () => {
    expect(activeTabId(tabs, 'stats', true)).toBe(MENU_TAB)
  })
})
