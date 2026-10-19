/**
 * Helper générique d'envoi d'email aux admins ATP — utilisé pour toute
 * alerte opérationnelle (IA en panne durable, et plus tard : crédits
 * ElevenLabs Jarvis épuisés, webhook Whop en échec, etc.).
 *
 * Design :
 *   - Destinataire = env ALERT_EMAIL (jamais en dur dans le code)
 *   - Expéditeur   = env EMAIL_FROM (partagé avec le reste du projet)
 *   - Transport    = Resend (déjà présent dans le projet)
 *   - Fail-safe    : env manquante ou Resend KO → log + return, JAMAIS
 *                    de throw qui remonterait dans le flow de la route
 *                    IA et casserait la réponse au trader
 *
 * À appeler via next/server after() depuis les routes pour ne pas
 * rallonger la réponse perçue :
 *     after(async () => { await notifyAdmin({ subject, html, text }) })
 */

import { Resend } from 'resend'

export interface NotifyAdminInput {
  subject: string
  html: string
  /** Variante texte brut — fallback pour clients mail qui bloquent le HTML. */
  text?: string
}

export async function notifyAdmin(input: NotifyAdminInput): Promise<void> {
  const to = process.env.ALERT_EMAIL
  if (!to) {
    console.error('[notify-admin] ALERT_EMAIL env var missing — alert dropped', { subject: input.subject })
    return
  }
  const from = process.env.EMAIL_FROM
  if (!from) {
    console.error('[notify-admin] EMAIL_FROM env var missing — alert dropped', { subject: input.subject })
    return
  }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[notify-admin] RESEND_API_KEY env var missing — alert dropped', { subject: input.subject })
    return
  }

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
  } catch (err) {
    console.error('[notify-admin] Resend send failed', { subject: input.subject, err })
  }
}
