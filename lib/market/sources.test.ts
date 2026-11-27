import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFredObservations, parseFredObservations } from './fred'
import { fetchCotRows, parseCotRows } from './cftc'

describe('FRED : lecture des observations', () => {
  it('valeurs numériques triées, valeurs manquantes (« . ») ignorées', () => {
    const obs = parseFredObservations({ observations: [
      { date: '2026-11-25', value: '4.01' }, { date: '2026-11-24', value: '.' }, { date: '2026-11-21', value: '3.98' }, { date: 'x', value: '1' },
    ] })
    expect(obs).toEqual([{ date: '2026-11-21', value: 3.98 }, { date: '2026-11-25', value: 4.01 }])
  })
  it('réponse inattendue → erreur', () => {
    expect(() => parseFredObservations({ error: 'x' })).toThrow()
  })
  describe('appel réseau', () => {
    afterEach(() => vi.unstubAllEnvs())
    it('la clé n’apparaît jamais dans un message d’erreur', async () => {
      vi.stubEnv('FRED_API_KEY', 'cle-secrete-123')
      const fake = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
      await expect(fetchFredObservations('DGS10', '2026-01-01', fake)).rejects.toThrow(/^FRED DGS10 : HTTP 500$/)
      const err = await fetchFredObservations('DGS10', '2026-01-01', fake).catch(e => (e as Error).message)
      expect(err).not.toContain('cle-secrete-123')
    })
    it('sans clé : refus net', async () => {
      vi.stubEnv('FRED_API_KEY', '')
      await expect(fetchFredObservations('DGS10', '2026-01-01', vi.fn() as unknown as typeof fetch)).rejects.toThrow('FRED_API_KEY absente')
    })
  })
})

const ROW = {
  report_date_as_yyyy_mm_dd: '2026-11-17T00:00:00.000', cftc_contract_market_code: '209742', futonly_or_combined: 'FutOnly',
  open_interest_all: '296423', asset_mgr_positions_long: '112461', asset_mgr_positions_short: '29561',
  lev_money_positions_long: '53394', lev_money_positions_short: '64322',
  dealer_positions_long_all: '46518', dealer_positions_short_all: '136196',
}

describe('CFTC : lecture du rapport TFF', () => {
  it('futures seuls et bon code de contrat uniquement', () => {
    const rows = parseCotRows([ROW, { ...ROW, futonly_or_combined: 'Combined' }, { ...ROW, cftc_contract_market_code: '13874A' }], 'NQ')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ market: 'NQ', reportDate: '2026-11-17', openInterest: 296423, assetMgrLong: 112461, levMoneyShort: 64322, dealerShort: 136196 })
  })
  it('valeur non numérique → erreur (pas de zéro inventé)', () => {
    expect(() => parseCotRows([{ ...ROW, open_interest_all: 'n/a' }], 'NQ')).toThrow()
  })
  it('date de début au format strict (pas d’injection dans la requête)', async () => {
    await expect(fetchCotRows('NQ', "2020-01-01' OR 1=1", vi.fn() as unknown as typeof fetch)).rejects.toThrow('Date de début invalide')
  })
})
