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

/** Accès rapide pour la route IA (zéro appel au serveur d'auth
 *  Supabase une fois le JWKS caché). isAdmin absent — fetché avec
 *  le reste des data en Promise.all côté caller. */
export interface JarvisAccessFast {
  userId: string
  email: string
}

function parseAllowedEmails(): Set<string> {
  const raw = process.env.JARVIS_ALLOWED_EMAILS || ''
  return new Set(
    raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  )
}

/** Normalisation robuste (strip guillemets, trim, lowercase) — doit
 *  rester identique à reset-session/route.ts. */
function normalizeEmail(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase()
}

function parseTesters(): Set<string> {
  const raw = (process.env.JARVIS_TESTERS || '').trim()
  const unquoted = raw.replace(/^["']+|["']+$/g, '')
  return new Set(unquoted.split(',').map(normalizeEmail).filter(Boolean))
}

/** Vrai si l'email appartient à la liste JARVIS_TESTERS. Pur, zéro I/O. */
export function isTesterEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return parseTesters().has(normalizeEmail(email))
}

/**
 * Pour les Server Components / pages Next : retourne `null` si l'accès
 * est refusé — l'appelant appelle `notFound()` du module `next/navigation`.
 *
 * Utilise getUser() (round-trip serveur) parce qu'une page n'est rendue
 * qu'une fois à l'ouverture — latence invisible. Pour la route API
 * appelée à chaque message, préférer requireJarvisAccessFast().
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
 * Variante rapide pour l'API : utilise supabase.auth.getClaims() qui
 * valide le JWT LOCALEMENT (signature + exp) contre un JWKS caché, au
 * lieu de getUser() qui fait un round-trip au serveur d'auth Supabase
 * eu-west-3 (~100-300 ms). Après le 1er appel sur l'instance Vercel,
 * les suivants sont de la pure crypto locale, 0 ms.
 *
 * Risque résiduel : si l'utilisateur est banni/déconnecté côté Supabase
 * mais que son JWT n'a pas encore expiré (durée ~1 h), il peut encore
 * passer la gate. Acceptable pour un POC gated à un email unique :
 * l'attaquant devrait d'abord voler le JWT du compte autorisé.
 *
 * isAdmin n'est pas renseigné ici — à récupérer dans la route via un
 * SELECT profiles en parallèle du reste.
 */
export async function requireJarvisAccessFast(): Promise<JarvisAccessFast | Response> {
  if (process.env.JARVIS_ENABLED !== 'true') return new NextResponse(null, { status: 404 })

  const supabase = await createSsrClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return new NextResponse(null, { status: 404 })

  const email = (typeof data.claims.email === 'string' ? data.claims.email : '').toLowerCase()
  const userId = typeof data.claims.sub === 'string' ? data.claims.sub : ''
  if (!email || !userId) return new NextResponse(null, { status: 404 })

  const allowed = parseAllowedEmails()
  if (!allowed.has(email)) return new NextResponse(null, { status: 404 })

  return { userId, email }
}

/**
 * Variante historique pour l'API — passage round-trip serveur. Garde
 * la compat avec les callers qui en dépendaient avant 2A-PERF, mais
 * n'est plus utilisée par /api/jarvis/chat.
 */
export async function requireJarvisAccess(): Promise<JarvisAccess | Response> {
  const info = await checkJarvisAccess()
  if (!info) return new NextResponse(null, { status: 404 })
  return info
}
