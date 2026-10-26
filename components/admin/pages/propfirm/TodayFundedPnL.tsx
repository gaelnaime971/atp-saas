'use client'

/**
 * Trading perso — saisie quotidienne du P&L pour les comptes financés.
 *
 * Affichée en tête de l'onglet Business Plan. Permet de remplir d'un
 * coup la perf du jour sur tous les comptes funded : chaque ligne a un
 * champ € + nombre de trades + note courte. Pré-rempli depuis
 * propfirm_daily_pnl si une entrée existe déjà à cette date. À la
 * sauvegarde, chaque compte dont la valeur a changé est UPSERT, puis
 * son current_balance est recalculé par le parent (recomputeBalance
 * déjà en place dans TradingPerso).
 */

import { useEffect, useMemo, useState } from 'react'

interface PropAccount {
  id: string
  label: string
  propfirm: string
  account_size: number
  current_balance: number
  starting_balance: number
}

interface DailyPnL {
  id: string
  account_id: string
  date: string
  pnl: number
  trades_count: number | null
  notes: string | null
}

interface Props {
  accounts: PropAccount[]
  pnls: DailyPnL[]
  onSave(updates: Array<{
    accountId: string
    date: string
    pnl: number
    tradesCount?: number
    notes?: string
  }>): Promise<void>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

const fmtEur = (n: number): string => {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.round(n))
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '')
  return `${sign}${abs.toLocaleString('fr-FR')} €`
}

