import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import { TerminalAccessProvider } from '@/components/terminal/TerminalAccess'
import { MemberTimeZoneProvider } from '@/components/time/MemberTimeZone'
import { terminalOpenToMembers } from '@/lib/terminal/access'

// Dit au SPA /dashboard si l'espace Marchés est ouvert aux membres.
// TERMINAL_ACCESS est lue AU BUILD : /dashboard reste pré-généré
// (statique). Sans risque, car Vercel n'applique un changement de
// variable qu'au déploiement suivant, qui refait le build. Le contrôle
// d'accès réel reste à l'exécution (proxy.ts + layout Marchés).
// Un admin n'atteint jamais le SPA (proxy.ts).
// MemberTimeZoneProvider : fuseau du membre pour tout /dashboard
// (lib/time.ts), enregistré depuis le navigateur à la première visite.
// Mobile : le contenu peut aller jusqu'aux bords de l'écran (encoche,
// barre du bas de l'iPhone) ; AppShell garde les marges de sécurité avec
// env(safe-area-inset-*). Limité au dashboard, les pages publiques ne
// changent pas.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const membersSeeTerminal = terminalOpenToMembers(process.env.TERMINAL_ACCESS)
  return (
    <TerminalAccessProvider membersSeeTerminal={membersSeeTerminal}>
      <MemberTimeZoneProvider>{children}</MemberTimeZoneProvider>
    </TerminalAccessProvider>
  )
}
