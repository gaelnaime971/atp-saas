import { describe, expect, it } from 'vitest'
import { listboxNextIndex } from './listbox'

describe('liste de choix : navigation clavier', () => {
  it('flèches, bornées aux extrémités', () => {
    expect(listboxNextIndex('ArrowDown', 0, 5)).toBe(1)
    expect(listboxNextIndex('ArrowDown', 4, 5)).toBe(4)
    expect(listboxNextIndex('ArrowUp', 0, 5)).toBe(0)
    expect(listboxNextIndex('ArrowUp', 3, 5)).toBe(2)
  })
  it('sans option active : ↓ va à la première, ↑ à la dernière', () => {
    expect(listboxNextIndex('ArrowDown', -1, 5)).toBe(0)
    expect(listboxNextIndex('ArrowUp', -1, 5)).toBe(4)
  })
  it('Début, Fin, pages', () => {
    expect(listboxNextIndex('Home', 3, 5)).toBe(0)
    expect(listboxNextIndex('End', 0, 5)).toBe(4)
    expect(listboxNextIndex('PageDown', 1, 20)).toBe(9)
    expect(listboxNextIndex('PageUp', 3, 20)).toBe(0)
  })
  it('index hors liste après un filtrage : ramené dans la liste', () => {
    expect(listboxNextIndex('ArrowDown', 12, 3)).toBe(2)
  })
  it('autres touches ou liste vide : rien', () => {
    expect(listboxNextIndex('a', 0, 5)).toBeNull()
    expect(listboxNextIndex('ArrowDown', 0, 0)).toBeNull()
  })
})
