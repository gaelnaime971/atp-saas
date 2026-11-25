'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Visibilité de l'espace Marchés pour un MEMBRE, calculée côté serveur
 * dans app/dashboard/layout.tsx (TERMINAL_ACCESS) et transmise au SPA,
 * qui ne peut pas lire une variable serveur. Défaut : masqué.
 *
 * C'est un confort d'affichage (menu, ⌘K) : le vrai contrôle d'accès à
 * /dashboard/marches/* est fait côté serveur (proxy.ts + layout).
 */
const TerminalAccessContext = createContext(false)

export function TerminalAccessProvider({ membersSeeTerminal, children }: { membersSeeTerminal: boolean; children: ReactNode }) {
  return <TerminalAccessContext.Provider value={membersSeeTerminal}>{children}</TerminalAccessContext.Provider>
}

export function useMembersSeeTerminal(): boolean {
  return useContext(TerminalAccessContext)
}
