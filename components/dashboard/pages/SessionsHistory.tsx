'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

  const supabase = createClient()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('trading_sessions')
      .select('*')
      .eq('trader_id', user.id)
      .order('session_date', { ascending: false })
    if (data) setSessions(data)
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
  }

  const handleSave = async () => {
    if (!editingSession) return
    setSaving(true)

    const result: 'win' | 'loss' | 'breakeven' = editPnl > 0 ? 'win' : editPnl < 0 ? 'loss' : 'breakeven'
    const extraData = {
      session_type: editSessionType,
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
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px',
          background: toast.startsWith('Erreur') ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)',
          color: '#fff', fontSize: '13px', fontWeight: 500,
          backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {/* Header stats */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Sessions de trading</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text3)' }}>P&L Total</p>
            <p className="text-sm font-bold font-mono" style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} $
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text3)' }}>Win Rate</p>
            <p className="text-sm font-bold font-mono" style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>
              {winRate}%
            </p>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Aucune session enregistrée.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Type', 'Inst.', 'Trades', 'P&L', 'R', 'Win%', 'Plan', 'Humeur', 'Actions'].map(h => (
                  <th
                    key={h}
                    className={`text-xs font-medium uppercase tracking-wider px-4 py-3 ${h === 'Actions' ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--text3)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const meta = parseSetup(s.setup)
                const pnl = Number(s.pnl)
                const rVal = meta?.r_value
                const planScore = meta?.plan_score
                return (
                  <tr
                    key={s.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text2)' }}>
                      {new Date(s.session_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                        {meta?.session_type ?? 'Live'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text2)' }}>
                      {s.instrument ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text2)' }}>
                      {s.trades_count}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-semibold" style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} $
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: rVal != null ? (rVal >= 0 ? '#22c55e' : '#ef4444') : 'var(--text3)' }}>
                      {rVal != null ? `${rVal >= 0 ? '+' : ''}${Number(rVal).toFixed(1)}R` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text2)' }}>
                      {meta?.win_rate != null ? `${meta.win_rate}%` : (s.result === 'win' ? '100%' : s.result === 'loss' ? '0%' : '—')}
                    </td>
                    <td className="px-4 py-3">
                      {planScore != null ? (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{
                          background: planScore >= 8 ? 'rgba(34,197,94,0.15)' : planScore >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.15)',
                          color: planScore >= 8 ? '#22c55e' : planScore >= 5 ? '#f59e0b' : '#ef4444',
                        }}>
                          {planScore}/10
                        </span>
                      ) : <span className="text-xs" style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {meta?.mood || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)]"
                          title="Modifier"
                        >
                          <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={deleting === s.id}
                          className="p-1.5 rounded-lg transition-all hover:bg-[rgba(239,68,68,0.1)]"
                          title="Supprimer"
                          style={{ opacity: deleting === s.id ? 0.5 : 1 }}
                        >
                          <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => e.target === e.currentTarget && setEditingSession(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border flex flex-col"
            style={{ background: 'var(--bg2)', borderColor: 'var(--border)', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Modifier la session du {new Date(editingSession.session_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button
                onClick={() => setEditingSession(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: 'var(--text3)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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
                    style={{ width: '100%', accentColor: editPlanScore >= 8 ? '#22c55e' : editPlanScore >= 5 ? '#f59e0b' : '#ef4444', marginTop: 4 }}
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
                        border: editMood === m ? '2px solid #22c55e' : '1px solid var(--border)',
                        background: editMood === m ? 'rgba(34,197,94,0.1)' : 'var(--bg3)',
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
                        color: star <= editGlobalRating ? '#f59e0b' : '#374151',
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
                style={{ background: 'var(--green)', color: '#09090b' }}
              >
                {saving ? 'Enregistrement...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
