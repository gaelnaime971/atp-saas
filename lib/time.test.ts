import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIME_ZONE, addDays, dateKey, formatDuration, formatTime, isValidTimeZone, marketTimeIn,
  matchesTimeZone, offsetLabel, resolveTimeZone, safeTimeZone, timeZoneLabel, timeZoneOptions,
  weekdayOf, zonedTimeToUtc,
} from './time'

const NY = 'America/New_York'
const PARIS = 'Europe/Paris'
const GPE = 'America/Guadeloupe'

// Ouverture du cash US (9:30 à New York) vue d'ailleurs.
const nyOpen = (date: string, tz: string) => marketTimeIn(date, '09:30', NY, tz).time

describe('fuseau du membre', () => {
  it('profil valide → profil', () => {
    expect(resolveTimeZone(GPE, PARIS)).toEqual({ timeZone: GPE, source: 'profile' })
  })
  it('profil vide → navigateur, sinon Paris', () => {
    expect(resolveTimeZone(null, GPE)).toEqual({ timeZone: GPE, source: 'browser' })
    expect(resolveTimeZone('', GPE)).toEqual({ timeZone: GPE, source: 'browser' })
    expect(resolveTimeZone('   ', null)).toEqual({ timeZone: DEFAULT_TIME_ZONE, source: 'default' })
    expect(resolveTimeZone(undefined, 'Pas/UneZone')).toEqual({ timeZone: DEFAULT_TIME_ZONE, source: 'default' })
  })
  it('profil invalide → Paris (jamais le navigateur, jamais d’exception)', () => {
    expect(resolveTimeZone('Mars/Olympus', GPE)).toEqual({ timeZone: PARIS, source: 'default' })
    expect(resolveTimeZone('<script>', GPE).timeZone).toBe(PARIS)
  })
  it('validation des identifiants', () => {
    for (const tz of [PARIS, GPE, 'America/Martinique', 'America/Cayenne', 'Indian/Reunion', 'Europe/Brussels', 'Europe/Zurich', 'America/Toronto', 'UTC'])
      expect(isValidTimeZone(tz), tz).toBe(true)
    for (const tz of ['', ' ', 'Paris', 'Europe/Pariss', null, undefined, 42, 'x'.repeat(80)])
      expect(isValidTimeZone(tz), String(tz)).toBe(false)
  })
  it('un fuseau invalide ne fait jamais planter un format', () => {
    const t = Date.UTC(2026, 10, 25, 14, 42)
    expect(() => formatTime(t, 'Nope/Nope')).not.toThrow()
    expect(formatTime(t, 'Nope/Nope')).toBe(formatTime(t, PARIS))
    expect(safeTimeZone('Nope/Nope')).toBe(PARIS)
    expect(offsetLabel(t, '')).toBe('UTC+1')
  })
})

describe('ouverture de New York (9:30) vue de Paris et de Guadeloupe', () => {
  // Mars 2026 : les États-Unis passent à l'heure d'été le 8, l'Europe le 29.
  it('mars 2026 : 15:30 → 14:30 pendant les 3 semaines d’écart → 15:30', () => {
    expect(nyOpen('2026-03-06', PARIS)).toBe('15:30') // ven., avant le changement US
    expect(nyOpen('2026-03-09', PARIS)).toBe('14:30') // lun., US en heure d'été, Europe non
    expect(nyOpen('2026-03-27', PARIS)).toBe('14:30') // ven., dernier jour de l'écart
    expect(nyOpen('2026-03-30', PARIS)).toBe('15:30') // lun., Europe en heure d'été
  })
  it('mars 2026 vu de Guadeloupe (jamais de changement) : 10:30 → 9:30', () => {
    expect(nyOpen('2026-03-06', GPE)).toBe('10:30')
    expect(nyOpen('2026-03-09', GPE)).toBe('09:30')
    expect(nyOpen('2026-03-30', GPE)).toBe('09:30')
  })
  // Novembre 2026 : Europe à l'heure d'hiver le 25/10, États-Unis le 1/11.
  it('fin octobre / novembre 2026 : une semaine à 14:30 vu de Paris', () => {
    expect(nyOpen('2026-10-23', PARIS)).toBe('15:30')
    expect(nyOpen('2026-10-26', PARIS)).toBe('14:30') // Europe déjà en hiver, US non
    expect(nyOpen('2026-10-30', PARIS)).toBe('14:30')
    expect(nyOpen('2026-11-02', PARIS)).toBe('15:30')
  })
  it('novembre 2026 vu de Guadeloupe : 9:30 → 10:30 au 1er novembre', () => {
    expect(nyOpen('2026-10-30', GPE)).toBe('09:30')
    expect(nyOpen('2026-11-02', GPE)).toBe('10:30')
  })
  it('mars 2027 : écart de deux semaines (US le 14, Europe le 28)', () => {
    expect(nyOpen('2027-03-12', PARIS)).toBe('15:30')
    expect(nyOpen('2027-03-15', PARIS)).toBe('14:30')
    expect(nyOpen('2027-03-26', PARIS)).toBe('14:30')
    expect(nyOpen('2027-03-29', PARIS)).toBe('15:30')
  })
  it('libellés de décalage', () => {
    expect(offsetLabel(Date.UTC(2026, 10, 25), PARIS)).toBe('UTC+1')
    expect(offsetLabel(Date.UTC(2026, 6, 1), PARIS)).toBe('UTC+2')
    expect(offsetLabel(Date.UTC(2026, 6, 1), GPE)).toBe('UTC−4')
    expect(offsetLabel(Date.UTC(2026, 0, 1), GPE)).toBe('UTC−4')
    expect(offsetLabel(Date.UTC(2026, 0, 1), 'Asia/Kolkata')).toBe('UTC+5:30')
    expect(offsetLabel(Date.UTC(2026, 0, 1), 'UTC')).toBe('UTC')
  })
})

