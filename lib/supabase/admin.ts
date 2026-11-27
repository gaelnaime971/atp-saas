import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase service-role : contourne la RLS. CÔTÉ SERVEUR
 * UNIQUEMENT (routes API, cron, Server Components, scripts locaux).
 * Jamais importé par un composant 'use client' ; la clé n'est pas une
 * variable NEXT_PUBLIC_, elle n'existe pas dans le navigateur.
 *
 * Usage : écriture des tables Terminal (seul le service-role écrit) et
 * lecture partagée mise en cache, APRÈS le contrôle d'accès membre.
 */
export function createAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient : côté serveur uniquement')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Configuration Supabase service-role absente')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
