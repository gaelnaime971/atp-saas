/**
 * POST /api/unsubscribe
 *
 * Endpoint One-Click RFC 8058 pour les clients email (Gmail, Outlook,
 * Apple Mail) qui affichent un bouton natif "Se désabonner". Au clic,
 * ils POST ici avec le token en form-data ou query.
 *
 * Pour le lien cliquable dans le HTML email (page de confirmation visible),
 * voir app/unsubscribe/page.tsx (GET).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe'

async function readToken(request: NextRequest): Promise<string | null> {
  // Query d'abord
  const qsToken = request.nextUrl.searchParams.get('token')
  if (qsToken) return qsToken
  // Puis form-data (urlencoded ou multipart) — Gmail/Outlook envoient parfois
  // le token en form-data avec le header List-Unsubscribe-Post.
  try {
    const form = await request.formData()
    const t = form.get('token')
    if (typeof t === 'string' && t.length > 0) return t
  } catch {
    // body pas un form valide — pas grave, on retourne null
  }
  return null
}

export async function POST(request: NextRequest) {
  const token = await readToken(request)
  if (!token) {
    return new NextResponse('Missing token', { status: 400 })
  }
  const email = verifyUnsubscribeToken(token)
  if (!email) {
    return new NextResponse('Invalid token', { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const admin = createClient(url, key)
  // Idempotent — match 0 row si email absent, on renvoie 200 quand même
  // (pas d'info leak sur l'existence du contact).
  await admin
    .from('prospects')
    .update({ unsubscribed: true })
    .ilike('email', email)

  return NextResponse.json({ ok: true })
}
