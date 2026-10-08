import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { buildUnsubscribeUrl } from '@/lib/email/unsubscribe'

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
    const { recipientIds, subject, html, testMode, testEmail, sources, recipientMode } = await request.json()

    if (!subject || !html) {
      return NextResponse.json({ error: 'Sujet et contenu HTML requis' }, { status: 400 })
    }

    const from = process.env.EMAIL_FROM || 'ATP coaching <noreply@alphatradingpro-coaching.fr>'

    // Get current admin user for log
    const ssr = await createSsrClient()
    const { data: { user } } = await ssr.auth.getUser()

    // TEST MODE: send only to test email
    if (testMode) {
      if (!testEmail) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 })
      const r = await resend.emails.send({
        from,
        to: testEmail,
        subject: `[TEST] ${subject}`,
        html,
      })
      const sent = r.error ? 0 : 1
      const errors = r.error ? 1 : 0

      await supabase.from('email_broadcasts').insert({
        sent_by: user?.id || null,
        subject, html,
        recipient_mode: 'test',
        recipient_count: 1,
        sources: [],
        recipient_ids: [],
        sent, errors,
        test_email: testEmail,
        test_mode: true,
      })

      return NextResponse.json({ success: true, sent, errors, mode: 'test' })
    }

    // BROADCAST MODE
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ error: 'Aucun destinataire sélectionné' }, { status: 400 })
    }

    if (recipientIds.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 destinataires par broadcast' }, { status: 400 })
    }

    // Filtre serveur : exclut les désabonnés même s'ils sont dans recipientIds
    // (ex: l'admin a sélectionné "tous" sans voir le flag). Non-négociable
    // pour la conformité RGPD + la réputation Resend.
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, email, prenom, nom')
      .in('id', recipientIds)
      .eq('unsubscribed', false)

    const recipients = (prospects || []) as Recipient[]
    const excluded = recipientIds.length - recipients.length
    // Domaine CANONIQUE forcé (www.alphatradingpro-coaching.fr côté Vercel
    // d'après le curl -I). Sans ça, request.url retourne l'origine courante
    // (parfois sans www selon où l'admin appelle), le lien de désabonnement
    // dans l'email fait un 307 www→redirect, et Outlook strict casse le lien.
    // Fallback sur request.url en dev local (NEXT_PUBLIC_SITE_URL absent).
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
    let sent = 0
    let errors = 0
    const failedEmails: Array<{ email: string; reason: string }> = []

    // Send sequentially with throttle to respect Resend free tier (2 req/sec)
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      const unsubUrl = buildUnsubscribeUrl(r.email, origin)
      const personalizedHtml = html
        .replace(/\{\{prenom\}\}/gi, r.prenom || '')
        .replace(/\{\{nom\}\}/gi, r.nom || '')
        .replace(/\{\{email\}\}/gi, r.email)
        .replace(/\{\{unsubscribe_url\}\}/gi, unsubUrl)
      try {
        const res = await resend.emails.send({
          from,
          to: r.email,
          subject,
          html: personalizedHtml,
          headers: {
            // RFC 8058 — Gmail/Outlook afficheront un bouton "Se désabonner" natif.
            // Un clic = POST sur /api/unsubscribe = désinscription immédiate.
            'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@alphatradingpro-coaching.fr>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        if (res.error) {
          errors++
          const err = res.error as { message?: string } | string
          failedEmails.push({
            email: r.email,
            reason: typeof err === 'string' ? err : (err.message || JSON.stringify(err)),
          })
        } else {
          sent++
        }
      } catch (e) {
        errors++
        failedEmails.push({
          email: r.email,
          reason: e instanceof Error ? e.message : 'Erreur réseau',
        })
      }
      // Throttle: 600ms between sends to stay under 2 req/sec
      if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 600))
    }

    // Log broadcast
    await supabase.from('email_broadcasts').insert({
      sent_by: user?.id || null,
      subject, html,
      recipient_mode: recipientMode || 'manual',
      recipient_count: recipients.length,
      sources: sources || [],
      recipient_ids: recipientIds,
      sent, errors,
      failed_emails: failedEmails,
      test_mode: false,
    })

    return NextResponse.json({
      success: true,
      sent,
      errors,
      total: recipients.length,
      excluded, // nb de désabonnés silencieusement filtrés
    })
  } catch (err) {
    console.error('Broadcast error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
