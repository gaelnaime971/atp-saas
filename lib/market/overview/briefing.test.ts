import { describe, expect, it } from 'vitest'
import { zonedTimeToUtc } from '@/lib/time'
import type { CalendarEvent } from '@/lib/market/calendar/events'
import { MARKET_SPECIAL_DAYS } from '@/lib/terminal/market-holidays'
import { atpWindowText, buildBriefing, daysBetween, relativeDay, upcomingHigh, type BriefingInput } from './briefing'

const ET = 'America/New_York'
const etAt = (date: string, time: string) => zonedTimeToUtc(date, time, ET).getTime()
const release = (id: string, date: string, time: string, title: string, impact: CalendarEvent['impact'] = 'high'): CalendarEvent => ({
  id, kind: 'release', title, agency: 'BLS', at: etAt(date, time), date, impact, timeOfficial: false,
})

const base = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  now: etAt('2026-12-10', '07:00'), tz: 'Europe/Paris', specialDays: MARKET_SPECIAL_DAYS, events: [],
  nextDecision: null, sentiment: null, cotExtremes: [], season: null, roll: null, ...over,
})

describe('briefing : titre', () => {
  it('une annonce forte aujourd’hui : heure et fenêtre ATP dans le fuseau du membre', () => {
    const events = [release('cpi', '2026-12-10', '08:30', 'Inflation (IPC)')]
    expect(buildBriefing(base({ events })).headline).toBe('Inflation (IPC) à 14:30 : aucune position de 14:15 à 14:45.')
    expect(buildBriefing(base({ events, tz: 'America/New_York' })).headline).toBe('Inflation (IPC) à 08:30 : aucune position de 08:15 à 08:45.')
    expect(buildBriefing(base({ events, tz: 'Asia/Tokyo' })).headline).toBe('Inflation (IPC) à 22:30 : aucune position de 22:15 à 22:45.')
  })
  it('plusieurs annonces fortes : journée chargée', () => {
    const events = [release('a', '2026-12-10', '08:30', 'Inflation (IPC)'), release('b', '2026-12-10', '10:00', 'Autre')]
    expect(buildBriefing(base({ events })).headline).toMatch(/^Journée chargée : 2 annonces à fort impact, dont Inflation \(IPC\) à 14:30\.$/)
  })
  it('jour férié, clôture anticipée, veille de férié', () => {
    expect(buildBriefing(base({ now: etAt('2026-11-26', '09:00') })).headline).toBe('Thanksgiving : Wall Street fermée aujourd’hui.')
    expect(buildBriefing(base({ now: etAt('2026-11-27', '09:00') })).headline)
      .toBe('Lendemain de Thanksgiving : clôture anticipée de Wall Street à 19:00, volume mince attendu.')
    expect(buildBriefing(base({ now: etAt('2026-11-25', '09:00') })).headline).toBe('Veille de Thanksgiving : Wall Street fermée demain.')
  })
  it('rien de spécial', () => {
    expect(buildBriefing(base({ now: etAt('2026-12-02', '09:00') })).headline).toBe('Pas d’annonce à fort impact aujourd’hui.')
  })
  it('les annonces faibles ne comptent pas', () => {
    const events = [release('x', '2026-12-10', '08:30', 'Prix à l’importation', 'low')]
    expect(buildBriefing(base({ events })).headline).toBe('Pas d’annonce à fort impact aujourd’hui.')
  })
})

