'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Line, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip,
  XAxis, YAxis, PieChart, Pie, Legend,
} from 'recharts'
import EntityCard, { BalanceHero, PerfCells } from '@/components/ui/EntityCard'

// ── Types ─────────────────────────────────────────────

type Phase = 'p1' | 'p2' | 'funded' | 'failed'
type Status = 'active' | 'passed' | 'failed' | 'paused'

interface PropAccount {
  id: string
  owner_id: string
  label: string
  propfirm: string
  account_size: number
  starting_balance: number
  current_balance: number
  phase: Phase
  profit_target_pct: number | null
  profit_target_amount: number | null
  max_daily_loss_pct: number | null
  max_total_dd_pct: number | null
  trailing_dd: boolean
  min_trading_days: number | null
  consistency_rule_pct: number | null
  status: Status
  cost_eur: number | null
  payout_split_pct: number | null
  notes: string | null
  created_at: string
}

interface DailyPnL {
  id: string
  account_id: string
  date: string
  pnl: number
  trades_count: number | null
  notes: string | null
}

interface WeeklyTarget {
  id: string
  owner_id: string
  week_start_date: string
  target_eur: number
  notes: string | null
}

interface DailyOverride {
  id: string
  weekly_target_id: string
  date: string
  target_eur: number
}

interface AnnualTarget {
  id: string
  owner_id: string
  year: number
  target_eur: number
  notes: string | null
}

interface Payout {
  id: string
  account_id: string
  payout_date: string
  amount_eur: number
  notes: string | null
}

// ── Constants ─────────────────────────────────────────

const PROPFIRMS = [
  'FTMO', 'MFF (My Forex Funds)', 'Apex Trader Funding', 'TopStep', 'FTUK',
  'Funded Next', 'The5%ers', 'E8 Funding', 'FundedNext', 'True Forex Funds',
  'Traders With Edge', 'City Traders Imperium', 'The Prop Trading', 'Blue Guardian',
  'Autre',
]

