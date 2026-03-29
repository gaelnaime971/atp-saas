'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'

interface TraderProfileModalProps {
  trader: Profile | null
  onClose: () => void
}

interface SessionRow {
  id: string
  session_date: string
  pnl: number
  result: string | null
  trades_count: number
  instrument: string | null
  setup: string | null
}

interface JournalRow {
  id: string
  entry_date: string
  content: string | null
  mood: string | null
}

interface CoachingRow {
  id: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string | null
}

interface ObjectiveRow {
  id: string
  title: string
  progress: number
}

interface PayoutRow {
  id: string
  amount: number
  payout_date: string
  propfirm_name: string | null
  account_label: string | null
  notes: string | null
}

interface AccountRow {
  id: string
  label: string
  propfirm_name: string | null
  capital: number
  initial_balance: number
  account_type: string
  created_at: string
}

function parseSetup(setup: string | null | undefined) {
  if (!setup) return null
  try { return JSON.parse(setup) } catch { return null }
}

export default function TraderProfileModal({ trader, onClose }: TraderProfileModalProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [journal, setJournal] = useState<JournalRow[]>([])
  const [coaching, setCoaching] = useState<CoachingRow[]>([])
  const [objectives, setObjectives] = useState<ObjectiveRow[]>([])
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [privateNote, setPrivateNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'sessions' | 'journal' | 'coaching' | 'accounts' | 'notes'>('overview')
  const supabase = createClient()

  useEffect(() => {
    if (!trader) return
    async function fetchAll() {
      setLoading(true)
      const [sessRes, journalRes, coachRes, objRes, payRes, accRes] = await Promise.all([
        supabase.from('trading_sessions').select('*').eq('trader_id', trader!.id).order('session_date', { ascending: false }),
        supabase.from('journal_entries').select('*').eq('trader_id', trader!.id).order('entry_date', { ascending: false }).limit(20),
        supabase.from('coaching_sessions').select('*').eq('trader_id', trader!.id).order('scheduled_at', { ascending: false }),
        supabase.from('objectives').select('*').eq('trader_id', trader!.id),
        supabase.from('payouts').select('*').eq('trader_id', trader!.id).order('payout_date', { ascending: false }),
        supabase.from('trader_accounts').select('*').eq('trader_id', trader!.id).order('created_at', { ascending: true }),
      ])
      setSessions((sessRes.data ?? []) as SessionRow[])
      setJournal((journalRes.data ?? []) as JournalRow[])
      setCoaching((coachRes.data ?? []) as CoachingRow[])
      setObjectives((objRes.data ?? []) as ObjectiveRow[])
      setPayouts((payRes.data ?? []) as PayoutRow[])
      setAccounts((accRes.data ?? []) as AccountRow[])
      // Load private note from localStorage
      const storedNote = localStorage.getItem(`admin_note_${trader!.id}`)
      if (storedNote) setPrivateNote(storedNote)
      setLoading(false)
    }
    fetchAll()
  }, [trader])

  if (!trader) return null

  // Computed stats
  const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
  const wins = sessions.filter(s => s.result === 'win').length
  const losses = sessions.filter(s => s.result === 'loss').length
  const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
  const grossProfit = sessions.filter(s => Number(s.pnl) > 0).reduce((s, x) => s + Number(x.pnl), 0)
  const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((s, x) => s + Number(x.pnl), 0))
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 0
  const bestSession = sessions.length > 0 ? Math.max(...sessions.map(s => Number(s.pnl))) : 0
  const worstSession = sessions.length > 0 ? Math.min(...sessions.map(s => Number(s.pnl))) : 0
  const avgPlanScore = (() => {
    const scores = sessions.map(s => parseSetup(s.setup)?.plan_score).filter((v: any) => v != null) as number[]
    return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null
  })()
  const totalPayouts = payouts.reduce((s, p) => s + Number(p.amount), 0)
  const avgRValue = (() => {
    const rValues = sessions.map(s => parseSetup(s.setup)?.r_value).filter((v: any) => v != null) as number[]
    return rValues.length > 0 ? (rValues.reduce((a, b) => a + b, 0) / rValues.length) : null
  })()

  async function savePrivateNote() {
    setSavingNote(true)
    localStorage.setItem(`admin_note_${trader!.id}`, privateNote)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
    setSavingNote(false)
  }

  const tabs = [
    { id: 'overview' as const, label: 'Vue globale' },
    { id: 'accounts' as const, label: `Comptes (${accounts.length})` },
    { id: 'sessions' as const, label: `Sessions (${sessions.length})` },
    { id: 'journal' as const, label: `Journal (${journal.length})` },
    { id: 'coaching' as const, label: `Coaching (${coaching.length})` },
    { id: 'notes' as const, label: 'Notes privées' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-4xl rounded-xl border flex flex-col"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              {trader.full_name?.charAt(0).toUpperCase() ?? 'T'}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{trader.full_name ?? 'Trader'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs" style={{ color: 'var(--text3)' }}>{trader.email}</span>
                {trader.plan_type && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    {trader.plan_type}
                  </span>
                )}
                {trader.propfirm_name && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                    {trader.propfirm_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--text3)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 pb-0 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: tab === t.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: tab === t.id ? '#22c55e' : 'var(--text3)',
                border: tab === t.id ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === 'overview' && (
                <div className="space-y-4">
                  {/* KPI Grid */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'P&L Total', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)} $`, color: totalPnl >= 0 ? '#22c55e' : '#ef4444' },
                      { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? '#22c55e' : '#ef4444' },
                      { label: 'Profit Factor', value: profitFactor > 0 ? profitFactor.toFixed(2) : '—', color: profitFactor >= 1.5 ? '#22c55e' : profitFactor >= 1 ? '#f59e0b' : '#ef4444' },
                      { label: 'Sessions', value: sessions.length.toString(), color: 'var(--text)' },
                    ].map(kpi => (
                      <div key={kpi.label} className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{kpi.label}</p>
                        <p className="text-lg font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Meilleure session', value: `+${bestSession.toFixed(0)} $`, color: '#22c55e' },
                      { label: 'Pire session', value: `${worstSession.toFixed(0)} $`, color: '#ef4444' },
                      { label: 'R moyen', value: avgRValue != null ? `${avgRValue >= 0 ? '+' : ''}${avgRValue.toFixed(1)}R` : '—', color: (avgRValue ?? 0) >= 0 ? '#22c55e' : '#ef4444' },
                      { label: 'Plan ATP moy.', value: avgPlanScore != null ? `${avgPlanScore.toFixed(1)}/10` : '—', color: (avgPlanScore ?? 0) >= 8 ? '#22c55e' : (avgPlanScore ?? 0) >= 5 ? '#f59e0b' : '#ef4444' },
                    ].map(kpi => (
                      <div key={kpi.label} className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{kpi.label}</p>
                        <p className="text-lg font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Win/Loss breakdown */}
                  <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>Répartition</p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
                        {sessions.length > 0 && (
                          <div className="h-full rounded-full" style={{
                            width: `${winRate}%`,
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                          }} />
                        )}
                      </div>
                      <div className="flex gap-4 text-xs font-mono shrink-0">
                        <span style={{ color: '#22c55e' }}>{wins}W</span>
                        <span style={{ color: '#ef4444' }}>{losses}L</span>
                        <span style={{ color: '#f59e0b' }}>{sessions.length - wins - losses}BE</span>
                      </div>
                    </div>
                  </div>

                  {/* Objectives */}
                  {objectives.length > 0 && (
                    <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <p className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>Objectifs</p>
                      <div className="space-y-3">
                        {objectives.map(obj => (
                          <div key={obj.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{obj.title}</span>
                              <span className="text-xs font-mono" style={{ color: obj.progress >= 100 ? '#22c55e' : 'var(--text3)' }}>{obj.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: 'var(--bg)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(obj.progress, 100)}%`, background: obj.progress >= 100 ? '#22c55e' : '#f59e0b' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent sessions preview */}
                  <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>5 dernières sessions</p>
                    {sessions.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>Aucune session</p>
                    ) : (
                      <div className="space-y-2">
                        {sessions.slice(0, 5).map(s => {
                          const meta = parseSetup(s.setup)
                          const pnl = Number(s.pnl)
                          return (
                            <div key={s.id} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                              <span className="text-xs font-mono w-16 shrink-0" style={{ color: 'var(--text3)' }}>
                                {new Date(s.session_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                              </span>
                              <span className="text-xs font-mono w-8 shrink-0" style={{ color: 'var(--text2)' }}>{s.instrument ?? '—'}</span>
                              <span className="text-xs font-mono font-semibold w-20 shrink-0" style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)} $
                              </span>
                              <span className="text-xs font-mono w-10 shrink-0" style={{ color: (meta?.r_value ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                                {meta?.r_value != null ? `${meta.r_value >= 0 ? '+' : ''}${meta.r_value}R` : '—'}
                              </span>
                              {meta?.plan_score != null && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                  background: meta.plan_score >= 8 ? 'rgba(34,197,94,0.15)' : meta.plan_score >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.15)',
                                  color: meta.plan_score >= 8 ? '#22c55e' : meta.plan_score >= 5 ? '#f59e0b' : '#ef4444',
                                }}>
                                  {meta.plan_score}/10
                                </span>
                              )}
                              {meta?.mood && <span className="text-sm">{meta.mood}</span>}
                              <span className="text-xs ml-auto" style={{ color: 'var(--text3)' }}>{meta?.session_type ?? s.result ?? '—'}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Payouts */}
                  {payouts.length > 0 && (
                    <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Payouts</p>
                        <span className="text-xs font-bold font-mono" style={{ color: '#22c55e' }}>
                          Total: +{totalPayouts.toLocaleString('fr-FR')} $
                        </span>
                      </div>
                      <div className="space-y-2">
                        {payouts.map(p => (
                          <div key={p.id} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                            <span className="text-xs font-mono w-16 shrink-0" style={{ color: 'var(--text3)' }}>
                              {new Date(p.payout_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            </span>
                            <span className="text-xs font-mono font-bold" style={{ color: '#22c55e' }}>
                              +{Number(p.amount).toLocaleString('fr-FR')} $
                            </span>
                            {p.propfirm_name && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg)', color: 'var(--text3)' }}>
                                {p.propfirm_name}
                              </span>
                            )}
                            {p.account_label && (
                              <span className="text-xs" style={{ color: 'var(--text3)' }}>{p.account_label}</span>
                            )}
                            {p.notes && (
                              <span className="text-xs ml-auto truncate" style={{ color: 'var(--text3)' }}>
                                {p.notes}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs" style={{ color: 'var(--text3)' }}>
                    Membre depuis le {new Date(trader.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}

              {/* ACCOUNTS TAB */}
              {tab === 'accounts' && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>Nb comptes</p>
                      <p className="text-lg font-bold font-mono" style={{ color: 'var(--text)' }}>{accounts.length}</p>
                    </div>
                    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>Capital total</p>
                      <p className="text-lg font-bold font-mono" style={{ color: 'var(--text)' }}>
                        {accounts.reduce((s, a) => s + Number(a.capital), 0).toLocaleString('fr-FR')} $
                      </p>
                    </div>
                    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>Balance totale</p>
                      <p className="text-lg font-bold font-mono" style={{ color: accounts.reduce((s, a) => s + Number(a.initial_balance), 0) >= accounts.reduce((s, a) => s + Number(a.capital), 0) ? '#22c55e' : '#ef4444' }}>
                        {accounts.reduce((s, a) => s + Number(a.initial_balance), 0).toLocaleString('fr-FR')} $
                      </p>
                    </div>
                  </div>

                  {accounts.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Aucun compte configuré par ce trader</p>
                  ) : (
                    <div className="space-y-3">
                      {accounts.map(acc => {
                        const pnl = Number(acc.initial_balance) - Number(acc.capital)
                        const pnlPct = Number(acc.capital) > 0 ? (pnl / Number(acc.capital)) * 100 : 0
                        const typeColor = acc.account_type === 'funded' ? '#22c55e' : acc.account_type === 'challenge' ? '#60a5fa' : '#f59e0b'
                        const typeLabel = acc.account_type === 'funded' ? 'Financé' : acc.account_type === 'challenge' ? 'Challenge' : 'Personnel'
                        return (
                          <div key={acc.id} className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)', borderLeft: `3px solid ${typeColor}` }}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                                  {acc.label || `Compte ${acc.propfirm_name}`}
                                </h4>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${typeColor}15`, color: typeColor }}>
                                  {typeLabel}
                                </span>
                              </div>
                              {acc.propfirm_name && (
                                <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--text3)' }}>
                                  {acc.propfirm_name}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Capital</p>
                                <p className="text-sm font-bold font-mono" style={{ color: 'var(--text)' }}>{Number(acc.capital).toLocaleString('fr-FR')} $</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Balance</p>
                                <p className="text-sm font-bold font-mono" style={{ color: Number(acc.initial_balance) >= Number(acc.capital) ? '#22c55e' : '#ef4444' }}>
                                  {Number(acc.initial_balance).toLocaleString('fr-FR')} $
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>P&L</p>
                                <p className="text-sm font-bold font-mono" style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                                  {pnl >= 0 ? '+' : ''}{pnl.toLocaleString('fr-FR')} $
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Perf %</p>
                                <p className="text-sm font-bold font-mono" style={{ color: pnlPct >= 0 ? '#22c55e' : '#ef4444' }}>
                                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SESSIONS TAB */}
              {tab === 'sessions' && (
                <div className="overflow-x-auto">
                  {sessions.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Aucune session</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Date', 'Inst.', 'Trades', 'P&L', 'R', 'Win%', 'Plan', 'Humeur', 'Type'].map(h => (
                            <th key={h} className="text-left font-medium uppercase tracking-wider pb-2 pr-3" style={{ color: 'var(--text3)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map(s => {
                          const meta = parseSetup(s.setup)
                          const pnl = Number(s.pnl)
                          const rVal = meta?.r_value ?? pnl / 25
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="py-2 pr-3 font-mono" style={{ color: 'var(--text2)' }}>
                                {new Date(s.session_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                              </td>
                              <td className="py-2 pr-3" style={{ color: 'var(--text2)' }}>{s.instrument ?? '—'}</td>
                              <td className="py-2 pr-3 font-mono" style={{ color: 'var(--text2)' }}>{s.trades_count}</td>
                              <td className="py-2 pr-3 font-mono font-semibold" style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)} $
                              </td>
                              <td className="py-2 pr-3 font-mono" style={{ color: rVal >= 0 ? '#22c55e' : '#ef4444' }}>
                                {rVal >= 0 ? '+' : ''}{Number(rVal).toFixed(1)}R
                              </td>
                              <td className="py-2 pr-3 font-mono" style={{ color: 'var(--text2)' }}>
                                {meta?.win_rate ?? (s.result === 'win' ? 100 : s.result === 'loss' ? 0 : 50)}%
                              </td>
                              <td className="py-2 pr-3">
                                {meta?.plan_score != null ? (
                                  <span className="px-1.5 py-0.5 rounded" style={{
                                    background: meta.plan_score >= 8 ? 'rgba(34,197,94,0.15)' : meta.plan_score >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.15)',
                                    color: meta.plan_score >= 8 ? '#22c55e' : meta.plan_score >= 5 ? '#f59e0b' : '#ef4444',
                                  }}>
                                    {meta.plan_score}/10
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="py-2 pr-3 text-sm">{meta?.mood ?? '—'}</td>
                              <td className="py-2" style={{ color: 'var(--text3)' }}>{meta?.session_type ?? s.result ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* JOURNAL TAB */}
              {tab === 'journal' && (
                <div className="space-y-3">
                  {journal.length === 0 ? (
                    <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Aucune entrée</p>
                  ) : (
                    journal.map(j => {
                      const content = j.content ?? ''
                      const catMatch = content.match(/^\[(\w+)\]\s*([\s\S]*)$/)
                      const category = catMatch ? catMatch[1] : 'Autre'
                      const text = catMatch ? catMatch[2] : content
                      const catColors: Record<string, string> = {
                        Technique: '#22c55e', Psychologie: '#f59e0b', Macro: '#60a5fa', Risk: '#ef4444', Autre: '#a0aec0',
                      }
                      return (
                        <div key={j.id} className="rounded-lg p-3 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)', borderLeft: `3px solid ${catColors[category] ?? '#a0aec0'}` }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
                              {new Date(j.entry_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: catColors[category] ?? 'var(--text3)' }}>
                              {category}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>{text}</p>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* COACHING TAB */}
              {tab === 'coaching' && (
                <div className="space-y-4">
                  {/* Objectives */}
                  {objectives.length > 0 && (
                    <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Objectifs</p>
                      <div className="space-y-3">
                        {objectives.map(obj => (
                          <div key={obj.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{obj.title}</span>
                              <span className="text-xs font-mono" style={{ color: obj.progress >= 100 ? '#22c55e' : 'var(--text3)' }}>{obj.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full" style={{ background: 'var(--bg)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(obj.progress, 100)}%`, background: obj.progress >= 100 ? '#22c55e' : '#f59e0b' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Coaching sessions */}
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Sessions de coaching</p>
                  {coaching.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text3)' }}>Aucune session de coaching</p>
                  ) : (
                    <div className="space-y-2">
                      {coaching.map(c => {
                        const statusColor = c.status === 'completed' ? '#22c55e' : c.status === 'cancelled' ? '#ef4444' : '#60a5fa'
                        return (
                          <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                            <div className="w-1 self-stretch rounded-full" style={{ background: statusColor }} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-mono" style={{ color: 'var(--text2)' }}>
                                  {new Date(c.scheduled_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
                                  {new Date(c.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text3)' }}>{c.duration_minutes} min</span>
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                  background: c.status === 'completed' ? 'rgba(34,197,94,0.1)' : c.status === 'cancelled' ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)',
                                  color: statusColor,
                                }}>
                                  {c.status === 'completed' ? 'Terminé' : c.status === 'cancelled' ? 'Annulé' : 'Planifié'}
                                </span>
                              </div>
                              {c.notes && <p className="text-xs" style={{ color: 'var(--text3)' }}>{c.notes}</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* NOTES TAB */}
              {tab === 'notes' && (
                <div className="space-y-4">
                  <div className="rounded-lg p-4 border" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Notes privées</p>
                      <span className="text-xs" style={{ color: 'var(--text3)' }}>Visible uniquement par vous</span>
                    </div>
                    <textarea
                      value={privateNote}
                      onChange={e => setPrivateNote(e.target.value)}
                      placeholder="Notes privées sur ce trader... (préparation coaching, points à aborder, observations...)"
                      style={{
                        width: '100%', minHeight: 200, padding: 12, background: 'var(--bg)',
                        border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)',
                        fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
                      }}
                    />
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={savePrivateNote}
                        disabled={savingNote}
                        className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: 'var(--green)', color: '#0f1117' }}
                      >
                        {savingNote ? 'Sauvegarde...' : 'Sauvegarder'}
                      </button>
                      {noteSaved && (
                        <span className="text-xs font-medium" style={{ color: '#22c55e' }}>Sauvegardé</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
