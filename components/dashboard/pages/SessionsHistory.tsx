'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TraderAccount } from '@/lib/types'
import CsvSessionImport from '@/components/dashboard/CsvSessionImport'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, toneForRate, TONE_COLOR_VAR } from '@/lib/format'

interface SessionRow {
  id: string
  session_date: string
  pnl: number
  result: 'win' | 'loss' | 'breakeven' | null
  trades_count: number
  instrument: string | null
  setup: string | null
  notes: string | null
}

function parseSetup(setup: string | null) {
  if (!setup) return null
  try { return JSON.parse(setup) } catch { return null }
}

const INSTRUMENTS = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ']
const SESSION_TYPES = ['Live', 'Paper', 'Backtest']
const MOODS = ['😴', '😬', '😐', '😌', '🎯', '🔥']

export default function SessionsHistory() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSession, setEditingSession] = useState<SessionRow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showCsvImport, setShowCsvImport] = useState(false)

  // Filtres (nouvelle fonctionnalité — anticipe EmptyState paramétré)
  type PeriodFilter = 'all' | '7' | '30' | '90' | 'year'
  type ResultFilter = 'all' | 'win' | 'loss' | 'breakeven'
  const [filterInstrument, setFilterInstrument] = useState<string>('all')
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterResult, setFilterResult] = useState<ResultFilter>('all')
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('all')

  // Edit form state
  const [editDate, setEditDate] = useState('')
  const [editInstrument, setEditInstrument] = useState('ES')
  const [editPnl, setEditPnl] = useState(0)
  const [editTradesCount, setEditTradesCount] = useState(0)
  const [editRValue, setEditRValue] = useState(0)
  const [editWinRate, setEditWinRate] = useState(0)
  const [editMaxDrawdown, setEditMaxDrawdown] = useState(0)
  const [editPlanScore, setEditPlanScore] = useState(5)
  const [editMood, setEditMood] = useState('')
  const [editSessionType, setEditSessionType] = useState('Live')
  const [editTechnical, setEditTechnical] = useState('')
  const [editPsychological, setEditPsychological] = useState('')
  const [editImprovement, setEditImprovement] = useState('')
  const [editGlobalRating, setEditGlobalRating] = useState(0)
  const [editAccountIds, setEditAccountIds] = useState<string[]>([])

  // Accounts
  const [accounts, setAccounts] = useState<TraderAccount[]>([])

  const supabase = createClient()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: sessData }, { data: accData }] = await Promise.all([
      supabase.from('trading_sessions').select('*').eq('trader_id', user.id).order('session_date', { ascending: false }),
      supabase.from('trader_accounts').select('*').eq('trader_id', user.id).order('created_at', { ascending: true }),
    ])
    if (sessData) setSessions(sessData)
    if (accData) setAccounts(accData as TraderAccount[])
    setLoading(false)
  }

  useEffect(() => { fetchSessions() }, [])

  const openEdit = (s: SessionRow) => {
    const meta = parseSetup(s.setup)
    setEditingSession(s)
    setEditDate(s.session_date)
    setEditInstrument(s.instrument ?? 'ES')
    setEditPnl(s.pnl)
    setEditTradesCount(s.trades_count)
    setEditRValue(meta?.r_value ?? 0)
    setEditWinRate(meta?.win_rate ?? 0)
    setEditMaxDrawdown(meta?.max_drawdown ?? 0)
    setEditPlanScore(meta?.plan_score ?? 5)
    setEditMood(meta?.mood ?? '')
    setEditSessionType(meta?.session_type ?? 'Live')
    setEditTechnical(meta?.technical_analysis ?? '')
    setEditPsychological(meta?.psychological_analysis ?? '')
    setEditImprovement(meta?.improvement ?? '')
    setEditGlobalRating(meta?.global_rating ?? 0)
    setEditAccountIds(meta?.account_ids ?? [])
  }

  const handleSave = async () => {
    if (!editingSession) return
    setSaving(true)

    const result: 'win' | 'loss' | 'breakeven' = editPnl > 0 ? 'win' : editPnl < 0 ? 'loss' : 'breakeven'
    const extraData = {
      session_type: editSessionType,
      account_ids: editAccountIds,
      r_value: editRValue,
      win_rate: editWinRate,
      max_drawdown: editMaxDrawdown,
      plan_score: editPlanScore,
      mood: editMood,
      technical_analysis: editTechnical,
      psychological_analysis: editPsychological,
      improvement: editImprovement,
      global_rating: editGlobalRating,
    }

    const { error } = await supabase
      .from('trading_sessions')
      .update({
        session_date: editDate,
        instrument: editInstrument,
        pnl: editPnl,
        result,
        trades_count: editTradesCount,
        setup: JSON.stringify(extraData),
        notes: editTechnical || null,
      })
      .eq('id', editingSession.id)

    setSaving(false)
    if (error) {
      showToast('Erreur : ' + error.message)
    } else {
      showToast('Session mise à jour')
      setEditingSession(null)
      fetchSessions()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette session ?')) return
    setDeleting(id)
    const { error } = await supabase.from('trading_sessions').delete().eq('id', id)
    setDeleting(null)
    if (error) {
      showToast('Erreur : ' + error.message)
    } else {
      showToast('Session supprimée')
      fetchSessions()
    }
  }

  // Stats
  const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
  const wins = sessions.filter(s => s.result === 'win').length
  const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '13px',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text3)',
    marginBottom: '4px',
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-xl p-5 animate-pulse" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex gap-4">
              <div className="h-4 w-20 rounded" style={{ background: 'var(--bg3)' }} />
              <div className="h-4 w-12 rounded" style={{ background: 'var(--bg3)' }} />
              <div className="h-4 w-16 rounded" style={{ background: 'var(--bg3)' }} />
              <div className="h-4 w-24 rounded ml-auto" style={{ background: 'var(--bg3)' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Explanatory banner */}
      <div
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--color-profit)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          fontSize: '13px',
          lineHeight: '1.6',
          color: '#a0aec0',
        }}
      >
        📊 Historique de toutes tes sessions de trading enregistrées. Consulte, modifie ou supprime tes sessions passées pour suivre ta progression.
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px',
          background: toast.startsWith('Erreur') ? 'rgba(var(--color-loss-rgb), 0.9)' : 'rgba(var(--color-profit-rgb), 0.9)',
          color: '#fff', fontSize: '13px', fontWeight: 500,
          backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      <div className="mb-5">
        <PageHeader
          size="sm"
          title="Sessions de trading"
          subtitle={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
          actions={<>
            <KpiCard
              variant="compact"
              label="P&L Total"
              value={fmtUsd(totalPnl, 2, { sign: true })}
              tone={toneForPnl(totalPnl)}
            />
            <KpiCard
              variant="compact"
              label="Win Rate"
              value={fmtPct(winRate, 0)}
              tone={toneForRate(winRate, 50)}
            />
            <button
              onClick={() => setShowCsvImport(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
              style={{ background: 'var(--green)', color: '#000' }}
              title="Importer un historique de trades depuis un CSV broker"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Importer CSV
            </button>
          </>}
        />
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvSessionImport
          existingDates={sessions.map(s => s.session_date)}
          onClose={() => setShowCsvImport(false)}
          onImported={() => {
            setShowCsvImport(false)
            fetchSessions()
            showToast('Sessions importées avec succès')
          }}
        />
      )}

      {(() => {
        // ── Filtres (nouvelle fonctionnalité) ────────────────────────────
        const instrumentsInData = Array.from(new Set(sessions.map(s => s.instrument).filter((v): v is string => !!v)))
        const filtered = sessions.filter(s => {
          if (filterInstrument !== 'all' && s.instrument !== filterInstrument) return false
          if (filterResult !== 'all' && s.result !== filterResult) return false
          if (filterAccount !== 'all') {
            const meta = parseSetup(s.setup)
            const ids: string[] = meta?.account_ids ?? []
            if (!ids.includes(filterAccount)) return false
          }
          if (filterPeriod !== 'all') {
            const days = { '7': 7, '30': 30, '90': 90, year: 365 }[filterPeriod]
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
            if (new Date(s.session_date + 'T00:00:00') < cutoff) return false
          }
          return true
        })
        const anyFilterActive = filterInstrument !== 'all' || filterAccount !== 'all' || filterResult !== 'all' || filterPeriod !== 'all'
        const resetFilters = () => { setFilterInstrument('all'); setFilterAccount('all'); setFilterResult('all'); setFilterPeriod('all') }

        // ── Colonnes DataTable ───────────────────────────────────────────
        const columns: Column<SessionRow>[] = [
          {
            id: 'date', header: 'Date', sortable: true,
            sortValue: s => s.session_date,
            accessor: s => (
              <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-2)' }}>
                {new Date(s.session_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>
            ),
          },
          {
            id: 'type', header: 'Type',
            accessor: s => {
              const t = parseSetup(s.setup)?.session_type ?? 'Live'
              return <SmallBadge>{t}</SmallBadge>
            },
          },
          {
            id: 'instrument', header: 'Inst.', sortable: true,
            sortValue: s => s.instrument ?? '',
            accessor: s => <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-2)' }}>{s.instrument ?? '—'}</span>,
          },
          {
            id: 'trades', header: 'Trades', numeric: true, sortable: true,
            sortValue: s => s.trades_count,
            accessor: s => s.trades_count,
          },
          {
            id: 'pnl', header: 'P&L', numeric: true, sortable: true,
            sortValue: s => Number(s.pnl),
            accessor: s => {
              const pnl = Number(s.pnl)
              return (
                <span style={{ color: TONE_COLOR_VAR[toneForPnl(pnl)], fontWeight: 600 }}>
                  {fmtUsd(pnl, 2, { sign: true })}
                </span>
              )
            },
          },
          {
            id: 'r', header: 'R', numeric: true, sortable: true,
            sortValue: s => Number(parseSetup(s.setup)?.r_value ?? 0),
            accessor: s => {
              const rVal = parseSetup(s.setup)?.r_value
              if (rVal == null) return <span style={{ color: 'var(--color-text-3)' }}>—</span>
              return (
                <span style={{ color: TONE_COLOR_VAR[toneForPnl(Number(rVal))] }}>
                  {fmtNumber(Number(rVal), 1, { sign: true })}R
                </span>
              )
            },
          },
          {
            id: 'winrate', header: 'Win%', numeric: true,
            accessor: s => {
              const meta = parseSetup(s.setup)
              const wr = meta?.win_rate != null ? Number(meta.win_rate) : (s.result === 'win' ? 100 : s.result === 'loss' ? 0 : null)
              if (wr == null) return <span style={{ color: 'var(--color-text-3)' }}>—</span>
              return <span style={{ color: TONE_COLOR_VAR[toneForRate(wr, 50)] }}>{fmtPct(wr, 0)}</span>
            },
          },
          {
            id: 'plan', header: 'Plan', align: 'center',
            accessor: s => {
              const p = parseSetup(s.setup)?.plan_score
              if (p == null) return <span style={{ color: 'var(--color-text-3)' }}>—</span>
              const tone = p >= 8 ? 'profit' : p >= 5 ? 'warn' : 'loss'
              return (
                <span
                  className="text-xs"
                  style={{
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    background: `rgba(var(--color-${tone === 'profit' ? 'profit' : tone === 'warn' ? 'warn' : 'loss'}-rgb), 0.15)`,
                    color: TONE_COLOR_VAR[tone],
                    fontFamily: 'var(--font-data)',
                  }}
                >
                  {p}/10
                </span>
              )
            },
          },
          {
            id: 'mood', header: 'Humeur', align: 'center',
            accessor: s => <span className="text-base">{parseSetup(s.setup)?.mood || '—'}</span>,
          },
          {
            id: 'actions', header: '', align: 'right',
            accessor: s => (
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={e => { e.stopPropagation(); openEdit(s) }}
                  className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)]"
                  title="Modifier"
                >
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--color-text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                  disabled={deleting === s.id}
                  className="p-1.5 rounded-lg transition-all hover:bg-[rgba(var(--color-loss-rgb),0.1)]"
                  title="Supprimer"
                  style={{ opacity: deleting === s.id ? 0.5 : 1 }}
                >
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--color-loss)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ),
          },
        ]

        // ── EmptyState paramétré selon le contexte ────────────────────────
        const emptyNode = anyFilterActive ? (
          <EmptyState
            title="Aucune session ne correspond à ces filtres"
            description="Ajuste les filtres ci-dessus ou réinitialise-les pour voir toutes tes sessions."
            action={<Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>}
          />
        ) : (
          <EmptyState
            title="Aucune session enregistrée"
            description="Ta première session apparaîtra ici dès que tu l'auras créée. Tu peux aussi importer un historique CSV via le bouton en haut à droite."
          />
        )

        return (
          <div className="space-y-4">
            {/* Filter bar */}
            <div
              className="flex items-center gap-2 flex-wrap p-3 rounded-xl border"
              style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border-subtle)' }}
            >
              <FilterGroup label="Instrument">
                <FilterSelect value={filterInstrument} onChange={setFilterInstrument} options={[
                  { value: 'all', label: 'Tous' },
                  ...instrumentsInData.map(i => ({ value: i, label: i })),
                ]} />
              </FilterGroup>

              {accounts.length > 0 && (
                <FilterGroup label="Compte">
                  <FilterSelect value={filterAccount} onChange={setFilterAccount} options={[
                    { value: 'all', label: 'Tous' },
                    ...accounts.map(a => ({ value: a.id, label: a.label || `${a.propfirm_name} ${Number(a.capital).toLocaleString('fr-FR')}$` })),
                  ]} />
                </FilterGroup>
              )}

              <FilterGroup label="Résultat">
                <FilterSelect
                  value={filterResult}
                  onChange={v => setFilterResult(v as ResultFilter)}
                  options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'win', label: 'Gagnées' },
                    { value: 'loss', label: 'Perdues' },
                    { value: 'breakeven', label: 'Nulles' },
                  ]}
                />
              </FilterGroup>

              <FilterGroup label="Période">
                <FilterSelect
                  value={filterPeriod}
                  onChange={v => setFilterPeriod(v as PeriodFilter)}
                  options={[
                    { value: 'all', label: 'Tout' },
                    { value: '7', label: '7 jours' },
                    { value: '30', label: '30 jours' },
                    { value: '90', label: '3 mois' },
                    { value: 'year', label: 'Année' },
                  ]}
                />
              </FilterGroup>

              <div className="ml-auto flex items-center gap-2">
                {anyFilterActive && (
                  <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>
                    {filtered.length} / {sessions.length}
                  </span>
                )}
                {anyFilterActive && (
                  <button
                    onClick={resetFilters}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: 'transparent', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-3)', cursor: 'pointer' }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            {/* Data table */}
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={s => s.id}
              defaultSort={{ columnId: 'date', dir: 'desc' }}
              empty={emptyNode}
            />
          </div>
        )
      })()}

      {/* Edit Modal */}
      <Modal
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        title={editingSession ? `Modifier la session du ${new Date(editingSession.session_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
        size="lg"
        dismissible={!saving}
      >
        {editingSession && (
          <>
            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              {/* Row 1: Date + Type + Instrument */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={editSessionType} onChange={e => setEditSessionType(e.target.value)} style={inputStyle}>
                    {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Instrument</label>
                  <select value={editInstrument} onChange={e => setEditInstrument(e.target.value)} style={inputStyle}>
                    {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              {/* Accounts */}
              {accounts.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Comptes tradés</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {accounts.map(acc => {
                      const selected = editAccountIds.includes(acc.id)
                      const typeColor = acc.account_type === 'funded' ? 'var(--color-profit)' : acc.account_type === 'challenge' ? '#60a5fa' : 'var(--color-warn)'
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setEditAccountIds(prev => selected ? prev.filter(id => id !== acc.id) : [...prev, acc.id])}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            background: selected ? `${typeColor}15` : 'var(--bg3)',
                            border: `2px solid ${selected ? typeColor : 'rgba(255,255,255,0.08)'}`,
                            color: selected ? typeColor : 'var(--text3)',
                          }}
                        >
                          {acc.label || `${acc.propfirm_name} ${Number(acc.capital).toLocaleString()}$`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Row 2: Trades, P&L, R, Win Rate */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label style={labelStyle}>Trades</label>
                  <input type="number" min={0} value={editTradesCount} onChange={e => setEditTradesCount(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>P&L ($)</label>
                  <input type="number" value={editPnl} onChange={e => setEditPnl(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>R obtenu</label>
                  <input type="number" step={0.1} value={editRValue} onChange={e => setEditRValue(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Win Rate (%)</label>
                  <input type="number" min={0} max={100} value={editWinRate} onChange={e => setEditWinRate(Number(e.target.value))} style={inputStyle} />
                </div>
              </div>

              {/* Row 3: Max DD + Plan Score */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Max Drawdown ($)</label>
                  <input type="number" value={editMaxDrawdown} onChange={e => setEditMaxDrawdown(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Respect du plan ATP : {editPlanScore}/10</label>
                  <input
                    type="range" min={0} max={10} value={editPlanScore}
                    onChange={e => setEditPlanScore(Number(e.target.value))}
                    style={{ width: '100%', accentColor: editPlanScore >= 8 ? 'var(--color-profit)' : editPlanScore >= 5 ? 'var(--color-warn)' : 'var(--color-loss)', marginTop: 4 }}
                  />
                </div>
              </div>

              {/* Mood */}
              <div>
                <label style={labelStyle}>Humeur</label>
                <div className="flex gap-2">
                  {MOODS.map(m => (
                    <button
                      key={m}
                      onClick={() => setEditMood(m)}
                      className="flex-1 py-2 rounded-lg text-lg transition-all"
                      style={{
                        border: editMood === m ? '2px solid var(--color-profit)' : '1px solid var(--border)',
                        background: editMood === m ? 'rgba(var(--color-profit-rgb), 0.1)' : 'var(--bg3)',
                        transform: editMood === m ? 'scale(1.05)' : 'scale(1)',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Analyse technique</label>
                <textarea
                  value={editTechnical} onChange={e => setEditTechnical(e.target.value)}
                  rows={2} className="w-full rounded-lg text-xs outline-none resize-none"
                  style={{ ...inputStyle, minHeight: 60 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Analyse psychologique</label>
                <textarea
                  value={editPsychological} onChange={e => setEditPsychological(e.target.value)}
                  rows={2} className="w-full rounded-lg text-xs outline-none resize-none"
                  style={{ ...inputStyle, minHeight: 60 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Point d&apos;amélioration</label>
                <textarea
                  value={editImprovement} onChange={e => setEditImprovement(e.target.value)}
                  rows={2} className="w-full rounded-lg text-xs outline-none resize-none"
                  style={{ ...inputStyle, minHeight: 50 }}
                />
              </div>

              {/* Star rating */}
              <div>
                <label style={labelStyle}>Note globale</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setEditGlobalRating(star)}
                      style={{
                        fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        color: star <= editGlobalRating ? 'var(--color-warn)' : '#374151',
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setEditingSession(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--text3)', border: '1px solid var(--border)' }}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--green)', color: 'var(--color-surface-0)' }}
              >
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Local sub-components (SmallBadge, FilterGroup, FilterSelect)
// ═══════════════════════════════════════════════════════════════
// Ces 3 mini-composants sont locaux à SessionsHistory pour cette étape.
// Ils deviendront des primitives partagées si le pattern se répète (badges
// de statut et filter bar seront candidats à l'étape 5).

function SmallBadge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-text-3)',
        fontSize: 11,
        fontFamily: 'var(--font-data)',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-xs"
        style={{
          fontFamily: 'var(--font-data)',
          color: 'var(--color-text-3)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterSelect({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-xs px-2 py-1 rounded-md outline-none"
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
        color: 'var(--color-text-1)',
        cursor: 'pointer',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
