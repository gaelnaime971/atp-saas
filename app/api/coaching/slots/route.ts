import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface AvailabilityRow {
  id: string
  day_of_week: number
  start_time: string // 'HH:MM:SS'
  end_time: string
  slot_duration_minutes: number
  is_active: boolean
}

interface OverrideRow {
  id: string
  override_date: string // 'YYYY-MM-DD'
  type: 'blocked' | 'extra_slot'
  start_time: string | null
  end_time: string | null
  slot_duration_minutes: number
}

interface BookedRow {
  scheduled_at: string
  duration_minutes: number
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0]
}

function parseTime(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map(Number)
  return { h, m }
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [availRes, overrideRes, bookedRes] = await Promise.all([
      supabase.from('coaching_availability').select('*').eq('is_active', true),
      supabase.from('coaching_date_overrides').select('*'),
      supabase.from('coaching_sessions')
        .select('scheduled_at, duration_minutes')
        .in('meeting_status', ['scheduled', 'in_progress'])
        .gte('scheduled_at', new Date().toISOString()),
    ])

    const availabilities = (availRes.data || []) as AvailabilityRow[]
    const overrides = (overrideRes.data || []) as OverrideRow[]
    const booked = (bookedRes.data || []) as BookedRow[]

    const bookedKeys = new Set(booked.map(b => new Date(b.scheduled_at).toISOString()))
    const blockedDates = new Set(
      overrides.filter(o => o.type === 'blocked').map(o => o.override_date)
    )

    // Generate slots for next 30 days
    const slots: Array<{ start: string; end: string; available: boolean }> = []
    const now = new Date()
    const minimumLead = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2h lead time

    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i)
      date.setHours(0, 0, 0, 0)
      const dow = date.getDay()
      const dateStr = ymd(date)

      if (blockedDates.has(dateStr)) continue

      // Weekly availabilities for this day
      const dayAvails = availabilities.filter(a => a.day_of_week === dow)
      // Extra slots from overrides
      const extras = overrides.filter(o => o.type === 'extra_slot' && o.override_date === dateStr)

      const allRanges = [
        ...dayAvails.map(a => ({ start: a.start_time, end: a.end_time, duration: a.slot_duration_minutes })),
        ...extras.filter(e => e.start_time && e.end_time).map(e => ({
          start: e.start_time!,
          end: e.end_time!,
          duration: e.slot_duration_minutes,
        })),
      ]

      for (const range of allRanges) {
        const { h: sh, m: sm } = parseTime(range.start)
        const { h: eh, m: em } = parseTime(range.end)
        const rangeStart = new Date(date)
        rangeStart.setHours(sh, sm, 0, 0)
        const rangeEnd = new Date(date)
        rangeEnd.setHours(eh, em, 0, 0)

        let cursor = new Date(rangeStart)
        while (addMinutes(cursor, range.duration) <= rangeEnd) {
          const slotEnd = addMinutes(cursor, range.duration)
          if (cursor >= minimumLead) {
            const isoStart = cursor.toISOString()
            const taken = bookedKeys.has(isoStart)
            slots.push({
              start: isoStart,
              end: slotEnd.toISOString(),
              available: !taken,
            })
          }
          cursor = slotEnd
        }
      }
    }

    return NextResponse.json({ slots })
  } catch (err) {
    console.error('Slots error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
