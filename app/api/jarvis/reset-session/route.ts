import { NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { resetTodaySession } from '@/lib/jarvis/session-write'

export const runtime = 'nodejs'

/**
 * Bouton "Réinitialiser ma session du jour" — réservé aux testeurs
 * (JARVIS_TESTERS). Supprime tous les événements du jour (date Paris)
 * du trader connecté. JAMAIS exposé aux membres : contrôle strict
 * sur la liste JARVIS_TESTERS, séparée de JARVIS_ALLOWED_EMAILS.
 *
 * JARVIS_TESTERS absent/vide → 404 pour tout le monde.
 */
function parseTesters(): Set<string> {
  const raw = process.env.JARVIS_TESTERS || ''
  return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
}

export async function POST() {
  // Même gate 404 que les autres routes Jarvis : jamais 403/401.
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase() || ''
  if (!user || !email) return new NextResponse(null, { status: 404 })

  const testers = parseTesters()
  if (!testers.has(email)) return new NextResponse(null, { status: 404 })

  try {
    const removed = await resetTodaySession(user.id)
    return NextResponse.json({ ok: true, removed })
  } catch (err) {
    console.error('[jarvis-reset]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function GET() {
  // Permet au client de savoir si l'utilisateur est testeur
  // → bouton affiché seulement si oui. Toujours 404 sinon.
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase() || ''
  if (!user || !email) return new NextResponse(null, { status: 404 })
  const testers = parseTesters()
  if (!testers.has(email)) return new NextResponse(null, { status: 404 })
  return NextResponse.json({ ok: true, tester: true })
}
