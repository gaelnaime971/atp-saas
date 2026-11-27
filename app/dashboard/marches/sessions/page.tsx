import type { Metadata } from 'next'
import SessionsBoard from '@/components/terminal/sessions/SessionsBoard'
import { getMemberTimeZone } from '@/lib/time-server'
import { createClient } from '@/lib/supabase/server'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { assembleCalendar } from '@/lib/market/calendar/assemble'
import { requestClock } from '@/lib/market/freshness'
import { addDays, dateKey } from '@/lib/time'

export const metadata: Metadata = { title: 'Sessions & horaires · Marchés · ATP' }

// Horaires calculés dans le navigateur (heure du membre). Le serveur
// fournit le fuseau du profil, utilisé jusqu'à la résolution côté client.
export default async function SessionsPage() {
  await requireMarketsViewer()
  const { timeZone } = await getMemberTimeZone()
  // Calendrier économique des prochains jours (vraies publications des
  // créneaux 8:30 et 10:00) et confirmations CME des jours de fête.
  const { now } = requestClock()
  const todayEt = dateKey(now, 'America/New_York')
  const cal = await assembleCalendar(addDays(todayEt, -1), addDays(todayEt, 10))
  const publications = cal.events
    .filter(e => e.kind === 'release' && e.at !== null)
    .map(e => ({ at: e.at as number, title: e.title, impact: e.impact, kind: e.kind }))
  // Le réglage du fuseau est dans Mon compte, que l'admin n'a pas.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  return (
    <SessionsBoard
      serverTimeZone={timeZone}
      settingsHref={isAdmin ? undefined : '/dashboard?page=compte#fuseau'}
      specialDays={cal.specialDays}
      publications={publications}
    />
  )
}
