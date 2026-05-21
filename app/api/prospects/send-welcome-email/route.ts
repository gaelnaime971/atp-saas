import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { promises as fs } from 'fs'
import path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

interface Body {
  prospect_id?: string
  recipient_email?: string
  recipient_prenom?: string
  subject?: string
  amount: string
  date_paiement: string
  reference: string
  test_mode?: boolean
  test_email?: string
  custom_html?: string
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let html = template
  for (const [key, value] of Object.entries(vars)) {
    const safe = (value ?? '').toString()
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), safe)
  }
  return html
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body

    const {
      prospect_id,
      recipient_email,
      recipient_prenom,
      subject,
      amount,
      date_paiement,
      reference,
      test_mode,
      test_email,
      custom_html,
    } = body

    if (!amount || !date_paiement || !reference) {
      return NextResponse.json(
        { error: 'Montant, date de paiement et référence requis' },
        { status: 400 }
      )
    }

    let toEmail = test_mode ? test_email : recipient_email
    let prenom = recipient_prenom || ''

    if (!test_mode && prospect_id) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('email, prenom')
        .eq('id', prospect_id)
        .single()
      if (prospect) {
        toEmail = prospect.email
        prenom = prospect.prenom || prenom
      }
    }

    if (!toEmail) {
      return NextResponse.json({ error: 'Email destinataire manquant' }, { status: 400 })
    }

    let html: string
    if (custom_html && custom_html.trim()) {
      html = custom_html
    } else {
      const templatePath = path.join(process.cwd(), 'public', 'email_bienvenue_atp.html')
      const template = await fs.readFile(templatePath, 'utf-8')
      html = renderTemplate(template, {
        PRENOM: prenom || 'à toi',
        MONTANT: amount,
        DATE_PAIEMENT: date_paiement,
        REFERENCE: reference,
      })
    }

    const from = process.env.EMAIL_FROM || 'ATP coaching <noreply@alphatradingpro-coaching.fr>'
    const finalSubject = subject?.trim() || `Paiement reçu — Bienvenue dans ATP ULTRA`

    const ssr = await createSsrClient()
    const { data: { user } } = await ssr.auth.getUser()

    let sent = 0
    let errors = 0
    const failedEmails: Array<{ email: string; reason: string }> = []

    try {
      const res = await resend.emails.send({
        from,
        to: toEmail,
        subject: test_mode ? `[TEST] ${finalSubject}` : finalSubject,
        html,
      })
      if (res.error) {
        errors++
        const err = res.error as { message?: string } | string
        failedEmails.push({
          email: toEmail,
          reason: typeof err === 'string' ? err : err.message || JSON.stringify(err),
        })
      } else {
        sent++
      }
    } catch (e) {
      errors++
      failedEmails.push({
        email: toEmail,
        reason: e instanceof Error ? e.message : 'Erreur réseau',
      })
    }

    try {
      await supabase.from('email_broadcasts').insert({
        sent_by: user?.id || null,
        subject: finalSubject,
        html,
        recipient_mode: test_mode ? 'test' : 'welcome',
        recipient_count: 1,
        sources: [],
        recipient_ids: prospect_id ? [prospect_id] : [],
        sent,
        errors,
        failed_emails: failedEmails,
        test_email: test_mode ? test_email : null,
        test_mode: !!test_mode,
      })
    } catch (logErr) {
      console.warn('Welcome email log failed:', logErr)
    }

    if (errors > 0) {
      return NextResponse.json(
        { error: failedEmails[0]?.reason || 'Envoi échoué', sent, errors },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, sent, errors })
  } catch (err) {
    console.error('Welcome email error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
