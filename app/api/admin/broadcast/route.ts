import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import BroadcastEmail from '@/emails/BroadcastEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { subject, message, recipients } = await request.json()

  if (!subject || !message) {
    return NextResponse.json({ error: 'Sujet et message requis' }, { status: 400 })
  }

  // Determine recipient emails
  let traderEmails: string[] = []

  if (recipients === 'all') {
    const { data: traders } = await supabase
      .from('profiles')
      .select('email')
      .eq('role', 'trader')
      .not('email', 'is', null)
    traderEmails = (traders ?? []).map(t => t.email).filter(Boolean) as string[]
  } else if (recipients === 'active') {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const since = thirtyDaysAgo.toISOString().split('T')[0]

    const { data: sessions } = await supabase
      .from('trading_sessions')
      .select('trader_id')
      .gte('session_date', since)

    const activeIds = [...new Set((sessions ?? []).map(s => s.trader_id))]

    if (activeIds.length > 0) {
      const { data: traders } = await supabase
        .from('profiles')
        .select('email')
        .in('id', activeIds)
        .not('email', 'is', null)
      traderEmails = (traders ?? []).map(t => t.email).filter(Boolean) as string[]
    }
  } else if (Array.isArray(recipients)) {
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire sélectionné' }, { status: 400 })
    }
    const { data: traders } = await supabase
      .from('profiles')
      .select('email')
      .in('id', recipients)
      .not('email', 'is', null)
    traderEmails = (traders ?? []).map(t => t.email).filter(Boolean) as string[]
  } else {
    return NextResponse.json({ error: 'Format de destinataires invalide' }, { status: 400 })
  }

  if (traderEmails.length === 0) {
    return NextResponse.json({ error: 'Aucun trader avec email trouvé' }, { status: 400 })
  }

  // Render email template
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alphatradingpro-coaching.fr'
  const emailHtml = await render(BroadcastEmail({ subject, message, appUrl }))

  let sent = 0
  const errors: string[] = []

  for (const email of traderEmails) {
    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: email,
        subject,
        html: emailHtml,
      })
      sent++
    } catch (err: any) {
      errors.push(`${email}: ${err.message ?? 'erreur'}`)
    }
  }

  return NextResponse.json({ success: true, sent, total: traderEmails.length, errors: errors.length > 0 ? errors : undefined })
}
