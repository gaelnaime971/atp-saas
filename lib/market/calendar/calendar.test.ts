import { describe, expect, it } from 'vitest'
import { formatTime, zonedTimeToUtc } from '@/lib/time'
import {
  agendaEvents, atpWindows, auctionEvents, dedupe, eventsBetween, filterEvents, fomcEvents, holidayEvents,
  memberDate, releaseEvents, to24h, weekStart, type CalendarEvent,
} from './events'
import { figureCacheKey, figureTtlSeconds, publishedFigure } from './figure'
import { parseFredReleaseDates, parseIcs, parseTreasury } from './sources'

const PARIS = 'Europe/Paris'
const GPE = 'America/Guadeloupe'
const ny = (date: string, time: string) => zonedTimeToUtc(date, time, 'America/New_York').getTime()

describe('fuseaux : publication à 8:30 à New York', () => {
  const [cpi] = releaseEvents([{ releaseId: 10, date: '2026-12-10' }], [])
  it('14:30 à Paris et 9:30 en Guadeloupe en hiver', () => {
    expect(formatTime(cpi.at!, PARIS)).toBe('14:30')
    expect(formatTime(cpi.at!, GPE)).toBe('09:30')
  })
  it('pendant l’écart de mars 2027 : 13:30 à Paris, 8:30 en Guadeloupe', () => {
    const [e] = releaseEvents([{ releaseId: 10, date: '2027-03-16' }], [])
    expect(formatTime(e.at!, PARIS)).toBe('13:30')
    expect(formatTime(e.at!, GPE)).toBe('08:30')
  })
  it('décision de la Fed 14:00 ET = 20:00 à Paris le 9 déc. 2026', () => {
    const d = fomcEvents().find(e => e.id === 'fomc:decision:2026-12-09')!
    expect(formatTime(d.at!, PARIS)).toBe('20:00')
    expect(d.title).toBe('Décision de la Fed et projections')
  })
})

