import { describe, expect, it } from 'vitest'
import { BOJ_DECISIONS, ECB_MEETINGS, FOMC_MEETINGS, bojObservations, lastMeeting, meetingOutcome, nextMeeting, rateAt, rateChanges, stepSeries } from './central-banks'

// Fed : borne haute de la fourchette autour de la hausse de septembre 2026 (relevé FRED).
const fedUpper = [
  { date: '2026-09-15', value: 3.75 }, { date: '2026-09-16', value: 3.75 },
  { date: '2026-09-17', value: 4.0 }, { date: '2026-10-28', value: 4.0 }, { date: '2026-11-27', value: 4.0 },
]

describe('banques centrales : réunions', () => {
  it('prochaine réunion et dernière réunion (27/11/2026)', () => {
    expect(nextMeeting('FED', '2026-11-27')?.decisionDate).toBe('2026-12-09')
    expect(nextMeeting('ECB', '2026-11-27')?.decisionDate).toBe('2026-12-17')
    expect(nextMeeting('BOJ', '2026-11-27')?.decisionDate).toBe('2026-12-18')
    expect(lastMeeting('FED', '2026-11-27')?.decisionDate).toBe('2026-10-28')
    expect(nextMeeting('FED', '2026-12-09')?.decisionDate).toBe('2026-12-09') // le jour même
  })
  it('tables triées, sans doublon, projections de la Fed en mars, juin, sept., déc. 2026', () => {
    for (const list of [FOMC_MEETINGS, ECB_MEETINGS]) {
      const d = list.map(m => m.decisionDate)
      expect([...d].sort()).toEqual(d)
      expect(new Set(d).size).toBe(d.length)
    }
    expect(FOMC_MEETINGS.filter(m => m.projections).map(m => m.decisionDate)).toEqual(['2026-03-18', '2026-06-17', '2026-09-16', '2026-12-09'])
    expect(FOMC_MEETINGS.filter(m => m.decisionDate.startsWith('2027')).every(m => m.tentative)).toBe(true)
  })
})

describe('banques centrales : décisions', () => {
  const changes = rateChanges(fedUpper)
  it('changements de taux, date d’effet', () => {
    expect(changes).toEqual([{ date: '2026-09-17', from: 3.75, to: 4.0 }])
  })
  it('issue d’une réunion : hausse si un changement entre en vigueur dans les 7 jours, sinon maintien', () => {
    const sept = FOMC_MEETINGS.find(m => m.decisionDate === '2026-09-16')!
    const oct = FOMC_MEETINGS.find(m => m.decisionDate === '2026-10-28')!
    expect(meetingOutcome(sept, changes)).toMatchObject({ kind: 'hike', change: { to: 4 } })
    expect(meetingOutcome(oct, changes)).toEqual({ kind: 'hold' })
  })
  it('BoJ : décisions recoupées avec le taux de base (écart 0,25 pt) ; 1,25 % depuis sept. 2026', () => {
    expect(BOJ_DECISIONS.at(-1)).toEqual({ date: '2026-09-18', rate: 1.25 })
    expect(rateAt(bojObservations(), '2026-11-27')).toBe(1.25)
    expect(rateAt(bojObservations(), '2026-07-01')).toBe(1.0)
    expect(rateAt(bojObservations(), '2023-11-27')).toBe(-0.1)
  })
  it('escalier pour le graphique', () => {
    expect(stepSeries(changes, { date: '2026-01-01', value: 3.75 }, '2026-11-27')).toEqual([
      { date: '2026-01-01', value: 3.75 }, { date: '2026-09-16', value: 3.75 }, { date: '2026-09-17', value: 4 }, { date: '2026-11-27', value: 4 },
    ])
  })
})
