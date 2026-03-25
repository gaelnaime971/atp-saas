'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { Payout } from '@/lib/types'

const PROP_FIRMS = ['FTMO', 'TopStep', 'Apex', 'E8', 'My Forex Funds', 'Autre'] as const
const CAPITALS = [10_000, 25_000, 50_000, 100_000, 200_000] as const
type AccountType = 'challenge' | 'funded' | 'personal'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  challenge: 'Challenge',
  funded: 'Compte Financé',
  personal: 'Compte Personnel',
}

export default function PropFirm() {
  const [firm, setFirm] = useState<string>(PROP_FIRMS[0])
  const [capital, setCapital] = useState<number>(CAPITALS[2])
  const [nbAccounts, setNbAccounts] = useState(1)
  const [accountType, setAccountType] = useState<AccountType>('challenge')
  const supabase = createClient()

  const [loaded, setLoaded] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [showPayoutForm, setShowPayoutForm] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0])
  const [payoutAccount, setPayoutAccount] = useState('Compte #1')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [savingPayout, setSavingPayout] = useState(false)

  async function fetchPayouts(uid: string) {
    const { data } = await supabase
      .from('payouts')
      .select('*')
      .eq('trader_id', uid)
      .order('payout_date', { ascending: false })
    setPayouts((data ?? []) as Payout[])
  }

  // Load saved config from profile
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('capital, nb_accounts, propfirm_name').eq('id', user.id).single()
      if (profile) {
        if (Number(profile.capital) > 0) setCapital(Number(profile.capital))
        if (profile.nb_accounts && profile.nb_accounts > 0) setNbAccounts(profile.nb_accounts)
        if (profile.propfirm_name) setFirm(profile.propfirm_name)
      }
      await fetchPayouts(user.id)
      setLoaded(true)
    }
    load()
  }, [])

  async function handleAddPayout() {
    if (!userId || !payoutAmount) return
    setSavingPayout(true)
    await supabase.from('payouts').insert({
      trader_id: userId,
      amount: parseFloat(payoutAmount),
      payout_date: payoutDate,
      propfirm_name: firm,
      account_label: payoutAccount,
      notes: payoutNotes || null,
    })
    await fetchPayouts(userId)
    setPayoutAmount('')
    setPayoutNotes('')
    setPayoutAccount('Compte #1')
    setShowPayoutForm(false)
    setSavingPayout(false)
  }

  async function handleDeletePayout(id: string) {
    if (!userId) return
    await supabase.from('payouts').delete().eq('id', id)
    await fetchPayouts(userId)
  }

  const totalPayouts = payouts.reduce((s, p) => s + Number(p.amount), 0)

  // Save capital & nb_accounts to profile on change (only after initial load)
  const saveToProfile = useCallback(async (cap: number, nb: number, firmName: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ capital: cap, nb_accounts: nb, propfirm_name: firmName }).eq('id', user.id)
  }, [supabase])

  useEffect(() => {
    if (!loaded) return
    const timeout = setTimeout(() => saveToProfile(capital, nbAccounts, firm), 500)
    return () => clearTimeout(timeout)
  }, [capital, nbAccounts, firm, saveToProfile, loaded])

  // Challenge rules
  const [profitPct, setProfitPct] = useState(10)
  const [profitEur, setProfitEur] = useState(5000)
  const [maxDailyLossPct, setMaxDailyLossPct] = useState(5)
  const [maxOverallLossPct, setMaxOverallLossPct] = useState(10)
  const [minTradingDays, setMinTradingDays] = useState(10)

  const totalCapital = capital * nbAccounts
  const totalProfitTarget = useMemo(() => (capital * profitPct) / 100, [capital, profitPct])
  const maxDrawdown = useMemo(() => (capital * maxOverallLossPct) / 100, [capital, maxOverallLossPct])

  const formatEur = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  const mockAccounts = useMemo(() => {
    return Array.from({ length: nbAccounts }, (_, i) => {
      const pnl = 0
      const profitProgress = 0
      const dailyLossUsed = 0
      const overallLossUsed = 0
      return { index: i + 1, pnl, profitProgress, dailyLossUsed, overallLossUsed }
    })
  }, [nbAccounts])

  return (
    <div className="space-y-6">
      {/* ── Config banner ── */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Configuration Prop Firm
          </h2>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--green)' }}
          >
            Configuré ✓
          </span>
        </div>

        {/* Row 1: Firm / Capital / Nb accounts */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Prop Firm select */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
              Prop Firm
            </label>
            <select
              value={firm}
              onChange={e => setFirm(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--bg3, #1c2333)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {PROP_FIRMS.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Capital select */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
              Capital par compte
            </label>
            <select
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--bg3, #1c2333)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {CAPITALS.map(c => (
                <option key={c} value={c}>
                  {formatEur(c)}
                </option>
              ))}
            </select>
          </div>

          {/* Nb accounts */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
              Nombre de comptes
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNbAccounts(Math.max(1, nbAccounts - 1))}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors"
                style={{
                  background: 'var(--bg3, #1c2333)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                }}
              >
                −
              </button>
              <span
                className="w-10 text-center text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                {nbAccounts}
              </span>
              <button
                onClick={() => setNbAccounts(nbAccounts + 1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors"
                style={{
                  background: 'var(--bg3, #1c2333)',
                  color: 'var(--text2)',
                  border: '1px solid var(--border)',
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Account type cards */}
        <div className="mb-5">
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
            Type de compte
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, string][]).map(([key, label]) => {
              const active = accountType === key
              return (
                <button
                  key={key}
                  onClick={() => setAccountType(key)}
                  className="rounded-xl px-4 py-3 text-sm font-medium text-left transition-all"
                  style={{
                    background: active ? 'rgba(74,222,128,0.06)' : 'var(--bg3, #1c2333)',
                    border: active ? '2px solid var(--green)' : '2px solid var(--border)',
                    color: active ? 'var(--green)' : 'var(--text2)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                      style={{
                        borderColor: active ? 'var(--green)' : 'var(--text3)',
                      }}
                    >
                      {active && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: 'var(--green)' }}
                        />
                      )}
                    </span>
                    {label}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Challenge rules — only for challenge */}
        {accountType === 'challenge' && (
          <div className="mb-5">
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
              Règles du challenge
            </label>
            <div className="grid grid-cols-5 gap-3">
              <InputField
                label="Objectif profit %"
                value={profitPct}
                onChange={setProfitPct}
                suffix="%"
              />
              <InputField
                label="Objectif €"
                value={profitEur}
                onChange={setProfitEur}
                suffix="€"
              />
              <InputField
                label="Max daily loss %"
                value={maxDailyLossPct}
                onChange={setMaxDailyLossPct}
                suffix="%"
              />
              <InputField
                label="Max overall loss %"
                value={maxOverallLossPct}
                onChange={setMaxOverallLossPct}
                suffix="%"
              />
              <InputField
                label="Jours trading min"
                value={minTradingDays}
                onChange={setMinTradingDays}
              />
            </div>
          </div>
        )}

        {/* Profit target / drawdown display (challenge only) */}
        {accountType === 'challenge' && (
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div
              className="rounded-lg p-3"
              style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>
                Objectif profit total
              </p>
              <p className="text-lg font-bold" style={{ color: 'var(--green)' }}>
                {formatEur(totalProfitTarget)}
              </p>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>
                Drawdown max
              </p>
              <p className="text-lg font-bold" style={{ color: '#ef4444' }}>
                {formatEur(maxDrawdown)}
              </p>
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div
          className="rounded-lg p-3 flex items-center justify-between flex-wrap gap-3"
          style={{ background: 'var(--bg3, #1c2333)', border: '1px solid var(--border)' }}
        >
          <SummaryItem label="Prop Firm" value={firm} />
          <SummaryItem label="Capital/compte" value={formatEur(capital)} />
          <SummaryItem label="Nb comptes" value={String(nbAccounts)} />
          <SummaryItem label="Capital total" value={formatEur(totalCapital)} />
          <SummaryItem label="Type" value={ACCOUNT_TYPE_LABELS[accountType]} />
        </div>
      </Card>

      {/* ── Account cards grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockAccounts.map(acc => {
          const healthy = acc.overallLossUsed < 50
          const borderColor = healthy ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'
          return (
            <Card
              key={acc.index}
              className="relative"
              style={{ borderColor }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Compte #{acc.index}
                </h3>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'rgba(74,222,128,0.1)',
                    color: 'var(--green)',
                  }}
                >
                  {ACCOUNT_TYPE_LABELS[accountType]}
                </span>
              </div>

              <p className="text-xs mb-3" style={{ color: 'var(--text3)' }}>
                {firm} — {formatEur(capital)}
              </p>

              {/* P&L */}
              <div className="mb-3">
                <p className="text-xs" style={{ color: 'var(--text3)' }}>
                  P&L ce mois
                </p>
                <p
                  className="text-lg font-bold"
                  style={{ color: acc.pnl >= 0 ? 'var(--green)' : '#ef4444' }}
                >
                  {formatEur(acc.pnl)}
                </p>
              </div>

              {/* Profit progress */}
              {accountType === 'challenge' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text3)' }}>Objectif profit</span>
                    <span style={{ color: 'var(--text2)' }}>{acc.profitProgress}%</span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: 'var(--bg3, #1c2333)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(acc.profitProgress, 100)}%`,
                        background: 'var(--green)',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Daily / Overall loss */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>
                    Daily loss utilisé
                  </p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {acc.dailyLossUsed}%
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>
                    Overall loss
                  </p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {acc.overallLossUsed}%
                  </p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Payouts ── */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Payouts
            </h2>
            {totalPayouts > 0 && (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full font-mono"
                style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                Total: {formatEur(totalPayouts)}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowPayoutForm(!showPayoutForm)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#0f1117' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau payout
          </button>
        </div>

        {/* Payout form */}
        {showPayoutForm && (
          <div
            className="rounded-xl p-4 mb-5 border"
            style={{ background: 'var(--bg3)', borderColor: 'rgba(34,197,94,0.15)' }}
          >
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
                  Montant ($)
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  placeholder="500"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
                  Date
                </label>
                <input
                  type="date"
                  value={payoutDate}
                  onChange={e => setPayoutDate(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
                  Compte
                </label>
                <select
                  value={payoutAccount}
                  onChange={e => setPayoutAccount(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {Array.from({ length: nbAccounts }, (_, i) => (
                    <option key={i} value={`Compte #${i + 1}`}>Compte #{i + 1}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
                  Notes (optionnel)
                </label>
                <input
                  type="text"
                  value={payoutNotes}
                  onChange={e => setPayoutNotes(e.target.value)}
                  placeholder="Premier retrait..."
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowPayoutForm(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleAddPayout} loading={savingPayout} disabled={!payoutAmount}>
                Ajouter le payout
              </Button>
            </div>
          </div>
        )}

        {/* Payouts list */}
        {payouts.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--text3)' }}>
            Aucun payout enregistré
          </p>
        ) : (
          <div className="space-y-2">
            {payouts.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-4 p-3 rounded-lg border"
                style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono" style={{ color: 'var(--green)' }}>
                      +{Number(p.amount).toLocaleString('fr-FR')} $
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
                      {new Date(p.payout_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.propfirm_name && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                        {p.propfirm_name}
                      </span>
                    )}
                    {p.account_label && (
                      <span className="text-xs" style={{ color: 'var(--text3)' }}>{p.account_label}</span>
                    )}
                    {p.notes && (
                      <span className="text-xs truncate" style={{ color: 'var(--text3)' }}>— {p.notes}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePayout(p.id)}
                  className="text-xs px-2 py-1 rounded-lg transition-all hover:bg-red-500/10"
                  style={{ color: 'var(--text3)' }}
                  title="Supprimer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── Helpers ── */

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text3)' }}>
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {value}
      </p>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: 'var(--bg3, #1c2333)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: 'var(--text3)' }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}
