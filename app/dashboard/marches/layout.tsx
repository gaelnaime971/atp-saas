import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import MarketsShell from '@/components/terminal/MarketsShell'
import { createClient } from '@/lib/supabase/server'
import { terminalViewer } from '@/lib/terminal/access'

// Espace « Marchés » : vraies routes sous /dashboard/marches/*.
// Accès contrôlé côté serveur à 2 niveaux : proxy.ts (chaque requête)
// puis ici. Admin → toujours ; membre → seulement si TERMINAL_ACCESS
// vaut « all », sinon retour à /dashboard. Le gate Whop et la redirection
// login de proxy.ts couvrent aussi tout le sous-arbre. Voir
// docs/design/terminal/DECISIONS.md.
export default async function MarchesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const viewer = terminalViewer({
    isAdmin: profile?.role === 'admin',
    access: process.env.TERMINAL_ACCESS,
  })
  if (viewer === 'hidden') redirect('/dashboard')

  return <MarketsShell viewer={viewer}>{children}</MarketsShell>
}
