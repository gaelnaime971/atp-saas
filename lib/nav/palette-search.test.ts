import { describe, expect, it } from 'vitest'
import { foldForSearch, matchRank, rankPaletteItems } from '@/lib/nav/palette-search'
import { buildPaletteItems } from '@/lib/nav/palette'

const item = (label: string, groupLabel?: string) => ({ label, groupLabel })

describe('matchRank', () => {
  it('0 : le nom commence par la recherche', () => {
    expect(matchRank(item('COT'), 'co')).toBe(0)
    expect(matchRank(item('Contrat'), 'CO')).toBe(0)
  })
  it('1 : un mot du nom commence par la recherche', () => {
    expect(matchRank(item('Sessions coaching'), 'co')).toBe(1)
    expect(matchRank(item('Mon compte'), 'co')).toBe(1)
    expect(matchRank(item('Analyse d\'action'), 'act')).toBe(1)
    expect(matchRank(item('Actus & Squawk'), 'squ')).toBe(1)
  })
  it('2 : le nom contient la recherche', () => {
    expect(matchRank(item('Calendrier éco'), 'co')).toBe(2)
  })
  it('3 : seul le groupe correspond', () => {
    expect(matchRank(item('Formation', 'Mon trading · Coaching'), 'co')).toBe(3)
  })
  it('null : aucune correspondance', () => {
    expect(matchRank(item('Stats', 'Mon trading · Performance'), 'co')).toBeNull()
  })
  it('ignore casse et accents', () => {
    expect(foldForSearch('Éco Pré-Marché')).toBe('eco pre-marche')
    expect(matchRank(item('Routine pré-marché'), 'pre')).toBe(1)
    expect(matchRank(item('Calendrier éco'), 'eco')).toBe(1)
  })
})

describe('rankPaletteItems', () => {
  it('classe par rang, et garde l’ordre d’origine à égalité', () => {
    const items = [
      item('Formation', 'Coaching'),       // 3
      item('Calendrier éco', 'Agenda'),    // 2
      item('Sessions coaching', 'Coaching'), // 1
      item('Contrat', 'Compte'),           // 0
      item('Mon compte', 'Compte'),        // 1
      item('COT', 'Positionnement'),       // 0
      item('Stats', 'Performance'),        // exclu
    ]
    expect(rankPaletteItems(items, 'co').map(i => i.label)).toEqual([
      'Contrat', 'COT', 'Sessions coaching', 'Mon compte', 'Calendrier éco', 'Formation',
    ])
  })
  it('recherche vide : tout, dans l’ordre d’origine', () => {
    const items = [item('B'), item('A')]
    expect(rankPaletteItems(items, '  ')).toBe(items)
  })
  it('sur la vraie palette d’un membre, « co » remonte d’abord les noms en « co… »', () => {
    const labels = rankPaletteItems(buildPaletteItems('spa', 'trading', 'member'), 'co').map(i => i.label)
    const firstNonPrefix = labels.findIndex(l => !foldForSearch(l).startsWith('co'))
    expect(labels.slice(0, firstNonPrefix).sort()).toEqual(['COT', 'Contrat'])
    expect(labels.indexOf('Formation')).toBeGreaterThan(labels.indexOf('Calendrier éco'))
  })
})
