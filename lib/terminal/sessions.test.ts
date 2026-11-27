import { describe, expect, it } from 'vitest'
import { formatTime, zonedTimeToUtc } from '@/lib/time'
import { MARKET_SPECIAL_DAYS } from './market-holidays'
import {
  memberHours, monthlyOpex, quarterlyExpirations, sessionState, thirdFriday, upcomingClockShifts,
  upcomingHolidays, usAppointments, usTradingDay,
} from './sessions'

const ny = (date: string, time: string) => zonedTimeToUtc(date, time, 'America/New_York').getTime()
const PARIS = 'Europe/Paris'
const GPE = 'America/Guadeloupe'

describe('3e vendredis, roll et OPEX', () => {
  it('3e vendredi', () => {
    expect(thirdFriday(2026, 12)).toBe('2026-12-18')
    expect(thirdFriday(2027, 3)).toBe('2027-03-19')
    expect(thirdFriday(2027, 6)).toBe('2027-06-18') // aussi Juneteenth observé
    expect(thirdFriday(2027, 9)).toBe('2027-09-17')
    expect(thirdFriday(2026, 5)).toBe('2026-05-15') // le 1er est un vendredi
  })
  it('les 4 prochaines échéances trimestrielles, avec le roll 8 jours avant', () => {
    const list = quarterlyExpirations('2026-11-27')
    expect(list.map(e => [e.date, e.roll, e.code])).toEqual([
      ['2026-12-18', '2026-12-10', 'Z6'],
      ['2027-03-19', '2027-03-11', 'H7'],
      ['2027-06-17', '2027-06-10', 'M7'], // 3e vendredi férié (Juneteenth) → jeudi
      ['2027-09-17', '2027-09-09', 'U7'],
    ])
    expect(list[0].contract).toBe('Décembre 2026')
  })
  it('le jour même de l’échéance, elle reste affichée', () => {
    expect(quarterlyExpirations('2026-12-18', 1)[0].date).toBe('2026-12-18')
    expect(quarterlyExpirations('2026-12-19', 1)[0].date).toBe('2027-03-19')
  })
  it('OPEX mensuelles', () => {
    expect(monthlyOpex('2026-11-27')).toEqual(['2026-12-18', '2027-01-15', '2027-02-19', '2027-03-19'])
    expect(monthlyOpex('2026-11-20', 1)).toEqual(['2026-11-20'])
  })
})

describe('état des sessions', () => {
  it('mercredi normal 9:42 à New York : Londres, New York, cash et Globex ouverts, Tokyo fermé', () => {
    const now = ny('2026-11-25', '09:42')
    expect(sessionState('london', now).status).toBe('open')
    expect(sessionState('newYork', now).status).toBe('open')
    expect(sessionState('cashUs', now).status).toBe('open')
    expect(sessionState('globex', now).status).toBe('open')
    expect(sessionState('tokyo', now).status).toBe('closed')
    expect(sessionState('cashUs', now).nextChange).toBe(ny('2026-11-25', '16:00'))
  })
  it('pause Globex de 17:00 à 18:00 ET, réouverture à 18:00', () => {
    const s = sessionState('globex', ny('2026-11-24', '17:20'))
    expect(s.status).toBe('pause')
    expect(s.nextChange).toBe(ny('2026-11-24', '18:00'))
  })
  it('week-end : Globex fermé jusqu’au dimanche 18:00 ET', () => {
    const s = sessionState('globex', ny('2026-11-28', '12:00'))
    expect(s.status).toBe('closed')
    expect(s.nextChange).toBe(ny('2026-11-29', '18:00'))
  })
  it('jour férié (Thanksgiving 26/11/2026) : cash fermé, Globex arrêté à 13:00 ET puis rouvert à 18:00', () => {
    const morning = ny('2026-11-26', '10:00')
    expect(sessionState('cashUs', morning).status).toBe('closed')
    expect(sessionState('cashUs', morning).special?.name).toBe('Thanksgiving')
    expect(sessionState('newYork', morning).status).toBe('closed')
    expect(sessionState('globex', morning).status).toBe('open')
    expect(sessionState('globex', morning).nextChange).toBe(ny('2026-11-26', '13:00'))
    const afternoon = sessionState('globex', ny('2026-11-26', '14:00'))
    expect(afternoon.status).toBe('closed') // arrêt de 5 h : pas une simple pause
    expect(afternoon.nextChange).toBe(ny('2026-11-26', '18:00'))
    expect(sessionState('london', morning).status).toBe('open') // Londres n'est pas férié
  })
  it('clôture anticipée (27/11/2026) : cash jusqu’à 13:00 ET, Globex jusqu’à 13:15, puis week-end', () => {
    expect(sessionState('cashUs', ny('2026-11-27', '12:00')).nextChange).toBe(ny('2026-11-27', '13:00'))
    expect(sessionState('cashUs', ny('2026-11-27', '13:30')).status).toBe('closed')
    expect(sessionState('globex', ny('2026-11-27', '13:00')).status).toBe('open')
    const after = sessionState('globex', ny('2026-11-27', '13:30'))
    expect(after.status).toBe('closed')
    expect(after.nextChange).toBe(ny('2026-11-29', '18:00'))
  })
  it('Noël 2026 : fermé du jeudi 24 à 13:15 ET au dimanche 27 à 18:00', () => {
    const s = sessionState('globex', ny('2026-12-25', '10:00'))
    expect(s.status).toBe('closed')
    expect(s.nextChange).toBe(ny('2026-12-27', '18:00'))
    expect(sessionState('cashUs', ny('2026-12-25', '10:00')).status).toBe('closed')
  })
  it('Jour de l’an 2027 : pas de séance le soir du 31/12, réouverture le dimanche 3/01', () => {
    expect(sessionState('globex', ny('2026-12-31', '18:30')).status).toBe('closed')
    expect(sessionState('globex', ny('2026-12-31', '18:30')).nextChange).toBe(ny('2027-01-03', '18:00'))
  })
  it('horaires de la session dans le fuseau du membre', () => {
    const now = ny('2026-11-25', '03:00')
    expect(memberHours('newYork', now, PARIS)).toBe('14:00–23:00')
    expect(memberHours('cashUs', now, PARIS)).toBe('15:30–22:00')
    expect(memberHours('cashUs', now, GPE)).toBe('10:30–17:00')
    expect(memberHours('tokyo', ny('2026-11-25', '10:00'), PARIS)).toBe('01:00–10:00')
  })
})

