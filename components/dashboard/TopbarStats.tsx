'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  todayPnl: number | null
  monthPnl: number
  totalPnl: number
  winRate: number
  streak: { count: number; type: 'win' | 'loss' }
  sessionsThisMonth: number
  sessionsTotal: number
  profitFactor: number
  bestDay: number
  avgPnl: number
  unreadMessages: number
}

export default function TopbarStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

      const [{ data: monthSessions }, { data: todaySessions }, { data: allTimeSessions }, { count: unread }] = await Promise.all([
        supabase.from('trading_sessions').select('pnl, result').eq('trader_id', user.id).gte('session_date', firstOfMonth).order('session_date', { ascending: false }),
        supabase.from('trading_sessions').select('pnl').eq('trader_id', user.id).eq('session_date', today),
        supabase.from('trading_sessions').select('pnl, result').eq('trader_id', user.id).order('session_date', { ascending: false }),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('is_read', false),
      ])

      const month = monthSessions ?? []
      const all = allTimeSessions ?? []
      const todayPnl = todaySessions && todaySessions.length > 0 ? todaySessions.reduce((s, t) => s + Number(t.pnl), 0) : null
      const monthPnl = month.reduce((s, t) => s + Number(t.pnl), 0)
      const totalPnl = all.reduce((s, t) => s + Number(t.pnl), 0)
      const wins = month.filter(s => s.result === 'win').length
      const winRate = month.length > 0 ? Math.round((wins / month.length) * 100) : 0
      const grossProfit = month.filter(s => Number(s.pnl) > 0).reduce((s, t) => s + Number(t.pnl), 0)
      const grossLoss = Math.abs(month.filter(s => Number(s.pnl) < 0).reduce((s, t) => s + Number(t.pnl), 0))
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0
      const bestDay = month.length > 0 ? Math.max(...month.map(s => Number(s.pnl))) : 0
      const avgPnl = month.length > 0 ? monthPnl / month.length : 0

      let streakCount = 0
      let streakType: 'win' | 'loss' = 'win'
      if (all.length > 0) {
        streakType = all[0].result === 'loss' ? 'loss' : 'win'
        for (const s of all) {
          if ((streakType === 'win' && s.result === 'win') || (streakType === 'loss' && s.result === 'loss')) streakCount++
          else break
        }
      }

      setStats({ todayPnl, monthPnl, totalPnl, winRate, streak: { count: streakCount, type: streakType }, sessionsThisMonth: month.length, sessionsTotal: all.length, profitFactor, bestDay, avgPnl, unreadMessages: unread ?? 0 })
    }
    load()
  }, [])

  if (!stats) return null

  const items: { label: string; value: string; color: string }[] = [
    {
      label: "P&L Jour",
      value: stats.todayPnl != null ? `${stats.todayPnl >= 0 ? '+' : ''}${stats.todayPnl.toFixed(0)}$` : '—',
      color: stats.todayPnl != null ? (stats.todayPnl >= 0 ? '#22c55e' : '#ef4444') : '#5a6a82',
    },
    {
      label: 'P&L Mois',
      value: `${stats.monthPnl >= 0 ? '+' : ''}${stats.monthPnl.toFixed(0)}$`,
      color: stats.monthPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'P&L Total',
      value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(0)}$`,
      color: stats.totalPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Win Rate',
      value: `${stats.winRate}%`,
      color: stats.winRate >= 50 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Profit Factor',
      value: stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—',
      color: stats.profitFactor >= 1.5 ? '#22c55e' : stats.profitFactor >= 1 ? '#f59e0b' : '#ef4444',
    },
    {
      label: 'Streak',
      value: `${stats.streak.count}${stats.streak.type === 'win' ? 'W' : 'L'}`,
      color: stats.streak.type === 'win' ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Moy/Session',
      value: `${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl.toFixed(0)}$`,
      color: stats.avgPnl >= 0 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Best Day',
      value: `+${stats.bestDay.toFixed(0)}$`,
      color: '#22c55e',
    },
    {
      label: 'Sessions',
      value: `${stats.sessionsThisMonth}`,
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
          <div
            className="flex flex-col items-center px-2.5 py-1 rounded-md"
            style={{ background: 'rgba(96,165,250,0.08)' }}
          >
            <span className="text-[9px] font-medium uppercase tracking-wider leading-none mb-0.5" style={{ color: '#60a5fa' }}>
              Messages
            </span>
            <span className="text-[11px] font-bold font-mono leading-tight" style={{ color: '#60a5fa' }}>
              {stats.unreadMessages}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
