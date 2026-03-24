'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'

interface TraderProfileModalProps {
  trader: Profile | null
  onClose: () => void
}

interface Stats {
  total_pnl: number
  win_rate: number
  session_count: number
  best_session: number
  worst_session: number
}

export default function TraderProfileModal({ trader, onClose }: TraderProfileModalProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!trader) return

    async function fetchStats() {
      setLoading(true)
      const { data: sessions } = await supabase
        .from('trading_sessions')
        .select('pnl, result')
        .eq('trader_id', trader!.id)

      if (sessions && sessions.length > 0) {
        const total_pnl = sessions.reduce((sum, s) => sum + (s.pnl ?? 0), 0)
        const wins = sessions.filter(s => s.result === 'win').length
        const win_rate = Math.round((wins / sessions.length) * 100)
        const pnls = sessions.map(s => s.pnl ?? 0)
        setStats({
          total_pnl,
          win_rate,
          session_count: sessions.length,
          best_session: Math.max(...pnls),
          worst_session: Math.min(...pnls),
        })
      } else {
        setStats({ total_pnl: 0, win_rate: 0, session_count: 0, best_session: 0, worst_session: 0 })
      }
      setLoading(false)
    }

    fetchStats()
  }, [trader])

  if (!trader) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Profil Trader</h2>
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

        {/* Body */}
        <div className="px-6 py-5">
          {/* Identity */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              {trader.full_name?.charAt(0).toUpperCase() ?? 'T'}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{trader.full_name ?? 'Trader'}</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>{trader.email}</p>
              <div className="flex items-center gap-2 mt-1">
                {trader.plan_type && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    {trader.plan_type}
                  </span>
                )}
                {trader.propfirm_name && (
                  <span className="text-xs px-2 py-0.5 rounded-full border font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
                    {trader.propfirm_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'P&L Total', value: `${stats.total_pnl >= 0 ? '+' : ''}${stats.total_pnl.toFixed(0)} $`, color: stats.total_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Win Rate', value: `${stats.win_rate}%`, color: stats.win_rate >= 50 ? 'text-green-400' : 'text-red-400' },
                { label: 'Sessions', value: stats.session_count.toString(), color: 'text-[#e8edf5]' },
                { label: 'Meilleure session', value: `+${stats.best_session.toFixed(0)} $`, color: 'text-green-400' },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="rounded-lg p-4 border"
                  style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}
                >
                  <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{stat.label}</p>
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              Membre depuis le {new Date(trader.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