describe('briefing : lignes', () => {
  it('agenda : 3 prochaines annonces fortes avec jour relatif et fenêtre ATP', () => {
    const events = [
      release('a', '2026-12-10', '08:30', 'Inflation (IPC)'),
      release('b', '2026-12-11', '08:30', 'Ventes au détail'),
      release('c', '2026-12-15', '08:30', 'PPI'),
      release('d', '2026-12-16', '08:30', 'Quatrième'),
    ]
    const line = buildBriefing(base({ events })).lines.find(l => l.key === 'agenda')!
    expect(line.text).toBe('Inflation (IPC) aujourd’hui à 14:30 (fenêtre ATP 14:15–14:45) · Ventes au détail demain à 14:30 (fenêtre ATP 14:15–14:45) · PPI mar. 15 déc. à 14:30 (fenêtre ATP 14:15–14:45).')
    expect(buildBriefing(base()).lines[0].text).toBe('Aucune annonce à fort impact dans les 7 prochains jours.')
  })
  it('taux, sentiment, positionnement, saisonnalité, échéances', () => {
    const b = buildBriefing(base({
      nextDecision: { bank: 'Fed', date: '2026-12-16', at: etAt('2026-12-16', '14:00') },
      sentiment: { score: 44, zone: 'Neutre', weekAgo: 51 },
      cotExtremes: [{ market: 'NQ', category: 'Gérants d’actifs', reading: 'Proche du plus haut sur 3 ans' }],
      season: { month: 'Décembre', upCount: 16, n: 20, mean: 1.37 },
      roll: { date: '2026-12-10', contract: 'Mars 2027', code: 'H7' },
    }))
    const t = Object.fromEntries(b.lines.map(l => [l.key, l.text]))
    expect(t.taux).toBe('Prochaine décision : Fed mer. 16 déc. à 20:00, dans 6 jours.')
    expect(t.sentiment).toBe('Score de 44 sur 100 (neutre), 51 il y a une semaine.')
    expect(t.cot).toBe('Gérants d’actifs sur NQ : proche du plus haut sur 3 ans.')
    expect(t.saison).toBe('Décembre : S&P 500 en hausse 16 années sur 20, +1,37 % en moyenne.')
    expect(t.echeances).toBe('Roll conseillé aujourd’hui vers Mars 2027 (H7).')
  })
  it('BoJ sans heure fixe, roll à venir, aucune position extrême', () => {
    const b = buildBriefing(base({
      nextDecision: { bank: 'BoJ', date: '2026-12-18', at: null },
      roll: { date: '2026-12-14', contract: 'Mars 2027', code: 'H7' },
    }))
    const t = Object.fromEntries(b.lines.map(l => [l.key, l.text]))
    expect(t.taux).toBe('Prochaine décision : BoJ ven. 18 déc. (heure non fixée), dans 8 jours.')
    expect(t.echeances).toBe('Prochain roll le lun. 14 déc. vers Mars 2027 (H7), dans 4 jours.')
    expect(t.cot).toBe('Aucune position extrême sur 3 ans dans le dernier rapport COT.')
  })
})

describe('briefing : outils', () => {
  it('jour relatif, écart en jours, fenêtre ATP', () => {
    expect(relativeDay('2026-12-10', '2026-12-10')).toBe('aujourd’hui')
    expect(relativeDay('2026-12-11', '2026-12-10')).toBe('demain')
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(atpWindowText(etAt('2026-12-09', '14:00'), 'Europe/Paris')).toBe('19:45–20:15')
  })
  it('à cheval sur minuit : une annonce de 20:00 ET tombe le lendemain à Paris', () => {
    const e = release('late', '2026-12-09', '20:00', 'Tardive')
    const b = buildBriefing(base({ now: etAt('2026-12-09', '17:00'), events: [e] })) // 23:00 à Paris
    expect(b.lines[0].text).toBe('Tardive demain à 02:00 (fenêtre ATP 01:45–02:15).')
    expect(buildBriefing(base({ now: etAt('2026-12-09', '17:00'), events: [e], tz: ET })).lines[0].text).toMatch(/^Tardive aujourd’hui à 20:00/)
  })
  it('horizon de 7 jours, annonce en cours (dans sa fenêtre) encore listée', () => {
    const now = etAt('2026-12-10', '08:40')
    const events = [release('a', '2026-12-10', '08:30', 'En cours'), release('b', '2026-12-20', '08:30', 'Trop loin')]
    expect(upcomingHigh(events, now).map(e => e.id)).toEqual(['a'])
  })
})
