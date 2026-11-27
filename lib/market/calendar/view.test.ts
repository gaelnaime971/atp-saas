import { describe, expect, it } from 'vitest'
import { calendarHref, formatFigure, parseCalendarParams, toggle } from './view'

describe('paramètres de la page Calendrier', () => {
  it('par défaut : aujourd’hui, sans filtre', () => {
    expect(parseCalendarParams({}, '2026-11-27')).toEqual({ view: 'jour', from: '2026-11-27', to: '2026-11-27', impacts: [], types: [] })
  })
  it('vue semaine : du lundi au dimanche de la semaine demandée', () => {
    const p = parseCalendarParams({ vue: 'semaine', du: '2026-12-10' }, '2026-11-27')
    expect([p.from, p.to]).toEqual(['2026-12-07', '2026-12-13'])
  })
  it('filtres en français, valeurs inconnues et dates invalides ignorées', () => {
    const p = parseCalendarParams({ impact: 'fort,moyen,xxx', type: 'fed,feries', du: '10/12/2026' }, '2026-11-27')
    expect(p.impacts).toEqual(['high', 'medium'])
    expect(p.types).toEqual(['fed', 'holiday'])
    expect(p.from).toBe('2026-11-27')
  })
  it('liens : filtres conservés, bascule d’un filtre', () => {
    const p = parseCalendarParams({ vue: 'semaine', impact: 'fort' }, '2026-11-27')
    expect(calendarHref(p, { from: '2026-11-30' })).toBe('?vue=semaine&du=2026-11-30&impact=fort')
    expect(toggle(['high'], 'high')).toEqual([])
    expect(toggle(['high'], 'low')).toEqual(['high', 'low'])
  })
})

describe('format des chiffres publiés', () => {
  it('variations, créations d’emplois, niveaux', () => {
    expect(formatFigure(0.35, 'pct_mom')).toBe('+0,4 %')
    expect(formatFigure(165, 'change_k')).toBe('+165 k')
    expect(formatFigure(4.3, 'level_pct')).toBe('4,3 %')
    expect(formatFigure(189, 'level_k')).toBe('189 k')
    expect(formatFigure(7.523, 'level_m')).toBe('7,52 M')
    expect(formatFigure(null, 'pct_mom')).toBe('—')
  })
})
