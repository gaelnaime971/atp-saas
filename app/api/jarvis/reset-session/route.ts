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
/** Normalise une entrée d'email : lowercase + trim + retire les
 *  guillemets simples/doubles éventuels autour (erreur fréquente de
 *  config Vercel : `"gael.naime@gmail.com"` au lieu de la valeur nue). */
function normalizeEmail(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase()
}

function parseTesters(): Set<string> {
  const raw = (process.env.JARVIS_TESTERS || '').trim()
  // Supporte aussi les guillemets globaux autour de toute la liste
  const unquoted = raw.replace(/^["']+|["']+$/g, '')
  return new Set(unquoted.split(',').map(normalizeEmail).filter(Boolean))
}

/** Même source de vérité qu'access.ts, répété ici pour comparer
 *  les deux listes dans le log et aider le diagnostic. */
function parseAllowed(): Set<string> {
  const raw = (process.env.JARVIS_ALLOWED_EMAILS || '').trim()
  const unquoted = raw.replace(/^["']+|["']+$/g, '')
  return new Set(unquoted.split(',').map(normalizeEmail).filter(Boolean))
}

/** Log temporaire pour diagnostiquer les 404. À retirer plus tard. */
function logTesters(stage: string, email: string, testers: Set<string>) {
  const rawTesters = process.env.JARVIS_TESTERS
  console.log('[jarvis-testers]', {
    stage,
    emailFromAuth: email,
    emailLen: email.length,
    JARVIS_TESTERS_defined: rawTesters !== undefined,
    JARVIS_TESTERS_raw: rawTesters,
    JARVIS_TESTERS_rawLen: rawTesters?.length ?? 0,
    testersParsed: Array.from(testers),
    allowedParsed: Array.from(parseAllowed()),
    matchesTester: testers.has(email),
  })
}

export async function POST() {
  // Même gate 404 que les autres routes Jarvis : jamais 403/401.
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = normalizeEmail(user?.email || '')
  if (!user || !email) return new NextResponse(null, { status: 404 })

  const testers = parseTesters()
  logTesters('POST', email, testers)
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
  const email = normalizeEmail(user?.email || '')
  if (!user || !email) return new NextResponse(null, { status: 404 })
  const testers = parseTesters()
  logTesters('GET', email, testers)
  if (!testers.has(email)) return new NextResponse(null, { status: 404 })
  return NextResponse.json({ ok: true, tester: true })
}
