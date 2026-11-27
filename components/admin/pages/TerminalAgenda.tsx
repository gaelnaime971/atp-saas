'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { EARNINGS_SUGGESTIONS } from '@/lib/market/agenda-admin'
import { formatDateKey } from '@/lib/time'

/**
 * Admin › Terminal › Agenda Terminal : résultats d'entreprises et
 * discours de la Fed (calendrier économique), confirmation des horaires
 * CME des jours de fête (pages Sessions et Calendrier). Écriture par la
 * route admin /api/admin/terminal-agenda (service-role).
 */

interface Item { id: string; kind: 'earnings' | 'speech'; event_date: string; time_et: string | null; timing: 'bmo' | 'amc' | null; ticker: string | null; title: string }
interface Holiday {
  date: string; name: string; nyse: 'closed' | 'early' | null; codeRanges: string
  confirmation: { cme_confirmed: boolean; globex_ranges: string | null; note: string | null; updated_at: string } | null
}

const field: CSSProperties = {
  padding: '8px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)', color: 'var(--color-text-1)', fontSize: 13, outline: 'none', minHeight: 36,
}
const label: CSSProperties = { display: 'block', fontSize: 11, color: 'var(--color-text-2)', marginBottom: 4 }
const sectionTitle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', margin: '0 0 4px 0' }
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }

