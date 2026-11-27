import { describe, expect, it } from 'vitest'
import { zonedTimeToUtc } from '@/lib/time'
import { MARKET_SPECIAL_DAYS, applyConfirmations, parseGlobexRanges } from './market-holidays'
import { publicationsAt, sessionState, usAppointments } from './sessions'

const ny = (date: string, time: string) => zonedTimeToUtc(date, time, 'America/New_York').getTime()

describe('confirmation des horaires CME par l’admin', () => {
  it('plages saisies : lues, triées ; vide = fermé ; invalide = refusé', () => {
    expect(parseGlobexRanges('18:00-24:00, 00:00-13:15')).toEqual([['00:00', '13:15'], ['18:00', '24:00']])
    expect(parseGlobexRanges('')).toEqual([])
    expect(parseGlobexRanges('13:00-12:00')).toBeNull()
    expect(parseGlobexRanges('8h-12h')).toBeNull()
  })
  it('confirmé tel quel : plus de « à confirmer », plages du code gardées', () => {
    const days = applyConfirmations(MARKET_SPECIAL_DAYS, [{ date: '2026-12-24', cmeConfirmed: true, globexRanges: null, note: null }])
    const d = days.find(x => x.date === '2026-12-24')!
    expect(d.cmeConfirmed).toBe(true)
    expect(d.globex).toEqual([['00:00', '13:15']])
    expect(usAppointments('2026-12-24', days).find(a => a.id === 'globex-pause')?.label).toBe('Clôture anticipée CME Globex')
    expect(usAppointments('2026-12-24').find(a => a.id === 'globex-pause')?.label).toBe('Clôture anticipée CME Globex (à confirmer)')
  })
  it('plages corrigées par l’admin : elles remplacent le schéma du code partout', () => {
    const days = applyConfirmations(MARKET_SPECIAL_DAYS, [{ date: '2026-12-24', cmeConfirmed: true, globexRanges: '00:00-12:15', note: 'Avis CME' }])
    expect(usAppointments('2026-12-24', days).find(a => a.id === 'globex-pause')?.etTime).toBe('12:15')
    expect(sessionState('globex', ny('2026-12-24', '12:30'), days).status).toBe('closed')
    expect(sessionState('globex', ny('2026-12-24', '12:30')).status).toBe('open') // sans confirmation : 13:15
  })
  it('les autres jours ne changent pas', () => {
    const days = applyConfirmations(MARKET_SPECIAL_DAYS, [{ date: '2026-12-24', cmeConfirmed: true, globexRanges: null, note: null }])
    expect(days.find(x => x.date === '2026-12-25')).toEqual(MARKET_SPECIAL_DAYS.find(x => x.date === '2026-12-25'))
  })
})

describe('rendez-vous US : vraies publications', () => {
  it('publications à l’heure exacte du créneau, sinon aucune', () => {
    const slot = ny('2026-12-10', '08:30')
    const events = [
      { kind: 'release', at: slot, title: 'IPC' },
      { kind: 'release', at: ny('2026-12-10', '10:00'), title: 'JOLTS' },
      { kind: 'fomc', at: slot, title: 'x' },
    ]
    expect(publicationsAt(events, slot).map(e => e.title)).toEqual(['IPC'])
    expect(publicationsAt(events, ny('2026-12-11', '08:30'))).toEqual([])
  })
})

describe('jours spéciaux : libellés', () => {
  it('jeudi 23 déc. 2027 : veille du jour férié de Noël (Noël observé le 24)', () => {
    expect(MARKET_SPECIAL_DAYS.find(d => d.date === '2027-12-23')?.name).toBe('Veille du jour férié de Noël')
  })
})
