import { describe, expect, it } from 'vitest'
import { zonedTimeToUtc } from '@/lib/time'
import { MARKET_SPECIAL_DAYS } from '@/lib/terminal/market-holidays'
import {
  cashCloseAt, isTradingDay, journalDay, nextTradingDay, pickRecapDay, planLabel, previousTradingDay, recapDay,
  recapSummary, recentSessions, type RecapInput,
} from './recap'

const ET = 'America/New_York'
const etAt = (d: string, t: string) => zonedTimeToUtc(d, t, ET).getTime()
const D = MARKET_SPECIAL_DAYS

describe('séance à récapituler : avant et après la clôture', () => {
  it('avant 16:00 à New York : la séance précédente ; après : celle du jour', () => {
    expect(recapDay(etAt('2026-12-08', '15:59'), D)).toBe('2026-12-07')
    expect(recapDay(etAt('2026-12-08', '16:00'), D)).toBe('2026-12-08')
  })
  it('lundi matin : le vendredi ; week-end : le vendredi', () => {
    expect(recapDay(etAt('2026-12-07', '09:00'), D)).toBe('2026-12-04')
    expect(recapDay(etAt('2026-12-06', '12:00'), D)).toBe('2026-12-04')
  })
  it('clôture anticipée (lendemain de Thanksgiving) : récap dès 13:00', () => {
    expect(cashCloseAt('2026-11-27', D)).toBe(etAt('2026-11-27', '13:00'))
    expect(recapDay(etAt('2026-11-27', '12:59'), D)).toBe('2026-11-25')
    expect(recapDay(etAt('2026-11-27', '13:00'), D)).toBe('2026-11-27')
  })
  it('jour férié (Thanksgiving) : pas une séance, on montre la veille', () => {
    expect(isTradingDay('2026-11-26', D)).toBe(false)
    expect(recapDay(etAt('2026-11-26', '18:00'), D)).toBe('2026-11-25')
    expect(previousTradingDay('2026-11-27', D)).toBe('2026-11-25')
    expect(nextTradingDay('2026-11-25', D)).toBe('2026-11-27')
  })
  it('heure de Paris : 22:30 à Paris = 16:30 à New York, la séance du jour est close', () => {
    const now = zonedTimeToUtc('2026-12-08', '22:30', 'Europe/Paris').getTime()
    expect(recapDay(now, D)).toBe('2026-12-08')
  })
  it('registre : 5 séances, jour demandé accepté seulement s’il en fait partie', () => {
    const now = etAt('2026-11-30', '17:00')
    expect(recentSessions(now, D)).toEqual(['2026-11-30', '2026-11-27', '2026-11-25', '2026-11-24', '2026-11-23'])
    expect(pickRecapDay('2026-11-24', now, D)).toBe('2026-11-24')
    expect(pickRecapDay('2026-11-26', now, D)).toBe('2026-11-30') // férié
    expect(pickRecapDay('2027-01-04', now, D)).toBe('2026-11-30') // futur
    expect(pickRecapDay(undefined, now, D)).toBe('2026-11-30')
  })
})

describe('ta séance (journal)', () => {
  it('journal vide pour ce jour : null', () => {
    expect(journalDay([], '2026-12-08')).toBeNull()
    expect(journalDay([{ session_date: '2026-12-07', pnl: 100, trades_count: 2, setup: null }], '2026-12-08')).toBeNull()
  })
  it('journal rempli : P&L, trades, R et respect du plan (plusieurs comptes additionnés)', () => {
    const j = journalDay([
      { session_date: '2026-12-08', pnl: '250.50', trades_count: 3, setup: JSON.stringify({ r_value: 1.5, plan_score: 9, win_rate: 66.7 }) },
      { session_date: '2026-12-08', pnl: -50, trades_count: 1, setup: JSON.stringify({ r_value: -0.5, plan_score: 6 }) },
      { session_date: '2026-12-08', pnl: null, trades_count: null, setup: 'pas du JSON' },
    ], '2026-12-08')
    expect(j).toEqual({ sessions: 3, pnl: 200.5, trades: 4, r: 1, plan: 7.5, winRate: 66.7 })
    expect(planLabel(7.5)).toBe('Partiel')
    expect(planLabel(8)).toBe('Dans le plan')
    expect(planLabel(4)).toBe('Hors plan')
  })
  it('sans R ni plan saisis : null (pas 0)', () => {
    expect(journalDay([{ session_date: '2026-12-08', pnl: 10, trades_count: 1, setup: JSON.stringify({ source: 'csv' }) }], '2026-12-08'))
      .toMatchObject({ r: null, plan: null, winRate: null })
  })
})

