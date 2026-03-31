'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  caMonth: number
  activeTraders: number
  totalTraders: number
  sessionsToday: number
  sessionsMonth: number
  winRate: number
  totalPnl: number
  avgPnlPerTrader: number
  unreadMessages: number
  coachingThisMonth: number
  pendingInvites: number
}

export default function AdminTopbarStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const { data: { user } } = await supabase.auth.getUser()

      const [
        { data: revenues },
        { count: activeCount },
        { count: totalCount },
        { data: todaySessions },
        { data: monthSessions },
        { count: unread },
        { count: coachingCount },
        { count: pendingCount },
      ] = await Promise.all([
        supabase.from('revenues').select('amount').gte('payment_date', firstOfMonth),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'trader').neq('is_active', false),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'trader'),
        supabase.from('trading_sessions').select('pnl').eq('session_date', today),
        supabase.from('trading_sessions').select('pnl, result, trader_id').gte('session_date', firstOfMonth),
        user ? supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false) : Promise.resolve({ count: 0 }),
        supabase.from('coaching_sessions').select('*', { count: 'exact', head: true }).gte('scheduled_at', firstOfMonth).eq('status', 'completed'),
        supabase.from('invitations').select('*', { count: 'exact', head: true }).is('used_at', null).gt('expires_at', new Date().toISOString()),
      ])

      const caMonth = revenues?.reduce((s, r) => s + Number(r.amount), 0) ?? 0
      const sessions = monthSessions ?? []
      const wins = sessions.filter(s => s.result === 'win').length
      const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
      const totalPnl = sessions.reduce((s, t) => s + Number(t.pnl), 0)
      const uniqueTraders = new Set(sessions.map(s => s.trader_id)).size
      const avgPnlPerTrader = uniqueTraders > 0 ? totalPnl / uniqueTraders : 0

      setStats({
        caMonth,
        activeTraders: activeCount ?? 0,
        totalTraders: totalCount ?? 0,
        sessionsToday: todaySessions?.length ?? 0,
        sessionsMonth: sessions.length,
        winRate,
        totalPnl,
        avgPnlPerTrader,
        unreadMessages: (unread as number) ?? 0,
        coachingThisMonth: coachingCount ?? 0,
        pendingInvites: pendingCount ?? 0,
      })
    }
    load()
  }, [])

  if (!stats) return null

  const items: { label: string; value: string; color: string }[] = [
    {
      label: 'CA Mois',
      value: `${stats.caMonth.toLocaleString('fr-FR')}€`,
      color: '#22c55e',
    },
    {
      label: 'Traders',
      value: `${stats.activeTraders}/${stats.totalTraders}`,
      color: '#60a5fa',
    },
    {
      label: "Auj.",
      value: `${stats.sessionsToday} sess.`,
      color: stats.sessionsToday > 0 ? '#22c55e' : '#5a6a82',
    },
    {
      label: 'P&L Global',
      value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(0)}$`,
      color: stats.totalPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Moy/Trader',
      value: `${stats.avgPnlPerTrader >= 0 ? '+' : ''}${stats.avgPnlPerTrader.toFixed(0)}$`,
      color: stats.avgPnlPerTrader >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Win Rate',
      value: `${stats.winRate}%`,
      color: stats.winRate >= 50 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Coaching',
      value: String(stats.coachingThisMonth),
      color: '#a78bfa',
    },
    {
      label: 'Sessions',
      value: String(stats.sessionsMonth),
      color: 'var(--text)',
    },
  ]

  return (
    <div className="flex items-center gap-0.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center">
          <div
            className="flex flex-col items-center px-2.5 py-1 rounded-md"
            style={{ minWidth: 56 }}
          >
            <span className="text-[9px] font-medium uppercase tracking-wider leading-none mb-0.5" style={{ color: '#5a6a82' }}>
              {item.label}
            </span>
            <span className="text-[11px] font-bold font-mono leading-tight" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
          {i < items.length - 1 && (
            <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          )}
        </div>
      ))}
      {stats.unreadMessages > 0 && (
        <>
          <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex flex-col items-center px-2.5 py-1 rounded-md" style={{ background: 'rgba(239,68,68,0.08)' }}>
            <span className="text-[9px] font-medium uppercase tracking-wider leading-none mb-0.5" style={{ color: '#ef4444' }}>Messages</span>
            <span className="text-[11px] font-bold font-mono leading-tight" style={{ color: '#ef4444' }}>{stats.unreadMessages}</span>
          </div>
        </>
      )}
      {stats.pendingInvites > 0 && (
        <>
          <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex flex-col items-center px-2.5 py-1 rounded-md" style={{ background: 'rgba(245,158,11,0.08)' }}>
            <span className="text-[9px] font-medium uppercase tracking-wider leading-none mb-0.5" style={{ color: '#f59e0b' }}>Invitations</span>
            <span className="text-[11px] font-bold font-mono leading-tight" style={{ color: '#f59e0b' }}>{stats.pendingInvites}</span>
          </div>
        </>
      )}
    </div>
  )
}
