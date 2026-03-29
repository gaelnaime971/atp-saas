'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

interface SessionData {
  pnl: number
  result: string | null
  setup: string | null
  session_date: string
}

interface Badge {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  maxProgress: number
  color: string
}

function parseSetup(setup: string | null) {
  if (!setup) return null
  try { return JSON.parse(setup) } catch { return null }
}

export default function Classement() {
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [hasPayout, setHasPayout] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: sess }, { data: pays }] = await Promise.all([
        supabase.from('trading_sessions').select('pnl, result, setup, session_date').eq('trader_id', user.id).order('session_date', { ascending: true }),
        supabase.from('payouts').select('id').eq('trader_id', user.id).limit(1),
      ])
      if (sess) setSessions(sess as SessionData[])
      if (pays && pays.length > 0) setHasPayout(true)
      setLoading(false)
    }
    fetch()
  }, [])

  const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
  const wins = sessions.filter(s => s.result === 'win').length
  const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
  const grossProfit = sessions.filter(s => Number(s.pnl) > 0).reduce((s, x) => s + Number(x.pnl), 0)
  const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((s, x) => s + Number(x.pnl), 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0

  // Streaks
  let currentStreak = 0
  let bestWinStreak = 0
  let tempStreak = 0
  for (const s of [...sessions].reverse()) {
    if (s.result === 'win') {
      tempStreak++
      bestWinStreak = Math.max(bestWinStreak, tempStreak)
    } else {
      tempStreak = 0
    }
  }
  for (const s of [...sessions].reverse()) {
    if (s.result === 'win') currentStreak++
    else break
  }

  // Plan scores
  const planScores = sessions.map(s => parseSetup(s.setup)?.plan_score).filter((v: any) => v != null) as number[]
  const avgPlanScore = planScores.length > 0 ? planScores.reduce((a, b) => a + b, 0) / planScores.length : 0
  const planAbove8 = planScores.filter(s => s >= 8).length

  // Consecutive plan sessions
  let consecutivePlan = 0
  let maxConsecutivePlan = 0
  for (const s of sessions) {
    const score = parseSetup(s.setup)?.plan_score
    if (score != null && score >= 8) {
      consecutivePlan++
      maxConsecutivePlan = Math.max(maxConsecutivePlan, consecutivePlan)
    } else {
      consecutivePlan = 0
    }
  }

  // Level
  const count = sessions.length
  const level = count >= 100 ? { name: 'Expert', color: '#f59e0b', next: null, progress: 100 }
    : count >= 60 ? { name: 'Confirmé', color: '#22c55e', next: 100, progress: Math.round(((count - 60) / 40) * 100) }
    : count >= 30 ? { name: 'Intermédiaire', color: '#60a5fa', next: 60, progress: Math.round(((count - 30) / 30) * 100) }
    : count >= 10 ? { name: 'Apprenti', color: '#a78bfa', next: 30, progress: Math.round(((count - 10) / 20) * 100) }
    : { name: 'Débutant', color: '#5a6a82', next: 10, progress: Math.round((count / 10) * 100) }

  const badges: Badge[] = [
    { id: '10sess', title: '10 Sessions', description: 'Enregistrer 10 sessions', icon: '📊', unlocked: count >= 10, progress: Math.min(count, 10), maxProgress: 10, color: '#60a5fa' },
    { id: '50sess', title: '50 Sessions', description: 'Enregistrer 50 sessions', icon: '📈', unlocked: count >= 50, progress: Math.min(count, 50), maxProgress: 50, color: '#a78bfa' },
    { id: '100sess', title: '100 Sessions', description: 'Enregistrer 100 sessions', icon: '🏆', unlocked: count >= 100, progress: Math.min(count, 100), maxProgress: 100, color: '#f59e0b' },
    { id: 'wr50', title: 'Win Rate 50%+', description: 'Maintenir un win rate supérieur à 50%', icon: '🎯', unlocked: winRate >= 50 && count >= 5, progress: Math.min(winRate, 50), maxProgress: 50, color: '#22c55e' },
    { id: 'wr60', title: 'Win Rate 60%+', description: 'Maintenir un win rate supérieur à 60%', icon: '🔥', unlocked: winRate >= 60 && count >= 10, progress: Math.min(winRate, 60), maxProgress: 60, color: '#f59e0b' },
    { id: 'pf15', title: 'Profit Factor > 1.5', description: 'Avoir un profit factor supérieur à 1.5', icon: '💎', unlocked: profitFactor >= 1.5 && count >= 5, progress: Math.min(Math.round(profitFactor * 10), 15), maxProgress: 15, color: '#22c55e' },
    { id: 'streak5', title: '5 Wins Streak', description: 'Enchaîner 5 victoires consécutives', icon: '⚡', unlocked: bestWinStreak >= 5, progress: Math.min(bestWinStreak, 5), maxProgress: 5, color: '#f59e0b' },
    { id: 'plan80', title: 'Dans le plan 80%+', description: 'Score plan ATP >= 8 sur 80% des sessions', icon: '📋', unlocked: planScores.length >= 5 && (planAbove8 / planScores.length) >= 0.8, progress: planAbove8, maxProgress: Math.max(planScores.length, 1), color: '#60a5fa' },
    { id: 'plan10c', title: '10 sessions dans le plan', description: '10 sessions consécutives avec plan >= 8/10', icon: '🧠', unlocked: maxConsecutivePlan >= 10, progress: Math.min(maxConsecutivePlan, 10), maxProgress: 10, color: '#a78bfa' },
    { id: 'payout', title: 'Premier Payout', description: 'Obtenir votre premier retrait', icon: '💰', unlocked: hasPayout, progress: hasPayout ? 1 : 0, maxProgress: 1, color: '#22c55e' },
    { id: 'profitable', title: 'Profitable', description: 'Avoir un P&L total positif', icon: '✅', unlocked: totalPnl > 0 && count >= 5, progress: totalPnl > 0 ? 1 : 0, maxProgress: 1, color: '#22c55e' },
  ]

  const unlockedCount = badges.filter(b => b.unlocked).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Achievements</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>{unlockedCount} / {badges.length} débloqués</p>
      </div>

      {/* Level card */}
      <Card>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${level.color}15`, border: `2px solid ${level.color}40` }}>
            {level.name === 'Expert' ? '🏆' : level.name === 'Confirmé' ? '⭐' : level.name === 'Intermédiaire' ? '📈' : level.name === 'Apprenti' ? '🌱' : '🔰'}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Niveau actuel</p>
            <p className="text-2xl font-bold" style={{ color: level.color }}>{level.name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>{count} sessions enregistrées{level.next ? ` · ${level.next - count} pour le niveau suivant` : ''}</p>
            {level.next && (
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg3)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${level.progress}%`, background: level.color }} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-lg font-bold font-mono" style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}$</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>P&L Total</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono" style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>{winRate}%</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>Win Rate</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono" style={{ color: profitFactor >= 1.5 ? '#22c55e' : profitFactor >= 1 ? '#f59e0b' : '#ef4444' }}>{profitFactor > 0 ? profitFactor.toFixed(2) : '—'}</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>Profit Factor</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono" style={{ color: currentStreak > 0 ? '#22c55e' : 'var(--text2)' }}>{currentStreak}</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>Streak actuel</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Badges grid */}
      <div className="grid grid-cols-3 gap-4">
        {badges.map(badge => (
          <div
            key={badge.id}
            className="rounded-xl p-4 border transition-all"
            style={{
              background: badge.unlocked ? `${badge.color}08` : 'var(--bg2)',
              borderColor: badge.unlocked ? `${badge.color}30` : 'var(--border)',
              opacity: badge.unlocked ? 1 : 0.5,
            }}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">{badge.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: badge.unlocked ? badge.color : 'var(--text3)' }}>{badge.title}</p>
                  {badge.unlocked && (
                    <svg className="w-4 h-4" fill={badge.color} viewBox="0 0 24 24">
                      <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{badge.description}</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono" style={{ color: badge.unlocked ? badge.color : 'var(--text3)' }}>
                      {badge.progress}/{badge.maxProgress}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg3)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((badge.progress / badge.maxProgress) * 100, 100)}%`, background: badge.unlocked ? badge.color : 'var(--text3)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
