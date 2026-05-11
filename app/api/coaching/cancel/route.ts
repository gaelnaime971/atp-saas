import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { deleteRoom } from '@/lib/daily'
import { deleteCalendarEvent, findConnectedAdminId } from '@/lib/google'

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

    // Verify ownership (trader cancels their own, or admin cancels any)
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'

    const { data: session } = await adminSupabase
      .from('coaching_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
    if (!isAdmin && session.trader_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Delete Daily room
    if (session.daily_room_name) await deleteRoom(session.daily_room_name)

    // Delete Google Calendar event
    if (session.google_event_id) {
      try {
        const adminId = await findConnectedAdminId()
        if (adminId) await deleteCalendarEvent(adminId, session.google_event_id)
      } catch (gErr) {
        console.warn('Google event deletion failed:', gErr)
      }
    }

    // Mark as cancelled
    await adminSupabase
      .from('coaching_sessions')
      .update({ meeting_status: 'cancelled', daily_room_url: null, daily_room_name: null, google_event_id: null })
      .eq('id', session_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Cancel error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
