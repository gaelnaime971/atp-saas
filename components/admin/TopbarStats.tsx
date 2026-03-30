'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  caMonth: number
  activeTraders: number
  sessionsToday: number
  sessionsMonth: number
  winRate: number
  totalPnl: number
  unreadMessages: number
  coachingThisMonth: number
}

export default function AdminTopbarStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const { data: { user } } = await supabase.auth.getUser()

      const [
        { data: revenues },
        { count: tradersCount },
        { data: todaySessions },
        { data: monthSessions },
        { count: unread },
        { count: coachingCount },
      ] = await Promise.all([
        supabase.from('revenues').select('amount').gte('payment_date', firstOfMonth),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'trader').neq('is_active', false),
        supabase.from('trading_sessions').select('pnl').eq('session_date', today),
        supabase.from('trading_sessions').select('pnl, result').gte('session_date', firstOfMonth),
        user ? supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false) : Promise.resolve({ count: 0 }),
        supabase.from('coaching_sessions').select('*', { count: 'exact', head: true }).gte('scheduled_at', firstOfMonth).eq('status', 'completed'),
      ])

      const caMonth = revenues?.reduce((s, r) => s + Number(r.amount), 0) ?? 0
      const sessions = monthSessions ?? []
      const wins = sessions.filter(s => s.result === 'win').length
      const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
      const totalPnl = sessions.reduce((s, t) => s + Number(t.pnl), 0)

      setStats({
        caMonth,
        activeTraders: tradersCount ?? 0,
        sessionsToday: todaySessions?.length ?? 0,
        sessionsMonth: sessions.length,
        winRate,
        totalPnl,
        unreadMessages: (unread as number) ?? 0,
        coachingThisMonth: coachingCount ?? 0,
      })
    }
    fetch()
  }, [])

  if (!stats) return null

  const pills: { icon: string; value: string; color: string; label: string }[] = [
    {
      icon: '💰',
      label: 'CA du mois',
      value: `${stats.caMonth.toLocaleString('fr-FR')}€`,
      color: '#22c55e',
    },
    {
      icon: '👥',
      label: 'Traders actifs',
      value: String(stats.activeTraders),
      color: '#60a5fa',
    },
    {
      icon: '📊',
      label: "Sessions aujourd'hui",
      value: String(stats.sessionsToday),
      color: stats.sessionsToday > 0 ? '#22c55e' : '#5a6a82',
    },
    {
      icon: '📈',
      label: 'P&L global mois',
      value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(0)}$`,
      color: stats.totalPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      icon: '🎯',
      label: 'Win Rate mois',
      value: `${stats.winRate}%`,
      color: stats.winRate >= 50 ? '#22c55e' : '#ef4444',
    },
    {
      icon: '🎥',
      label: 'Coaching ce mois',
      value: String(stats.coachingThisMonth),
      color: '#a78bfa',
    },
    {
      icon: '📋',
      label: 'Sessions mois',
      value: String(stats.sessionsMonth),
      color: 'var(--text)',
    },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {pills.map((pill, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
          }}
          title={pill.label}
        >
          <span className="text-xs">{pill.icon}</span>
          <span className="text-xs font-bold font-mono" style={{ color: pill.color }}>{pill.value}</span>
        </div>
      ))}
      {stats.unreadMessages > 0 && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <span className="text-xs">💬</span>
          <span className="text-xs font-bold font-mono" style={{ color: '#ef4444' }}>{stats.unreadMessages}</span>
        </div>
      )}
    </div>
  )
}
