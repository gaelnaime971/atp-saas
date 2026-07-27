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
  echeance_numero: string | number
  echeance_total: string | number
  date_echeance: string
  payment_method: 'stripe' | 'virement' | 'both'
  stripe_link?: string
  titulaire?: string
  iban?: string
  bic?: string
  reference?: string
  note?: string
  show_already_paid_notice?: boolean
  test_mode?: boolean
  test_email?: string
  custom_html?: string
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
  flags: { stripe: boolean; virement: boolean; note: boolean; alreadyPaidNotice: boolean }
): string {
  let html = template

  const sections: Array<{ name: string; show: boolean }> = [
    { name: 'STRIPE', show: flags.stripe },
    { name: 'VIREMENT', show: flags.virement },
    { name: 'BOTH', show: flags.stripe && flags.virement },
    { name: 'NOTE', show: flags.note },
    { name: 'ALREADY_PAID_NOTICE', show: flags.alreadyPaidNotice },
  ]

  for (const { name, show } of sections) {
    const blockRegex = new RegExp(
      `<!-- IF_${name}_START -->[\\s\\S]*?<!-- IF_${name}_END -->`,
      'g'
    )
    if (!show) {
      html = html.replace(blockRegex, '')
    } else {
      html = html.replace(new RegExp(`<!-- IF_${name}_START -->`, 'g'), '')
      html = html.replace(new RegExp(`<!-- IF_${name}_END -->`, 'g'), '')
    }
  }

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
      prospect_id, recipient_email, recipient_prenom, subject,
      amount, echeance_numero, echeance_total, date_echeance, payment_method,
      stripe_link, titulaire, iban, bic, reference, note,
      show_already_paid_notice, test_mode, test_email, custom_html,
    } = body

    if (!amount || !date_echeance || !echeance_numero || !payment_method) {
      return NextResponse.json(
        { error: 'Montant, numéro d\'échéance, date et méthode de paiement requis' },
        { status: 400 }
      )
    }

    const showStripe = payment_method === 'stripe' || payment_method === 'both'
    const showVirement = payment_method === 'virement' || payment_method === 'both'

    if (showStripe && !stripe_link?.trim()) {
      return NextResponse.json({ error: 'Lien Stripe requis' }, { status: 400 })
    }
    if (showVirement && (!titulaire?.trim() || !iban?.trim() || !bic?.trim())) {
      return NextResponse.json(
        { error: 'Titulaire, IBAN et BIC requis pour le virement' },
        { status: 400 }
      )
    }

    // Resolve recipient — caller-provided email wins
    let toEmail = test_mode ? test_email : recipient_email
    let prenom = recipient_prenom || ''

    if (!test_mode && prospect_id) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('email, prenom')
        .eq('id', prospect_id)
        .single()
      if (prospect) {
        if (!toEmail) toEmail = prospect.email
        if (!prenom) prenom = prospect.prenom || ''
      }
    }

    if (!toEmail) {
      return NextResponse.json({ error: 'Email destinataire manquant' }, { status: 400 })
    }

    let html: string
    if (custom_html && custom_html.trim()) {
      html = custom_html
    } else {
      const templatePath = path.join(process.cwd(), 'public', 'email_relance_paiement.html')
      const template = await fs.readFile(templatePath, 'utf-8')
      html = renderTemplate(
        template,
        {
          PRENOM: prenom || 'à toi',
          MONTANT: amount,
          ECHEANCE_NUMERO: String(echeance_numero),
          ECHEANCE_TOTAL: String(echeance_total || ''),
          DATE_ECHEANCE: date_echeance,
          LIEN_STRIPE: stripe_link || '#',
          TITULAIRE: titulaire || '',
          IBAN: iban || '',
          BIC: bic || '',
          REFERENCE_VIREMENT: reference || '',
          NOTE_PERSONNALISEE: note || '',
        },
        {
          stripe: showStripe,
          virement: showVirement,
          note: !!note?.trim(),
          alreadyPaidNotice: show_already_paid_notice !== false, // default ON
        }
      )
    }

    // Payment reminders are signed by Audrey — override the shared EMAIL_FROM display name.
    // Keep the verified alphatradingpro-coaching.fr domain (required by Resend);
    // route replies to Audrey's inbox via reply-to.
    const from = 'Audrey — Alpha Trading Pro <noreply@alphatradingpro-coaching.fr>'
    const replyTo = 'contact.alphatradingpro@gmail.com'
    const finalSubject = subject?.trim() || `Rappel échéance ${echeance_numero}/${echeance_total} — ATP ULTRA`

    const ssr = await createSsrClient()
    const { data: { user } } = await ssr.auth.getUser()

    let sent = 0
    let errors = 0
    const failedEmails: Array<{ email: string; reason: string }> = []

    try {
      const res = await resend.emails.send({
        from,
        to: toEmail,
        replyTo,
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
        recipient_mode: test_mode ? 'test' : 'payment_reminder',
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
      console.warn('Payment reminder log failed:', logErr)
    }

    if (errors > 0) {
      return NextResponse.json(
        { error: failedEmails[0]?.reason || 'Envoi échoué', sent, errors },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, sent, errors })
  } catch (err) {
    console.error('Payment reminder error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
