'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { TraderAccount, Payout } from '@/lib/types'

const PROP_FIRMS = ['FTMO', 'TopStep', 'Apex', 'E8', 'My Forex Funds', 'Capital Personnel', 'Autre'] as const
const ACCOUNT_TYPES: { id: TraderAccount['account_type']; label: string; color: string }[] = [
  { id: 'challenge', label: 'Challenge', color: '#60a5fa' },
  { id: 'funded', label: 'Financé', color: '#22c55e' },
  { id: 'personal', label: 'Personnel', color: '#f59e0b' },
]

export default function PropFirm() {
  const [accounts, setAccounts] = useState<TraderAccount[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Add account form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formFirm, setFormFirm] = useState<string>(PROP_FIRMS[0])
  const [formCapital, setFormCapital] = useState('')
  const [formInitialBalance, setFormInitialBalance] = useState('')
  const [formType, setFormType] = useState<TraderAccount['account_type']>('challenge')
  const [saving, setSaving] = useState(false)

  // Payout form
  const [showPayoutForm, setShowPayoutForm] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0])
  const [payoutAccountId, setPayoutAccountId] = useState('')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [savingPayout, setSavingPayout] = useState(false)

  // P&L per account computed from sessions
  const [accountPnl, setAccountPnl] = useState<Record<string, number>>({})

  const supabase = createClient()

  async function fetchData(uid: string) {
    const [{ data: accs }, { data: pays }, { data: sessions }] = await Promise.all([
      supabase.from('trader_accounts').select('*').eq('trader_id', uid).order('created_at', { ascending: true }),
      supabase.from('payouts').select('*').eq('trader_id', uid).order('payout_date', { ascending: false }),
      supabase.from('trading_sessions').select('pnl, setup').eq('trader_id', uid),
    ])
    if (accs) setAccounts(accs as TraderAccount[])
    if (pays) setPayouts(pays as Payout[])

    // Compute P&L per account
    const pnlMap: Record<string, number> = {}
    for (const s of sessions ?? []) {
      try {
        const setup = s.setup ? JSON.parse(s.setup) : null
        const ids: string[] = setup?.account_ids ?? []
        if (ids.length > 0) {
          const pnlPerAccount = Number(s.pnl) / ids.length
          for (const id of ids) {
            pnlMap[id] = (pnlMap[id] ?? 0) + pnlPerAccount
          }
        }
      } catch {}
    }
    setAccountPnl(pnlMap)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchData(user.id)
      setLoading(false)
    }
    init()
  }, [])

  function resetForm() {
    setFormLabel('')
    setFormFirm(PROP_FIRMS[0])
    setFormCapital('')
    setFormInitialBalance('')
    setFormType('challenge')
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(acc: TraderAccount) {
    setEditingId(acc.id)
    setFormLabel(acc.label)
    setFormFirm(acc.propfirm_name ?? PROP_FIRMS[0])
    setFormCapital(String(acc.capital))
    setFormInitialBalance(String(acc.initial_balance))
    setFormType(acc.account_type)
    setShowForm(true)
  }

  async function handleSave() {
    if (!userId) return
    if (!validate()) return
    setSaving(true)

    const payload = {
      trader_id: userId,
      label: formLabel.trim() || `Compte ${accounts.length + 1}`,
      propfirm_name: formFirm,
      capital: parseFloat(formCapital) || 0,
      initial_balance: parseFloat(formInitialBalance) || parseFloat(formCapital) || 0,
      account_type: formType,
    }

    if (editingId) {
      await supabase.from('trader_accounts').update(payload).eq('id', editingId)
    } else {
      await supabase.from('trader_accounts').insert(payload)
    }

    setSaving(false)
    resetForm()
    await fetchData(userId)
  }

  async function deleteAccount(id: string) {
    if (!userId || !confirm('Supprimer ce compte ?')) return
    await supabase.from('trader_accounts').delete().eq('id', id)
    await fetchData(userId)
  }

  async function handleAddPayout() {
    if (!userId || !payoutAmount) return
    setSavingPayout(true)
    const acc = accounts.find(a => a.id === payoutAccountId)
    await supabase.from('payouts').insert({
      trader_id: userId,
      amount: parseFloat(payoutAmount),
      payout_date: payoutDate,
      propfirm_name: acc?.propfirm_name ?? null,
      account_label: acc?.label ?? null,
      notes: payoutNotes || null,
    })
    await fetchData(userId)
    setPayoutAmount('')
    setPayoutNotes('')
    setShowPayoutForm(false)
    setSavingPayout(false)
  }

  async function deletePayout(id: string) {
    if (!userId) return
    await supabase.from('payouts').delete().eq('id', id)
    await fetchData(userId)
  }

  const totalCapital = accounts.reduce((s, a) => s + Number(a.capital), 0)
  const totalPayouts = payouts.reduce((s, p) => s + Number(p.amount), 0)
  const typeLabel = (t: string) => ACCOUNT_TYPES.find(at => at.id === t)?.label ?? t
  const typeColor = (t: string) => ACCOUNT_TYPES.find(at => at.id === t)?.color ?? '#5a6a82'

  // ─── VALIDATION ───
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!formLabel.trim()) errs.label = 'Requis. Ex: FTMO 50K #1'
    if (!formCapital || isNaN(Number(formCapital)) || Number(formCapital) <= 0) errs.capital = 'Entrez un nombre positif (pas de virgule, utilisez un point). Ex: 50000'
    else if (formCapital.includes(',')) errs.capital = 'Utilisez un point (.) et non une virgule (,). Ex: 50000'
    if (formInitialBalance && isNaN(Number(formInitialBalance))) errs.balance = 'Entrez un nombre valide. Ex: 52340.50'
    else if (formInitialBalance && formInitialBalance.includes(',')) errs.balance = 'Utilisez un point (.) et non une virgule (,). Ex: 52340.50'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const inputStyle = (field?: string): React.CSSProperties => ({
    width: '100%', padding: '8px 12px', background: 'var(--bg3)',
    border: `1px solid ${field && errors[field] ? '#ef4444' : 'var(--border)'}`, borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Mes comptes</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            {accounts.length} compte{accounts.length !== 1 ? 's' : ''} · Capital total : {totalCapital.toLocaleString('fr-FR')} $
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#0f1117' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un compte
          </button>
        )}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <Card>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
            {editingId ? 'Modifier le compte' : 'Nouveau compte'}
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: errors.label ? '#ef4444' : 'var(--text3)' }}>
                Nom du compte <span className="text-[10px] font-normal" style={{ color: 'var(--text3)' }}>(texte, majuscules acceptées)</span>
              </label>
              <input
                type="text" value={formLabel} onChange={e => { setFormLabel(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.label; return n }) }}
                placeholder="ex: FTMO 50K #1" style={inputStyle('label')}
              />
              {errors.label && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{errors.label}</p>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>Prop Firm</label>
              <select value={formFirm} onChange={e => setFormFirm(e.target.value)} style={inputStyle()}>
                {PROP_FIRMS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: errors.capital ? '#ef4444' : 'var(--text3)' }}>
                Capital du compte ($) <span className="text-[10px] font-normal" style={{ color: 'var(--text3)' }}>(chiffre, point pour décimales)</span>
              </label>
              <input
                type="text" inputMode="decimal" value={formCapital}
                onChange={e => { setFormCapital(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.capital; return n }) }}
                placeholder="50000" style={inputStyle('capital')}
              />
              {errors.capital && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{errors.capital}</p>}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: errors.balance ? '#ef4444' : 'var(--text3)' }}>
                Balance actuelle ($) <span className="text-[10px] font-normal" style={{ color: 'var(--text3)' }}>(chiffre, point pour décimales)</span>
              </label>
              <input
                type="text" inputMode="decimal" value={formInitialBalance}
                onChange={e => { setFormInitialBalance(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.balance; return n }) }}
                placeholder="52340.50" style={inputStyle('balance')}
              />
              {errors.balance && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{errors.balance}</p>}
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs mb-2" style={{ color: 'var(--text3)' }}>Type de compte</label>
            <div className="flex gap-2">
              {ACCOUNT_TYPES.map(at => (
                <button
                  key={at.id}
                  onClick={() => setFormType(at.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: formType === at.id ? `${at.color}15` : 'var(--bg3)',
                    border: `2px solid ${formType === at.id ? at.color : 'var(--border)'}`,
                    color: formType === at.id ? at.color : 'var(--text3)',
                  }}
                >
                  {at.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave} disabled={saving || !formCapital}
              className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--green)', color: '#0f1117' }}
            >
              {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Ajouter'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-xs font-medium"
              style={{ color: 'var(--text3)', border: '1px solid var(--border)' }}
            >
              Annuler
            </button>
          </div>
        </Card>
      )}

      {/* Accounts grid */}
      {accounts.length === 0 && !showForm ? (
        <Card>
          <div className="text-center py-10">
            <p className="text-sm mb-2" style={{ color: 'var(--text3)' }}>Aucun compte configuré</p>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>Ajoute tes comptes prop firm ou personnels pour commencer.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <Card key={acc.id} className="group relative" style={{ borderColor: `${typeColor(acc.account_type)}30` }}>
              {/* Actions */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(acc)} className="p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)]" title="Modifier">
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
                <button onClick={() => deleteAccount(acc.id)} className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)]" title="Supprimer">
                  <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: `${typeColor(acc.account_type)}15`, color: typeColor(acc.account_type) }}>
                  {typeLabel(acc.account_type)}
                </span>
                {acc.propfirm_name && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                    {acc.propfirm_name}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
                {acc.label || `Compte ${acc.propfirm_name}`}
              </h3>

              {(() => {
                const pnl = accountPnl[acc.id] ?? 0
                const balance = Number(acc.initial_balance) + pnl
                const perfPct = Number(acc.initial_balance) > 0 ? (pnl / Number(acc.initial_balance)) * 100 : 0
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Capital</p>
                        <p className="text-sm font-bold font-mono" style={{ color: 'var(--text)' }}>
                          {Number(acc.capital).toLocaleString('fr-FR')} $
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Début coaching</p>
                        <p className="text-sm font-bold font-mono" style={{ color: 'var(--text2)' }}>
                          {Number(acc.initial_balance).toLocaleString('fr-FR')} $
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Balance</p>
                        <p className="text-sm font-bold font-mono" style={{ color: balance >= Number(acc.initial_balance) ? '#22c55e' : '#ef4444' }}>
                          {balance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg p-2" style={{ background: pnl >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${pnl >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>P&L</p>
                        <p className="text-sm font-bold font-mono" style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                          {pnl >= 0 ? '+' : ''}{pnl.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $
                        </p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: perfPct >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${perfPct >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Perf</p>
                        <p className="text-sm font-bold font-mono" style={{ color: perfPct >= 0 ? '#22c55e' : '#ef4444' }}>
                          {perfPct >= 0 ? '+' : ''}{perfPct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </>
                )
              })()}
            </Card>
          ))}
        </div>
      )}

      {/* Payouts */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Payouts</h2>
            {totalPayouts > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full font-mono" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                Total: {totalPayouts.toLocaleString('fr-FR')} $
              </span>
            )}
          </div>
          <button
            onClick={() => { setShowPayoutForm(!showPayoutForm); if (accounts.length > 0) setPayoutAccountId(accounts[0].id) }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#0f1117' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau payout
          </button>
        </div>

        {showPayoutForm && (
          <div className="rounded-xl p-4 mb-5 border" style={{ background: 'var(--bg3)', borderColor: 'rgba(34,197,94,0.15)' }}>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>Montant ($)</label>
                <input type="number" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} placeholder="500" style={inputStyle()} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>Date</label>
                <input type="date" value={payoutDate} onChange={e => setPayoutDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>Compte</label>
                <select value={payoutAccountId} onChange={e => setPayoutAccountId(e.target.value)} style={inputStyle()}>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.label || `${a.propfirm_name} ${Number(a.capital).toLocaleString()}$`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>Notes</label>
                <input type="text" value={payoutNotes} onChange={e => setPayoutNotes(e.target.value)} placeholder="Optionnel..." style={inputStyle()} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowPayoutForm(false)}>Annuler</Button>
              <Button size="sm" onClick={handleAddPayout} loading={savingPayout} disabled={!payoutAmount || accounts.length === 0}>Ajouter</Button>
            </div>
          </div>
        )}

        {payouts.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--text3)' }}>Aucun payout enregistré</p>
        ) : (
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg border group" style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono" style={{ color: 'var(--green)' }}>+{Number(p.amount).toLocaleString('fr-FR')} $</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{new Date(p.payout_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.propfirm_name && <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>{p.propfirm_name}</span>}
                    {p.account_label && <span className="text-xs" style={{ color: 'var(--text3)' }}>{p.account_label}</span>}
                    {p.notes && <span className="text-xs truncate" style={{ color: 'var(--text3)' }}>— {p.notes}</span>}
                  </div>
                </div>
                <button onClick={() => deletePayout(p.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 transition-all" style={{ color: 'var(--text3)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