describe('synthèse rédigée par des règles', () => {
  const base = (over: Partial<RecapInput> = {}): RecapInput => ({
    day: '2026-12-10', tz: 'Europe/Paris', specialDays: D, releases: [], fed: [], auctions: [], sentiment: null, cot: null,
    tomorrow: { day: '2026-12-11', high: [] }, journal: null, ...over,
  })
  it('publication forte avec chiffre en titre, détail, Fed, adjudication, sentiment', () => {
    const s = recapSummary(base({
      releases: [
        { title: 'Inflation (IPC)', impact: 'high', at: etAt('2026-12-10', '08:30'), figure: '+0,3 % sur un mois' },
        { title: 'Inscriptions au chômage', impact: 'medium', at: etAt('2026-12-10', '08:30'), figure: '189 k nouvelles demandes' },
      ],
      fed: [{ title: 'Waller, Economic Outlook', kind: 'speech' }],
      auctions: [{ label: '30 ans', yield: 4.712 }],
      sentiment: { score: 31, previous: 28 },
    }))
    expect(s.headline).toBe('Inflation (IPC) : +0,3 % sur un mois.')
    expect(s.paragraphs).toEqual([
      '2 publications, dont 1 à fort impact : Inflation (IPC) +0,3 % sur un mois et Inscriptions au chômage 189 k nouvelles demandes.',
      'Fed : Waller, Economic Outlook ; adjudication à 30 ans au taux de 4,712 %.',
      'Sentiment de risque à 31 sur 100 (+3 sur la séance).',
    ])
  })
  it('clôture anticipée en titre ; séance vide', () => {
    expect(recapSummary(base({ day: '2026-11-27', tomorrow: { day: '2026-11-30', high: [] } })).headline)
      .toBe('Séance écourtée (Lendemain de Thanksgiving) : clôture du cash US à 19:00.')
    expect(recapSummary(base()).headline).toBe('Séance sans publication officielle US.')
    expect(recapSummary(base()).paragraphs).toEqual([])
  })
  it('décision FOMC en titre faute de chiffre fort', () => {
    expect(recapSummary(base({ fed: [{ title: 'Décision de la Fed et projections', kind: 'fomc' }] })).headline)
      .toBe('Décision de la Fed : Décision de la Fed et projections.')
  })
  it('COT publié ce jour-là, journal rempli', () => {
    const s = recapSummary(base({
      cot: { reportDate: '2026-12-08', extremes: ['Spéculateurs sur ES (proche du plus haut sur 3 ans)'] },
      journal: { sessions: 1, pnl: 320, trades: 3, r: 1.6, plan: 9, winRate: null },
    }))
    expect(s.paragraphs).toEqual([
      'Nouveau rapport COT (positions du mar. 8 déc.) : positions extrêmes : Spéculateurs sur ES (proche du plus haut sur 3 ans).',
      'Ta séance : +320 $ sur 3 trades, +1,6 R, plan respecté.',
    ])
  })
  it('demain : annonces fortes avec fenêtres ATP dans le fuseau du membre, ou clôture anticipée', () => {
    const at = etAt('2026-12-11', '08:30')
    expect(recapSummary(base({ tomorrow: { day: '2026-12-11', high: [{ title: 'Ventes au détail', at }] } })).tomorrow)
      .toBe('Vendredi 11 décembre : Ventes au détail à 14:30 (fenêtre ATP 14:15–14:45).')
    expect(recapSummary(base({ tz: ET, tomorrow: { day: '2026-12-11', high: [{ title: 'Ventes au détail', at }] } })).tomorrow)
      .toBe('Vendredi 11 décembre : Ventes au détail à 08:30 (fenêtre ATP 08:15–08:45).')
    expect(recapSummary(base({ day: '2026-11-25', tomorrow: { day: '2026-11-27', high: [] } })).tomorrow)
      .toBe('Vendredi 27 novembre : Lendemain de Thanksgiving, clôture anticipée de Wall Street à 19:00 ; pas d’annonce à fort impact.')
  })
})
