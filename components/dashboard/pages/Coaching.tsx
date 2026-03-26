'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import type { CoachingSession } from '@/lib/types'

export default function Coaching() {
  const [coachingSessions, setCoachingSessions] = useState<CoachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const [{ data: sessions }, { data: settings }] = await Promise.all([
          supabase.from('coaching_sessions').select('*').eq('trader_id', user.id).order('scheduled_at', { ascending: false }),
          supabase.from('app_settings').select('value').eq('key', 'calendly_url').single(),
        ])

        if (sessions) setCoachingSessions(sessions as CoachingSession[])
        if (settings?.value) setCalendlyUrl(settings.value)
      } catch (err) {
        console.error('Coaching fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const upcoming = coachingSessions.filter(s => s.status === 'planned' && s.scheduled_at >= new Date().toISOString())
  const past = coachingSessions.filter(s => s.status !== 'planned' || s.scheduled_at < new Date().toISOString())

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* Left: Historique des sessions */}
      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Mes sessions coaching
          </h2>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#60a5fa' }}>
                Prochaine{upcoming.length > 1 ? 's' : ''} session{upcoming.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {upcoming.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}
                  >
                    <div
                      className="flex-shrink-0 text-center rounded-lg px-2 py-1"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', minWidth: 44 }}
                    >
                      <div className="text-base font-bold font-mono" style={{ color: 'var(--text)' }}>
                        {new Date(s.scheduled_at).getDate()}
                      </div>
                      <div className="text-[9px] uppercase font-mono" style={{ color: 'var(--text3)' }}>
                        {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { month: 'short' })}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Session coaching</p>
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>
                        {new Date(s.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{s.duration_minutes} min
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                      Planifiée
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past sessions */}
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
            Historique ({past.length})
          </p>
          {past.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs" style={{ color: 'var(--text3)' }}>Aucune session passée</p>
            </div>
          ) : (
            <div className="space-y-2">
              {past.map(s => {
                const statusColor = s.status === 'completed' ? '#22c55e' : s.status === 'cancelled' ? '#ef4444' : 'var(--text3)'
                const statusLabel = s.status === 'completed' ? 'Terminée' : s.status === 'cancelled' ? 'Annulée' : 'Passée'
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
                  >
                    <div className="w-1 self-stretch rounded-full" style={{ background: statusColor }} />
                    <div
                      className="flex-shrink-0 text-center rounded-lg px-2 py-1"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', minWidth: 44 }}
                    >
                      <div className="text-base font-bold font-mono" style={{ color: 'var(--text2)' }}>
                        {new Date(s.scheduled_at).getDate()}
                      </div>
                      <div className="text-[9px] uppercase font-mono" style={{ color: 'var(--text3)' }}>
                        {new Date(s.scheduled_at).toLocaleDateString('fr-FR', { month: 'short' })}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Session coaching</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${statusColor}15`, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>
                        {new Date(s.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{s.duration_minutes} min
                      </p>
                      {s.notes && (
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text2)' }}>
                          {s.notes}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Right: Calendly embed */}
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
              Réserver un créneau
            </h2>
            {calendlyUrl && (
              <a
                href={calendlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--text3)' }}
              >
                Ouvrir dans Calendly
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>

          {calendlyUrl ? (
            <div style={{ borderRadius: 8, overflow: 'hidden', height: 660 }}>
              <iframe
                src={calendlyUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                title="Calendly - Réserver un coaching"
              />
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-xs" style={{ color: 'var(--text3)' }}>
                Le lien de réservation n&apos;a pas encore été configuré par l&apos;administrateur.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
