'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface CalendarSession {
  id: string
  trader_name: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string | null
}

export default function Calendar() {
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const supabase = createClient()

  useEffect(() => {
    async function fetchSessions() {
      const { data } = await supabase
        .from('coaching_sessions')
        .select('*, profiles(full_name)')
        .order('scheduled_at', { ascending: true })

      if (data) {
        setSessions(data.map((s: any) => ({
          id: s.id,
          trader_name: s.profiles?.full_name ?? 'Trader',
          scheduled_at: s.scheduled_at,
          duration_minutes: s.duration_minutes,
          status: s.status,
          notes: s.notes,
        })))
      }
      setLoading(false)
    }
    fetchSessions()
  }, [])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1

  const days: (Date | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  const getSessionsForDay = (date: Date) => {
    return sessions.filter(s => {
      const d = new Date(s.scheduled_at)
      return d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
    })
  }

  const upcomingSessions = sessions
    .filter(s => new Date(s.scheduled_at) >= new Date())
    .slice(0, 5)

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
        <h1 className="text-xl font-semibold text-[#e8edf5]">Calendrier</h1>
        <p className="text-[#5a6a82] text-sm mt-1">Sessions de coaching planifiées</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-[#e8edf5]">
                {monthNames[month]} {year}
              </h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Aujourd&apos;hui
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 mb-2">
              {dayNames.map(d => (
                <div key={d} className="text-center text-xs font-medium text-[#5a6a82] py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />
                const daySessions = getSessionsForDay(day)
                const isToday = day.toDateString() === new Date().toDateString()
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[72px] p-2 rounded-lg border transition-all ${
                      isToday
                        ? 'border-green-500/40 bg-green-500/5'
                        : 'border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.02)]'
                    }`}
                  >
                    <p className={`text-xs font-medium mb-1 ${isToday ? 'text-green-400' : 'text-[#a0aec0]'}`}>
                      {day.getDate()}
                    </p>
                    <div className="space-y-0.5">
                      {daySessions.slice(0, 2).map(s => (
                        <div
                          key={s.id}
                          className={`text-xs px-1 py-0.5 rounded truncate ${
                            s.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                            s.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                            'bg-blue-500/10 text-blue-400'
                          }`}
                        >
                          {s.trader_name.split(' ')[0]}
                        </div>
                      ))}
                      {daySessions.length > 2 && (
                        <p className="text-xs text-[#5a6a82]">+{daySessions.length - 2}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Upcoming sessions */}
        <div>
          <Card>
            <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">Prochaines sessions</h3>
            {upcomingSessions.length === 0 ? (
              <p className="text-[#5a6a82] text-sm">Aucune session planifiée</p>
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map(s => (
                  <div key={s.id} className="p-3 bg-[#1c2333] rounded-lg border border-[rgba(255,255,255,0.05)]">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium text-[#e8edf5]">{s.trader_name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        s.status === 'planned' ? 'bg-blue-500/10 text-blue-400' :
                        s.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {s.status === 'planned' ? 'Planifié' : s.status === 'completed' ? 'Terminé' : 'Annulé'}
                      </span>
                    </div>
                    <p className="text-xs text-[#5a6a82]">
                      {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}
                      {new Date(s.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-[#5a6a82] mt-0.5">{s.duration_minutes} min</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
