'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { CoachingSession, Objective } from '@/lib/types'

export default function Coaching() {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [coachingSessions, setCoachingSessions] = useState<CoachingSession[]>([])
  const [nextSession, setNextSession] = useState<CoachingSession | null>(null)
  const [prepNotes, setPrepNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Fetch objectives
        const { data: objs } = await supabase
          .from('objectives')
          .select('*')
          .eq('trader_id', user.id)
          .order('created_at', { ascending: false })

        if (objs) setObjectives(objs as Objective[])

        // Fetch coaching sessions
        const { data: sessions } = await supabase
          .from('coaching_sessions')
          .select('*')
          .eq('trader_id', user.id)
          .order('scheduled_at', { ascending: false })

        const allSessions = (sessions ?? []) as CoachingSession[]
        setCoachingSessions(allSessions)

        // Find next planned session
        const now = new Date().toISOString()
        const upcoming = allSessions
          .filter(s => s.status === 'planned' && s.scheduled_at >= now)
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

        if (upcoming.length > 0) setNextSession(upcoming[0])
      } catch (err) {
        console.error('Coaching fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  function formatShortDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }

  function getSessionDay(dateStr: string) {
    const d = new Date(dateStr)
    return d.getDate().toString()
  }

  function getSessionMonth(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Chargement...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top grid-2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {/* Left: Prochain RDV */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Prochain RDV
            </h2>
            <a
              href="#"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'var(--green, #22c55e)',
                color: '#111',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Prendre un RDV
            </a>
          </div>

          {nextSession ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: 14,
              background: 'var(--bg2, #1a1f2e)',
              border: '1px solid var(--border, rgba(255,255,255,0.07))',
              borderRadius: 10,
            }}>
              <div style={{
                textAlign: 'center',
                background: 'var(--bg4, #222940)',
                border: '1px solid var(--border, rgba(255,255,255,0.07))',
                borderRadius: 8,
                padding: '8px 12px',
                minWidth: 52,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text)' }}>
                  {getSessionDay(nextSession.scheduled_at)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' }}>
                  {getSessionMonth(nextSession.scheduled_at)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Session coaching
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                  {formatTime(nextSession.scheduled_at)} &middot; {nextSession.duration_minutes} min &middot; Visio
                </div>
                {nextSession.notes && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'DM Mono', monospace" }}>
                    {nextSession.notes}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              padding: 20,
              textAlign: 'center',
              background: 'var(--bg2, #1a1f2e)',
              border: '1px solid var(--border, rgba(255,255,255,0.07))',
              borderRadius: 10,
              color: 'var(--text3)',
              fontSize: 13,
            }}>
              Aucune session planifiee
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>Notes de preparation</div>
            <textarea
              value={prepNotes}
              onChange={e => setPrepNotes(e.target.value)}
              placeholder="Ce que tu veux aborder lors du prochain coaching..."
              style={{
                width: '100%',
                minHeight: 100,
                background: 'var(--bg2, #1a1f2e)',
                border: '1px solid var(--border, rgba(255,255,255,0.07))',
                borderRadius: 8,
                padding: 12,
                color: 'var(--text)',
                fontSize: 13,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </Card>

        {/* Right: Objectifs en cours */}
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            Objectifs en cours
          </h2>

          {objectives.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              Aucun objectif defini
            </div>
          ) : (
            objectives.map((obj, i) => (
              <div
                key={obj.id}
                style={{
                  padding: '10px 0',
                  borderBottom: i < objectives.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.07))' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{obj.title}</span>
                  <span style={{
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 600,
                    background: obj.progress >= 100 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: obj.progress >= 100 ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${obj.progress >= 100 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}>
                    {obj.progress >= 100 ? 'Atteint' : 'En cours'}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: 6,
                  background: 'var(--bg3, #222940)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(obj.progress, 100)}%`,
                    height: '100%',
                    background: obj.progress >= 100 ? 'var(--green, #22c55e)' : obj.progress >= 60 ? 'var(--amber, #f59e0b)' : 'var(--red, #ef4444)',
                    borderRadius: 99,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  {obj.progress}%
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Bottom: Historique des sessions */}
      <Card>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
          Historique des sessions
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Duree', 'Format', 'Sujet', 'Notes'].map(col => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      color: 'var(--text3)',
                      fontWeight: 500,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coachingSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>
                    Aucune session de coaching enregistree
                  </td>
                </tr>
              ) : (
                coachingSessions.map(s => (
                  <tr
                    key={s.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 10px', color: 'var(--text)', fontFamily: "'DM Mono', monospace" }}>
                      {formatShortDate(s.scheduled_at)}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>
                      {s.duration_minutes} min
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>
                      Visio
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>
                      {s.notes ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>
                      {s.status === 'completed' ? 'Terminee' : s.status === 'cancelled' ? 'Annulee' : 'Planifiee'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
