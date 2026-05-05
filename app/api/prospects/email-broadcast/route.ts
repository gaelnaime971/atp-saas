import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

interface Recipient {
  id: string
  email: string
  prenom: string
  nom: string
}

export async function POST(request: Request) {
  try {
    const { recipientIds, subject, html, testMode, testEmail } = await request.json()

    if (!subject || !html) {
      return NextResponse.json({ error: 'Sujet et contenu HTML requis' }, { status: 400 })
    }

    const from = process.env.EMAIL_FROM || 'ATP coaching <noreply@alphatradingpro-coaching.fr>'

    // TEST MODE: send only to test email
    if (testMode) {
      if (!testEmail) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 })
      await resend.emails.send({
        from,
        to: testEmail,
        subject: `[TEST] ${subject}`,
        html,
      })
      return NextResponse.json({ success: true, sent: 1, mode: 'test' })
    }

    // BROADCAST MODE
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire sélectionné' }, { status: 400 })
    }

    if (recipientIds.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 destinataires par broadcast' }, { status: 400 })
    }

    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, email, prenom, nom')
      .in('id', recipientIds)

    const recipients = (prospects || []) as Recipient[]
    let sent = 0
    let errors = 0

    // Send in batches of 5 to avoid rate limits
    for (let i = 0; i < recipients.length; i += 5) {
      const chunk = recipients.slice(i, i + 5)
      const results = await Promise.allSettled(
        chunk.map(r => {
          // Personalize: replace {{prenom}}, {{nom}} placeholders
          const personalizedHtml = html
            .replace(/\{\{prenom\}\}/gi, r.prenom || '')
            .replace(/\{\{nom\}\}/gi, r.nom || '')
            .replace(/\{\{email\}\}/gi, r.email)
          return resend.emails.send({
            from,
            to: r.email,
            subject,
            html: personalizedHtml,
          })
        })
      )
      results.forEach(res => {
        if (res.status === 'fulfilled' && !res.value.error) sent++
        else errors++
      })
      // Throttle: 100ms between batches
      if (i + 5 < recipients.length) await new Promise(r => setTimeout(r, 100))
    }

    return NextResponse.json({ success: true, sent, errors, total: recipients.length })
  } catch (err) {
    console.error('Broadcast error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
