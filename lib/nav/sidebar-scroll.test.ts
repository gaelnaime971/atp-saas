import { describe, expect, it } from 'vitest'
import { scrollTopToReveal } from '@/lib/nav/sidebar-scroll'

// Nav visible de 100 px à 600 px à l'écran (hauteur 500), items de 40 px.
const base = { containerTop: 100, containerHeight: 500, itemHeight: 40 }

describe('scrollTopToReveal', () => {
  it('ne bouge pas si l’élément actif est déjà visible', () => {
    expect(scrollTopToReveal({ ...base, scrollTop: 0, itemTop: 300 })).toBeNull()
    expect(scrollTopToReveal({ ...base, scrollTop: 120, itemTop: 108 })).toBeNull()
  })
  it('descend jusqu’à un élément sous la zone visible, et le centre', () => {
    // item à 800 px à l'écran = 700 px dans la nav ; centré → 700 − (500 − 40)/2 = 470
    expect(scrollTopToReveal({ ...base, scrollTop: 0, itemTop: 800 })).toBe(470)
  })
  it('remonte jusqu’à un élément au-dessus de la zone visible', () => {
    // nav défilée de 400, item à 50 px à l'écran = −50 dans la vue
    expect(scrollTopToReveal({ ...base, scrollTop: 400, itemTop: 50 })).toBe(400 - 50 - 230)
  })
  it('un élément à moitié coupé compte comme hors de vue', () => {
    expect(scrollTopToReveal({ ...base, scrollTop: 0, itemTop: 580 })).not.toBeNull()
  })
  it('ne renvoie jamais un défilement négatif', () => {
    expect(scrollTopToReveal({ ...base, scrollTop: 10, itemTop: 95 })).toBe(0)
  })
})
