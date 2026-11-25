import type { ReactNode } from 'react'
import MarketsShell from '@/components/terminal/MarketsShell'

// Espace « Marchés » : vraies routes sous /dashboard/marches/*.
// Le gate Whop et la redirection login de proxy.ts couvrent tout le
// sous-arbre (startsWith('/dashboard')). Voir docs/design/terminal/DECISIONS.md.
export default function MarchesLayout({ children }: { children: ReactNode }) {
  return <MarketsShell>{children}</MarketsShell>
}