export default function TerminalAgenda() {
  const [items, setItems] = useState<Item[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ kind: 'earnings' as 'earnings' | 'speech', date: '', ticker: '', timing: 'amc' as 'bmo' | 'amc', timeEt: '', title: '' })
  const [ranges, setRanges] = useState<Record<string, string>>({})

  const apply = (data: { items: Item[]; holidays: Holiday[] }) => {
    setItems(data.items)
    setHolidays(data.holidays)
    setRanges(Object.fromEntries(data.holidays.map(h => [h.date, h.confirmation?.globex_ranges ?? h.codeRanges])))
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/terminal-agenda', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      apply(await res.json())
      setError(null)
    } catch {
      setError('Agenda indisponible. Les tables du lot D sont-elles créées ?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function send(method: 'POST' | 'DELETE', body?: unknown, query = '') {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/terminal-agenda${query}`, {
        method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Enregistrement impossible'); return false }
      apply(data)
      setError(null)
      return true
    } finally {
      setBusy(false)
    }
  }

  async function addItem() {
    const ok = await send('POST', { action: 'save_item', item: form })
    if (ok) setForm(f => ({ ...f, ticker: '', title: '', timeEt: '' }))
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader size="sm" title="Agenda Terminal" subtitle="Résultats d’entreprises et discours de la Fed pour le calendrier économique, horaires CME des jours de fête." />
      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--color-loss)', margin: 0 }}>{error}</p>}

      <Card>
        <h2 style={sectionTitle}>Résultats et discours</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '0 0 14px 0' }}>
          Dates à New York. Résultats : avant l’ouverture ou après la clôture. Discours : heure de New York si elle est connue.
        </p>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end">
          <div>
            <label style={label} htmlFor="ag-kind">Type</label>
            <select id="ag-kind" style={{ ...field, width: '100%' }} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as 'earnings' | 'speech' }))}>
              <option value="earnings">Résultats</option>
              <option value="speech">Discours de la Fed</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="ag-date">Date</label>
            <input id="ag-date" type="date" style={{ ...field, width: '100%' }} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          {form.kind === 'earnings' ? (
            <>
              <div>
                <label style={label} htmlFor="ag-ticker">Ticker</label>
                <input id="ag-ticker" list="ag-tickers" style={{ ...field, width: '100%', textTransform: 'uppercase' }} value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} placeholder="MSFT" />
                <datalist id="ag-tickers">{EARNINGS_SUGGESTIONS.map(s => <option key={s.ticker} value={s.ticker}>{s.name}</option>)}</datalist>
              </div>
              <div>
                <label style={label} htmlFor="ag-timing">Moment</label>
                <select id="ag-timing" style={{ ...field, width: '100%' }} value={form.timing} onChange={e => setForm(f => ({ ...f, timing: e.target.value as 'bmo' | 'amc' }))}>
                  <option value="bmo">Avant l’ouverture</option>
                  <option value="amc">Après la clôture</option>
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ag-name">Société (facultatif)</label>
                <input id="ag-name" style={{ ...field, width: '100%' }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Nom proposé d’après le ticker" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={label} htmlFor="ag-time">Heure (New York)</label>
                <input id="ag-time" type="time" style={{ ...field, width: '100%' }} value={form.timeEt} onChange={e => setForm(f => ({ ...f, timeEt: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label style={label} htmlFor="ag-title">Intitulé</label>
                <input id="ag-title" style={{ ...field, width: '100%' }} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Discours de … (gouverneur de la Fed)" />
              </div>
            </>
          )}
          <Button onClick={addItem} loading={busy} disabled={busy || !form.date}>Ajouter</Button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
                <th style={{ fontWeight: 500, padding: '6px 0' }}>Date</th><th style={{ fontWeight: 500 }}>Type</th><th style={{ fontWeight: 500 }}>Détail</th><th style={{ fontWeight: 500 }}>Moment</th><th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: '10px 0', color: 'var(--color-text-3)' }}>Chargement…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '10px 0', color: 'var(--color-text-3)' }}>Aucun élément saisi.</td></tr>
              ) : items.map(i => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ ...mono, padding: '8px 0' }}>{formatDateKey(i.event_date, { year: true })}</td>
                  <td>{i.kind === 'earnings' ? <Badge tone="info" size="sm">Résultats</Badge> : <Badge tone="accent" size="sm">Discours</Badge>}</td>
                  <td style={{ color: 'var(--color-text-1)' }}>{i.kind === 'earnings' ? <><strong style={mono}>{i.ticker}</strong> {i.title}</> : i.title}</td>
                  <td style={{ color: 'var(--color-text-2)' }}>{i.kind === 'earnings' ? (i.timing === 'bmo' ? 'Avant l’ouverture' : 'Après la clôture') : (i.time_et ? `${i.time_et} à New York` : '—')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => send('DELETE', undefined, `?id=${encodeURIComponent(i.id)}`)}>Supprimer</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 style={sectionTitle}>Horaires CME des jours de fête</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '0 0 14px 0' }}>
          Le CME publie ses horaires de fête environ deux semaines avant. Vérifie-les sur cmegroup.com, corrige les plages Globex si besoin (heure de New York, ex. 00:00-13:15,18:00-24:00 ; vide = fermé toute la journée), puis confirme : la mention « à confirmer » disparaît des pages Sessions et Calendrier.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
                <th style={{ fontWeight: 500, padding: '6px 0' }}>Date</th><th style={{ fontWeight: 500 }}>Jour</th><th style={{ fontWeight: 500 }}>Plages Globex (New York)</th><th style={{ fontWeight: 500 }}>Statut</th><th />
              </tr>
            </thead>
            <tbody>
              {holidays.map(h => {
                const confirmed = h.confirmation?.cme_confirmed === true
                return (
                  <tr key={h.date} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ ...mono, padding: '8px 0' }}>{formatDateKey(h.date, { year: true })}</td>
                    <td style={{ color: 'var(--color-text-1)' }}>{h.name}</td>
                    <td>
                      <input aria-label={`Plages Globex du ${h.date}`} style={{ ...field, ...mono, width: 220 }} value={ranges[h.date] ?? ''} onChange={e => setRanges(r => ({ ...r, [h.date]: e.target.value }))} />
                    </td>
                    <td>{confirmed ? <Badge tone="profit" size="sm">Confirmé</Badge> : <Badge tone="warn" size="sm">À confirmer</Badge>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="sm" disabled={busy} onClick={() => send('POST', { action: 'confirm_holiday', confirmation: { date: h.date, cmeConfirmed: true, globexRanges: ranges[h.date] ?? '' } })}>
                        {confirmed ? 'Mettre à jour' : 'Confirmer'}
                      </Button>
                      {confirmed && (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => send('POST', { action: 'confirm_holiday', confirmation: { date: h.date, cmeConfirmed: false } })}>Annuler</Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
