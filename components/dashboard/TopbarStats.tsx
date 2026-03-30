'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  todayPnl: number | null
  monthPnl: number
  winRate: number
  streak: { count: number; type: 'win' | 'loss' }
  sessionsThisMonth: number
  profitFactor: number
  unreadMessages: number
}

export default function TopbarStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

      const [{ data: allSessions }, { data: todaySessions }, { count: unread }] = await Promise.all([
        supabase.from('trading_sessions').select('pnl, result, session_date').eq('trader_id', user.id).gte('session_date', firstOfMonth).order('session_date', { ascending: false }),
        supabase.from('trading_sessions').select('pnl').eq('trader_id', user.id).eq('session_date', today),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false),
      ])

      const sessions = allSessions ?? []
      const todayPnl = todaySessions && todaySessions.length > 0 ? todaySessions.reduce((s, t) => s + Number(t.pnl), 0) : null
      const monthPnl = sessions.reduce((s, t) => s + Number(t.pnl), 0)
      const wins = sessions.filter(s => s.result === 'win').length
      const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
      const grossProfit = sessions.filter(s => Number(s.pnl) > 0).reduce((s, t) => s + Number(t.pnl), 0)
      const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((s, t) => s + Number(t.pnl), 0))
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0

      // Streak
      let streakCount = 0
      let streakType: 'win' | 'loss' = 'win'
      if (sessions.length > 0) {
        streakType = sessions[0].result === 'loss' ? 'loss' : 'win'
        for (const s of sessions) {
          if ((streakType === 'win' && s.result === 'win') || (streakType === 'loss' && s.result === 'loss')) {
            streakCount++
          } else break
        }
      }

      setStats({
        todayPnl,
        monthPnl,
        winRate,
        streak: { count: streakCount, type: streakType },
        sessionsThisMonth: sessions.length,
        profitFactor,
        unreadMessages: unread ?? 0,
      })
    }
    fetch()
  }, [])

  if (!stats) return null

  const pills: { icon: string; value: string; color: string; label: string }[] = [
    {
      icon: '📊',
      label: "Aujourd'hui",
      value: stats.todayPnl != null ? `${stats.todayPnl >= 0 ? '+' : ''}${stats.todayPnl.toFixed(0)}$` : '—',
      color: stats.todayPnl != null ? (stats.todayPnl >= 0 ? '#22c55e' : '#ef4444') : '#5a6a82',
    },
    {
      icon: '💰',
      label: 'Mois',
      value: `${stats.monthPnl >= 0 ? '+' : ''}${stats.monthPnl.toFixed(0)}$`,
      color: stats.monthPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      icon: '🎯',
      label: 'Win Rate',
      value: `${stats.winRate}%`,
      color: stats.winRate >= 50 ? '#22c55e' : '#ef4444',
    },
    {
      icon: stats.streak.type === 'win' ? '🔥' : '❄️',
      label: 'Streak',
      value: `${stats.streak.count}${stats.streak.type === 'win' ? 'W' : 'L'}`,
      color: stats.streak.type === 'win' ? '#22c55e' : '#ef4444',
    },
    {
      icon: '📈',
      label: 'PF',
      value: stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—',
      color: stats.profitFactor >= 1.5 ? '#22c55e' : stats.profitFactor >= 1 ? '#f59e0b' : '#ef4444',
    },
    {
      icon: '📋',
      label: 'Sessions',
      value: String(stats.sessionsThisMonth),
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
            background: 'rgba(96,165,250,0.08)',
            border: '1px solid rgba(96,165,250,0.2)',
          }}
        >
          <span className="text-xs">💬</span>
          <span className="text-xs font-bold font-mono" style={{ color: '#60a5fa' }}>{stats.unreadMessages}</span>
        </div>
      )}
    </div>
  )
}