describe('rendez-vous de la journée US', () => {
  it('heures ET converties, avec fenêtre ATP ±15 min', () => {
    const list = usAppointments('2026-12-02')
    expect(list.map(a => formatTime(a.at, PARIS))).toEqual(['14:30', '15:30', '16:00', '22:00', '23:00'])
    expect(list.map(a => formatTime(a.at, GPE))).toEqual(['09:30', '10:30', '11:00', '17:00', '18:00'])
    expect(formatTime(list[0].windowStart, PARIS)).toBe('14:15')
    expect(formatTime(list[0].windowEnd, PARIS)).toBe('14:45')
  })
  it('jour de clôture anticipée : 13:00 et 13:15 ET', () => {
    expect(usAppointments('2026-11-27').map(a => a.etTime)).toEqual(['08:30', '09:30', '10:00', '13:00', '13:15'])
  })
  it('jour de séance affiché : saute week-ends et fériés, et passe au lendemain après 17:00 ET', () => {
    expect(usTradingDay(ny('2026-11-26', '09:00'))).toBe('2026-11-27') // Thanksgiving
    expect(usTradingDay(ny('2026-11-27', '18:00'))).toBe('2026-11-30')
    expect(usTradingDay(ny('2026-11-30', '16:30'))).toBe('2026-11-30')
  })
})

describe('jours spéciaux à venir', () => {
  it('fériés et clôtures anticipées dans l’ordre, en heure du membre', () => {
    const list = upcomingHolidays(ny('2026-11-27', '08:00'), PARIS, 4)
    expect(list.map(d => [d.date, d.kind])).toEqual([
      ['2026-11-27', 'early'], ['2026-12-24', 'early'], ['2026-12-25', 'closed'], ['2027-01-01', 'closed'],
    ])
    expect(list[0].detail).toContain('19:00 chez toi')
    expect(upcomingHolidays(ny('2026-11-27', '08:00'), GPE, 1)[0].detail).toContain('14:00 chez toi')
  })
  it('changements d’heure vus de Paris : mars 2027 (US le 14, Europe le 28)', () => {
    const shifts = upcomingClockShifts(ny('2026-12-01', '12:00'), PARIS, 150)
    expect(shifts.map(s => [s.date, s.detail.match(/ouvre à (\d\d:\d\d)/)?.[1]])).toEqual([
      ['2027-03-14', '14:30'], ['2027-03-28', '15:30'],
    ])
  })
  it('vus de Guadeloupe : un seul changement en mars 2027', () => {
    const shifts = upcomingClockShifts(ny('2026-12-01', '12:00'), GPE, 150)
    expect(shifts.map(s => s.date)).toEqual(['2027-03-14'])
    expect(shifts[0].detail).toContain('09:30')
  })
})

describe('table des jours spéciaux', () => {
  it('triée, sans doublon, uniquement 2026-2027', () => {
    const dates = MARKET_SPECIAL_DAYS.map(d => d.date)
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
    expect(dates.every(d => d >= '2026-01-01' && d <= '2027-12-31')).toBe(true)
  })
  it('10 fermetures NYSE par an, clôtures anticipées publiées', () => {
    const closed = (y: string) => MARKET_SPECIAL_DAYS.filter(d => d.nyse === 'closed' && d.date.startsWith(y)).length
    expect(closed('2026')).toBe(10)
    expect(closed('2027')).toBe(10)
    expect(MARKET_SPECIAL_DAYS.filter(d => d.nyse === 'early').map(d => d.date))
      .toEqual(['2026-11-27', '2026-12-24', '2027-11-26'])
  })
  it('aucun horaire CME présenté comme confirmé tant qu’il n’a pas été vérifié', () => {
    expect(MARKET_SPECIAL_DAYS.every(d => d.cmeConfirmed === false)).toBe(true)
  })
})
