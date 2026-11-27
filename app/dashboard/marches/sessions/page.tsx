import type { Metadata } from 'next'
import SessionsBoard from '@/components/terminal/sessions/SessionsBoard'
import { getMemberTimeZone } from '@/lib/time-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Sessions & horaires · Marchés · ATP' }

// Horaires calculés dans le navigateur (heure du membre). Le serveur
// fournit le fuseau du profil, utilisé jusqu'à la résolution côté client.
export default async function SessionsPage() {
  const { timeZone } = await getMemberTimeZone()
  // Le réglage du fuseau est dans Mon compte, que l'admin n'a pas.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  return <SessionsBoard serverTimeZone={timeZone} settingsHref={isAdmin ? undefined : '/dashboard?page=compte#fuseau'} />
}
