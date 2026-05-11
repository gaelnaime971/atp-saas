// Google OAuth + Calendar API helpers
// Docs: https://developers.google.com/identity/protocols/oauth2/web-server
//       https://developers.google.com/calendar/api/v3/reference/events/insert

import { createClient as createAdminClient } from '@supabase/supabase-js'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function redirectUri(): string {
  return `${appUrl()}/api/google/oauth/callback`
}

export function buildAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not set')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // ensure refresh_token
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  id_token?: string
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  return res.json() as Promise<TokenResponse>
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json() as Promise<TokenResponse>
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { email?: string }
    return data.email || null
  } catch {
    return null
  }
}

/**
 * Get a valid access token for the admin, refreshing if expired.
 * Returns null if not connected.
 */
export async function getValidAdminAccessToken(adminId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data: row } = await adminSupabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('admin_id', adminId)
    .maybeSingle()

  if (!row) return null

  const expiresAt = new Date(row.expires_at).getTime()
  const now = Date.now()

  // Refresh if expiring within 60s
  if (expiresAt - now < 60_000) {
    try {
      const refreshed = await refreshAccessToken(row.refresh_token)
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
      await adminSupabase
        .from('google_calendar_tokens')
        .update({
          access_token: refreshed.access_token,
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('admin_id', adminId)
      return { accessToken: refreshed.access_token, calendarId: row.calendar_id || 'primary' }
    } catch (err) {
      console.error('Failed to refresh Google token:', err)
      return null
    }
  }

  return { accessToken: row.access_token, calendarId: row.calendar_id || 'primary' }
}

export interface CalendarEventInput {
  summary: string
  description?: string
  start: Date
  end: Date
  attendees?: string[]
  conferenceUrl?: string // Daily.co link
  timezone?: string
}

interface CalendarEvent {
  id: string
  htmlLink?: string
  status?: string
}

export async function createCalendarEvent(
  adminId: string,
  event: CalendarEventInput
): Promise<CalendarEvent | null> {
  const creds = await getValidAdminAccessToken(adminId)
  if (!creds) return null

  const tz = event.timezone || 'America/Guadeloupe'
  const body = {
    summary: event.summary,
    description: event.description || '',
    start: { dateTime: event.start.toISOString(), timeZone: tz },
    end: { dateTime: event.end.toISOString(), timeZone: tz },
    attendees: (event.attendees || []).map(email => ({ email })),
    ...(event.conferenceUrl
      ? {
          location: event.conferenceUrl,
          description: `${event.description || ''}\n\nVisio : ${event.conferenceUrl}`,
        }
      : {}),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      console.error('Google event creation failed:', await res.text())
      return null
    }
    return res.json() as Promise<CalendarEvent>
  } catch (err) {
    console.error('Google event creation error:', err)
    return null
  }
}

export async function deleteCalendarEvent(adminId: string, eventId: string): Promise<boolean> {
  const creds = await getValidAdminAccessToken(adminId)
  if (!creds) return false
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(creds.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      }
    )
    return res.ok || res.status === 410 // 410 = already deleted
  } catch (err) {
    console.error('Google event deletion error:', err)
    return false
  }
}

/**
 * Find the first admin user id with connected Google Calendar.
 * In this app there's typically only one admin.
 */
export async function findConnectedAdminId(): Promise<string | null> {
  const { data } = await adminSupabase
    .from('google_calendar_tokens')
    .select('admin_id')
    .limit(1)
    .maybeSingle()
  return data?.admin_id || null
}
