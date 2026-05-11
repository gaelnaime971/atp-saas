import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createCoachingRoom } from '@/lib/daily'
import { createCalendarEvent, findConnectedAdminId } from '@/lib/google'
import { Resend } from 'resend'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { scheduled_at, duration_minutes = 60, notes } = await request.json()

    if (!scheduled_at) return NextResponse.json({ error: 'scheduled_at requis' }, { status: 400 })

    const scheduledDate = new Date(scheduled_at)
    if (isNaN(scheduledDate.getTime())) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
    if (scheduledDate.getTime() < Date.now() + 60 * 60_000) {
      return NextResponse.json({ error: 'La réservation doit être au moins 1h à l\'avance' }, { status: 400 })
    }

    // Check slot not already taken
    const { data: existing } = await adminSupabase
      .from('coaching_sessions')
      .select('id')
      .eq('scheduled_at', scheduledDate.toISOString())
      .in('meeting_status', ['scheduled', 'in_progress'])
      .maybeSingle()

    if (existing) return NextResponse.json({ error: 'Ce créneau n\'est plus disponible' }, { status: 409 })

    // Create Daily.co room
    let dailyRoomUrl: string | null = null
    let dailyRoomName: string | null = null
    try {
      const room = await createCoachingRoom({
        scheduledStart: scheduledDate,
        durationMinutes: duration_minutes,
      })
      dailyRoomUrl = room.url
      dailyRoomName = room.name
    } catch (err) {
      console.error('Daily room creation failed:', err)
      return NextResponse.json({ error: 'Erreur lors de la création de la salle vidéo. Réessaie.' }, { status: 500 })
    }

    // Fetch trader profile for email + name
    const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()
    const traderName = (profile?.full_name || '').trim() || 'Trader'

    // Insert coaching session
    const { data: inserted, error: insertErr } = await adminSupabase
      .from('coaching_sessions')
      .insert({
        trader_id: user.id,
        scheduled_at: scheduledDate.toISOString(),
        duration_minutes,
        notes: notes || null,
        daily_room_url: dailyRoomUrl,
        daily_room_name: dailyRoomName,
        meeting_status: 'scheduled',
      })
      .select()
      .single()

    if (insertErr) {
      console.error('Insert error:', insertErr)
      return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 })
    }

    // Sync to Google Calendar (admin's calendar)
    try {
      const adminId = await findConnectedAdminId()
      if (adminId) {
        const endDate = new Date(scheduledDate.getTime() + duration_minutes * 60_000)
        const traderEmail = profile?.email || user.email
        const event = await createCalendarEvent(adminId, {
          summary: `Coaching ATP — ${traderName}`,
          description: notes
            ? `Trader : ${traderName}${traderEmail ? ` (${traderEmail})` : ''}\n\nNotes du trader :\n${notes}`
            : `Trader : ${traderName}${traderEmail ? ` (${traderEmail})` : ''}`,
          start: scheduledDate,
          end: endDate,
          attendees: traderEmail ? [traderEmail] : [],
          conferenceUrl: dailyRoomUrl || undefined,
        })
        if (event?.id) {
          await adminSupabase
            .from('coaching_sessions')
            .update({ google_event_id: event.id })
            .eq('id', inserted.id)
        }
      }
    } catch (gErr) {
      console.warn('Google sync failed (non-blocking):', gErr)
    }

    // Send confirmation email
    const dateFmt = scheduledDate.toLocaleString('fr-FR', {
      timeZone: 'America/Guadeloupe', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    const traderEmail = profile?.email || user.email
    try {
      if (traderEmail) {
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: traderEmail,
          subject: `Coaching ATP confirmé — ${dateFmt}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0a0a0a;color:#eee;border-radius:12px">
              <h2 style="color:#22c55e;margin:0 0 16px;">Coaching confirmé</h2>
              <p>Salut ${traderName},</p>
              <p>Ton coaching est réservé :</p>
              <div style="padding:14px 18px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:8px;margin:16px 0">
                <strong style="color:#22c55e;font-size:16px">${dateFmt}</strong><br>
                <span style="color:#888;font-size:13px">Durée : ${duration_minutes} minutes</span>
              </div>
              <p style="font-size:13px;color:#bbb;line-height:1.6">Rejoins l'appel depuis ton dashboard 5 minutes avant l'heure prévue. Le bouton "Rejoindre" apparaîtra sur ta page Coaching.</p>
              <a href="${dashboardUrl}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#22c55e;color:#000;text-decoration:none;border-radius:8px;font-weight:bold">Ouvrir mon dashboard</a>
              <p style="font-size:11px;color:#555;margin-top:24px">— Alpha Trading Pro</p>
            </div>
          `,
        })
      }
      // Notify admin
      await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: 'gael.n971@gmail.com',
        subject: `🟢 Nouveau coaching — ${traderName} · ${dateFmt}`,
        html: `<p><strong>${traderName}</strong> (${traderEmail}) a réservé un coaching le <strong>${dateFmt}</strong>.</p>`,
      })
    } catch (emailErr) {
      console.warn('Email send failed:', emailErr)
    }

    return NextResponse.json({ success: true, session: inserted })
  } catch (err) {
    console.error('Book error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
