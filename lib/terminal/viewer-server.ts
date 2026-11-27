import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { INACTIVE_PATH, hasDashboardAccess, readAccessProfile } from '@/lib/access/member-access'
import { terminalViewer, type TerminalViewer } from '@/lib/terminal/access'

/**
 * Contrôle d'accès de l'espace Marchés, côté serveur, partagé par le
 * layout et les pages (dédoublonné par requête avec React cache).
 * Les pages l'appellent AVANT de lire les données Terminal (lecture
 * partagée par le service-role, lib/market/read.ts).
 *
 * Sans session → /login ; sans accès membre (règle unique
 * lib/access/member-access) → page « abonnement inactif » ; espace
 * masqué aux membres (TERMINAL_ACCESS) → /dashboard.
 */
export const requireMarketsViewer = cache(async (): Promise<{ userId: string; viewer: Exclude<TerminalViewer, 'hidden'> }> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const profile = await readAccessProfile(cols => supabase.from('profiles').select(cols).eq('id', user.id).maybeSingle())
  if (!hasDashboardAccess(profile)) redirect(INACTIVE_PATH)
  const viewer = terminalViewer({ isAdmin: profile?.role === 'admin', access: process.env.TERMINAL_ACCESS })
  if (viewer === 'hidden') redirect('/dashboard')
  return { userId: user.id, viewer }
})