describe('conversions aux heures de changement', () => {
  it('heure inexistante (8/03/2026 2:30 à New York) → avancée d’une heure', () => {
    expect(formatTime(zonedTimeToUtc('2026-03-08', '02:30', NY), NY)).toBe('03:30')
  })
  it('heure ambiguë (1/11/2026 1:30 à New York) → première occurrence (heure d’été)', () => {
    expect(zonedTimeToUtc('2026-11-01', '01:30', NY).toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })
  it('la date peut changer : 18:00 à New York = 00:00 le lendemain à Paris', () => {
    expect(marketTimeIn('2026-11-25', '18:00', NY, PARIS)).toMatchObject({ time: '00:00', date: '2026-11-26' })
    expect(marketTimeIn('2026-11-25', '09:00', 'Asia/Tokyo', PARIS)).toMatchObject({ time: '01:00', date: '2026-11-25' })
  })
})

describe('formats et dates civiles', () => {
  it('heure française à 2 chiffres, minuit compris', () => {
    expect(formatTime(Date.UTC(2026, 10, 25, 23, 5), PARIS)).toBe('00:05')
    expect(formatTime(Date.UTC(2026, 10, 25, 13, 30), PARIS)).toBe('14:30')
  })
  it('dates civiles', () => {
    expect(dateKey(Date.UTC(2026, 10, 25, 23, 30), PARIS)).toBe('2026-11-26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(weekdayOf('2026-11-27')).toBe(5)
  })
  it('durées', () => {
    expect(formatDuration(45 * 60_000)).toBe('45 min')
    expect(formatDuration((5 * 60 + 18) * 60_000)).toBe('5 h 18')
    expect(formatDuration(3 * 3_600_000)).toBe('3 h')
    expect(formatDuration((2 * 24 + 4) * 3_600_000)).toBe('2 j 4 h')
  })
})

describe('liste des fuseaux', () => {
  const options = timeZoneOptions()
  it('les fuseaux des membres en tête, dans l’ordre', () => {
    expect(options.slice(0, 8).map(o => o.label)).toEqual(
      ['Paris', 'Guadeloupe', 'Martinique', 'Guyane', 'La Réunion', 'Bruxelles', 'Genève', 'Montréal'])
  })
  it('puis la liste complète, sans doublon', () => {
    expect(options.length).toBeGreaterThan(300)
    expect(new Set(options.map(o => o.id)).size).toBe(options.length)
  })
  it('recherche sans accents', () => {
    expect(matchesTimeZone({ id: 'America/Toronto', label: 'Montréal' }, 'montre')).toBe(true)
    expect(matchesTimeZone({ id: 'Indian/Reunion', label: 'La Réunion' }, 'reunion')).toBe(true)
    expect(matchesTimeZone({ id: 'America/New_York', label: 'Amériques · New York' }, 'new york')).toBe(true)
    expect(matchesTimeZone({ id: 'Europe/Paris', label: 'Paris' }, 'tokyo')).toBe(false)
  })
  it('libellés français', () => {
    expect(timeZoneLabel('Europe/London')).toBe('Europe · Londres')
    expect(timeZoneLabel('America/Bogota')).toBe('Amériques · Bogota')
    expect(timeZoneLabel('America/Guadeloupe')).toBe('Guadeloupe')
  })
})
