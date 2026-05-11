import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createMeetingToken } from '@/lib/daily'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { session_id } = await request.json()
    if (!session_id) return NextResponse.json({ error: 'session_id requis' }, { status: 400 })

    const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'

    const { data: session } = await adminSupabase
      .from('coaching_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
    if (!isAdmin && session.trader_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!session.daily_room_name) return NextResponse.json({ error: 'Pas de salle vidéo' }, { status: 400 })

    const expiresAt = new Date(new Date(session.scheduled_at).getTime() + (session.duration_minutes + 90) * 60_000)

    const token = await createMeetingToken({
      roomName: session.daily_room_name,
      userName: (profile?.full_name || user.email || 'Participant').trim(),
      isOwner: isAdmin,
      expiresAt,
    })

    return NextResponse.json({
      token: token.token,
      url: session.daily_room_url,
      roomName: session.daily_room_name,
    })
  } catch (err) {
    console.error('Token error:', err)
    return NextResponse.json({ error: 'Erreur génération token' }, { status: 500 })
  }
}
