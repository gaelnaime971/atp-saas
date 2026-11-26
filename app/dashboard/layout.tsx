import type { ReactNode } from 'react'
import { TerminalAccessProvider } from '@/components/terminal/TerminalAccess'
import { terminalOpenToMembers } from '@/lib/terminal/access'

// Dit au SPA /dashboard si l'espace Marchés est ouvert aux membres.
// TERMINAL_ACCESS est lue AU BUILD : /dashboard reste pré-généré
// (statique). Sans risque, car Vercel n'applique un changement de
// variable qu'au déploiement suivant, qui refait le build. Le contrôle
// d'accès réel reste à l'exécution (proxy.ts + layout Marchés).
// Un admin n'atteint jamais le SPA (proxy.ts).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const membersSeeTerminal = terminalOpenToMembers(process.env.TERMINAL_ACCESS)
  return <TerminalAccessProvider membersSeeTerminal={membersSeeTerminal}>{children}</TerminalAccessProvider>
}
