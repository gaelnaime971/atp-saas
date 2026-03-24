'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface CoachingSession {
  id: string
  trader_name: string
  trader_id: string
  scheduled_at: string
  duration_minutes: number
  status: 'planned' | 'completed' | 'cancelled'
  notes: string | null
}

export default function Sessions() {
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'completed' | 'cancelled'>('all')
  const supabase = createClient()

  async function fetchSessions() {
    const { data } = await supabase
      .from('coaching_sessions')
      .select('*, profiles(full_name)')
      .order('scheduled_at', { ascending: false })

    if (data) {
      setSessions(data.map((s: any) => ({
        id: s.id,
        trader_name: s.profiles?.full_name ?? 'Trader',
        trader_id: s.trader_id,
        scheduled_at: s.scheduled_at,
        duration_minutes: s.duration_minutes,
        status: s.status,
        notes: s.notes,
      })))
    }
    setLoading(false)
  }

  useEffect(() => { fetchSessions() }, [])

  async function updateStatus(id: string, status: 'planned' | 'completed' | 'cancelled') {
    await supabase.from('coaching_sessions').update({ status }).eq('id', id)
    fetchSessions()
  }

  const filtered = sessions.filter(s => statusFilter === 'all' || s.status === statusFilter)

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
        <h1 className="text-xl font-semibold text-[#e8edf5]">Sessions de Coaching</h1>
        <p className="text-[#5a6a82] text-sm mt-1">{sessions.length} session{sessions.length !== 1 ? 's' : ''} au total</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'planned', 'completed', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === f
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-[#5a6a82] hover:text-[#a0aec0] bg-[#1c2333] border border-[rgba(255,255,255,0.07)]'
            }`}
          >
            {f === 'all' ? 'Tout' : f === 'planned' ? 'Planifié' : f === 'completed' ? 'Terminé' : 'Annulé'}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucune session trouvée</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(session => (
              <div
                key={session.id}
                className="flex items-center gap-4 p-4 bg-[#1c2333] rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] transition-all"
              >
                <div className={`w-1 self-stretch rounded-full ${
                  session.status === 'completed' ? 'bg-green-500' :
                  session.status === 'cancelled' ? 'bg-red-500' :
                  'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-semibold text-[#e8edf5]">{session.trader_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      session.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      session.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {session.status === 'planned' ? 'Planifié' : session.status === 'completed' ? 'Terminé' : 'Annulé'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#5a6a82]">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(session.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(session.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{session.duration_minutes} min
                    </span>
                  </div>
                  {session.notes && (
                    <p className="text-xs text-[#a0aec0] mt-1 truncate">{session.notes}</p>
                  )}
                </div>
                {session.status === 'planned' && (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => updateStatus(session.id, 'completed')}>
                      Terminer
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => updateStatus(session.id, 'cancelled')}>
                      Annuler
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
