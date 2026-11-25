import type { ReactNode } from 'react'
import { connection } from 'next/server'
import { TerminalAccessProvider } from '@/components/terminal/TerminalAccess'
import { terminalOpenToMembers } from '@/lib/terminal/access'

// Lit TERMINAL_ACCESS à chaque requête (connection() : pas de valeur
// figée au build) et dit au SPA /dashboard si l'espace Marchés est
// ouvert aux membres. Un admin n'atteint jamais le SPA (proxy.ts).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection()
  const membersSeeTerminal = terminalOpenToMembers(process.env.TERMINAL_ACCESS)
  return <TerminalAccessProvider membersSeeTerminal={membersSeeTerminal}>{children}</TerminalAccessProvider>
}
