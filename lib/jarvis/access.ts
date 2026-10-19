/**
 * Contrôle d'accès POC Jarvis (étape 2A).
 *
 * Deux gates obligatoires :
 *   - process.env.JARVIS_ENABLED === 'true'
 *   - user.email appartient à process.env.JARVIS_ALLOWED_EMAILS
 *     (liste séparée par virgules, insensible à la casse)
 *
 * Toute défaillance → 404, jamais 403, pour que la page/l'API restent
 * invisibles aux comptes non autorisés (pas de signal "cette URL existe
 * mais tu n'y as pas accès").
 */

import { NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export interface JarvisAccess {
  user: { id: string; email: string }
  isAdmin: boolean
}

function parseAllowedEmails(): Set<string> {
  const raw = process.env.JARVIS_ALLOWED_EMAILS || ''
  return new Set(
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  )
}

/**
 * Pour les Server Components / pages Next : retourne `null` si l'accès
 * est refusé — l'appelant appelle `notFound()` du module `next/navigation`.
 */
export async function checkJarvisAccess(): Promise<JarvisAccess | null> {
  if (process.env.JARVIS_ENABLED !== 'true') return null

  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email?.toLowerCase() || null
  if (!user || !email) return null

  const allowed = parseAllowedEmails()
  if (!allowed.has(email)) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

  return { user: { id: user.id, email }, isAdmin }
}

/**
 * Pour les Route Handlers API : retourne la même info ou une Response
 * 404 prête à être retournée directement par le caller.
 */
export async function requireJarvisAccess(): Promise<JarvisAccess | Response> {
  const info = await checkJarvisAccess()
  if (!info) return new NextResponse(null, { status: 404 })
  return info
}
