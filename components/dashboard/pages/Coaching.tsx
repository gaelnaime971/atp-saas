'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import VideoCall from '@/components/coaching/VideoCall'

type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

interface CoachingSessionRow {
  id: string
  trader_id: string
  scheduled_at: string
  duration_minutes: number
  notes: string | null
  meeting_status: MeetingStatus | null
  daily_room_url: string | null
  daily_room_name: string | null
  recording_url: string | null
  created_at: string
}

interface Slot {
  start: string
  end: string
  available: boolean
}

const TZ = 'America/Guadeloupe'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayKey(iso: string): string {
  // Build a stable per-day key in Guadeloupe TZ
  const parts = new Date(iso).toLocaleDateString('fr-CA', { timeZone: TZ })
  return parts // YYYY-MM-DD
}

function statusBadge(status: MeetingStatus | null): { label: string; color: string; bg: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'Planifié', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' }
    case 'in_progress':
      return { label: 'En cours', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' }
    case 'completed':
      return { label: 'Terminé', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' }
    case 'cancelled':
      return { label: 'Annulé', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }
    case 'no_show':
      return { label: 'Absent', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
    default:
      return { label: '—', color: 'var(--text3)', bg: 'var(--bg3)' }
  }
}

function joinWindow(scheduledAt: string, durationMin: number): {
  joinable: boolean
  preStart: boolean
  postEnd: boolean
  minutesUntil: number
} {
  const start = new Date(scheduledAt).getTime()
  const end = start + durationMin * 60_000
  const now = Date.now()
  const fifteenMinBefore = start - 15 * 60_000
  const oneHourAfter = end + 60 * 60_000
  return {
    joinable: now >= fifteenMinBefore && now <= oneHourAfter,
    preStart: now < fifteenMinBefore,
    postEnd: now > oneHourAfter,
    minutesUntil: Math.round((start - now) / 60_000),
  }
}

function humanizeMinutes(mins: number): string {
  if (mins <= 0) return 'maintenant'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 24) return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  const d = Math.floor(h / 24)
  const remH = h % 24
  return remH ? `${d}j ${remH}h` : `${d}j`
}

export default function Coaching() {
  const [sessions, setSessions] = useState<CoachingSessionRow[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null)
  const [bookingNotes, setBookingNotes] = useState('')
  const [booking, setBooking] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Force re-render every 30s so "joinable" buttons update
  const [tick, setTick] = useState(0)

  const supabase = useMemo(() => createClient(), [])

  const fetchSessions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('coaching_sessions')
      .select(
        'id, trader_id, scheduled_at, duration_minutes, notes, meeting_status, daily_room_url, daily_room_name, recording_url, created_at',
      )
      .eq('trader_id', user.id)
      .order('scheduled_at', { ascending: false })
    if (data) setSessions(data as CoachingSessionRow[])
  }, [supabase])

  const fetchSlots = useCallback(async () => {
    setSlotsLoading(true)
    try {
      const res = await fetch('/api/coaching/slots')
      if (res.ok) {
        const body = (await res.json()) as { slots: Slot[] }
        setSlots(body.slots || [])
      }
    } catch (err) {
      console.error('fetchSlots', err)
    } finally {
      setSlotsLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchSessions(), fetchSlots()]).finally(() => setLoading(false))
  }, [fetchSessions, fetchSlots])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Trigger tick re-render reference (avoid unused warning)
  void tick

  const now = Date.now()
  const upcoming = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            (s.meeting_status === 'scheduled' || s.meeting_status === 'in_progress') &&
            new Date(s.scheduled_at).getTime() + (s.duration_minutes || 60) * 60_000 + 60 * 60_000 >= now,
        )
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [sessions, now],
  )

  const past = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.meeting_status === 'completed' ||
            s.meeting_status === 'no_show' ||
            s.meeting_status === 'cancelled' ||
            (s.meeting_status === 'scheduled' &&
              new Date(s.scheduled_at).getTime() + (s.duration_minutes || 60) * 60_000 + 60 * 60_000 < now),
        )
        .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    [sessions, now],
  )

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, Slot[]>()
    for (const slot of slots) {
      const k = dayKey(slot.start)
      const arr = groups.get(k) || []
      arr.push(slot)
      groups.set(k, arr)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, list]) => ({
        key: k,
        label: fmtDate(list[0].start),
        slots: list.sort((a, b) => a.start.localeCompare(b.start)),
      }))
  }, [slots])

  async function confirmBooking() {
    if (!bookingSlot) return
    setBooking(true)
    setBookingError(null)
    try {
      const durationMs = new Date(bookingSlot.end).getTime() - new Date(bookingSlot.start).getTime()
      const duration_minutes = Math.max(15, Math.round(durationMs / 60_000))
      const res = await fetch('/api/coaching/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: bookingSlot.start,
          duration_minutes,
          notes: bookingNotes.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setBookingError(body.error || 'Erreur réservation')
        return
      }
      setToast('Coaching réservé. Confirmation envoyée par email.')
      setBookingSlot(null)
      setBookingNotes('')
      await Promise.all([fetchSessions(), fetchSlots()])
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setBooking(false)
    }
  }

  async function cancelSession(id: string) {
    if (!confirm('Annuler ce coaching ? Cette action est irréversible.')) return
    setCancellingId(id)
    try {
      const res = await fetch('/api/coaching/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setToast(body.error || 'Erreur annulation')
        return
      }
      setToast('Coaching annulé.')
      await Promise.all([fetchSessions(), fetchSlots()])
    } finally {
      setCancellingId(null)
    }
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 240 }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'var(--green)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 80,
            right: 24,
            zIndex: 100,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            padding: '10px 16px',
            borderRadius: 8,
            color: 'var(--text)',
            fontSize: 13,
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          {toast}
        </div>
      )}

      {/* SECTION 1: Mes RDV à venir */}
      <section>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text2)',
            marginBottom: 12,
          }}
        >
          Mes RDV à venir
        </h2>

        {upcoming.length === 0 ? (
          <div
            style={{
              padding: 24,
              background: 'var(--bg2)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: 13,
            }}
          >
            Aucun coaching à venir — réserve ton créneau ci-dessous.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {upcoming.map((s) => {
              const jw = joinWindow(s.scheduled_at, s.duration_minutes || 60)
              const badge = statusBadge(s.meeting_status)
              const cancellable = new Date(s.scheduled_at).getTime() - now > 24 * 3600 * 1000
              return (
                <div
                  key={s.id}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    transition: 'border-color 150ms, background 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                        {fmtTime(s.scheduled_at)}
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, textTransform: 'capitalize' }}>
                        {fmtDate(s.scheduled_at)}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        Durée : {s.duration_minutes || 60} min
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: badge.color,
                        background: badge.bg,
                        padding: '4px 8px',
                        borderRadius: 6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {s.notes && (
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text2)',
                        background: 'var(--bg3)',
                        padding: '8px 10px',
                        borderRadius: 8,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {s.notes}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {jw.joinable ? (
                      <button
                        onClick={() => setActiveCallSessionId(s.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'var(--green)',
                          color: '#000',
                          border: 'none',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>▶</span> Rejoindre l&apos;appel
                      </button>
                    ) : jw.preStart ? (
                      <button
                        disabled
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'var(--bg3)',
                          color: 'var(--text3)',
                          border: '1px solid var(--border)',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'not-allowed',
                        }}
                      >
                        Démarre dans {humanizeMinutes(jw.minutesUntil)}
                      </button>
                    ) : (
                      <button
                        disabled
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'var(--bg3)',
                          color: 'var(--text3)',
                          border: '1px solid var(--border)',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'not-allowed',
                        }}
                      >
                        Terminé
                      </button>
                    )}
                    {cancellable && (
                      <button
                        onClick={() => cancelSession(s.id)}
                        disabled={cancellingId === s.id}
                        style={{
                          background: 'transparent',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.3)',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: cancellingId === s.id ? 'wait' : 'pointer',
                        }}
                      >
                        {cancellingId === s.id ? '…' : 'Annuler'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: Réserver un coaching */}
      <section>
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text2)',
            marginBottom: 12,
          }}
        >
          Réserver un coaching
        </h2>

        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 18,
          }}
        >
          {slotsLoading ? (
            <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Chargement des créneaux…
            </p>
          ) : slotsByDay.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Aucun créneau disponible pour le moment. Reviens plus tard.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {slotsByDay.map((day) => (
                <div
                  key={day.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: 16,
                    paddingBottom: 14,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {day.label}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {day.slots.filter((s) => s.available).length} dispo
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {day.slots.map((slot) => {
                      const time = fmtTime(slot.start)
                      if (!slot.available) {
                        return (
                          <span
                            key={slot.start}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              background: 'var(--bg3)',
                              color: 'var(--text3)',
                              border: '1px solid var(--border)',
                              textDecoration: 'line-through',
                              cursor: 'not-allowed',
                            }}
                          >
                            {time}
                          </span>
                        )
                      }
                      return (
                        <button
                          key={slot.start}
                          onClick={() => {
                            setBookingSlot(slot)
                            setBookingNotes('')
                            setBookingError(null)
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'rgba(34,197,94,0.1)',
                            color: 'var(--green)',
                            border: '1px solid rgba(34,197,94,0.25)',
                            cursor: 'pointer',
                            transition: 'background 120ms',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(34,197,94,0.2)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(34,197,94,0.1)'
                          }}
                        >
                          {time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: Historique */}
      <section>
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text2)',
            marginBottom: 12,
          }}
        >
          <span style={{ transform: historyOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>▸</span>
          Historique ({past.length})
        </button>

        {historyOpen &&
          (past.length === 0 ? (
            <div
              style={{
                padding: 16,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                textAlign: 'center',
                color: 'var(--text3)',
                fontSize: 13,
              }}
            >
              Aucun coaching passé.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((s) => {
                const badge = statusBadge(s.meeting_status)
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: 12,
                      background: 'var(--bg2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ minWidth: 140 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                        {fmtDateShort(s.scheduled_at)}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {fmtTime(s.scheduled_at)} · {s.duration_minutes || 60} min
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: badge.color,
                        background: badge.bg,
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {badge.label}
                    </span>
                    <p
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: 'var(--text2)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.notes || <span style={{ color: 'var(--text3)' }}>Aucune note</span>}
                    </p>
                    {s.recording_url && (
                      <a
                        href={s.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--green)',
                          textDecoration: 'none',
                          padding: '4px 10px',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ▶ Revoir l&apos;enregistrement
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
      </section>

      {/* Booking confirm modal */}
      {bookingSlot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => !booking && setBookingSlot(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              Confirmer la réservation
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Une confirmation te sera envoyée par email.
            </p>

            <div
              style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                padding: 14,
                borderRadius: 10,
                marginBottom: 14,
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>
                {fmtDateTimeFull(bookingSlot.start)}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                Durée :{' '}
                {Math.round((new Date(bookingSlot.end).getTime() - new Date(bookingSlot.start).getTime()) / 60_000)}{' '}
                minutes
              </p>
            </div>

            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text2)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}
            >
              Sujet / Notes (optionnel)
            </label>
            <textarea
              value={bookingNotes}
              onChange={(e) => setBookingNotes(e.target.value)}
              placeholder="Ex: revue de ma stratégie scalping, gestion du risque…"
              rows={4}
              style={{
                width: '100%',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
            />

            {bookingError && (
              <p
                style={{
                  fontSize: 12,
                  color: '#fca5a5',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 12,
                }}
              >
                {bookingError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setBookingSlot(null)}
                disabled={booking}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text2)',
                  padding: '10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: booking ? 'wait' : 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmBooking}
                disabled={booking}
                style={{
                  flex: 2,
                  background: 'var(--green)',
                  color: '#000',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: booking ? 'wait' : 'pointer',
                }}
              >
                {booking ? 'Réservation…' : 'Confirmer la réservation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video call overlay */}
      {activeCallSessionId && (
        <VideoCall
          sessionId={activeCallSessionId}
          onLeave={() => {
            setActiveCallSessionId(null)
            fetchSessions()
          }}
        />
      )}
    </div>
  )
}
