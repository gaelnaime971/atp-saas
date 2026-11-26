import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildProspectAlertEmail } from '@/lib/email/prospect-alert'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prenom, nom, email, whatsapp, experience, objectif, source, notes } = body

    if (!prenom || !nom || !email || !whatsapp || !experience || !objectif) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const { error } = await supabase.from('prospects').insert({
      prenom,
      nom,
      email,
      whatsapp,
      experience,
      objectif,
      source: source || 'landing-capture',
      status: 'nouveau',
      action: 'rien_fait',
      notes: notes || '',
    })

    if (error) {
      console.error('Prospect insert error:', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // E-mail d'alerte à l'admin. Route PUBLIQUE : tous les champs saisis
    // sont échappés avant d'entrer dans le HTML (lib/email/prospect-alert).
    const alertEmail = buildProspectAlertEmail({ prenom, nom, email, whatsapp, experience, objectif, source })

    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'ATP coaching <noreply@alphatradingpro-coaching.fr>',
            to: 'gael.n971@gmail.com',
            subject: alertEmail.subject,
            html: alertEmail.html,
          }),
        })
      } catch (emailErr) {
        console.error('Email notification error:', emailErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
