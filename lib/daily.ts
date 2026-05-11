// Daily.co API helpers
// Docs: https://docs.daily.co/reference

const DAILY_API_BASE = 'https://api.daily.co/v1'

interface DailyRoom {
  name: string
  url: string
  privacy: string
  created_at: string
  config?: Record<string, unknown>
}

function getApiKey(): string {
  const key = process.env.DAILY_API_KEY
  if (!key) throw new Error('DAILY_API_KEY not set')
  return key
}

async function dailyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DAILY_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Daily API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/**
 * Create a Daily.co room for a coaching session.
 * The room auto-expires 24h after the scheduled end time.
 */
export async function createCoachingRoom(opts: {
  scheduledStart: Date
  durationMinutes: number
  enableRecording?: boolean
}): Promise<DailyRoom> {
  const nbfSec = Math.floor(opts.scheduledStart.getTime() / 1000) - 15 * 60 // can join 15min before
  const expSec = Math.floor(opts.scheduledStart.getTime() / 1000) + (opts.durationMinutes + 60) * 60

  // Generate a random short name
  const roomName = `atp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const body = {
    name: roomName,
    privacy: 'private',
    properties: {
      nbf: nbfSec,
      exp: expSec,
      max_participants: 4,
      enable_chat: true,
      enable_screenshare: true,
      enable_prejoin_ui: true,
      enable_knocking: false,
      start_video_off: false,
      start_audio_off: false,
      ...(opts.enableRecording ? { enable_recording: 'cloud' } : {}),
    },
  }

  return dailyFetch<DailyRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteRoom(name: string): Promise<void> {
  try {
    await dailyFetch(`/rooms/${name}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('Failed to delete Daily room:', err)
  }
}

/**
 * Create a meeting token (so user joins with their name auto-filled).
 */
export async function createMeetingToken(opts: {
  roomName: string
  userName: string
  isOwner?: boolean
  expiresAt?: Date
}): Promise<{ token: string }> {
  const body = {
    properties: {
      room_name: opts.roomName,
      user_name: opts.userName,
      is_owner: !!opts.isOwner,
      ...(opts.expiresAt ? { exp: Math.floor(opts.expiresAt.getTime() / 1000) } : {}),
    },
  }
  return dailyFetch<{ token: string }>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
