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

interface JoinedSession extends CoachingSessionRow {
  trader_name: string
  trader_email: string | null
}

interface AvailabilityRow {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  slot_duration_minutes: number
  is_active: boolean
}

interface OverrideRow {
  id: string
  override_date: string
  type: 'blocked' | 'extra_slot'
  start_time: string | null
  end_time: string | null
  slot_duration_minutes: number
  note: string | null
}

const TZ = 'America/Guadeloupe'
const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateLong(d: string): string {
  // d is YYYY-MM-DD
  const date = new Date(`${d}T00:00:00`)
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function trimSeconds(t: string): string {
  // 'HH:MM:SS' -> 'HH:MM'
  return t.length >= 5 ? t.slice(0, 5) : t
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

type Tab = 'upcoming' | 'availability' | 'history'

export default function AdminCoaching() {
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('upcoming')
  const [sessions, setSessions] = useState<JoinedSession[]>([])
  const [availability, setAvailability] = useState<AvailabilityRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCallSessionId, setActiveCallSessionId] = useState<string | null>(null)
  const [savingAvailability, setSavingAvailability] = useState(false)
  const [blockDateInput, setBlockDateInput] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')

  const fetchSessions = useCallback(async () => {
    const { data } = await supabase
      .from('coaching_sessions')
      .select(
        'id, trader_id, scheduled_at, duration_minutes, notes, meeting_status, daily_room_url, daily_room_name, recording_url, created_at, profiles(full_name, email)',
      )
      .order('scheduled_at', { ascending: true })
    if (!data) return

    type WithProfile = CoachingSessionRow & {
      profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null
    }
    const rows = (data as unknown as WithProfile[]).map((r): JoinedSession => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        id: r.id,
        trader_id: r.trader_id,
        scheduled_at: r.scheduled_at,
        duration_minutes: r.duration_minutes,
        notes: r.notes,
        meeting_status: r.meeting_status,
        daily_room_url: r.daily_room_url,
        daily_room_name: r.daily_room_name,
        recording_url: r.recording_url,
        created_at: r.created_at,
        trader_name: prof?.full_name || 'Trader',
        trader_email: prof?.email ?? null,
      }
    })
    setSessions(rows)
  }, [supabase])

  const fetchAvailability = useCallback(async () => {
    const { data } = await supabase.from('coaching_availability').select('*').order('day_of_week', { ascending: true })
    // Ensure all 7 days have a row in the UI (we fill missing ones with inactive defaults)
    const map = new Map<number, AvailabilityRow>()
    for (const r of (data as AvailabilityRow[] | null) || []) {
      map.set(r.day_of_week, {
        id: r.id,
        day_of_week: r.day_of_week,
        start_time: trimSeconds(r.start_time),
        end_time: trimSeconds(r.end_time),
        slot_duration_minutes: r.slot_duration_minutes,
        is_active: r.is_active,
      })
    }
    const full: AvailabilityRow[] = []
    for (let d = 0; d < 7; d++) {
      full.push(
        map.get(d) || {
          day_of_week: d,
          start_time: '09:00',
          end_time: '17:00',
          slot_duration_minutes: 60,
          is_active: false,
        },
      )
    }
    setAvailability(full)
  }, [supabase])

  const fetchOverrides = useCallback(async () => {
    const { data } = await supabase
      .from('coaching_date_overrides')
      .select('*')
      .order('override_date', { ascending: true })
    if (data) setOverrides(data as OverrideRow[])
  }, [supabase])

  useEffect(() => {
    Promise.all([fetchSessions(), fetchAvailability(), fetchOverrides()]).finally(() => setLoading(false))
  }, [fetchSessions, fetchAvailability, fetchOverrides])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

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

  const blockedDates = useMemo(() => overrides.filter((o) => o.type === 'blocked'), [overrides])

  function updateAvail(dow: number, patch: Partial<AvailabilityRow>) {
    setAvailability((rows) => rows.map((r) => (r.day_of_week === dow ? { ...r, ...patch } : r)))
  }

  async function saveAvailability() {
    setSavingAvailability(true)
    try {
      // Upsert each day: delete row if inactive AND has id, else insert/update
      for (const row of availability) {
        if (!row.is_active) {
          if (row.id) {
            await supabase.from('coaching_availability').delete().eq('id', row.id)
          }
          continue
        }
        const payload = {
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          slot_duration_minutes: row.slot_duration_minutes,
          is_active: true,
        }
        if (row.id) {
          await supabase.from('coaching_availability').update(payload).eq('id', row.id)
        } else {
          await supabase.from('coaching_availability').insert(payload)
        }
      }
      await fetchAvailability()
      setToast('Disponibilités sauvegardées.')
    } catch (err) {
      console.error('saveAvailability', err)
      setToast('Erreur sauvegarde')
    } finally {
      setSavingAvailability(false)
    }
  }

  async function addBlockedDate() {
    if (!blockDateInput) return
    const { error } = await supabase
      .from('coaching_date_overrides')
      .insert({ override_date: blockDateInput, type: 'blocked' })
    if (error) {
      setToast(error.message)
      return
    }
    setBlockDateInput('')
    await fetchOverrides()
    setToast('Date bloquée.')
  }

  async function removeOverride(id: string) {
    await supabase.from('coaching_date_overrides').delete().eq('id', id)
    await fetchOverrides()
  }

  async function cancelSession(id: string) {
    if (!confirm('Annuler ce coaching ? Le trader sera notifié.')) return
    const res = await fetch('/api/coaching/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: id }),
    })
    if (res.ok) {
      setToast('Coaching annulé.')
      await fetchSessions()
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setToast(body.error || 'Erreur annulation')
    }
  }

  async function saveNotes(id: string) {
    const { error } = await supabase.from('coaching_sessions').update({ notes: notesDraft }).eq('id', id)
    if (error) {
      setToast('Erreur sauvegarde notes')
      return
    }
    setEditingNotesId(null)
    setNotesDraft('')
    await fetchSessions()
    setToast('Notes mises à jour.')
  }

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'upcoming', label: `🟢 RDV à venir (${upcoming.length})` },
    { id: 'availability', label: '📅 Mes disponibilités' },
    { id: 'history', label: `📚 Historique (${past.length})` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200 }}>
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

      <GoogleCalendarStatus onToast={msg => setToast(msg)} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: tab === t.id ? 'rgba(34,197,94,0.1)' : 'var(--bg3)',
              color: tab === t.id ? 'var(--green)' : 'var(--text2)',
              border: `1px solid ${tab === t.id ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Upcoming */}
      {tab === 'upcoming' && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {upcoming.length === 0 ? (
            <p style={{ padding: 28, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              Aucun RDV à venir.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  <th style={th}>Date & heure</th>
                  <th style={th}>Trader</th>
                  <th style={th}>Durée</th>
                  <th style={th}>Statut</th>
                  <th style={th}>Notes</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => {
                  const badge = statusBadge(s.meeting_status)
                  const startMs = new Date(s.scheduled_at).getTime()
                  const endMs = startMs + (s.duration_minutes || 60) * 60_000
                  const joinable = now >= startMs - 15 * 60_000 && now <= endMs + 60 * 60_000
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                          {fmtDate(s.scheduled_at)}
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: 12 }}>{fmtTime(s.scheduled_at)}</div>
                      </td>
                      <td style={td}>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{s.trader_name}</div>
                        {s.trader_email && (
                          <div style={{ color: 'var(--text3)', fontSize: 11 }}>{s.trader_email}</div>
                        )}
                      </td>
                      <td style={td}>
                        <span style={{ color: 'var(--text2)' }}>{s.duration_minutes || 60} min</span>
                      </td>
                      <td style={td}>
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
                      </td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--text2)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.notes || <span style={{ color: 'var(--text3)' }}>—</span>}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => setActiveCallSessionId(s.id)}
                            disabled={!joinable}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: joinable ? 'var(--green)' : 'var(--bg3)',
                              color: joinable ? '#000' : 'var(--text3)',
                              border: joinable ? 'none' : '1px solid var(--border)',
                              cursor: joinable ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Rejoindre
                          </button>
                          <button
                            onClick={() => cancelSession(s.id)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: 'transparent',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.3)',
                              cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Availability */}
      {tab === 'availability' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Disponibilités hebdomadaires
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              Active les jours où tu es disponible. Les créneaux seront générés automatiquement.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availability.map((row) => (
                <div
                  key={row.day_of_week}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 130px 1fr 1fr 130px',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: row.is_active ? 'var(--bg3)' : 'transparent',
                    border: `1px solid ${row.is_active ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                    borderRadius: 10,
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--text2)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) => updateAvail(row.day_of_week, { is_active: e.target.checked })}
                      style={{ accentColor: 'var(--green)' }}
                    />
                  </label>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {DAY_LABELS[row.day_of_week]}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>De</span>
                    <input
                      type="time"
                      value={row.start_time}
                      disabled={!row.is_active}
                      onChange={(e) => updateAvail(row.day_of_week, { start_time: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>À</span>
                    <input
                      type="time"
                      value={row.end_time}
                      disabled={!row.is_active}
                      onChange={(e) => updateAvail(row.day_of_week, { end_time: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <select
                    value={row.slot_duration_minutes}
                    disabled={!row.is_active}
                    onChange={(e) =>
                      updateAvail(row.day_of_week, { slot_duration_minutes: Number(e.target.value) })
                    }
                    style={inputStyle}
                  >
                    <option value={15}>15 min / slot</option>
                    <option value={30}>30 min / slot</option>
                    <option value={45}>45 min / slot</option>
                    <option value={60}>60 min / slot</option>
                    <option value={90}>90 min / slot</option>
                  </select>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={saveAvailability}
                disabled={savingAvailability}
                style={{
                  background: 'var(--green)',
                  color: '#000',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: savingAvailability ? 'wait' : 'pointer',
                }}
              >
                {savingAvailability ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Bloquer une date
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              Bloque un jour précis (congés, etc.) — aucun créneau ne sera proposé ce jour-là.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <input
                type="date"
                value={blockDateInput}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setBlockDateInput(e.target.value)}
                style={{ ...inputStyle, maxWidth: 220 }}
              />
              <button
                onClick={addBlockedDate}
                disabled={!blockDateInput}
                style={{
                  background: blockDateInput ? 'var(--green)' : 'var(--bg3)',
                  color: blockDateInput ? '#000' : 'var(--text3)',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: blockDateInput ? 'pointer' : 'not-allowed',
                }}
              >
                Bloquer
              </button>
            </div>

            {blockedDates.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Aucune date bloquée.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {blockedDates.map((o) => (
                  <span
                    key={o.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      color: '#fca5a5',
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {fmtDateLong(o.override_date)}
                    <button
                      onClick={() => removeOverride(o.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: 0,
                      }}
                      aria-label="Retirer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: History */}
      {tab === 'history' && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {past.length === 0 ? (
            <p style={{ padding: 28, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Aucun historique.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  <th style={th}>Date</th>
                  <th style={th}>Trader</th>
                  <th style={th}>Durée</th>
                  <th style={th}>Statut</th>
                  <th style={th}>Notes</th>
                  <th style={{ ...th, textAlign: 'right' }}>Enregistrement</th>
                </tr>
              </thead>
              <tbody>
                {past.map((s) => {
                  const badge = statusBadge(s.meeting_status)
                  const editing = editingNotesId === s.id
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                          {fmtDate(s.scheduled_at)}
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: 12 }}>{fmtTime(s.scheduled_at)}</div>
                      </td>
                      <td style={td}>
                        <div style={{ color: 'var(--text)' }}>{s.trader_name}</div>
                      </td>
                      <td style={td}>{s.duration_minutes || 60} min</td>
                      <td style={td}>
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
                      </td>
                      <td style={{ ...td, maxWidth: 320 }}>
                        {editing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <textarea
                              value={notesDraft}
                              onChange={(e) => setNotesDraft(e.target.value)}
                              rows={2}
                              style={{
                                flex: 1,
                                ...inputStyle,
                                fontFamily: 'inherit',
                                resize: 'vertical',
                                padding: 6,
                              }}
                            />
                            <button
                              onClick={() => saveNotes(s.id)}
                              style={{
                                background: 'var(--green)',
                                color: '#000',
                                border: 'none',
                                padding: '0 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setEditingNotesId(null)
                                setNotesDraft('')
                              }}
                              style={{
                                background: 'var(--bg3)',
                                color: 'var(--text2)',
                                border: '1px solid var(--border)',
                                padding: '0 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingNotesId(s.id)
                              setNotesDraft(s.notes || '')
                            }}
                            title="Modifier"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              color: s.notes ? 'var(--text2)' : 'var(--text3)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.4,
                            }}
                          >
                            {s.notes || '+ Ajouter une note'}
                          </button>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {s.recording_url ? (
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
                              display: 'inline-block',
                            }}
                          >
                            ▶ Voir
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

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

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text3)',
}

const td: React.CSSProperties = {
  padding: '12px 14px',
  color: 'var(--text2)',
  verticalAlign: 'middle',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
}


function GoogleCalendarStatus({ onToast }: { onToast: (msg: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    fetch("/api/google/status").then(r => r.json()).then(d => {
      setConnected(!!d.connected)
      setEmail(d.email || null)
    }).finally(() => setLoading(false))

    // Handle return from OAuth
    const params = new URLSearchParams(window.location.search)
    if (params.get("google") === "connected") {
      onToast("Google Calendar connecté ✓")
      window.history.replaceState({}, "", window.location.pathname)
    } else if (params.get("google") === "error") {
      onToast(`Erreur Google : ${params.get("reason") || ""}`)
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [onToast])

  async function disconnect() {
    if (!confirm("Déconnecter Google Calendar ? Les futurs RDV ne seront plus synchronisés.")) return
    setDisconnecting(true)
    await fetch("/api/google/disconnect", { method: "POST" })
    setConnected(false)
    setEmail(null)
    setDisconnecting(false)
    onToast("Google Calendar déconnecté")
  }

  if (loading) return null

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: connected ? "rgba(34,197,94,0.06)" : "var(--bg3)",
        border: `1px solid ${connected ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
        borderRadius: 10,
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22 }}>📅</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Google Calendar</div>
          {connected ? (
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
              Connecté{email ? ` · ${email}` : ""} · les RDV sont créés dans ton agenda automatiquement
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
              Connecte ton compte pour que les RDV apparaissent dans ton agenda Google
            </div>
          )}
        </div>
      </div>
      {connected ? (
        <button
          onClick={disconnect}
          disabled={disconnecting}
          style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: "transparent", border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444", cursor: disconnecting ? "default" : "pointer", whiteSpace: "nowrap",
          }}
        >
          {disconnecting ? "..." : "Déconnecter"}
        </button>
      ) : (
        <a
          href="/api/google/oauth/start"
          style={{
            padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: "var(--green)", color: "#000", textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Connecter Google →
        </a>
      )}
    </div>
  )
}
