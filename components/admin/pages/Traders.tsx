'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { fmtUsd, fmtPct, fmtCompact, fmtNumber, toneForPnl, toneForRate, TONE_COLOR_VAR } from '@/lib/format'
import NewTraderModal from '@/components/admin/modals/NewTraderModal'
import TraderProfileModal from '@/components/admin/modals/TraderProfileModal'

interface TraderRow extends Profile {
  session_count?: number
  total_pnl?: number
  win_rate?: number
  status: 'active' | 'pending'
}

interface PendingInvitation {
  id: string
  email: string
  full_name: string
  plan_type: string
  propfirm_name: string | null
  code: string
  created_at: string
  expires_at: string
}

interface TradersProps {
  triggerNewModal?: boolean
  onNewModalHandled?: () => void
}

type FilterMode = 'all' | 'day' | 'range' | 'month' | 'year'

function getDateRange(mode: FilterMode, day: string, rangeFrom: string, rangeTo: string, month: string, year: string): { from: string; to: string } | null {
  if (mode === 'all') return null
  if (mode === 'day' && day) {
    return { from: day, to: day }
  }
  if (mode === 'range' && rangeFrom && rangeTo) {
    return { from: rangeFrom, to: rangeTo }
  }
  if (mode === 'month' && month) {
    const [y, m] = month.split('-')
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
  }
  if (mode === 'year' && year) {
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  return null
}

export default function Traders({ triggerNewModal, onNewModalHandled }: TradersProps) {
  const [traders, setTraders] = useState<TraderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedTrader, setSelectedTrader] = useState<TraderRow | null>(null)
  const [blurNames, setBlurNames] = useState(false)

  // Date filter state
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split('T')[0])
  const [filterRangeFrom, setFilterRangeFrom] = useState('')
  const [filterRangeTo, setFilterRangeTo] = useState('')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))

  const supabase = createClient()

  async function fetchTraders() {
    setLoading(true)

    const dateRange = getDateRange(filterMode, filterDay, filterRangeFrom, filterRangeTo, filterMonth, filterYear)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*, capital, nb_accounts')
      .eq('role', 'trader')
      .order('created_at', { ascending: false })

    const activeTraders: TraderRow[] = []
    if (profiles) {
      const enriched = await Promise.all(
        profiles.map(async (trader) => {
          let query = supabase
            .from('trading_sessions')
            .select('pnl, result')
            .eq('trader_id', trader.id)

          if (dateRange) {
            query = query.gte('session_date', dateRange.from).lte('session_date', dateRange.to)
          }

          const { data: sessions } = await query

          const session_count = sessions?.length ?? 0
          const total_pnl = sessions?.reduce((sum, s) => sum + (s.pnl || 0), 0) ?? 0
          const wins = sessions?.filter(s => s.result === 'win').length ?? 0
          const win_rate = session_count > 0 ? Math.round((wins / session_count) * 100) : 0

          return { ...trader, session_count, total_pnl, win_rate, status: 'active' as const }
        })
      )
      activeTraders.push(...enriched)
    }

    const { data: invitations } = await supabase
      .from('invitations')
      .select('*')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    const pendingTraders: TraderRow[] = (invitations ?? []).map((inv: PendingInvitation) => ({
      id: inv.id,
      email: inv.email,
      full_name: inv.full_name,
      plan_type: inv.plan_type,
      propfirm_name: inv.propfirm_name,
      role: 'trader' as const,
      created_at: inv.created_at,
      avatar_url: null,
      session_count: 0,
      total_pnl: 0,
      win_rate: 0,
      status: 'pending' as const,
    }))

    setTraders([...activeTraders, ...pendingTraders])
    setLoading(false)
  }

  useEffect(() => { fetchTraders() }, [filterMode, filterDay, filterRangeFrom, filterRangeTo, filterMonth, filterYear])

  useEffect(() => {
    if (triggerNewModal) {
      setShowNewModal(true)
      onNewModalHandled?.()
    }
  }, [triggerNewModal])

  // Computed stats
  const active = traders.filter(t => t.status === 'active')
  const pending = traders.filter(t => t.status === 'pending')
  const totalPnl = active.reduce((s, t) => s + (t.total_pnl ?? 0), 0)
  const totalSessions = active.reduce((s, t) => s + (t.session_count ?? 0), 0)
  const avgWinRate = active.length > 0
    ? Math.round(active.reduce((s, t) => s + (t.win_rate ?? 0), 0) / active.length)
    : 0
  const profitableTraders = active.filter(t => (t.total_pnl ?? 0) > 0).length
  const profitableRate = active.length > 0 ? Math.round((profitableTraders / active.length) * 100) : 0
  const totalCapital = active.reduce((s, t) => {
    const cap = Number((t as any).capital) || 0
    const nb = Number((t as any).nb_accounts) || 1
    return s + (cap * nb)
  }, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        size="sm"
        title="Traders"
        subtitle={<>
          {active.length} actif{active.length !== 1 ? 's' : ''}
          {pending.length > 0 && <> · {pending.length} en attente</>}
        </>}
        actions={<>
          <button
            onClick={() => setBlurNames(b => !b)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: blurNames ? 'rgba(var(--color-profit-rgb), 0.1)' : 'var(--bg3)',
              borderColor: blurNames ? 'rgba(var(--color-profit-rgb), 0.2)' : 'var(--border)',
              color: blurNames ? 'var(--color-profit)' : 'var(--text3)',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {blurNames ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              )}
            </svg>
            {blurNames ? 'Noms masqués' : 'Masquer noms'}
          </button>
          <Button onClick={() => setShowNewModal(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau Trader
          </Button>
        </>}
      />

      {/* Date filter bar */}
      <div
        className="flex items-center gap-2 flex-wrap p-3 rounded-xl border"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
      >
        <span className="text-xs font-medium mr-1" style={{ color: 'var(--text3)' }}>Période :</span>
        {([
          { id: 'all', label: 'Tout' },
          { id: 'day', label: 'Jour' },
          { id: 'range', label: 'Plage' },
          { id: 'month', label: 'Mois' },
          { id: 'year', label: 'Année' },
        ] as { id: FilterMode; label: string }[]).map(f => (
          <button
            key={f.id}
            onClick={() => setFilterMode(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterMode === f.id ? 'rgba(var(--color-profit-rgb), 0.1)' : 'transparent',
              color: filterMode === f.id ? 'var(--color-profit)' : 'var(--text3)',
              border: filterMode === f.id ? '1px solid rgba(var(--color-profit-rgb), 0.2)' : '1px solid transparent',
            }}
          >
            {f.label}
          </button>
        ))}

        <div className="h-5 w-px mx-1" style={{ background: 'var(--border)' }} />

        {filterMode === 'day' && (
          <input
            type="date"
            value={filterDay}
            onChange={e => setFilterDay(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        )}
        {filterMode === 'range' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterRangeFrom}
              onChange={e => setFilterRangeFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text3)' }}>→</span>
            <input
              type="date"
              value={filterRangeTo}
              onChange={e => setFilterRangeTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        )}
        {filterMode === 'month' && (
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        )}
        {filterMode === 'year' && (
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        {filterMode !== 'all' && (
          <span className="text-xs ml-auto font-medium" style={{ color: 'var(--green)' }}>
            {filterMode === 'day' && filterDay && new Date(filterDay + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {filterMode === 'range' && filterRangeFrom && filterRangeTo && `${new Date(filterRangeFrom + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — ${new Date(filterRangeTo + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            {filterMode === 'month' && filterMonth && new Date(filterMonth + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            {filterMode === 'year' && filterYear}
          </span>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-6 gap-4">
        <KpiCard
          label="Traders actifs"
          value={fmtNumber(active.length)}
          hint={`${pending.length} en attente`}
        />
        <KpiCard
          label="Capital cumulé"
          value={totalCapital > 0 ? fmtCompact(totalCapital, '$') : '—'}
          hint="Sous gestion"
        />
        <KpiCard
          label="P&L global"
          value={fmtUsd(totalPnl, 0, { sign: true })}
          tone={toneForPnl(totalPnl)}
          hint={`${totalSessions} session${totalSessions !== 1 ? 's' : ''}${filterMode !== 'all' ? ' (filtrées)' : ''}`}
        />
        <KpiCard
          label="Win Rate moyen"
          value={fmtPct(avgWinRate, 0)}
          tone={toneForRate(avgWinRate, 50)}
          hint="Moyenne tous traders"
        />
        <KpiCard
          label="Traders rentables"
          value={fmtPct(profitableRate, 0)}
          tone={toneForRate(profitableRate, 50)}
          hint={`${profitableTraders} / ${active.length} en profit`}
        />
        {(() => {
          const avgPerTrader = active.length > 0 ? totalPnl / active.length : null
          return (
            <KpiCard
              label="P&L moyen / trader"
              value={avgPerTrader != null ? fmtUsd(avgPerTrader, 0, { sign: true }) : '—'}
              tone={toneForPnl(avgPerTrader)}
              hint={`Moy. ${active.length > 0 ? Math.round(totalSessions / active.length) : 0} sessions`}
            />
          )
        })()}
      </div>

      {(() => {
        type T = typeof traders[number]
        const cols: Column<T>[] = [
          { id: 'trader', header: 'Trader', sortable: true, sortValue: t => t.full_name ?? '',
            accessor: t => (
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                  t.status === 'pending'
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-green-500/10 border-green-500/20'
                }`}>
                  <span className={`text-xs font-bold ${t.status === 'pending' ? 'text-amber-400' : 'text-green-400'}`}>
                    {(t.full_name || 'T')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p
                    className="text-sm font-medium transition-all"
                    style={{ color: 'var(--color-text-1)', ...(blurNames ? { filter: 'blur(6px)', userSelect: 'none' } : {}) }}
                  >
                    {t.full_name ?? 'Unnamed'}
                  </p>
                  <p
                    className="text-xs transition-all"
                    style={{ color: 'var(--color-neutral)', ...(blurNames ? { filter: 'blur(6px)', userSelect: 'none' } : {}) }}
                  >
                    {t.email}
                  </p>
                </div>
              </div>
            ) },
          { id: 'status', header: 'Statut',
            accessor: t => (
              <Badge tone={t.status === 'pending' ? 'warn' : 'profit'} size="sm" bordered dot>
                {t.status === 'pending' ? 'En attente' : 'Actif'}
              </Badge>
            ) },
          { id: 'plan', header: 'Plan',
            accessor: t => (
              <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}>
                {t.plan_type ?? 'N/A'}
              </span>
            ) },
          { id: 'propfirm', header: 'PropFirm',
            accessor: t => t.propfirm_name ?? '—' },
          { id: 'sessions', header: 'Sessions', numeric: true, sortable: true, sortValue: t => t.session_count ?? 0,
            accessor: t => t.status === 'pending' ? '—' : t.session_count },
          { id: 'winrate', header: 'Win Rate', numeric: true, sortable: true, sortValue: t => t.win_rate ?? 0,
            accessor: t => t.status === 'pending' ? <span style={{ color: 'var(--color-neutral)' }}>—</span> : (
              <span style={{ color: TONE_COLOR_VAR[toneForRate(t.win_rate ?? 0, 50)] }}>{fmtPct(t.win_rate ?? 0, 0)}</span>
            ) },
          { id: 'pnl', header: 'PnL Total', numeric: true, sortable: true, sortValue: t => t.total_pnl ?? 0,
            accessor: t => t.status === 'pending' ? <span style={{ color: 'var(--color-neutral)' }}>—</span> : (
              <span style={{ color: TONE_COLOR_VAR[toneForPnl(t.total_pnl ?? 0)], fontWeight: 500 }}>
                {fmtUsd(t.total_pnl ?? 0, 2, { sign: true })}
              </span>
            ) },
          { id: 'actions', header: '', align: 'right',
            accessor: t => t.status === 'active' ? (
              <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedTrader(t) }}>
                Voir profil
              </Button>
            ) : (
              <span className="text-xs italic" style={{ color: 'var(--color-neutral)' }}>Invitation envoyée</span>
            ) },
        ]
        return (
          <DataTable
            columns={cols}
            rows={traders}
            rowKey={t => t.id}
            empty={
              <EmptyState
                title="Aucun trader"
                description="Invite ton premier trader pour commencer."
                action={<Button onClick={() => setShowNewModal(true)}>Inviter un trader</Button>}
              />
            }
          />
        )
      })()}

      {showNewModal && (
        <NewTraderModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => fetchTraders()}
        />
      )}

      {selectedTrader && (
        <TraderProfileModal
          trader={selectedTrader}
          onClose={() => setSelectedTrader(null)}
        />
      )}
    </div>
  )
}
