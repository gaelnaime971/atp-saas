'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

const PROP_FIRMS = ['FTMO', 'TopStep', 'Apex', 'E8', 'My Forex Funds', 'Autre'] as const
const CAPITALS = [10_000, 25_000, 50_000, 100_000, 200_000] as const
type AccountType = 'challenge' | 'funded' | 'personal'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  challenge: 'Challenge/Evaluation',
  funded: 'Compte Financé',
  personal: 'Compte Personnel',
}

export default function PropFirm() {
  const [firm, setFirm] = useState<string>(PROP_FIRMS[0])
  const [capital, setCapital] = useState<number>(CAPITALS[2])
  const [nbAccounts, setNbAccounts] = useState(1)
  const [accountType, setAccountType] = useState<AccountType>('challenge')
  const [phase, setPhase] = useState<1 | 2>(1)
  const supabase = createClient()

  const [loaded, setLoaded] = useState(false)

  // Load saved config from profile
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('capital, nb_accounts, propfirm_name').eq('id', user.id).single()
      if (profile) {
        if (Number(profile.capital) > 0) setCapital(Number(profile.capital))
        if (profile.nb_accounts && profile.nb_accounts > 0) setNbAccounts(profile.nb_accounts)
        if (profile.propfirm_name) setFirm(profile.propfirm_name)
      }
      setLoaded(true)
    }
    load()
  }, [])

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

        {/* Phase buttons — only for challenge */}
        {accountType === 'challenge' && (
          <div className="mb-5">
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
              Phase
            </label>
            <div className="flex gap-2">
              {([1, 2] as const).map(p => {
                const active = phase === p
                return (
                  <button
                    key={p}
                    onClick={() => setPhase(p)}
                    className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: active ? 'var(--green)' : 'var(--bg3, #1c2333)',
                      color: active ? '#000' : 'var(--text2)',
                      border: active ? '1px solid var(--green)' : '1px solid var(--border)',
                    }}
                  >
                    Phase {p}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
