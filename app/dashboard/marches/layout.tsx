import type { ReactNode } from 'react'
import MarketsShell from '@/components/terminal/MarketsShell'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'

// Espace « Marchés » : vraies routes sous /dashboard/marches/*.
// Accès contrôlé côté serveur à 2 niveaux : proxy.ts (chaque requête)
// puis ici. Admin → toujours ; membre → seulement si TERMINAL_ACCESS
// vaut « all », sinon retour à /dashboard. Le gate Whop et la redirection
// login de proxy.ts couvrent aussi tout le sous-arbre. Voir
// docs/design/terminal/DECISIONS.md. Contrôle partagé avec les pages :
// lib/terminal/viewer-server.ts (accès membre compris).
export default async function MarchesLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireMarketsViewer()
  return <MarketsShell viewer={viewer}>{children}</MarketsShell>
}