function parseFrNumber(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s.replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const input: React.CSSProperties = {
  height: 36, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit',
}
const monoInput: React.CSSProperties = {
  ...input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  textAlign: 'right',
}

// ─── Composant ──────────────────────────────────────────────────────────────

interface Draft {
  pnlInput: string
  tradesInput: string
  notesInput: string
}

export default function TodayFundedPnL({ accounts, pnls, onSave }: Props) {
  const [date, setDate] = useState<string>(todayISO())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  // Hydrate l'état depuis les P&L existants chaque fois que la date
  // change ou que les pnls arrivent.
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const a of accounts) {
      const existing = pnls.find(p => p.account_id === a.id && p.date === date)
      next[a.id] = {
        pnlInput: existing ? String(existing.pnl).replace('.', ',') : '',
        tradesInput: existing?.trades_count != null ? String(existing.trades_count) : '',
        notesInput: existing?.notes ?? '',
      }
    }
    setDrafts(next)
  }, [accounts, pnls, date])

  // Agrégats affichés en live
  const total = useMemo(() => {
    let sum = 0
    for (const a of accounts) {
      const d = drafts[a.id]
      if (!d) continue
      const n = parseFrNumber(d.pnlInput)
      if (n != null) sum += n
    }
    return sum
  }, [drafts, accounts])

  const touchedCount = useMemo(() => {
    let n = 0
    for (const a of accounts) {
      const d = drafts[a.id]
      if (!d) continue
      const existing = pnls.find(p => p.account_id === a.id && p.date === date)
      const parsed = parseFrNumber(d.pnlInput)
      const existingVal = existing ? Number(existing.pnl) : null
      if (parsed == null && existingVal == null) continue
      if (parsed !== existingVal) n += 1
      else if (d.tradesInput !== (existing?.trades_count != null ? String(existing.trades_count) : '')) n += 1
      else if (d.notesInput !== (existing?.notes ?? '')) n += 1
    }
    return n
  }, [drafts, accounts, pnls, date])

  function patch(accountId: string, p: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [accountId]: { ...prev[accountId], ...p } }))
  }

  async function save() {
    if (saving) return
    const updates: Array<{ accountId: string; date: string; pnl: number; tradesCount?: number; notes?: string }> = []
    for (const a of accounts) {
      const d = drafts[a.id]
      if (!d) continue
      const pnl = parseFrNumber(d.pnlInput)
      if (pnl == null) continue
      const trades = parseFrNumber(d.tradesInput)
      updates.push({
        accountId: a.id, date, pnl,
        tradesCount: trades != null ? Math.round(trades) : undefined,
        notes: d.notesInput.trim() || undefined,
      })
    }
    if (updates.length === 0) {
      setToast('Rien à enregistrer — remplis au moins un P&L.')
      setTimeout(() => setToast(null), 2500)
      return
    }
    setSaving(true)
    try {
      await onSave(updates)
      setToast(`✓ ${updates.length} compte${updates.length > 1 ? 's' : ''} mis à jour.`)
      setTimeout(() => setToast(null), 2500)
    } catch (e) {
      setToast('Erreur à l\'enregistrement — réessaie.')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (accounts.length === 0) return null

  const totalColor = total > 0 ? '#22c55e' : total < 0 ? '#ef4444' : 'var(--text3)'

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(34,197,94,0.04) 100%)',
      border: '1px solid var(--border)', borderRadius: 12, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              P&L du jour · comptes financés
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Remplis ta perf du jour, les soldes se mettent à jour automatiquement
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...input, width: 150 }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>
            Total : <span style={{ color: totalColor, fontFamily: 'ui-monospace', fontSize: 14, fontWeight: 800 }}>{fmtEur(total)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Compte</th>
              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>P&L (€)</th>
              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Trades</th>
              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Note</th>
              <th style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Solde après</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => {
              const d = drafts[a.id] ?? { pnlInput: '', tradesInput: '', notesInput: '' }
              const existing = pnls.find(p => p.account_id === a.id && p.date === date)
              const parsed = parseFrNumber(d.pnlInput)
              const existingVal = existing ? Number(existing.pnl) : 0
              const delta = parsed != null ? parsed - existingVal : 0
              // Solde après = solde actuel + delta (si pnl modifié)
              const projectedBalance = Number(a.current_balance) + delta
              const projectedColor = parsed != null
                ? (parsed > 0 ? '#22c55e' : parsed < 0 ? '#ef4444' : 'var(--text3)')
                : 'var(--text3)'
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                      {a.propfirm} · {Math.round(Number(a.account_size)).toLocaleString('fr-FR')} €
                    </div>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <input type="text" inputMode="decimal"
                      value={d.pnlInput}
                      onChange={e => patch(a.id, { pnlInput: e.target.value })}
                      placeholder="0"
                      style={{
                        ...monoInput, width: 110,
                        color: projectedColor, fontWeight: 700,
                        borderColor: parsed != null && parsed !== 0 ? projectedColor : 'var(--border)',
                      }} />
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <input type="text" inputMode="numeric"
                      value={d.tradesInput}
                      onChange={e => patch(a.id, { tradesInput: e.target.value })}
                      placeholder="—"
                      style={{ ...monoInput, width: 60 }} />
                  </td>
                  <td style={{ padding: '10px' }}>
                    <input type="text"
                      value={d.notesInput}
                      onChange={e => patch(a.id, { notesInput: e.target.value })}
                      placeholder="Note courte…"
                      style={{ ...input, width: '100%', minWidth: 140 }} />
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13, fontWeight: 700, color: parsed != null ? projectedColor : 'var(--text3)' }}>
                    {Math.round(projectedBalance).toLocaleString('fr-FR')} €
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer : save + toast */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          {touchedCount > 0
            ? `${touchedCount} ligne${touchedCount > 1 ? 's' : ''} modifiée${touchedCount > 1 ? 's' : ''}`
            : 'Aucune modification'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {toast && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: toast.startsWith('✓') ? '#22c55e' : '#f59e0b',
            }}>{toast}</span>
          )}
          <button type="button" onClick={save} disabled={saving || touchedCount === 0}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
              background: touchedCount === 0 ? 'var(--bg3)' : 'var(--color-accent)',
              color: touchedCount === 0 ? 'var(--text3)' : '#09090b',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              cursor: saving || touchedCount === 0 ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la journée'}
          </button>
        </div>
      </div>
    </div>
  )
}
