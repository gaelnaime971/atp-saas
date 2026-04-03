import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prenom, nom, email, whatsapp, experience, objectif, source } = body

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
      notes: '',
    })

    if (error) {
      console.error('Prospect insert error:', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Send email notification
    const expLabels: Record<string, string> = {
      debutant: 'Débutant (< 6 mois)',
      intermediaire: '6 mois à 2 ans',
      confirme: '+ de 2 ans',
    }
    const objLabels: Record<string, string> = {
      methode: 'Méthode structurée',
      propfirm: 'Prop firm',
      consistance: 'Consistance',
      vivre: 'Vivre du trading',
    }

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
            subject: `🔔 Nouveau prospect : ${prenom} ${nom}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#111;color:#fff;border-radius:12px;">
                <h2 style="color:#22c55e;margin:0 0 16px;">Nouveau prospect ATP</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#888;width:120px;">Nom</td><td style="padding:8px 0;font-weight:bold;">${prenom} ${nom}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;">${email}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">WhatsApp</td><td style="padding:8px 0;font-weight:bold;color:#25d366;">${whatsapp}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Expérience</td><td style="padding:8px 0;">${expLabels[experience] || experience}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Objectif</td><td style="padding:8px 0;">${objLabels[objectif] || objectif}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Source</td><td style="padding:8px 0;">${source || 'methode-atp'}</td></tr>
                </table>
                <div style="margin-top:20px;">
                  <a href="https://wa.me/${whatsapp.replace(/\s+/g, '').replace('+', '')}" style="display:inline-block;padding:10px 20px;background:#25d366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:8px;">Contacter sur WhatsApp →</a>
                </div>
                <p style="margin-top:16px;font-size:12px;color:#555;">Reçu le ${new Date().toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe' })}</p>
              </div>
            `,
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
