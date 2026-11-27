import { describe, expect, it } from 'vitest'
import { placesFor } from './clocks'

describe('horloges de la barre Marchés', () => {
  it('Paris ou Guadeloupe : les 3 places', () => {
    expect(placesFor('Europe/Paris').map(p => p.label)).toEqual(['Londres', 'New York', 'Tokyo'])
    expect(placesFor('America/Guadeloupe')).toHaveLength(3)
  })
  it('membre à Londres, New York ou Tokyo : pas d’horloge en double', () => {
    expect(placesFor('Europe/London').map(p => p.label)).toEqual(['New York', 'Tokyo'])
    expect(placesFor('America/New_York').map(p => p.label)).toEqual(['Londres', 'Tokyo'])
    expect(placesFor('Asia/Tokyo').map(p => p.label)).toEqual(['Londres', 'New York'])
  })
})
