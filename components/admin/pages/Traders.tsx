'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
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

export default function Traders({ triggerNewModal, onNewModalHandled }: TradersProps) {
  const [traders, setTraders] = useState<TraderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedTrader, setSelectedTrader] = useState<TraderRow | null>(null)
  const [blurNames, setBlurNames] = useState(false)
  const supabase = createClient()

  async function fetchTraders() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*, capital, nb_accounts')
      .eq('role', 'trader')
      .order('created_at', { ascending: false })

    const activeTraders: TraderRow[] = []
    if (profiles) {
      const enriched = await Promise.all(
        profiles.map(async (trader) => {
          const { data: sessions } = await supabase
            .from('trading_sessions')
            .select('pnl, result')
            .eq('trader_id', trader.id)

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

  useEffect(() => { fetchTraders() }, [])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8edf5]">Traders</h1>
          <p className="text-[#5a6a82] text-sm mt-1">
            {active.length} actif{active.length !== 1 ? 's' : ''}
            {pending.length > 0 && <> · {pending.length} en attente</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Blur toggle */}
          <button
            onClick={() => setBlurNames(b => !b)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: blurNames ? 'rgba(34,197,94,0.1)' : 'var(--bg3)',
              borderColor: blurNames ? 'rgba(34,197,94,0.2)' : 'var(--border)',
              color: blurNames ? '#22c55e' : 'var(--text3)',
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
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">Traders actifs</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{active.length}</p>
          <p className="text-xs text-[#5a6a82] mt-1">{pending.length} en attente</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">Capital cumulé</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">
            {totalCapital > 0 ? `${(totalCapital / 1000).toFixed(0)}K $` : '—'}
          </p>
          <p className="text-xs text-[#5a6a82] mt-1">Sous gestion</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">P&L global</p>
          <p className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)} $
          </p>
          <p className="text-xs text-[#5a6a82] mt-1">{totalSessions} sessions au total</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">Win Rate moyen</p>
          <p className={`text-2xl font-bold font-mono ${avgWinRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {avgWinRate}%
          </p>
          <p className="text-xs text-[#5a6a82] mt-1">Moyenne tous traders</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">Traders rentables</p>
          <p className={`text-2xl font-bold font-mono ${profitableRate >= 50 ? 'text-green-400' : 'text-amber-400'}`}>
            {profitableRate}%
          </p>
          <p className="text-xs text-[#5a6a82] mt-1">{profitableTraders} / {active.length} en profit</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1 uppercase tracking-wider">P&L moyen / trader</p>
          <p className={`text-2xl font-bold font-mono ${active.length > 0 && totalPnl / active.length >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {active.length > 0 ? `${totalPnl / active.length >= 0 ? '+' : ''}${(totalPnl / active.length).toFixed(0)} $` : '—'}
          </p>
          <p className="text-xs text-[#5a6a82] mt-1">Moy. {active.length > 0 ? Math.round(totalSessions / active.length) : 0} sessions</p>
        </Card>
      </div>

      <Card>
        {traders.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[#1c2333] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#5a6a82]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-[#a0aec0] font-medium">Aucun trader</p>
            <p className="text-[#5a6a82] text-sm mt-1">Invitez votre premier trader pour commencer</p>
            <Button className="mt-4" onClick={() => setShowNewModal(true)}>
              Inviter un trader
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">Trader</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">Statut</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">Plan</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">PropFirm</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">Sessions</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">Win Rate</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3 pr-4">PnL Total</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {traders.map((trader) => (
                  <tr key={trader.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                          trader.status === 'pending'
                            ? 'bg-amber-500/10 border-amber-500/20'
                            : 'bg-green-500/10 border-green-500/20'
                        }`}>
                          <span className={`text-xs font-bold ${
                            trader.status === 'pending' ? 'text-amber-400' : 'text-green-400'
                          }`}>
                            {(trader.full_name || 'T')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p
                            className="text-sm font-medium text-[#e8edf5] transition-all"
                            style={blurNames ? { filter: 'blur(6px)', userSelect: 'none' } : undefined}
                          >
                            {trader.full_name ?? 'Unnamed'}
                          </p>
                          <p
                            className="text-xs text-[#5a6a82] transition-all"
                            style={blurNames ? { filter: 'blur(6px)', userSelect: 'none' } : undefined}
                          >
                            {trader.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        trader.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-green-500/10 text-green-400 border border-green-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          trader.status === 'pending' ? 'bg-amber-400' : 'bg-green-400'
                        }`} />
                        {trader.status === 'pending' ? 'En attente' : 'Actif'}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="px-2 py-0.5 bg-[#1c2333] rounded text-xs text-[#a0aec0] font-medium">
                        {trader.plan_type ?? 'N/A'}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-sm text-[#a0aec0]">{trader.propfirm_name ?? '—'}</td>
                    <td className="py-4 pr-4 text-sm text-[#a0aec0] text-right font-mono">
                      {trader.status === 'pending' ? '—' : trader.session_count}
                    </td>
                    <td className="py-4 pr-4 text-right">
                      {trader.status === 'pending' ? (
                        <span className="text-sm text-[#5a6a82]">—</span>
                      ) : (
                        <span className={`text-sm font-mono font-medium ${(trader.win_rate ?? 0) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                          {trader.win_rate}%
                        </span>
                      )}
                    </td>
                    <td className={`py-4 pr-4 text-sm font-mono font-medium text-right ${
                      trader.status === 'pending' ? 'text-[#5a6a82]' :
                      (trader.total_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trader.status === 'pending' ? '—' : (
                        <>{(trader.total_pnl ?? 0) >= 0 ? '+' : ''}{(trader.total_pnl ?? 0).toFixed(2)} $</>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      {trader.status === 'active' ? (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTrader(trader)}>
                          Voir profil
                        </Button>
                      ) : (
                        <span className="text-xs text-[#5a6a82] italic">Invitation envoyée</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
