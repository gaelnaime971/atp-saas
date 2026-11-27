import { describe, expect, it } from 'vitest'
import { isUuid, validateAgendaItem, validateConfirmation } from './agenda-admin'

describe('agenda admin : résultats et discours', () => {
  it('résultats : ticker en majuscules, avant ouverture / après clôture, nom proposé', () => {
    expect(validateAgendaItem({ kind: 'earnings', date: '2027-01-28', ticker: 'msft', timing: 'amc' })).toEqual({
      ok: true, value: { kind: 'earnings', event_date: '2027-01-28', time_et: null, timing: 'amc', ticker: 'MSFT', title: 'Microsoft' },
    })
  })
  it('refus : date impossible, ticker invalide, moment manquant', () => {
    expect(validateAgendaItem({ kind: 'earnings', date: '2027-02-30', ticker: 'MSFT', timing: 'amc' }).ok).toBe(false)
    expect(validateAgendaItem({ kind: 'earnings', date: '2027-01-28', ticker: 'MS FT', timing: 'amc' }).ok).toBe(false)
    expect(validateAgendaItem({ kind: 'earnings', date: '2027-01-28', ticker: 'MSFT' }).ok).toBe(false)
    expect(validateAgendaItem({ kind: 'autre', date: '2027-01-28' }).ok).toBe(false)
  })
  it('discours : intitulé requis, heure de New York facultative mais valide', () => {
    expect(validateAgendaItem({ kind: 'speech', date: '2026-12-02', title: 'Discours du président de la Fed', timeEt: '13:00' })).toMatchObject({ ok: true, value: { time_et: '13:00', ticker: null } })
    expect(validateAgendaItem({ kind: 'speech', date: '2026-12-02', title: 'x', timeEt: '25:00' }).ok).toBe(false)
    expect(validateAgendaItem({ kind: 'speech', date: '2026-12-02', title: '  ' }).ok).toBe(false)
  })
  it('identifiants : UUID seulement', () => {
    expect(isUuid('0e8f6b1a-3c5d-4e7f-9a1b-2c3d4e5f6a7b')).toBe(true)
    expect(isUuid("1' OR 1=1")).toBe(false)
  })
})

describe('agenda admin : confirmation des horaires CME', () => {
  it('jour connu, plages normalisées', () => {
    expect(validateConfirmation({ date: '2026-12-24', cmeConfirmed: true, globexRanges: '18:00-24:00, 00:00-13:15', note: 'Avis CME' })).toEqual({
      ok: true, value: { holiday_date: '2026-12-24', cme_confirmed: true, globex_ranges: '00:00-13:15,18:00-24:00', note: 'Avis CME' },
    })
  })
  it('sans plages : schéma du code ; vide : fermé', () => {
    expect(validateConfirmation({ date: '2026-12-24', cmeConfirmed: true })).toMatchObject({ ok: true, value: { globex_ranges: null } })
    expect(validateConfirmation({ date: '2026-12-25', cmeConfirmed: true, globexRanges: '' })).toMatchObject({ ok: true, value: { globex_ranges: '' } })
  })
  it('refus : jour hors table, plages invalides', () => {
    expect(validateConfirmation({ date: '2026-12-22', cmeConfirmed: true }).ok).toBe(false)
    expect(validateConfirmation({ date: '2026-12-24', cmeConfirmed: true, globexRanges: '14:00-13:00' }).ok).toBe(false)
  })
})