const PHASE_LABELS: Record<Phase, { label: string; color: string; bg: string }> = {
  p1: { label: 'Challenge P1', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  p2: { label: 'Challenge P2', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  funded: { label: 'Financé', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  failed: { label: 'Échoué', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

const STATUS_LABELS: Record<Status, { label: string; color: string }> = {
  active: { label: 'Actif', color: '#22c55e' },
  passed: { label: 'Passé', color: '#3b82f6' },
  failed: { label: 'Failed', color: '#ef4444' },
  paused: { label: 'Pause', color: '#6b7280' },
}

const DAY_LABELS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// ── Helpers ───────────────────────────────────────────

const fmtEur = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('fr-FR')} €`
const fmtEurRaw = (n: number | null | undefined): string =>
  n == null || isNaN(n) ? '—' : `${Math.round(n).toLocaleString('fr-FR')} €`
const fmtPct = (n: number | null | undefined, dec = 1): string =>
  n == null || isNaN(n) ? '—' : `${n.toFixed(dec)}%`

function mondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon...6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function weekDates(mondayISO: string): string[] {
  const d = new Date(mondayISO)
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d)
    dd.setDate(dd.getDate() + i)
    return dd.toISOString().slice(0, 10)
  })
}

function todayISO() { return new Date().toISOString().slice(0, 10) }

// ── Main Component ────────────────────────────────────

export default function TradingPerso() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [accounts, setAccounts] = useState<PropAccount[]>([])
  const [pnls, setPnls] = useState<DailyPnL[]>([])
  const [weeklyTargets, setWeeklyTargets] = useState<WeeklyTarget[]>([])
  const [overrides, setOverrides] = useState<DailyOverride[]>([])
  const [annualTarget, setAnnualTarget] = useState<AnnualTarget | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])

  const [currentMonday, setCurrentMonday] = useState<string>(mondayOf(new Date()))
  const [editingAccount, setEditingAccount] = useState<PropAccount | null>(null)
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [pnlEditing, setPnlEditing] = useState<{ accountId: string; date: string } | null>(null)
  const [editingAnnual, setEditingAnnual] = useState(false)
  const currentYear = new Date().getFullYear()

  // ─── Tabs ───
  type TabId = 'validation' | 'business'
  const [activeTab, setActiveTab] = useState<TabId>('validation')

  // ─── Fetch all ───
  const fetchAll = useCallback(async (uid: string) => {
    const [accRes, pnlRes, wtRes, ovRes, atRes, poRes] = await Promise.all([
      supabase.from('propfirm_accounts').select('*').eq('owner_id', uid).order('created_at', { ascending: false }),
      supabase.from('propfirm_daily_pnl').select('*, propfirm_accounts!inner(owner_id)').eq('propfirm_accounts.owner_id', uid).order('date', { ascending: false }).limit(2000),
      supabase.from('propfirm_weekly_targets').select('*').eq('owner_id', uid).order('week_start_date', { ascending: false }).limit(52),
      supabase.from('propfirm_daily_target_overrides').select('*, propfirm_weekly_targets!inner(owner_id)').eq('propfirm_weekly_targets.owner_id', uid),
      supabase.from('propfirm_annual_targets').select('*').eq('owner_id', uid).eq('year', new Date().getFullYear()).maybeSingle(),
      supabase.from('propfirm_payouts').select('*, propfirm_accounts!inner(owner_id)').eq('propfirm_accounts.owner_id', uid).order('payout_date', { ascending: false }),
    ])
    if (accRes.data) setAccounts(accRes.data as PropAccount[])
    if (pnlRes.data) setPnls(pnlRes.data as unknown as DailyPnL[])
    if (wtRes.data) setWeeklyTargets(wtRes.data as WeeklyTarget[])
    if (ovRes.data) setOverrides(ovRes.data as unknown as DailyOverride[])
    if (atRes.data) setAnnualTarget(atRes.data as AnnualTarget)
    else setAnnualTarget(null)
    if (poRes.data) setPayouts(poRes.data as unknown as Payout[])
  }, [supabase])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchAll(user.id)
      setLoading(false)
    })()
  }, [supabase, fetchAll])

  // ─── Weekly target for the current week ───
  const currentWeeklyTarget = useMemo(
    () => weeklyTargets.find(t => t.week_start_date === currentMonday) || null,
    [weeklyTargets, currentMonday]
  )

  const currentWeekOverrides = useMemo(
    () => currentWeeklyTarget ? overrides.filter(o => o.weekly_target_id === currentWeeklyTarget.id) : [],
    [overrides, currentWeeklyTarget]
  )

  const currentWeekDates = useMemo(() => weekDates(currentMonday), [currentMonday])

  // Compute daily targets (Mon-Fri distribution by default)
  const dailyTargets = useMemo<Record<string, number>>(() => {
    if (!currentWeeklyTarget) return {}
    const tradingDays = currentWeekDates.slice(0, 5) // Mon-Fri
    const perDay = currentWeeklyTarget.target_eur / tradingDays.length
    const result: Record<string, number> = {}
    for (const d of currentWeekDates) {
      const ov = currentWeekOverrides.find(o => o.date === d)
      if (ov) result[d] = ov.target_eur
      else if (tradingDays.includes(d)) result[d] = perDay
      else result[d] = 0
    }
    return result
  }, [currentWeeklyTarget, currentWeekDates, currentWeekOverrides])

  // ─── Aggregations ───
  const activeAccounts = useMemo(() => accounts.filter(a => a.status === 'active'), [accounts])
  const failedAccounts = useMemo(() => accounts.filter(a => a.status === 'failed'), [accounts])
  const passedAccounts = useMemo(() => accounts.filter(a => a.status === 'passed'), [accounts])
  const fundedAccounts = useMemo(() => accounts.filter(a => a.phase === 'funded' && a.status === 'active'), [accounts])
  const challengeAccounts = useMemo(() => accounts.filter(a => (a.phase === 'p1' || a.phase === 'p2') && a.status === 'active'), [accounts])

  const totalCapital = useMemo(() => activeAccounts.reduce((s, a) => s + Number(a.account_size), 0), [activeAccounts])
  const totalProfit = useMemo(() => activeAccounts.reduce((s, a) => s + (Number(a.current_balance) - Number(a.starting_balance)), 0), [activeAccounts])
  const totalCostChallenge = useMemo(() => accounts.reduce((s, a) => s + Number(a.cost_eur || 0), 0), [accounts])

  // P&L this week / month / year
  const pnlOfWeek = useMemo(() => {
    const inWeek = new Set(currentWeekDates)
    return pnls.filter(p => inWeek.has(p.date)).reduce((s, p) => s + Number(p.pnl), 0)
  }, [pnls, currentWeekDates])

  const pnlOfMonth = useMemo(() => {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return pnls.filter(p => p.date.startsWith(monthKey)).reduce((s, p) => s + Number(p.pnl), 0)
  }, [pnls])

  const pnlYTD = useMemo(() => {
    const yr = new Date().getFullYear()
    return pnls.filter(p => p.date.startsWith(`${yr}-`)).reduce((s, p) => s + Number(p.pnl), 0)
  }, [pnls])

  // Weekly progress
  const weeklyActual = pnlOfWeek
  const weeklyProgressPct = currentWeeklyTarget && currentWeeklyTarget.target_eur > 0
    ? (weeklyActual / currentWeeklyTarget.target_eur) * 100
    : 0

  // Per-account this week P&L
  const weekPnlByAccount = useMemo(() => {
    const inWeek = new Set(currentWeekDates)
    const map: Record<string, number> = {}
    for (const p of pnls) {
      if (!inWeek.has(p.date)) continue
      map[p.account_id] = (map[p.account_id] || 0) + Number(p.pnl)
    }
    return map
  }, [pnls, currentWeekDates])

  // Equity curve (aggregate) — chronological
  const equityCurve = useMemo(() => {
    const byDate: Record<string, number> = {}
    for (const p of pnls) {
      byDate[p.date] = (byDate[p.date] || 0) + Number(p.pnl)
    }
    const dates = Object.keys(byDate).sort()
    let cum = 0
    let peak = 0
    return dates.map(d => {
      cum += byDate[d]
      if (cum > peak) peak = cum
      return { date: d, daily: Math.round(byDate[d]), cumulative: Math.round(cum), drawdown: Math.round(cum - peak) }
    })
  }, [pnls])

  // Alerts
  const alerts = useMemo(() => {
    const list: Array<{ level: 'warn' | 'crit' | 'info'; message: string; accountLabel?: string }> = []
    for (const a of activeAccounts) {
      const currentDdEur = Math.max(0, Number(a.starting_balance) - Number(a.current_balance))
      const maxDdEur = a.max_total_dd_pct != null ? Number(a.account_size) * (Number(a.max_total_dd_pct) / 100) : null
      if (maxDdEur != null && maxDdEur > 0) {
        const ratio = currentDdEur / maxDdEur
        if (ratio >= 0.75) list.push({ level: 'crit', message: `Max DD à ${Math.round(ratio * 100)}% — attention critique`, accountLabel: a.label })
        else if (ratio >= 0.5) list.push({ level: 'warn', message: `Max DD à ${Math.round(ratio * 100)}% — surveille de près`, accountLabel: a.label })
      }
      // Today's P&L vs max daily loss
      const todayPnl = pnls.filter(p => p.account_id === a.id && p.date === todayISO()).reduce((s, p) => s + Number(p.pnl), 0)
      const maxDailyLossEur = a.max_daily_loss_pct != null ? Number(a.account_size) * (Number(a.max_daily_loss_pct) / 100) : null
      if (maxDailyLossEur != null && todayPnl < 0 && Math.abs(todayPnl) >= maxDailyLossEur * 0.7) {
        list.push({ level: 'crit', message: `Perte du jour ${Math.round(Math.abs(todayPnl))}€ approche max daily loss ${Math.round(maxDailyLossEur)}€`, accountLabel: a.label })
      }
      // Consistency rule for funded
      if (a.phase === 'funded' && a.consistency_rule_pct != null && a.consistency_rule_pct > 0) {
        const accountPnl = Number(a.current_balance) - Number(a.starting_balance)
        if (accountPnl > 0) {
          const accountDailyPnls = pnls.filter(p => p.account_id === a.id).map(p => Number(p.pnl))
          const maxDay = Math.max(...accountDailyPnls.filter(v => v > 0), 0)
          if (maxDay > 0) {
            const ratio = (maxDay / accountPnl) * 100
            if (ratio > a.consistency_rule_pct * 0.9) {
              list.push({ level: 'warn', message: `Consistency : meilleur jour = ${Math.round(ratio)}% du profit total (limite ${a.consistency_rule_pct}%)`, accountLabel: a.label })
            }
          }
        }
      }
    }
    // Weekly progress alerts
    if (currentWeeklyTarget && weeklyProgressPct >= 80 && weeklyProgressPct < 100) {
      list.push({ level: 'info', message: `Semaine à ${weeklyProgressPct.toFixed(0)}% de l'objectif — envisage de sécuriser` })
    }
    if (currentWeeklyTarget && weeklyProgressPct >= 100) {
      list.push({ level: 'info', message: `🎯 Objectif hebdo atteint ! (${weeklyProgressPct.toFixed(0)}%)` })
    }
    return list
  }, [activeAccounts, pnls, currentWeeklyTarget, weeklyProgressPct])

  // ─── Mutations ───
  const saveAccount = async (a: Partial<PropAccount>): Promise<boolean> => {
    if (!userId) { alert('Non authentifié'); return false }
    // Only send fields that exist in the schema. Strip id and owner_id from patch/insert body.
    const payload = {
      label: a.label,
      propfirm: a.propfirm,
      account_size: a.account_size,
      starting_balance: a.starting_balance,
      current_balance: a.current_balance,
      phase: a.phase,
      profit_target_pct: a.profit_target_pct ?? null,
      profit_target_amount: a.profit_target_amount ?? null,
      max_daily_loss_pct: a.max_daily_loss_pct ?? null,
      max_total_dd_pct: a.max_total_dd_pct ?? null,
      trailing_dd: !!a.trailing_dd,
      min_trading_days: a.min_trading_days ?? null,
      consistency_rule_pct: a.consistency_rule_pct ?? null,
      status: a.status,
      cost_eur: a.cost_eur ?? null,
      payout_split_pct: a.payout_split_pct ?? null,
      notes: a.notes ?? null,
    }
    if (a.id) {
      const { error } = await supabase.from('propfirm_accounts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', a.id)
      if (error) {
        console.error('Update account error:', error)
        alert(`Erreur mise à jour compte : ${error.message}\n\nCode : ${error.code || 'inconnu'}`)
        return false
      }
    } else {
      const { error } = await supabase.from('propfirm_accounts').insert({ ...payload, owner_id: userId })
      if (error) {
        console.error('Insert account error:', error)
        const isMissingTable = /relation.*does not exist/i.test(error.message) || error.code === '42P01'
        if (isMissingTable) {
          alert('❌ La table propfirm_accounts n\'existe pas. Applique d\'abord la migration Supabase :\n\nsupabase/migrations/20260713000001_trading_perso.sql')
        } else {
          alert(`Erreur création compte : ${error.message}\n\nCode : ${error.code || 'inconnu'}`)
        }
        return false
      }
    }
    await fetchAll(userId)
    return true
  }

  const deleteAccount = async (id: string) => {
    if (!userId) return
    if (!confirm('Supprimer ce compte ? (P&L associé aussi)')) return
    const { error } = await supabase.from('propfirm_accounts').delete().eq('id', id)
    if (error) { alert(`Erreur suppression : ${error.message}`); return }
    await fetchAll(userId)
  }

  // Authoritative balance recompute — queries fresh sum from DB, no delta math
  const recomputeBalance = async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    const { data, error } = await supabase.from('propfirm_daily_pnl')
      .select('pnl').eq('account_id', accountId)
    if (error) return
    const sum = (data || []).reduce((s, p) => s + Number(p.pnl), 0)
    const newBalance = Number(account.starting_balance) + sum
    await supabase.from('propfirm_accounts').update({ current_balance: newBalance }).eq('id', accountId)
  }

  const recomputeAllBalances = async () => {
    if (!userId) return
    type Row = { account: PropAccount; sum: number; expected: number; current: number; delta: number; count: number; rows: { date: string; pnl: number }[] }
    const diag: Row[] = []
    for (const a of accounts) {
      const { data } = await supabase.from('propfirm_daily_pnl')
        .select('date, pnl').eq('account_id', a.id).order('date', { ascending: true })
      const rows = (data || []).map(r => ({ date: r.date as string, pnl: Number(r.pnl) }))
      const sum = rows.reduce((s, r) => s + r.pnl, 0)
      const expected = Number(a.starting_balance) + sum
      const current = Number(a.current_balance)
      const delta = current - expected
      diag.push({ account: a, sum, expected, current, delta, count: rows.length, rows })
    }
    const drift = diag.filter(d => Math.abs(d.delta) > 0.01)
    if (drift.length === 0) {
      alert('✅ Tous les soldes sont déjà synchronisés avec les P&L journaliers.')
      return
    }
    const lines = drift.map(d => {
      const perDay = d.rows.map(r => `    ${r.date}: ${r.pnl >= 0 ? '+' : ''}${r.pnl}€`).join('\n')
      return `[${d.account.label}] ${d.count} saisies · somme=${d.sum >= 0 ? '+' : ''}${d.sum}€\n  Solde actuel: ${d.current}€ | Attendu: ${d.expected}€ | Écart: ${d.delta >= 0 ? '+' : ''}${d.delta}€\n  Détail:\n${perDay}`
    }).join('\n\n')
    const ok = confirm(`⚠️ ${drift.length} comptes en dérive.\n\n${lines}\n\nCorriger le solde de chaque compte à = starting_balance + somme(P&L) ?`)
    if (!ok) return
    for (const d of drift) await recomputeBalance(d.account.id)
    await fetchAll(userId)
    alert(`✅ ${drift.length} soldes recalculés.`)
  }

  const savePnl = async (accountId: string, date: string, pnl: number, tradesCount?: number, notes?: string) => {
    if (!userId) return
    const existing = pnls.find(p => p.account_id === accountId && p.date === date)
    let err
    if (existing) {
      ({ error: err } = await supabase.from('propfirm_daily_pnl').update({
        pnl, trades_count: tradesCount ?? null, notes: notes ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id))
    } else {
      ({ error: err } = await supabase.from('propfirm_daily_pnl').insert({
        account_id: accountId, date, pnl,
        trades_count: tradesCount ?? null, notes: notes ?? null,
      }))
    }
    if (err) { alert(`Erreur P&L : ${err.message}`); return }
    await recomputeBalance(accountId)
    await fetchAll(userId)
  }

  const savePnlMulti = async (accountIds: string[], date: string, pnl: number, tradesCount?: number, notes?: string) => {
    if (!userId || accountIds.length === 0) return
    const errors: string[] = []
    for (const accountId of accountIds) {
      const existing = pnls.find(p => p.account_id === accountId && p.date === date)
      let err
      if (existing) {
        ({ error: err } = await supabase.from('propfirm_daily_pnl').update({
          pnl, trades_count: tradesCount ?? null, notes: notes ?? null,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id))
      } else {
        ({ error: err } = await supabase.from('propfirm_daily_pnl').insert({
          account_id: accountId, date, pnl,
          trades_count: tradesCount ?? null, notes: notes ?? null,
        }))
      }
      if (err) { errors.push(`${accountId}: ${err.message}`); continue }
      await recomputeBalance(accountId)
    }
    if (errors.length > 0) alert(`Erreurs P&L :\n${errors.join('\n')}`)
    await fetchAll(userId)
  }

  const deletePnl = async (id: string) => {
    if (!userId) return
    if (!confirm('Supprimer cette entrée P&L ?')) return
    const affected = pnls.find(p => p.id === id)
    const { error } = await supabase.from('propfirm_daily_pnl').delete().eq('id', id)
    if (error) { alert(`Erreur suppression : ${error.message}`); return }
    if (affected) await recomputeBalance(affected.account_id)
    await fetchAll(userId)
  }

  const saveWeeklyTarget = async (target: number) => {
    if (!userId) return
    let err
    if (currentWeeklyTarget) {
      ({ error: err } = await supabase.from('propfirm_weekly_targets').update({
        target_eur: target,
        updated_at: new Date().toISOString(),
      }).eq('id', currentWeeklyTarget.id))
    } else {
      ({ error: err } = await supabase.from('propfirm_weekly_targets').insert({
        owner_id: userId,
        week_start_date: currentMonday,
        target_eur: target,
      }))
    }
    if (err) {
      const isMissingTable = /relation.*does not exist/i.test(err.message) || err.code === '42P01'
      if (isMissingTable) {
        alert('❌ La table propfirm_weekly_targets n\'existe pas. Applique d\'abord la migration Supabase.')
      } else {
        alert(`Erreur objectif : ${err.message}`)
      }
      return
    }
    await fetchAll(userId)
  }

  const saveAnnualTarget = async (target: number) => {
    if (!userId) return
    let err
    if (annualTarget) {
      ({ error: err } = await supabase.from('propfirm_annual_targets').update({
        target_eur: target,
        updated_at: new Date().toISOString(),
      }).eq('id', annualTarget.id))
    } else {
      ({ error: err } = await supabase.from('propfirm_annual_targets').insert({
        owner_id: userId,
        year: currentYear,
        target_eur: target,
      }))
    }
    if (err) {
      const isMissingTable = /relation.*does not exist/i.test(err.message) || err.code === '42P01'
      if (isMissingTable) {
        alert('❌ La table propfirm_annual_targets n\'existe pas. Applique d\'abord la migration 20260713000002_trading_perso_enhancements.sql')
      } else {
        alert(`Erreur objectif annuel : ${err.message}`)
      }
      return
    }
    await fetchAll(userId)
  }

  const addPayout = async (accountId: string, date: string, amount: number, notes?: string) => {
    if (!userId) return
    const { error } = await supabase.from('propfirm_payouts').insert({
      account_id: accountId,
      payout_date: date,
      amount_eur: amount,
      notes: notes ?? null,
    })
    if (error) {
      const isMissingTable = /relation.*does not exist/i.test(error.message) || error.code === '42P01'
      if (isMissingTable) {
        alert('❌ La table propfirm_payouts n\'existe pas. Applique la migration 20260713000002_trading_perso_enhancements.sql')
      } else {
        alert(`Erreur payout : ${error.message}`)
      }
      return
    }
    await fetchAll(userId)
  }

  const deletePayout = async (id: string) => {
    if (!userId) return
    if (!confirm('Supprimer ce payout ?')) return
    const { error } = await supabase.from('propfirm_payouts').delete().eq('id', id)
    if (error) { alert(`Erreur : ${error.message}`); return }
    await fetchAll(userId)
  }

  const bulkAddAccounts = async (rows: Partial<PropAccount>[]): Promise<boolean> => {
    if (!userId) return false
    const filtered = rows.filter(r => r.label && r.label.trim())
    if (filtered.length === 0) { alert('Renseigne au moins un label.'); return false }
    const payload = filtered.map(a => ({
      owner_id: userId,
      label: a.label,
      propfirm: a.propfirm || 'FTMO',
      account_size: a.account_size ?? 100000,
      starting_balance: a.starting_balance ?? a.account_size ?? 100000,
      current_balance: a.current_balance ?? a.starting_balance ?? a.account_size ?? 100000,
      phase: a.phase || 'p1',
      status: a.status || 'active',
      profit_target_pct: a.profit_target_pct ?? null,
      profit_target_amount: null,
      max_daily_loss_pct: a.max_daily_loss_pct ?? null,
      max_total_dd_pct: a.max_total_dd_pct ?? null,
      trailing_dd: !!a.trailing_dd,
      min_trading_days: a.min_trading_days ?? null,
      consistency_rule_pct: a.consistency_rule_pct ?? null,
      cost_eur: a.cost_eur ?? null,
      payout_split_pct: a.payout_split_pct ?? null,
      notes: a.notes ?? null,
    }))
    const { error } = await supabase.from('propfirm_accounts').insert(payload)
    if (error) {
      const isMissingTable = /relation.*does not exist/i.test(error.message) || error.code === '42P01'
      if (isMissingTable) {
        alert('❌ Table propfirm_accounts manquante. Applique la migration.')
      } else {
        alert(`Erreur ajout en lot : ${error.message}`)
      }
      return false
    }
    await fetchAll(userId)
    return true
  }

  const setDailyOverride = async (date: string, targetEur: number) => {
    if (!currentWeeklyTarget || !userId) return
    const existing = currentWeekOverrides.find(o => o.date === date)
    let err
    if (existing) {
      ({ error: err } = await supabase.from('propfirm_daily_target_overrides').update({ target_eur: targetEur }).eq('id', existing.id))
    } else {
      ({ error: err } = await supabase.from('propfirm_daily_target_overrides').insert({
        weekly_target_id: currentWeeklyTarget.id,
        date, target_eur: targetEur,
      }))
    }
    if (err) { alert(`Erreur override : ${err.message}`); return }
    await fetchAll(userId)
  }

  // ─── Annual / aggregate calculations ───
  const yearStart = useMemo(() => new Date(currentYear, 0, 1), [currentYear])
  const yearEnd = useMemo(() => new Date(currentYear, 11, 31), [currentYear])
  const daysInYear = useMemo(() => Math.round((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1, [yearStart, yearEnd])
  const daysElapsed = useMemo(() => {
    const now = new Date()
    return Math.max(1, Math.round((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  }, [yearStart])
  const daysRemaining = Math.max(0, daysInYear - daysElapsed)

  const totalPayouts = useMemo(() => payouts.reduce((s, p) => s + Number(p.amount_eur), 0), [payouts])
  const totalPayoutsYTD = useMemo(() => payouts.filter(p => p.payout_date.startsWith(`${currentYear}-`)).reduce((s, p) => s + Number(p.amount_eur), 0), [payouts, currentYear])
  const netProfitYTD = pnlYTD + totalPayoutsYTD // realized value: trading P&L + received payouts

  const annualProgressPct = annualTarget && annualTarget.target_eur > 0
    ? (netProfitYTD / annualTarget.target_eur) * 100
    : null

  const expectedPct = (daysElapsed / daysInYear) * 100
  const paceOffset = annualProgressPct != null ? annualProgressPct - expectedPct : null

  const projectedEOY = daysElapsed > 0 ? (netProfitYTD / daysElapsed) * daysInYear : 0
  const remainingToTarget = annualTarget ? annualTarget.target_eur - netProfitYTD : 0
  const requiredDailyPace = daysRemaining > 0 && remainingToTarget > 0 ? remainingToTarget / daysRemaining : 0

  // Aggregate profit targets across all active challenge accounts
  const aggregateChallengeTarget = useMemo(() => {
    return activeAccounts.reduce((sum, a) => {
      if (a.phase === 'funded') return sum
      const targetAmount = a.profit_target_amount ?? (a.profit_target_pct != null ? Number(a.account_size) * (Number(a.profit_target_pct) / 100) : 0)
      return sum + Number(targetAmount || 0)
    }, 0)
  }, [activeAccounts])

  const aggregateChallengeProfit = useMemo(() => {
    return activeAccounts.filter(a => a.phase !== 'funded').reduce((sum, a) => {
      return sum + (Number(a.current_balance) - Number(a.starting_balance))
    }, 0)
  }, [activeAccounts])

  const aggregateProgressPct = aggregateChallengeTarget > 0
    ? (aggregateChallengeProfit / aggregateChallengeTarget) * 100
    : 0

  // Best/worst account this week
  const bestWeekAccount = useMemo(() => {
    let best: { account: PropAccount; pnl: number } | null = null
    for (const a of activeAccounts) {
      const pnl = weekPnlByAccount[a.id] || 0
      if (!best || pnl > best.pnl) best = { account: a, pnl }
    }
    return best
  }, [activeAccounts, weekPnlByAccount])
  const worstWeekAccount = useMemo(() => {
    let worst: { account: PropAccount; pnl: number } | null = null
    for (const a of activeAccounts) {
      const pnl = weekPnlByAccount[a.id] || 0
      if (!worst || pnl < worst.pnl) worst = { account: a, pnl }
    }
    return worst
  }, [activeAccounts, weekPnlByAccount])

  // Total costs vs realized profits — ROI on prop firm business
  const roi = totalCostChallenge > 0 ? ((netProfitYTD) / totalCostChallenge) * 100 : null
  const buybackCapacity = totalCostChallenge > 0 && activeAccounts.length > 0
    ? Math.floor(Math.max(0, netProfitYTD) / (totalCostChallenge / accounts.length))
    : 0

  // ─── Render ───
  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Chargement…</div>
  }

  return (
    <div style={{ padding: 24, background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
      `}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            💼 Trading Perso <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>· Business plan {currentYear}</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            Gestion multi-comptes prop firm · Objectifs · Perf · Payouts · Alertes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={recomputeAllBalances}
            className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer' }}
            title="Recalcule le solde de chaque compte à partir de la somme de ses P&L journaliers">
            🔄 Recalculer soldes
          </button>
          <button
            onClick={() => setShowBulkAdd(true)}
            className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            + Ajouter en lot (5)
          </button>
          <button
            onClick={() => setShowPayoutModal(true)}
            className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.35)', cursor: 'pointer' }}>
            💰 Payout
          </button>
          <button
            onClick={() => setShowNewAccount(true)}
            className="px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            style={{ background: 'var(--color-accent)', color: '#000', border: 'none', cursor: 'pointer' }}>
            + Nouveau compte
          </button>
        </div>
      </div>

      {/* ALERTS — always visible above tabs (critical info) */}
      {alerts.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text3)' }}>
            🚨 Alertes ({alerts.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {alerts.map((a, i) => {
              const col = a.level === 'crit' ? '#ef4444' : a.level === 'warn' ? '#f59e0b' : '#3b82f6'
              return (
                <div key={i} style={{
                  padding: '6px 10px', borderLeft: `3px solid ${col}`, background: `${col}10`,
                  borderRadius: 4, fontSize: 11, color: 'var(--text2)',
                }}>
                  {a.accountLabel && <strong style={{ color: 'var(--text)' }}>[{a.accountLabel}] </strong>}
                  {a.message}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════ TABS NAV ══════ */}
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', width: 'fit-content' }}>
        {([
          { id: 'validation' as TabId, label: 'Validation Challenges', icon: '🎯', count: challengeAccounts.length },
          { id: 'business' as TabId, label: 'Business Plan', icon: '💼', count: fundedAccounts.length },
        ]).map(t => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all"
              style={{
                background: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#09090b' : 'var(--text2)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <span>{t.label}</span>
              <span style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 8,
                background: active ? 'rgba(9,9,11,0.15)' : 'var(--bg3)',
                color: active ? '#09090b' : 'var(--text3)',
                fontWeight: 700,
              }}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══════ TAB · VALIDATION CHALLENGES (opérationnel) ══════════ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'validation' && (
        <>
          {/* WEEKLY TARGET + DAILY BREAKDOWN */}
          <WeeklyTargetSection
            currentMonday={currentMonday}
            setCurrentMonday={setCurrentMonday}
            target={currentWeeklyTarget}
            dailyTargets={dailyTargets}
            weekDates={currentWeekDates}
            weekPnls={pnls.filter(p => currentWeekDates.includes(p.date))}
            onSaveTarget={saveWeeklyTarget}
            onSetDailyOverride={setDailyOverride}
          />

          {/* CHALLENGES EN COURS — focus validation */}
          <ChallengesSection
            accounts={challengeAccounts}
            pnls={pnls}
            weekPnlByAccount={weekPnlByAccount}
            onEdit={setEditingAccount}
            onDelete={deleteAccount}
          />

          {/* DAILY P&L MATRIX (challenges only) */}
          {challengeAccounts.length > 0 && (
            <DailyPnlMatrix
              accounts={challengeAccounts}
              pnls={pnls}
              weekDates={currentWeekDates}
              onEdit={(accountId, date) => setPnlEditing({ accountId, date })}
            />
          )}

          {/* Failed / paused (collapsible) */}
          {(failedAccounts.length > 0 || accounts.filter(a => a.status === 'paused').length > 0) && (
            <details style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Comptes en pause / échoués ({failedAccounts.length + accounts.filter(a => a.status === 'paused').length})
              </summary>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                {[...failedAccounts, ...accounts.filter(a => a.status === 'paused')].map(a => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    weekPnl={weekPnlByAccount[a.id] || 0}
                    todayPnl={pnls.filter(p => p.account_id === a.id && p.date === todayISO()).reduce((s, p) => s + Number(p.pnl), 0)}
                    onEdit={() => setEditingAccount(a)}
                    onDelete={() => deleteAccount(a.id)}
                  />
                ))}
              </div>
            </details>
          )}

          {accounts.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 }}>
              Aucun compte. Clique &laquo;+ Nouveau compte&raquo; ou &laquo;+ Ajouter en lot (5)&raquo; pour commencer.
            </div>
          )}

          {challengeAccounts.length === 0 && accounts.length > 0 && (
            <div style={{ padding: 32, textAlign: 'center', background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 }}>
              Aucun challenge en cours. Tous tes comptes sont financés — passe à l&apos;onglet <strong style={{ color: 'var(--green)' }}>Business Plan</strong> pour piloter tes objectifs annuels.
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══════ TAB · BUSINESS PLAN (stratégique) ═══════════════════ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'business' && (
        <>
          {/* HERO — ANNUAL BUSINESS PLAN */}
          <AnnualHero
            year={currentYear}
            target={annualTarget}
            editing={editingAnnual}
            setEditing={setEditingAnnual}
            onSave={saveAnnualTarget}
            netProfitYTD={netProfitYTD}
            progressPct={annualProgressPct}
            expectedPct={expectedPct}
            paceOffset={paceOffset}
            projectedEOY={projectedEOY}
            remainingToTarget={remainingToTarget}
            requiredDailyPace={requiredDailyPace}
            daysElapsed={daysElapsed}
            daysRemaining={daysRemaining}
            daysInYear={daysInYear}
            totalPayoutsYTD={totalPayoutsYTD}
            pnlYTD={pnlYTD}
          />

          {/* KPI HERO STRIP */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <KpiBig label="Capital sous gestion" value={fmtEurRaw(totalCapital)} sub={`${activeAccounts.length} actifs`} />
            <KpiBig label="P&L YTD trading" value={fmtEur(pnlYTD)} color={pnlYTD >= 0 ? '#22c55e' : '#ef4444'} />
            <KpiBig label="Payouts YTD" value={fmtEurRaw(totalPayoutsYTD)} color="#a855f7" sub={`${payouts.length} au total`} />
            <KpiBig label="Net réalisé" value={fmtEur(netProfitYTD)} color={netProfitYTD >= 0 ? '#22c55e' : '#ef4444'} sub="P&L + payouts" />
            <KpiBig label="P&L semaine" value={fmtEur(pnlOfWeek)} color={pnlOfWeek >= 0 ? '#22c55e' : '#ef4444'}
              sub={currentWeeklyTarget ? `${weeklyProgressPct.toFixed(0)}% obj.` : 'sans obj.'} />
            <KpiBig label="P&L ce mois" value={fmtEur(pnlOfMonth)} color={pnlOfMonth >= 0 ? '#22c55e' : '#ef4444'} />
            <KpiBig label="ROI Challenges" value={roi != null ? `${roi.toFixed(0)}%` : '—'} color={(roi ?? 0) >= 100 ? '#22c55e' : '#f59e0b'} sub={`Coût : ${fmtEurRaw(totalCostChallenge)}`} />
            <KpiBig label="Comptes" value={`${fundedAccounts.length} · ${challengeAccounts.length}`} sub="financés · challenge" color="#3b82f6" />
          </div>

          {/* AGGREGATE PROGRESS — all challenge accounts combined */}
          {aggregateChallengeTarget > 0 && (
            <div style={{ background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(34,197,94,0.03) 100%)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Progression cumulée · {challengeAccounts.length} challenges actifs
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>
                    <span style={{ color: aggregateChallengeProfit >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{fmtEur(aggregateChallengeProfit)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}> / {fmtEurRaw(aggregateChallengeTarget)}</span>
                  </div>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: aggregateProgressPct >= 100 ? '#22c55e' : aggregateProgressPct >= 50 ? '#22c55e' : aggregateProgressPct >= 0 ? '#3b82f6' : '#ef4444', fontFamily: 'monospace' }}>
                  {aggregateProgressPct.toFixed(0)}<span style={{ fontSize: 18, color: 'var(--text3)' }}>%</span>
                </div>
              </div>
              <div style={{ height: 12, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, aggregateProgressPct))}%`,
                  background: aggregateProgressPct >= 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #22c55e)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <MiniStat label="Meilleur cette semaine" value={bestWeekAccount && bestWeekAccount.pnl > 0 ? bestWeekAccount.account.label : '—'} sub={bestWeekAccount && bestWeekAccount.pnl > 0 ? fmtEur(bestWeekAccount.pnl) : ''} color="#22c55e" />
                <MiniStat label="Moins performant" value={worstWeekAccount && worstWeekAccount.pnl < 0 ? worstWeekAccount.account.label : '—'} sub={worstWeekAccount && worstWeekAccount.pnl < 0 ? fmtEur(worstWeekAccount.pnl) : ''} color="#ef4444" />
                <MiniStat label="Capacité rachat challenge" value={`${buybackCapacity} × challenges`} sub="depuis profits" color="#3b82f6" />
                <MiniStat label="Comptes financés" value={String(fundedAccounts.length)} sub={`${payouts.length} payouts reçus`} color="#a855f7" />
              </div>
            </div>
          )}

          {/* COMPTES FINANCÉS — génération de profit */}
          <FundedSection
            accounts={fundedAccounts}
            pnls={pnls}
            payouts={payouts}
            weekPnlByAccount={weekPnlByAccount}
            onEdit={setEditingAccount}
            onDelete={deleteAccount}
            onLogPayout={() => setShowPayoutModal(true)}
          />

          {fundedAccounts.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 }}>
              Pas encore de compte financé. Valide un challenge dans l&apos;onglet <strong style={{ color: 'var(--green)' }}>Validation Challenges</strong> puis reviens ici pour piloter tes payouts.
            </div>
          )}

          {/* PAYOUTS HISTORY */}
          {(fundedAccounts.length > 0 || payouts.length > 0) && (
            <PayoutsSection payouts={payouts} accounts={accounts} onDelete={deletePayout} onAdd={() => setShowPayoutModal(true)} totalYTD={totalPayoutsYTD} totalAll={totalPayouts} />
          )}

          {/* CHARTS */}
          {equityCurve.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ChartCard title="Equity curve global">
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tp-eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} width={55} tickFormatter={v => `${v}€`} />
                      <RTooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="var(--border)" />
                      <Area type="monotone" dataKey="cumulative" stroke="#22c55e" strokeWidth={2} fill="url(#tp-eq)" name="Cumulé" />
                      <Line type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={1} dot={false} name="DD" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="P&L par jour">
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={equityCurve.slice(-30)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text3)' }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} width={50} tickFormatter={v => `${v}€`} />
                      <RTooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="var(--border)" />
                      <Bar dataKey="daily">
                        {equityCurve.slice(-30).map((d, i) => <Cell key={i} fill={d.daily >= 0 ? '#22c55e' : '#ef4444'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Répartition par prop firm">
                {(() => {
                  const map: Record<string, number> = {}
                  for (const a of activeAccounts) map[a.propfirm] = (map[a.propfirm] || 0) + 1
                  const data = Object.entries(map).map(([name, value]) => ({ name, value }))
                  if (!data.length) return <div style={{ fontSize: 11, color: 'var(--text3)', padding: 20, textAlign: 'center' }}>—</div>
                  return (
                    <div style={{ height: 220 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2}>
                            {data.map((_, i) => <Cell key={i} fill={['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'][i % 8]} />)}
                          </Pie>
                          <RTooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })()}
              </ChartCard>

              <ChartCard title="Statut des comptes">
                <div className="grid grid-cols-2 gap-2 p-3">
                  <StatBadge label="Actifs" value={activeAccounts.length} color="#22c55e" />
                  <StatBadge label="Financés" value={fundedAccounts.length} color="#22c55e" />
                  <StatBadge label="Challenge" value={challengeAccounts.length} color="#3b82f6" />
                  <StatBadge label="Passés" value={passedAccounts.length} color="#3b82f6" />
                  <StatBadge label="En pause" value={accounts.filter(a => a.status === 'paused').length} color="#6b7280" />
                  <StatBadge label="Échoués" value={failedAccounts.length} color="#ef4444" />
                </div>
              </ChartCard>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {(editingAccount || showNewAccount) && (
        <AccountModal
          account={editingAccount}
          onClose={() => { setEditingAccount(null); setShowNewAccount(false) }}
          onSave={async (a) => {
            const ok = await saveAccount(a)
            if (ok) {
              setEditingAccount(null)
              setShowNewAccount(false)
            }
          }}
        />
      )}

      {showBulkAdd && (
        <BulkAccountsModal
          onClose={() => setShowBulkAdd(false)}
          onSave={async (rows) => {
            const ok = await bulkAddAccounts(rows)
            if (ok) setShowBulkAdd(false)
          }}
        />
      )}

      {showPayoutModal && (
        <PayoutModal
          accounts={fundedAccounts.length > 0 ? fundedAccounts : accounts}
          onClose={() => setShowPayoutModal(false)}
          onSave={async (accountId, date, amount, notes) => {
            await addPayout(accountId, date, amount, notes)
            setShowPayoutModal(false)
          }}
        />
      )}

      {pnlEditing && (
        <PnlModal
          accountId={pnlEditing.accountId}
          date={pnlEditing.date}
          existing={pnls.find(p => p.account_id === pnlEditing.accountId && p.date === pnlEditing.date) || null}
          accounts={accounts}
          activeAccounts={activeAccounts}
          pnls={pnls}
          onClose={() => setPnlEditing(null)}
          onSave={async (pnl, tradesCount, notes, accountIds) => {
            if (accountIds && accountIds.length > 1) {
              await savePnlMulti(accountIds, pnlEditing.date, pnl, tradesCount, notes)
            } else {
              await savePnl(pnlEditing.accountId, pnlEditing.date, pnl, tradesCount, notes)
            }
            setPnlEditing(null)
          }}
          onDelete={async () => {
            const existing = pnls.find(p => p.account_id === pnlEditing.accountId && p.date === pnlEditing.date)
            if (existing) await deletePnl(existing.id)
            setPnlEditing(null)
          }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────

interface AnnualHeroProps {
  year: number
  target: AnnualTarget | null
  editing: boolean
  setEditing: (v: boolean) => void
  onSave: (t: number) => Promise<void>
  netProfitYTD: number
  progressPct: number | null
  expectedPct: number
  paceOffset: number | null
  projectedEOY: number
  remainingToTarget: number
  requiredDailyPace: number
  daysElapsed: number
  daysRemaining: number
  daysInYear: number
  totalPayoutsYTD: number
  pnlYTD: number
}

function AnnualHero({
  year, target, editing, setEditing, onSave,
  netProfitYTD, progressPct, expectedPct, paceOffset, projectedEOY,
  remainingToTarget, requiredDailyPace, daysRemaining, totalPayoutsYTD, pnlYTD,
}: AnnualHeroProps) {
  const [input, setInput] = useState(target?.target_eur?.toString() || '')
  useEffect(() => { setInput(target?.target_eur?.toString() || '') }, [target])

  const pct = progressPct ?? 0
  const ringColor = pct >= 100 ? '#22c55e' : pct >= expectedPct ? '#22c55e' : pct >= expectedPct - 5 ? '#f59e0b' : '#ef4444'
  const paceLabel = paceOffset == null ? '—'
    : paceOffset >= 5 ? '✓ En avance'
    : paceOffset >= -5 ? '✓ Sur cadence'
    : paceOffset >= -15 ? '⚠ Léger retard'
    : '⚠ En retard'
  const paceColor = paceOffset == null ? 'var(--text3)'
    : paceOffset >= 5 ? '#22c55e'
    : paceOffset >= -5 ? '#22c55e'
    : paceOffset >= -15 ? '#f59e0b'
    : '#ef4444'

  const RING_SIZE = 180
  const RING_STROKE = 14
  const R = (RING_SIZE - RING_STROKE) / 2
  const CIRC = 2 * Math.PI * R
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * CIRC

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(34,197,94,0.05) 60%, var(--bg2) 100%)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 300, height: 300,
        background: `radial-gradient(circle at 100% 0%, ${ringColor}15 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <span style={{ fontSize: 22 }}>🎯</span>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Objectif business plan {year}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            Décomposition & cadence par rapport à ton objectif annuel
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center" style={{ position: 'relative' }}>
        {/* Ring */}
        <div className="flex flex-col items-center gap-2">
          <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 12px ${ringColor}40)` }}>
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R} fill="none" stroke="var(--bg3)" strokeWidth={RING_STROKE} />
              <circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R} fill="none"
                stroke={ringColor} strokeWidth={RING_STROKE}
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)' }}
              />
              {/* Expected pace marker */}
              <circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={R} fill="none"
                stroke="rgba(255,255,255,0.3)" strokeWidth={2}
                strokeDasharray={`${(expectedPct / 100) * CIRC} ${CIRC}`}
                strokeLinecap="butt"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: ringColor, lineHeight: 1, fontFamily: 'monospace' }}>
                {target ? `${Math.round(pct)}%` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>de l&apos;objectif</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: paceColor, fontWeight: 700 }}>{paceLabel}</div>
        </div>

        {/* Numbers */}
        <div className="col-span-1 md:col-span-2 flex flex-col gap-3">
          {editing ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                value={input}
                onChange={e => setInput(e.target.value)}
                onBlur={() => { onSave(Number(input) || 0); setEditing(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { onSave(Number(input) || 0); setEditing(false) } }}
                autoFocus
                placeholder="100000"
                style={{ padding: '10px 14px', background: 'var(--bg3)', border: '2px solid #22c55e', borderRadius: 8, color: '#22c55e', fontSize: 28, fontWeight: 800, fontFamily: 'monospace', outline: 'none', width: 260, textAlign: 'right' }}
              />
              <span style={{ fontSize: 22, color: '#22c55e', fontWeight: 700 }}>€ / an</span>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={{
              background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Objectif annuel</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: target ? '#22c55e' : 'var(--text3)', fontFamily: 'monospace', lineHeight: 1, marginTop: 2 }}>
                {target ? fmtEurRaw(target.target_eur) : 'Cliquer pour définir'}
                <span style={{ fontSize: 14, marginLeft: 8, color: 'var(--text3)' }}>✎</span>
              </div>
            </button>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            <MiniBlock label="Réalisé net" value={fmtEur(netProfitYTD)} color={netProfitYTD >= 0 ? '#22c55e' : '#ef4444'} sub={`P&L ${fmtEur(pnlYTD)} + payouts ${fmtEurRaw(totalPayoutsYTD)}`} />
            <MiniBlock label="Restant à faire" value={target ? fmtEur(Math.max(0, remainingToTarget)) : '—'} color={remainingToTarget > 0 ? '#f59e0b' : '#22c55e'} sub={target && remainingToTarget <= 0 ? '🎯 Objectif atteint !' : ''} />
            <MiniBlock label="Cadence requise" value={target && requiredDailyPace > 0 ? `${fmtEurRaw(requiredDailyPace)}/j` : '—'} color="#3b82f6" sub={`sur ${daysRemaining}j restants`} />
            <MiniBlock label="Projection fin d'année" value={fmtEur(projectedEOY)} color={target && projectedEOY >= target.target_eur ? '#22c55e' : '#f59e0b'} sub={target && target.target_eur > 0 ? `${((projectedEOY / target.target_eur) * 100).toFixed(0)}% de l'obj.` : ''} />
            <MiniBlock label="Attendu à date" value={target ? `${expectedPct.toFixed(0)}%` : '—'} color="var(--text2)" sub="cadence linéaire" />
            <MiniBlock label="Écart de cadence" value={paceOffset != null ? `${paceOffset >= 0 ? '+' : ''}${paceOffset.toFixed(0)}pts` : '—'} color={paceColor} sub={paceOffset != null && paceOffset >= 0 ? "d'avance" : 'de retard'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniBlock({ label, value, color = 'var(--text)', sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'monospace', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function KpiBig({ label, value, sub, color = 'var(--text)' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 10,
      borderLeft: `3px solid ${color === 'var(--text)' ? 'var(--border)' : color}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color, fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value, sub, color = 'var(--text)' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Kpi({ label, value, sub, color = 'var(--text)' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg3)', border: `1px solid ${color}30`, borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  )
}

function AccountCard({
  account, weekPnl, todayPnl, onEdit, onDelete,
}: {
  account: PropAccount
  weekPnl: number
  todayPnl: number
  onEdit: () => void
  onDelete: () => void
}) {
  const phase = PHASE_LABELS[account.phase]
  const status = STATUS_LABELS[account.status]
  const totalPnl = Number(account.current_balance) - Number(account.starting_balance)
  const targetPct = account.profit_target_pct ?? null
  const targetAmount = account.profit_target_amount ?? (targetPct != null ? Number(account.account_size) * (targetPct / 100) : null)
  const progressPct = targetAmount && targetAmount > 0 ? Math.max(0, Math.min(100, (totalPnl / targetAmount) * 100)) : null
  const maxDdEur = account.max_total_dd_pct != null ? Number(account.account_size) * (Number(account.max_total_dd_pct) / 100) : null
  const currentDdEur = Math.max(0, Number(account.starting_balance) - Number(account.current_balance))
  const ddPct = maxDdEur && maxDdEur > 0 ? (currentDdEur / maxDdEur) * 100 : null
  const ddColor = ddPct == null ? 'var(--text3)' : ddPct > 75 ? '#ef4444' : ddPct > 50 ? '#f59e0b' : '#22c55e'

  return (
    <EntityCard
      title={account.label}
      subtitle={
        <>
          <span>{account.propfirm}</span>
          <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-data)' }}>{fmtEurRaw(account.account_size)}</span>
        </>
      }
      topRight={
        <>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: phase.bg, color: phase.color, letterSpacing: '0.04em' }}>
            {phase.label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: status.color, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: status.color, display: 'inline-block' }} />
            {status.label}
          </span>
        </>
      }
      accentColor={phase.color}
      dimmed={account.status === 'failed'}
      hero={<BalanceHero currentBalance={Number(account.current_balance)} startingBalance={Number(account.starting_balance)} />}
      weekPnl={weekPnl}
      todayPnl={todayPnl}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      {/* Progress to target */}
      {progressPct != null && (
        <div style={{ marginBottom: 10 }}>
          <div className="flex justify-between mb-1.5" style={{ fontSize: 10, color: 'var(--text3)' }}>
            <span>Objectif {targetPct ? `${targetPct}%` : ''} <span style={{ fontFamily: 'monospace' }}>({fmtEurRaw(targetAmount)})</span></span>
            <span style={{ fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace' }}>{progressPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct >= 100 ? '#22c55e' : `linear-gradient(90deg, #3b82f6, #22c55e)`, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {/* DD gauge */}
      {ddPct != null && (
        <div style={{ marginBottom: 12 }}>
          <div className="flex justify-between mb-1.5" style={{ fontSize: 10, color: 'var(--text3)' }}>
            <span>DD utilisé <span style={{ fontFamily: 'monospace' }}>({fmtEurRaw(currentDdEur)} / {fmtEurRaw(maxDdEur)})</span></span>
            <span style={{ fontWeight: 800, color: ddColor, fontFamily: 'monospace' }}>{ddPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, ddPct)}%`, background: ddColor, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}
    </EntityCard>
  )
}

function WeeklyTargetSection({
  currentMonday, setCurrentMonday, target, dailyTargets, weekDates, weekPnls, onSaveTarget, onSetDailyOverride,
}: {
  currentMonday: string
  setCurrentMonday: (s: string) => void
  target: WeeklyTarget | null
  dailyTargets: Record<string, number>
  weekDates: string[]
  weekPnls: DailyPnL[]
  onSaveTarget: (t: number) => Promise<void>
  onSetDailyOverride: (date: string, target: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(target?.target_eur.toString() || '')
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [dayInputValue, setDayInputValue] = useState('')

  useEffect(() => {
    setInputValue(target?.target_eur.toString() || '')
  }, [target])

  const dailyActual: Record<string, number> = {}
  for (const p of weekPnls) dailyActual[p.date] = (dailyActual[p.date] || 0) + Number(p.pnl)

  const weekActual = Object.values(dailyActual).reduce((s, v) => s + v, 0)
  const weekProgress = target && target.target_eur > 0 ? (weekActual / target.target_eur) * 100 : 0

  const shiftWeek = (dir: number) => {
    const d = new Date(currentMonday)
    d.setDate(d.getDate() + dir * 7)
    setCurrentMonday(mondayOf(d))
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} style={{ padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>◀</button>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 200, textAlign: 'center' }}>
            Semaine du {new Date(currentMonday).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <button onClick={() => shiftWeek(1)} style={{ padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>▶</button>
          <button onClick={() => setCurrentMonday(mondayOf(new Date()))} style={{ padding: '4px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}>Aujourd&apos;hui</button>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>Objectif :</span>
          {editing ? (
            <>
              <input
                type="number"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onBlur={() => { onSaveTarget(Number(inputValue) || 0); setEditing(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { onSaveTarget(Number(inputValue) || 0); setEditing(false) } }}
                autoFocus
                placeholder="5000"
                style={{ padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--green)', borderRadius: 4, color: 'var(--green)', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', width: 100, outline: 'none', textAlign: 'right' }}
              />
              <span style={{ fontSize: 11, color: 'var(--green)' }}>€</span>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={{
              padding: '4px 10px', background: target ? 'rgba(34,197,94,0.12)' : 'var(--bg3)',
              color: target ? '#22c55e' : 'var(--text3)',
              border: `1px solid ${target ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
              borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer',
            }}>
              {target ? `${fmtEurRaw(target.target_eur)} €` : 'Définir un objectif ✎'}
            </button>
          )}
        </div>
      </div>

      {target && (
        <>
          {/* Global week progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text3)' }}>
              <span>Progression semaine</span>
              <span>
                <strong style={{ color: weekActual >= 0 ? '#22c55e' : '#ef4444' }}>{fmtEur(weekActual)}</strong>
                <span style={{ color: 'var(--text3)' }}> / {fmtEurRaw(target.target_eur)}</span>
                <strong style={{ marginLeft: 8, color: weekProgress >= 100 ? '#22c55e' : 'var(--text)' }}>{weekProgress.toFixed(0)}%</strong>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              {weekProgress >= 0 ? (
                <div style={{ height: '100%', width: `${Math.min(100, weekProgress)}%`, background: weekProgress >= 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #22c55e)', borderRadius: 4 }} />
              ) : (
                <div style={{ height: '100%', width: `${Math.min(100, Math.abs(weekProgress))}%`, background: '#ef4444', borderRadius: 4 }} />
              )}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '80%', width: 1, background: 'var(--border)' }} />
            </div>
          </div>

          {/* Per-day breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {weekDates.map((d, i) => {
              const dailyTarget = dailyTargets[d] || 0
              const dailyActualVal = dailyActual[d] || 0
              const pct = dailyTarget > 0 ? (dailyActualVal / dailyTarget) * 100 : 0
              const isToday = d === todayISO()
              const dayLabel = DAY_LABELS_FR[i]
              const dateD = new Date(d)
              const isWeekend = i >= 5
              return (
                <div key={d} style={{
                  padding: '8px 10px',
                  background: isToday ? 'rgba(34,197,94,0.06)' : 'var(--bg3)',
                  border: `1px solid ${isToday ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                  borderRadius: 6,
                  opacity: isWeekend && dailyTarget === 0 ? 0.5 : 1,
                }}>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? '#22c55e' : 'var(--text3)', textTransform: 'uppercase' }}>
                      {dayLabel} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{dateD.getDate()}</span>
                    </span>
                    {editingDay === d ? (
                      <input
                        type="number"
                        value={dayInputValue}
                        onChange={e => setDayInputValue(e.target.value)}
                        onBlur={() => { onSetDailyOverride(d, Number(dayInputValue) || 0); setEditingDay(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { onSetDailyOverride(d, Number(dayInputValue) || 0); setEditingDay(null) } }}
                        autoFocus
                        style={{ padding: '1px 4px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontSize: 9, fontFamily: 'monospace', width: 60, outline: 'none' }}
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingDay(d); setDayInputValue(String(Math.round(dailyTarget))) }}
                        title="Modifier l'objectif de ce jour"
                        style={{ fontSize: 9, color: 'var(--text3)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        obj {fmtEurRaw(dailyTarget)} ✎
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: dailyActualVal >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                    {fmtEur(dailyActualVal)}
                  </div>
                  {dailyTarget > 0 && (
                    <div style={{ marginTop: 4, height: 3, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: pct >= 100 ? '#22c55e' : 'var(--text2)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function DailyPnlMatrix({
  accounts, pnls, weekDates, onEdit,
}: {
  accounts: PropAccount[]
  pnls: DailyPnL[]
  weekDates: string[]
  onEdit: (accountId: string, date: string) => void
}) {
  if (accounts.length === 0) return null

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div className="text-[10px] uppercase tracking-wider font-bold mb-3" style={{ color: 'var(--text3)' }}>
        Saisie P&L par jour × compte
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>Compte</th>
              {weekDates.slice(0, 5).map((d, i) => {
                const dateD = new Date(d)
                const isToday = d === todayISO()
                return (
                  <th key={d} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: isToday ? '#22c55e' : 'var(--text3)', textTransform: 'uppercase', textAlign: 'center' }}>
                    {DAY_LABELS_FR[i]} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>{dateD.getDate()}</span>
                  </th>
                )
              })}
              <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => {
              const weekTotal = weekDates.slice(0, 5).reduce((s, d) => {
                const p = pnls.find(x => x.account_id === a.id && x.date === d)
                return s + (p ? Number(p.pnl) : 0)
              }, 0)
              return (
                <tr key={a.id}>
                  <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
                    <div style={{ fontSize: 11 }}>{a.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)' }}>{a.propfirm}</div>
                  </td>
                  {weekDates.slice(0, 5).map(d => {
                    const p = pnls.find(x => x.account_id === a.id && x.date === d)
                    const val = p ? Number(p.pnl) : null
                    const hasVal = val != null
                    return (
                      <td key={d} style={{ padding: 2, textAlign: 'center' }}>
                        <button
                          onClick={() => onEdit(a.id, d)}
                          style={{
                            width: '100%', padding: '6px 4px', borderRadius: 4,
                            background: !hasVal ? 'var(--bg3)' : val >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            border: `1px solid ${!hasVal ? 'var(--border)' : val >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            color: !hasVal ? 'var(--text3)' : val >= 0 ? '#22c55e' : '#ef4444',
                            fontSize: 12, fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer',
                          }}>
                          {hasVal ? fmtEur(val) : '+'}
                        </button>
                      </td>
                    )
                  })}
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: weekTotal >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                    {fmtEur(weekTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────

function AccountModal({
  account, onClose, onSave,
}: {
  account: PropAccount | null
  onClose: () => void
  onSave: (a: Partial<PropAccount>) => Promise<void>
}) {
  const [form, setForm] = useState<Partial<PropAccount>>(
    account || {
      label: '', propfirm: 'FTMO', account_size: 100000,
      starting_balance: 100000, current_balance: 100000,
      phase: 'p1', status: 'active',
      profit_target_pct: 8, max_daily_loss_pct: 5, max_total_dd_pct: 10,
      min_trading_days: 4, consistency_rule_pct: null,
      trailing_dd: false, cost_eur: null, payout_split_pct: 80,
    }
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl flex flex-col" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {account ? '✎ Éditer le compte' : '+ Nouveau compte prop firm'}
          </h2>
          <button onClick={onClose} className="text-xl px-2" style={{ color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Label</label>
              <input type="text" value={form.label || ''} onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="FTMO 100k #1"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Prop firm</label>
              <select value={form.propfirm || ''} onChange={e => setForm({ ...form, propfirm: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {PROPFIRMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Phase</label>
              <select value={form.phase || 'p1'} onChange={e => setForm({ ...form, phase: e.target.value as Phase })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="p1">Challenge Phase 1</option>
                <option value="p2">Challenge Phase 2</option>
                <option value="funded">Financé</option>
                <option value="failed">Échoué</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Statut</label>
              <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value as Status })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="active">Actif</option>
                <option value="passed">Passé</option>
                <option value="failed">Failed</option>
                <option value="paused">Pause</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Taille (€)</label>
              <input type="number" value={form.account_size || ''} onChange={e => setForm({ ...form, account_size: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Balance initiale</label>
              <input type="number" value={form.starting_balance || ''} onChange={e => setForm({ ...form, starting_balance: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--green)' }}>Balance actuelle</label>
              <input type="number" value={form.current_balance || ''} onChange={e => setForm({ ...form, current_balance: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono font-bold"
                style={{ background: 'var(--bg3)', border: '1px solid var(--green)', color: 'var(--green)' }} />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Target %</label>
              <input type="number" value={form.profit_target_pct ?? ''} onChange={e => setForm({ ...form, profit_target_pct: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Max daily loss %</label>
              <input type="number" value={form.max_daily_loss_pct ?? ''} onChange={e => setForm({ ...form, max_daily_loss_pct: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Max total DD %</label>
              <input type="number" value={form.max_total_dd_pct ?? ''} onChange={e => setForm({ ...form, max_total_dd_pct: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Min days</label>
              <input type="number" value={form.min_trading_days ?? ''} onChange={e => setForm({ ...form, min_trading_days: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Consistency %</label>
              <input type="number" value={form.consistency_rule_pct ?? ''} onChange={e => setForm({ ...form, consistency_rule_pct: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="ex 30"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Coût (€)</label>
              <input type="number" value={form.cost_eur ?? ''} onChange={e => setForm({ ...form, cost_eur: e.target.value === '' ? null : Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Payout split %</label>
              <input type="number" value={form.payout_split_pct ?? ''} onChange={e => setForm({ ...form, payout_split_pct: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="80"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!form.trailing_dd} onChange={e => setForm({ ...form, trailing_dd: e.target.checked })} />
            Trailing drawdown (DD glissant depuis peak)
          </label>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Notes</label>
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={save} disabled={saving || !form.label}
            className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{ background: saving || !form.label ? 'var(--bg3)' : 'var(--color-accent)', color: saving || !form.label ? 'var(--text3)' : '#000', cursor: saving || !form.label ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Enregistrement…' : (account ? 'Enregistrer' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PnlModal({
  accountId, date, existing, accounts, activeAccounts, pnls, onClose, onSave, onDelete,
}: {
  accountId: string
  date: string
  existing: DailyPnL | null
  accounts: PropAccount[]
  activeAccounts: PropAccount[]
  pnls: DailyPnL[]
  onClose: () => void
  onSave: (pnl: number, tradesCount?: number, notes?: string, accountIds?: string[]) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const account = accounts.find(a => a.id === accountId)
  const [pnl, setPnl] = useState<string>(existing?.pnl.toString() || '')
  const [tradesCount, setTradesCount] = useState<string>(existing?.trades_count?.toString() || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [applyToAll, setApplyToAll] = useState(false)

  const otherActive = activeAccounts.filter(a => a.id !== accountId)
  const otherActiveWithExisting = otherActive.filter(a =>
    pnls.some(p => p.account_id === a.id && p.date === date)
  )
  const canApplyToAll = otherActive.length > 0

  const save = async () => {
    setSaving(true)
    const ids = applyToAll && canApplyToAll
      ? [accountId, ...otherActive.map(a => a.id)]
      : undefined
    await onSave(Number(pnl) || 0, tradesCount ? Number(tradesCount) : undefined, notes || undefined, ids)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl flex flex-col" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{account?.label}</h2>
          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{account?.propfirm}</div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>P&L du jour (€)</label>
            <input type="number" value={pnl} onChange={e => setPnl(e.target.value)}
              autoFocus placeholder="+500 ou -200"
              className="w-full px-3 py-2 rounded-lg text-lg outline-none font-mono font-bold"
              style={{ background: 'var(--bg3)', border: '1px solid var(--green)', color: Number(pnl) >= 0 ? '#22c55e' : '#ef4444' }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Nb trades (optionnel)</label>
            <input type="number" value={tradesCount} onChange={e => setTradesCount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          {canApplyToAll && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: applyToAll ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
              border: `1px solid ${applyToAll ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
              transition: 'all 0.15s ease',
            }}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={e => setApplyToAll(e.target.checked)}
                  className="mt-0.5"
                  style={{ accentColor: '#22c55e', cursor: 'pointer' }}
                />
                <div className="flex-1">
                  <div style={{ fontSize: 11, fontWeight: 700, color: applyToAll ? '#22c55e' : 'var(--text)' }}>
                    Appliquer à tous les comptes actifs ({activeAccounts.length})
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    Enregistre le même P&L / nb trades / notes sur {otherActive.length} autre{otherActive.length > 1 ? 's' : ''} compte{otherActive.length > 1 ? 's' : ''} actif{otherActive.length > 1 ? 's' : ''}.
                    {otherActiveWithExisting.length > 0 && applyToAll && (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                        {' '}⚠ {otherActiveWithExisting.length} saisie{otherActiveWithExisting.length > 1 ? 's' : ''} existante{otherActiveWithExisting.length > 1 ? 's' : ''} sera{otherActiveWithExisting.length > 1 ? 'ont' : ''} écrasée{otherActiveWithExisting.length > 1 ? 's' : ''}.
                      </span>
                    )}
                  </div>
                  {applyToAll && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {otherActive.map(a => {
                        const hasExisting = pnls.some(p => p.account_id === a.id && p.date === date)
                        return (
                          <span key={a.id} style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 4,
                            background: hasExisting ? 'rgba(245,158,11,0.15)' : 'var(--bg2)',
                            color: hasExisting ? '#f59e0b' : 'var(--text3)',
                            border: `1px solid ${hasExisting ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                            fontFamily: 'monospace',
                          }}>
                            {a.label}{hasExisting ? ' ⚠' : ''}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </label>
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-between" style={{ borderColor: 'var(--border)' }}>
          {existing ? (
            <button onClick={onDelete} className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer' }}>
              Supprimer
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold"
              style={{ background: saving ? 'var(--bg3)' : 'var(--color-accent)', color: saving ? 'var(--text3)' : '#000', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Enregistrement…' : applyToAll && canApplyToAll ? `Enregistrer sur ${activeAccounts.length} comptes` : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Payouts section ────────────────────────────────────

function PayoutsSection({
  payouts, accounts, onDelete, onAdd, totalYTD, totalAll,
}: {
  payouts: Payout[]
  accounts: PropAccount[]
  onDelete: (id: string) => Promise<void>
  onAdd: () => void
  totalYTD: number
  totalAll: number
}) {
  const accountMap = new Map(accounts.map(a => [a.id, a]))
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(168,85,247,0.03) 100%)',
      border: '1px solid var(--border)', borderRadius: 12, padding: 16,
    }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 22 }}>💰</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payouts reçus</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#a855f7', fontFamily: 'monospace', marginTop: 2 }}>
              {fmtEurRaw(totalYTD)} <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>cette année · {fmtEurRaw(totalAll)} au total</span>
            </div>
          </div>
        </div>
        <button onClick={onAdd} className="px-3 py-2 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.35)', cursor: 'pointer' }}>
          + Enregistrer un payout
        </button>
      </div>
      {payouts.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 12, background: 'var(--bg3)', borderRadius: 8 }}>
          Aucun payout enregistré. Clique &laquo;+ Enregistrer un payout&raquo; quand tu reçois un virement depuis un compte financé.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
          {payouts.map(p => {
            const acc = accountMap.get(p.account_id)
            return (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 1fr auto', gap: 8, alignItems: 'center',
                padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8,
                borderLeft: '3px solid #a855f7',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
                  {new Date(p.payout_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{acc?.label || '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{acc?.propfirm || ''}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#a855f7', fontFamily: 'monospace' }}>
                  {fmtEurRaw(p.amount_eur)}
                </div>
                <button onClick={() => onDelete(p.id)} style={{
                  padding: '4px 8px', background: 'transparent', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Payout modal ───────────────────────────────────────

function PayoutModal({
  accounts, onClose, onSave,
}: {
  accounts: PropAccount[]
  onClose: () => void
  onSave: (accountId: string, date: string, amount: number, notes?: string) => Promise<void>
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!accountId || !amount) return
    setSaving(true)
    await onSave(accountId, date, Number(amount), notes || undefined)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl flex flex-col" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>💰 Enregistrer un payout</h2>
          <button onClick={onClose} className="text-xl px-2" style={{ color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Compte</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.propfirm})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: '#a855f7' }}>Montant (€)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="1500"
                className="w-full px-3 py-2 rounded-lg text-xs outline-none font-mono font-bold"
                style={{ background: 'var(--bg3)', border: '1px solid #a855f7', color: '#a855f7' }} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={save} disabled={saving || !accountId || !amount} className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{
              background: saving || !accountId || !amount ? 'var(--bg3)' : '#a855f7',
              color: saving || !accountId || !amount ? 'var(--text3)' : '#000',
              cursor: saving || !accountId || !amount ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk accounts modal ────────────────────────────────

function BulkAccountsModal({
  onClose, onSave,
}: {
  onClose: () => void
  onSave: (rows: Partial<PropAccount>[]) => Promise<void>
}) {
  const emptyRow = (): Partial<PropAccount> => ({
    label: '', propfirm: 'FTMO', account_size: 100000,
    starting_balance: 100000, current_balance: 100000,
    phase: 'p1' as Phase, status: 'active' as Status,
    profit_target_pct: 8, max_daily_loss_pct: 5, max_total_dd_pct: 10,
    min_trading_days: 4, cost_eur: null, payout_split_pct: 80,
  })
  const [rows, setRows] = useState<Partial<PropAccount>[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()])
  const [saving, setSaving] = useState(false)

  const updateRow = (i: number, patch: Partial<PropAccount>) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  const copyFromFirst = () => {
    if (!rows[0]) return
    const first = rows[0]
    setRows(prev => prev.map((r, i) => i === 0 ? r : {
      ...r,
      propfirm: first.propfirm,
      account_size: first.account_size,
      starting_balance: first.starting_balance,
      current_balance: first.current_balance,
      phase: first.phase,
      profit_target_pct: first.profit_target_pct,
      max_daily_loss_pct: first.max_daily_loss_pct,
      max_total_dd_pct: first.max_total_dd_pct,
      cost_eur: first.cost_eur,
    }))
  }

  const validCount = rows.filter(r => r.label && r.label.trim()).length

  const save = async () => {
    setSaving(true)
    await onSave(rows)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-6xl rounded-2xl flex flex-col" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>+ Ajouter plusieurs comptes en lot</h2>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>Remplis le label et modifie ce qui change. {validCount}/5 lignes prêtes.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyFromFirst} className="px-3 py-1.5 rounded text-[11px] font-bold"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.35)', cursor: 'pointer' }}
              title="Copier les paramètres de la ligne 1 sur les autres">
              ⇩ Copier ligne 1 → tous
            </button>
            <button onClick={onClose} className="text-xl px-2" style={{ color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, fontSize: 11 }}>
            <thead>
              <tr style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Label *</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Prop firm</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Taille</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Phase</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Target %</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Max daily %</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Max DD %</th>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Coût €</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 6px', fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: 2 }}>
                    <input type="text" value={r.label || ''} onChange={e => updateRow(i, { label: e.target.value })}
                      placeholder={`FTMO 100k #${i + 1}`}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, outline: 'none' }} />
                  </td>
                  <td style={{ padding: 2 }}>
                    <select value={r.propfirm || ''} onChange={e => updateRow(i, { propfirm: e.target.value })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                      {PROPFIRMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 2 }}>
                    <input type="number" value={r.account_size || ''} onChange={e => updateRow(i, { account_size: Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                  </td>
                  <td style={{ padding: 2 }}>
                    <select value={r.phase || 'p1'} onChange={e => updateRow(i, { phase: e.target.value as Phase })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, outline: 'none' }}>
                      <option value="p1">P1</option>
                      <option value="p2">P2</option>
                      <option value="funded">Funded</option>
                    </select>
                  </td>
                  <td style={{ padding: 2 }}>
                    <input type="number" value={r.profit_target_pct ?? ''} onChange={e => updateRow(i, { profit_target_pct: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                  </td>
                  <td style={{ padding: 2 }}>
                    <input type="number" value={r.max_daily_loss_pct ?? ''} onChange={e => updateRow(i, { max_daily_loss_pct: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                  </td>
                  <td style={{ padding: 2 }}>
                    <input type="number" value={r.max_total_dd_pct ?? ''} onChange={e => updateRow(i, { max_total_dd_pct: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                  </td>
                  <td style={{ padding: 2 }}>
                    <input type="number" value={r.cost_eur ?? ''} onChange={e => updateRow(i, { cost_eur: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ width: '100%', padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)' }}>
            💡 La balance initiale et actuelle prennent automatiquement la taille du compte. Édite manuellement chaque compte pour les ajuster.
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={save} disabled={saving || validCount === 0} className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{
              background: saving || validCount === 0 ? 'var(--bg3)' : 'var(--color-accent)',
              color: saving || validCount === 0 ? 'var(--text3)' : '#000',
              cursor: saving || validCount === 0 ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Création…' : `Créer ${validCount} compte${validCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════
// ── CHALLENGES SECTION ─────────────────────────────────
// ═══════════════════════════════════════════════════════

function ChallengesSection({
  accounts, pnls, weekPnlByAccount, onEdit, onDelete,
}: {
  accounts: PropAccount[]
  pnls: DailyPnL[]
  weekPnlByAccount: Record<string, number>
  onEdit: (a: PropAccount) => void
  onDelete: (id: string) => void
}) {
  // Aggregate stats
  const totalCost = accounts.reduce((s, a) => s + Number(a.cost_eur || 0), 0)
  const totalTargetToUnlock = accounts.reduce((s, a) => {
    const target = a.profit_target_amount ?? (a.profit_target_pct != null ? Number(a.account_size) * (Number(a.profit_target_pct) / 100) : 0)
    return s + Number(target || 0)
  }, 0)
  const totalProfitOnChallenges = accounts.reduce((s, a) => s + (Number(a.current_balance) - Number(a.starting_balance)), 0)
  const avgProgress = totalTargetToUnlock > 0 ? (totalProfitOnChallenges / totalTargetToUnlock) * 100 : 0
  const nearValidation = accounts.filter(a => {
    const target = a.profit_target_amount ?? (a.profit_target_pct != null ? Number(a.account_size) * (Number(a.profit_target_pct) / 100) : 0)
    const profit = Number(a.current_balance) - Number(a.starting_balance)
    return target > 0 && profit / target >= 0.5
  }).length

  // Capital financé si tous validés (uniquement pour P2 → funded, ou P1 → P2 → funded si applicable)
  const capitalIfAllValidated = accounts.reduce((s, a) => {
    if (a.phase === 'p2') return s + Number(a.account_size) // proche du funded
    return s
  }, 0)

  if (accounts.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(59,130,246,0.03) 100%)',
        border: '1px solid var(--border)', borderRadius: 12, padding: 20,
      }}>
        <div className="flex items-center gap-3 mb-2">
          <span style={{ fontSize: 22 }}>🎯</span>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Challenges en cours</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Objectif : valider chaque challenge pour débloquer un compte financé</div>
          </div>
        </div>
        <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg3)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 }}>
          Aucun compte en challenge actif.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(59,130,246,0.04) 100%)',
      border: '1px solid var(--border)', borderRadius: 12, padding: 16,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 26 }}>🎯</span>
          <div>
            <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Challenges en cours · {accounts.length} compte{accounts.length > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Objectif : valider chaque challenge sans casser les règles
            </div>
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Progression cumulée</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: avgProgress >= 100 ? '#22c55e' : '#3b82f6', fontFamily: 'monospace' }}>
            {avgProgress.toFixed(0)}<span style={{ fontSize: 14, color: 'var(--text3)' }}>%</span>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <MiniStat label="Coût total investi" value={fmtEurRaw(totalCost)} color="#f59e0b" sub="challenges" />
        <MiniStat label="Profit cumulé" value={fmtEur(totalProfitOnChallenges)} color={totalProfitOnChallenges >= 0 ? '#22c55e' : '#ef4444'} sub={`/ ${fmtEurRaw(totalTargetToUnlock)} à faire`} />
        <MiniStat label="Restant à faire" value={fmtEurRaw(Math.max(0, totalTargetToUnlock - totalProfitOnChallenges))} color="#3b82f6" sub="pour tout valider" />
        <MiniStat label="Proches validation" value={String(nearValidation)} color="#22c55e" sub="≥ 50% du target" />
        <MiniStat label="Capital si tous validés" value={fmtEurRaw(capitalIfAllValidated + accounts.filter(a => a.phase === 'p1').reduce((s, a) => s + Number(a.account_size), 0))} color="#a855f7" sub="funded débloqué" />
      </div>

      {/* Global progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, avgProgress))}%`,
            background: avgProgress >= 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #22c55e)',
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(a => (
          <ChallengeCard
            key={a.id}
            account={a}
            weekPnl={weekPnlByAccount[a.id] || 0}
            todayPnl={pnls.filter(p => p.account_id === a.id && p.date === todayISO()).reduce((s, p) => s + Number(p.pnl), 0)}
            accountPnls={pnls.filter(p => p.account_id === a.id)}
            onEdit={() => onEdit(a)}
            onDelete={() => onDelete(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ChallengeCard({
  account, weekPnl, todayPnl, accountPnls, onEdit, onDelete,
}: {
  account: PropAccount
  weekPnl: number
  todayPnl: number
  accountPnls: DailyPnL[]
  onEdit: () => void
  onDelete: () => void
}) {
  const phase = PHASE_LABELS[account.phase]
  const profit = Number(account.current_balance) - Number(account.starting_balance)
  const targetAmount = account.profit_target_amount ?? (account.profit_target_pct != null ? Number(account.account_size) * (Number(account.profit_target_pct) / 100) : 0)
  const remaining = Math.max(0, targetAmount - profit)
  const progressPct = targetAmount > 0 ? (profit / targetAmount) * 100 : 0

  const tradingDaysElapsed = accountPnls.filter(p => Number(p.pnl) !== 0).length
  const minDays = account.min_trading_days || 0
  const minDaysMet = tradingDaysElapsed >= minDays

  const currentDdEur = Math.max(0, Number(account.starting_balance) - Number(account.current_balance))
  const maxDdEur = account.max_total_dd_pct != null ? Number(account.account_size) * (Number(account.max_total_dd_pct) / 100) : null
  const ddPct = maxDdEur && maxDdEur > 0 ? (currentDdEur / maxDdEur) * 100 : null
  const ddColor = ddPct == null ? 'var(--text3)' : ddPct > 75 ? '#ef4444' : ddPct > 50 ? '#f59e0b' : '#22c55e'

  const positivePnls = accountPnls.filter(p => Number(p.pnl) !== 0).slice(0, 10).map(p => Number(p.pnl))
  const avgDaily = positivePnls.length > 0 ? positivePnls.reduce((s, v) => s + v, 0) / positivePnls.length : 0
  const etaDays = avgDaily > 0 ? Math.ceil(remaining / avgDaily) : null

  const RING = 150
  const R = 62
  const STROKE = 12
  const CIRC = 2 * Math.PI * R
  const dash = (Math.max(0, Math.min(100, progressPct)) / 100) * CIRC
  const ringColor = progressPct >= 100 ? '#22c55e' : progressPct >= 60 ? '#22c55e' : progressPct >= 30 ? '#3b82f6' : progressPct >= 0 ? '#f59e0b' : '#ef4444'

  const validated = progressPct >= 100 && minDaysMet

  return (
    <EntityCard
      title={account.label}
      subtitle={
        <>
          <span>{account.propfirm}</span>
          <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-data)' }}>{fmtEurRaw(account.account_size)}</span>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10,
            background: phase.bg, color: phase.color, letterSpacing: '0.04em',
          }}>{phase.label}</span>
        </>
      }
      accentColor={phase.color}
      variant={validated ? 'success' : 'default'}
      cornerBadge={validated && (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 6,
          background: 'var(--color-profit)', color: '#000', letterSpacing: '0.08em',
          boxShadow: '0 2px 8px rgba(var(--color-profit-rgb), 0.3)',
        }}>
          ✓ VALIDÉ
        </span>
      )}
      hero={<BalanceHero currentBalance={Number(account.current_balance)} startingBalance={Number(account.starting_balance)} />}
      perfCells={<PerfCells weekPnl={weekPnl} todayPnl={todayPnl} weekLabel="Semaine" />}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      {/* Ring + validation target */}
      <div className="flex items-center gap-4 mb-4">
        <div style={{ position: 'relative', width: RING, height: RING, flexShrink: 0 }}>
          <svg width={RING} height={RING} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 10px ${ringColor}40)` }}>
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="var(--bg3)" strokeWidth={STROKE} />
            <circle cx={RING / 2} cy={RING / 2} r={R} fill="none"
              stroke={ringColor} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRC}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: ringColor, lineHeight: 1, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{Math.round(progressPct)}%</div>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em' }}>validation</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Objectif</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.1, marginTop: 3, letterSpacing: '-0.02em' }}>
            {fmtEurRaw(targetAmount)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
            {account.profit_target_pct}% du compte
          </div>
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 11, color: 'var(--text2)' }}>
            {remaining > 0 ? (
              <>Reste <strong style={{ color: '#3b82f6', fontFamily: 'monospace', fontSize: 13 }}>{fmtEurRaw(remaining)}</strong></>
            ) : (
              <span style={{ color: '#22c55e', fontWeight: 700 }}>🎯 Target atteint</span>
            )}
          </div>
        </div>
      </div>

      {/* Meta grid — bigger cells */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Jours tradés</div>
          <div style={{ color: minDaysMet ? '#22c55e' : 'var(--text)', fontWeight: 800, fontSize: 16, fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {tradingDaysElapsed}<span style={{ color: 'var(--text3)', fontSize: 12 }}>/{minDays || '—'}</span>
            {minDaysMet && <span style={{ marginLeft: 4, color: '#22c55e', fontSize: 12 }}>✓</span>}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>DD utilisé</div>
          <div style={{ color: ddColor, fontWeight: 800, fontSize: 16, fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {ddPct != null ? `${ddPct.toFixed(0)}%` : '—'}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>ETA valid.</div>
          <div style={{ color: etaDays != null ? '#3b82f6' : 'var(--text3)', fontWeight: 800, fontSize: 16, fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {etaDays != null ? `~${etaDays}j` : '—'}
          </div>
        </div>
      </div>

      {/* DD gauge */}
      {ddPct != null && (
        <div style={{ marginBottom: 12 }}>
          <div className="flex justify-between mb-1.5" style={{ fontSize: 10, color: 'var(--text3)' }}>
            <span>Drawdown <span style={{ fontFamily: 'monospace' }}>({fmtEurRaw(currentDdEur)} / {fmtEurRaw(maxDdEur)})</span></span>
            <span style={{ fontWeight: 800, color: ddColor, fontFamily: 'monospace' }}>{ddPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, ddPct)}%`, background: ddColor, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

    </EntityCard>
  )
}

// ═══════════════════════════════════════════════════════
// ── FUNDED SECTION ─────────────────────────────────────
// ═══════════════════════════════════════════════════════

function FundedSection({
  accounts, pnls, payouts, weekPnlByAccount, onEdit, onDelete, onLogPayout,
}: {
  accounts: PropAccount[]
  pnls: DailyPnL[]
  payouts: Payout[]
  weekPnlByAccount: Record<string, number>
  onEdit: (a: PropAccount) => void
  onDelete: (id: string) => void
  onLogPayout: () => void
}) {
  const totalCurrentProfit = accounts.reduce((s, a) => s + (Number(a.current_balance) - Number(a.starting_balance)), 0)
  const totalPayoutsAllTime = payouts.filter(p => accounts.some(a => a.id === p.account_id)).reduce((s, p) => s + Number(p.amount_eur), 0)
  const eligibleForPayout = accounts.filter(a => {
    const profit = Number(a.current_balance) - Number(a.starting_balance)
    return profit >= 100 // simplified minimum payout threshold
  }).length
  const totalCapitalManaged = accounts.reduce((s, a) => s + Number(a.account_size), 0)

  if (accounts.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(168,85,247,0.03) 100%)',
        border: '1px solid var(--border)', borderRadius: 12, padding: 20,
      }}>
        <div className="flex items-center gap-3 mb-2">
          <span style={{ fontSize: 22 }}>💰</span>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Comptes financés</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Objectif : générer du profit régulier et récupérer tes payouts</div>
          </div>
        </div>
        <div style={{ padding: 20, textAlign: 'center', background: 'var(--bg3)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 }}>
          Aucun compte financé pour le moment. Valide tes challenges pour débloquer.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(168,85,247,0.05) 100%)',
      border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12, padding: 16,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 26 }}>💰</span>
          <div>
            <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Comptes financés · {accounts.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Objectif : générer du profit régulier et récupérer tes payouts
            </div>
          </div>
        </div>
        <button onClick={onLogPayout} className="px-3 py-2 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.35)', cursor: 'pointer' }}>
          + Enregistrer un payout
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <MiniStat label="Capital managé" value={fmtEurRaw(totalCapitalManaged)} color="#a855f7" sub={`${accounts.length} comptes`} />
        <MiniStat label="Profit courant" value={fmtEur(totalCurrentProfit)} color={totalCurrentProfit >= 0 ? '#22c55e' : '#ef4444'} sub="cumulé" />
        <MiniStat label="Payouts reçus" value={fmtEurRaw(totalPayoutsAllTime)} color="#a855f7" sub={`${payouts.filter(p => accounts.some(a => a.id === p.account_id)).length} au total`} />
        <MiniStat label="Éligibles payout" value={String(eligibleForPayout)} color={eligibleForPayout > 0 ? '#22c55e' : 'var(--text3)'} sub="≥ 100€ profit" />
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map(a => {
          const accPayouts = payouts.filter(p => p.account_id === a.id)
          return (
            <FundedCard
              key={a.id}
              account={a}
              payouts={accPayouts}
              weekPnl={weekPnlByAccount[a.id] || 0}
              todayPnl={pnls.filter(p => p.account_id === a.id && p.date === todayISO()).reduce((s, p) => s + Number(p.pnl), 0)}
              accountPnls={pnls.filter(p => p.account_id === a.id)}
              onEdit={() => onEdit(a)}
              onDelete={() => onDelete(a.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function FundedCard({
  account, payouts, weekPnl, todayPnl, accountPnls, onEdit, onDelete,
}: {
  account: PropAccount
  payouts: Payout[]
  weekPnl: number
  todayPnl: number
  accountPnls: DailyPnL[]
  onEdit: () => void
  onDelete: () => void
}) {
  const profit = Number(account.current_balance) - Number(account.starting_balance)
  const totalPayouts = payouts.reduce((s, p) => s + Number(p.amount_eur), 0)
  const lastPayout = payouts[0] || null

  const profitSinceLastPayout = lastPayout
    ? accountPnls.filter(p => p.date > lastPayout.payout_date).reduce((s, p) => s + Number(p.pnl), 0)
    : profit

  const PAYOUT_CYCLE_DAYS = 14
  const daysSinceLastPayout = lastPayout
    ? Math.floor((Date.now() - new Date(lastPayout.payout_date).getTime()) / (86400 * 1000))
    : null
  const daysUntilNextEligible = daysSinceLastPayout != null ? Math.max(0, PAYOUT_CYCLE_DAYS - daysSinceLastPayout) : 0

  const eligible = profitSinceLastPayout >= 100 && (lastPayout == null || daysSinceLastPayout! >= PAYOUT_CYCLE_DAYS)

  let consistencyStatus: 'ok' | 'warn' | 'na' = 'na'
  let bestDayPct: number | null = null
  if (account.consistency_rule_pct && profit > 0) {
    const positiveDays = accountPnls.map(p => Number(p.pnl)).filter(v => v > 0)
    const maxDay = positiveDays.length > 0 ? Math.max(...positiveDays) : 0
    if (maxDay > 0) {
      bestDayPct = (maxDay / profit) * 100
      consistencyStatus = bestDayPct > account.consistency_rule_pct * 0.9 ? 'warn' : 'ok'
    }
  }

  const currentDdEur = Math.max(0, Number(account.starting_balance) - Number(account.current_balance))
  const maxDdEur = account.max_total_dd_pct != null ? Number(account.account_size) * (Number(account.max_total_dd_pct) / 100) : null
  const ddPct = maxDdEur && maxDdEur > 0 ? (currentDdEur / maxDdEur) * 100 : null
  const ddColor = ddPct == null ? 'var(--text3)' : ddPct > 75 ? '#ef4444' : ddPct > 50 ? '#f59e0b' : '#22c55e'

  const payoutShare = account.payout_split_pct ?? 80
  const yourShareIfPayout = (profitSinceLastPayout * payoutShare) / 100

  return (
    <EntityCard
      title={account.label}
      subtitle={
        <>
          <span>{account.propfirm}</span>
          <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
          <span style={{ fontFamily: 'var(--font-data)' }}>{fmtEurRaw(account.account_size)}</span>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10,
            background: 'rgba(var(--color-payout-rgb), 0.18)', color: 'var(--color-payout)',
            letterSpacing: '0.04em',
          }}>FINANCÉ</span>
        </>
      }
      accentColor="var(--color-payout)"
      variant={eligible ? 'highlight' : 'default'}
      cornerBadge={eligible && (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 6,
          background: 'var(--color-payout)', color: '#000', letterSpacing: '0.08em',
          boxShadow: '0 2px 8px rgba(var(--color-payout-rgb), 0.35)',
        }}>
          💰 PAYOUT ELIGIBLE
        </span>
      )}
      hero={<BalanceHero currentBalance={Number(account.current_balance)} startingBalance={Number(account.starting_balance)} />}
      perfCells={<PerfCells weekPnl={weekPnl} todayPnl={todayPnl} weekLabel="Semaine" />}
      onEdit={onEdit}
      onDelete={onDelete}
    >
      {/* Payout profit box — depuis dernier payout */}
      <div style={{
        padding: '14px 16px',
        background: profitSinceLastPayout >= 0
          ? 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(168,85,247,0.02) 100%)'
          : 'rgba(239,68,68,0.06)',
        border: `1px solid ${profitSinceLastPayout >= 0 ? 'rgba(168,85,247,0.25)' : 'rgba(239,68,68,0.2)'}`,
        borderRadius: 10, marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Profit {lastPayout ? 'depuis dernier payout' : 'total (aucun payout)'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: profitSinceLastPayout >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace', lineHeight: 1.1, marginTop: 4, letterSpacing: '-0.02em' }}>
          {fmtEur(profitSinceLastPayout)}
        </div>
        {profitSinceLastPayout > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Ta part ({payoutShare}%) :</span>
            <span style={{
              padding: '3px 8px', borderRadius: 5,
              background: 'rgba(168,85,247,0.2)', color: '#a855f7',
              fontWeight: 800, fontFamily: 'monospace', fontSize: 13,
            }}>
              {fmtEurRaw(yourShareIfPayout)}
            </span>
          </div>
        )}
      </div>

      {/* Meta grid — bigger cells */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prochain payout</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: eligible ? '#22c55e' : '#f59e0b', fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {eligible ? 'Maintenant ✓' : daysUntilNextEligible > 0 ? `${daysUntilNextEligible}j` : 'Bientôt'}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payouts reçus</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#a855f7', fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {fmtEurRaw(totalPayouts)}
            <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4, fontWeight: 500 }}>({payouts.length})</span>
          </div>
        </div>
      </div>

      {/* Consistency + DD — bigger */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div style={{
          padding: '10px 12px',
          background: consistencyStatus === 'warn' ? 'rgba(245,158,11,0.08)' : 'var(--bg3)',
          border: consistencyStatus === 'warn' ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Consistency</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: consistencyStatus === 'ok' ? '#22c55e' : consistencyStatus === 'warn' ? '#f59e0b' : 'var(--text3)', fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {consistencyStatus === 'na' ? '—' : `${bestDayPct?.toFixed(0)}%`}
            {consistencyStatus !== 'na' && <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginLeft: 3 }}>/ {account.consistency_rule_pct}%</span>}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            DD {account.trailing_dd ? '(trailing)' : ''}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: ddColor, fontFamily: 'monospace', marginTop: 3, lineHeight: 1 }}>
            {ddPct != null ? `${ddPct.toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>

    </EntityCard>
  )
}