describe('dédoublonnage', () => {
  it('une même publication FRED + BEA : un seul événement, heure officielle du BEA', () => {
    const bea = [{ start: Date.UTC(2026, 11, 23, 15, 0), summary: 'Personal Income and Outlays, November 2026' }] // 10:00 ET (heure exceptionnelle)
    const events = releaseEvents([{ releaseId: 54, date: '2026-12-23' }, { releaseId: 10, date: '2026-12-10' }], bea)
    const pce = events.filter(e => e.id === 'release:54:2026-12-23')
    expect(pce).toHaveLength(1)
    expect(pce[0].timeOfficial).toBe(true)
    expect(formatTime(pce[0].at!, 'America/New_York')).toBe('10:00')
    expect(pce[0].figure?.series).toBe('PCEPILFE')
    expect(events).toHaveLength(2)
  })
  it('publications non suivies ignorées, résumé BEA inconnu ignoré', () => {
    expect(releaseEvents([{ releaseId: 999, date: '2026-12-01' }], [{ start: 0, summary: 'GDP by County, 2025' }])).toEqual([])
  })
  it('mises en chantier : les jours des ventes de logements neufs (rattachés par FRED) sont ignorés', () => {
    const events = releaseEvents([
      { releaseId: 27, date: '2026-11-18' }, { releaseId: 27, date: '2026-11-25' }, { releaseId: 97, date: '2026-11-25' },
    ], [])
    expect(events.map(e => e.id).sort()).toEqual(['release:27:2026-11-18', 'release:97:2026-11-25'])
  })
  it('même adjudication vue dans « à venir » et « réalisées » : une seule', () => {
    const a = { cusip: 'X1', originalTerm: '10-Year', securityTerm: '10-Year', closeDate: '2026-12-09', closeTime: '01:00 PM', highYield: null }
    expect(auctionEvents([a, { ...a, highYield: 4.9 }])).toHaveLength(1)
  })
  it('l’ordre est stable : jour, journée entière d’abord, puis heure', () => {
    const e = (id: string, date: string, at: number | null): CalendarEvent => ({ id, kind: 'release', title: id, agency: 'x', at, date, impact: 'low', timeOfficial: false })
    const sorted = dedupe([e('b', '2026-12-01', 2), e('a', '2026-12-01', null), e('c', '2026-11-30', 5)])
    expect(sorted.map(x => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('fenêtres ATP ±15 min', () => {
  it('seulement autour des événements à fort impact', () => {
    const events = [...releaseEvents([{ releaseId: 10, date: '2026-12-10' }, { releaseId: 13, date: '2026-12-10' }], [])]
    const w = atpWindows(events)
    expect(w).toHaveLength(1)
    expect(formatTime(w[0].start, PARIS)).toBe('14:15')
    expect(formatTime(w[0].end, PARIS)).toBe('14:45')
  })
  it('décision 14:00 + conférence 14:30 : fenêtres fusionnées 13:45–14:45 ET', () => {
    const w = atpWindows(fomcEvents().filter(e => e.date === '2026-12-09'))
    expect(w).toHaveLength(1)
    expect(formatTime(w[0].start, 'America/New_York')).toBe('13:45')
    expect(formatTime(w[0].end, 'America/New_York')).toBe('14:45')
    expect(w[0].ids).toHaveLength(2)
  })
})

describe('chiffre publié et cache', () => {
  const obs = [
    { date: '2026-08-01', value: 334.131, realtimeStart: '2026-11-10' },
    { date: '2026-09-01', value: 336.298, realtimeStart: '2026-11-10' },
    { date: '2026-10-01', value: 337.476, realtimeStart: '2026-11-10' },
  ]
  it('publié si la dernière valeur date du jour de la publication ou après', () => {
    const f = publishedFigure(obs, '2026-11-10', 'pct_mom')
    expect(f.status).toBe('published')
    if (f.status === 'published') {
      expect(f.actual).toBeCloseTo(0.3505, 3)
      expect(f.previous).toBeCloseTo(0.6486, 3)
      expect(f.period).toBe('2026-10-01')
    }
  })
  it('publication suivante pas encore sortie : en attente (jamais l’ancien chiffre)', () => {
    expect(publishedFigure(obs, '2026-12-10', 'pct_mom')).toEqual({ status: 'pending' })
  })
  it('emplois créés : différence en milliers', () => {
    const p = [{ date: '2026-09-01', value: 159128, realtimeStart: '2026-11-06' }, { date: '2026-10-01', value: 159293, realtimeStart: '2026-11-06' }]
    expect(publishedFigure(p, '2026-11-06', 'change_k')).toMatchObject({ status: 'published', actual: 165 })
  })
  it('cache : rien avant l’annonce, 60 s dans les 3 h, 1 h ensuite', () => {
    const at = ny('2026-12-10', '08:30')
    expect(figureTtlSeconds(at, at - 60_000)).toBeNull()
    expect(figureTtlSeconds(at, at + 5 * 60_000)).toBe(60)
    expect(figureTtlSeconds(at, at + 4 * 3_600_000)).toBe(3600)
    expect(figureCacheKey('CPIAUCSL', '2026-12-10', at, at - 1)).toBeNull()
  })
  it('clé de cache : change chaque minute juste après l’annonce, stable dans la minute', () => {
    const at = ny('2026-12-10', '08:30')
    const k1 = figureCacheKey('CPIAUCSL', '2026-12-10', at, at + 61_000)
    const k2 = figureCacheKey('CPIAUCSL', '2026-12-10', at, at + 70_000)
    const k3 = figureCacheKey('CPIAUCSL', '2026-12-10', at, at + 125_000)
    expect(k1).toBe(k2)
    expect(k3).not.toBe(k1)
  })
})

describe('sources : lecture des fichiers officiels', () => {
  it('iCalendar du BEA (heures UTC, lignes repliées, virgules échappées)', () => {
    const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE-TIME:20261223T133000Z\r\nSUMMARY:Personal Income and Outlays\\, Novem\r\n ber 2026\r\nEND:VEVENT\r\nEND:VCALENDAR'
    expect(parseIcs(ics)).toEqual([{ start: Date.UTC(2026, 11, 23, 13, 30), summary: 'Personal Income and Outlays, November 2026' }])
  })
  it('dates FRED : seulement les publications suivies', () => {
    const json = { release_dates: [{ release_id: 10, date: '2026-12-10' }, { release_id: 4242, date: '2026-12-11' }] }
    expect(parseFredReleaseDates(json)).toEqual([{ releaseId: 10, date: '2026-12-10' }])
  })
  it('Trésor : 10 et 30 ans uniquement (réouvertures comprises), heure 13:00', () => {
    const rows = [
      { cusip: 'A', originalSecurityTerm: '10-Year', securityTerm: '9-Year 11-Month', competitiveAuctionCloseDate: '2026-12-09T00:00:00', competitiveAuctionCloseTime: '01:00 PM', highYield: '' },
      { cusip: 'B', originalSecurityTerm: '2-Year', securityTerm: '2-Year', competitiveAuctionCloseDate: '2026-12-01T00:00:00' },
    ]
    const a = parseTreasury(rows)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ cusip: 'A', closeDate: '2026-12-09', highYield: null })
    expect(auctionEvents(a)[0].detail).toBe('Réouverture')
    expect(to24h('01:00 PM')).toBe('13:00')
    expect(to24h('11:30 AM')).toBe('11:30')
  })
})

describe('fériés, agenda admin, filtres, semaine', () => {
  it('fériés de la page Sessions : journée entière ou clôture anticipée 13:00 ET', () => {
    const h = holidayEvents()
    expect(h.find(e => e.date === '2026-12-25')?.at).toBeNull()
    expect(formatTime(h.find(e => e.date === '2026-12-24')!.at!, PARIS)).toBe('19:00')
  })
  it('résultats : avant l’ouverture (8:00 ET) ou après la clôture (16:05 ET)', () => {
    const [e] = agendaEvents([{ id: '1', kind: 'earnings', date: '2027-01-28', timeEt: null, timing: 'amc', ticker: 'MSFT', title: 'Microsoft' }])
    expect(e.title).toBe('Résultats MSFT')
    expect(formatTime(e.at!, 'America/New_York')).toBe('16:05')
  })
  it('filtres : impact et type ; les fériés passent toujours le filtre d’impact', () => {
    const events = [...releaseEvents([{ releaseId: 10, date: '2026-12-10' }, { releaseId: 13, date: '2026-12-10' }], []), ...holidayEvents().slice(0, 1)]
    expect(filterEvents(events, ['high'], []).map(e => e.kind)).toEqual(['release', 'holiday'])
    expect(filterEvents(events, [], ['holiday'])).toHaveLength(1)
  })
  it('semaine du lundi au dimanche, dates chez le membre', () => {
    expect(weekStart('2026-11-27')).toBe('2026-11-23')
    expect(weekStart('2026-11-23')).toBe('2026-11-23')
    const decision = fomcEvents().find(e => e.id === 'fomc:decision:2026-12-09')!
    // 14:00 ET = 5:00 le lendemain à Tokyo.
    expect(memberDate(decision, 'Asia/Tokyo')).toBe('2026-12-10')
    expect(eventsBetween([decision], '2026-12-07', '2026-12-13', PARIS)).toHaveLength(1)
  })
})
