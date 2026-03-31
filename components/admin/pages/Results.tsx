'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'

interface SessionRow {
  id: string
  trader_name: string
  session_date: string
  pnl: number
  result: string | null
  trades_count: number
  instrument: string | null
  setup: string | null
}

export default function Results() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'breakeven'>('all')
  const supabase = createClient()

  useEffect(() => {
    async function fetchSessions() {
      const { data } = await supabase
        .from('trading_sessions')
        .select('*, profiles(full_name)')
        .order('session_date', { ascending: false })
        .limit(100)

      if (data) {
        setSessions(data.map((s: any) => ({
          id: s.id,
          trader_name: s.profiles?.full_name ?? 'Trader',
          session_date: s.session_date,
          pnl: s.pnl,
          result: s.result,
          trades_count: s.trades_count,
          instrument: s.instrument,
          setup: s.setup,
        })))
      }
      setLoading(false)
    }
    fetchSessions()
  }, [])

  const filtered = sessions.filter(s => filter === 'all' || s.result === filter)
  const totalPnL = filtered.reduce((sum, s) => sum + s.pnl, 0)
  const wins = filtered.filter(s => s.result === 'win').length
  const winRate = filtered.length > 0 ? Math.round((wins / filtered.length) * 100) : 0

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
        <h1 className="text-xl font-semibold text-[#e8edf5]">Résultats</h1>
        <p className="text-[#5a6a82] text-sm mt-1">Toutes les sessions de trading</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">PnL Total</p>
          <p className={`text-xl font-bold font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} $
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">Sessions</p>
          <p className="text-xl font-bold font-mono text-[#e8edf5]">{filtered.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">Win Rate</p>
          <p className={`text-xl font-bold font-mono ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {winRate}%
          </p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'win', 'loss', 'breakeven'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-[#5a6a82] hover:text-[#a0aec0] bg-[#18181b] border border-[rgba(255,255,255,0.07)]'
            }`}
          >
            {f === 'all' ? 'Tout' : f === 'win' ? 'Wins' : f === 'loss' ? 'Losses' : 'Breakeven'}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucune session trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Date</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Inst.</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trades</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">PnL</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">R</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Win%</th>
                  <th className="text-center text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Plan</th>
                  <th className="text-center text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Humeur</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {filtered.map((session) => {
                  const meta = (() => { try { return session.setup ? JSON.parse(session.setup) : null } catch { return null } })()
                  const rValue = meta?.r_value ?? session.pnl / 25
                  const winPct = meta?.win_rate ?? (session.result === 'win' ? 100 : session.result === 'loss' ? 0 : 50)
                  const planScore = meta?.plan_score
                  const mood = meta?.mood ?? '—'
                  const sessionType = meta?.session_type ?? (session.result === 'win' ? 'Win' : session.result === 'loss' ? 'Loss' : 'BE')
                  return (
                  <tr key={session.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3 text-sm font-medium text-[#e8edf5]">{session.trader_name}</td>
                    <td className="py-3 text-sm text-[#a0aec0] font-mono">
                      {new Date(session.session_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 bg-[#18181b] rounded text-xs font-mono text-[#a0aec0]">
                        {session.instrument ?? 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-[#a0aec0] text-right font-mono">{session.trades_count}</td>
                    <td className={`py-3 text-sm font-mono font-medium text-right ${session.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {session.pnl >= 0 ? '+' : ''}{session.pnl.toFixed(2)} $
                    </td>
                    <td className={`py-3 text-sm font-mono text-right ${rValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {rValue >= 0 ? '+' : ''}{Number(rValue).toFixed(1)}R
                    </td>
                    <td className="py-3 text-sm text-[#a0aec0] text-right font-mono">{winPct}%</td>
                    <td className="py-3 text-center">
                      {planScore != null ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          planScore >= 8 ? 'bg-green-500/10 text-green-400' :
                          planScore >= 5 ? 'bg-amber-500/10 text-amber-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {planScore}/10
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3 text-center text-base">{mood}</td>
                    <td className="py-3 text-right text-xs text-[#5a6a82]">{sessionType}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
