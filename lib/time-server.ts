import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TIME_ZONE, isValidTimeZone, type TimeZoneSource } from '@/lib/time'

/**
 * Fuseau du membre pour les Server Components (lib/time.ts pour la règle).
 * Le serveur ne connaît pas le navigateur : profil valide, sinon
 * Europe/Paris. Profil illisible, vide ou invalide → Europe/Paris, jamais
 * d'exception. Mis en cache pour la durée d'une requête.
 */
export const getMemberTimeZone = cache(async (): Promise<{ timeZone: string; source: TimeZoneSource }> => {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { timeZone: DEFAULT_TIME_ZONE, source: 'default' }
    const { data } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
    const tz = (data as { timezone?: string | null } | null)?.timezone
    if (isValidTimeZone(tz)) return { timeZone: tz.trim(), source: 'profile' }
  } catch {
    // colonne absente, réseau… : valeur par défaut
  }
  return { timeZone: DEFAULT_TIME_ZONE, source: 'default' }
})
