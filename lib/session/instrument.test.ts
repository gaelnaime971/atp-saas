import { describe, expect, it } from 'vitest'
import { defaultInstrument } from './instrument'

const LIST = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ', 'GC', 'MGC']

describe('instrument proposé à la saisie', () => {
  it('le dernier utilisé par le membre', () => {
    expect(defaultInstrument('YM', LIST)).toBe('YM')
    expect(defaultInstrument('es', LIST)).toBe('ES')
  })
  it('aucune session, ou instrument hors liste : NQ', () => {
    expect(defaultInstrument(null, LIST)).toBe('NQ')
    expect(defaultInstrument('', LIST)).toBe('NQ')
    expect(defaultInstrument('BTC', LIST)).toBe('NQ')
  })
})
