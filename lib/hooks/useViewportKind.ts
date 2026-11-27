'use client'

import { useSyncExternalStore } from 'react'
import { MOBILE_MAX, TABLET_MAX, viewportKind, type ViewportKind } from '@/lib/ui/shell'

/**
 * Taille d'écran courante (lib/ui/shell.ts), mise à jour au
 * redimensionnement. `null` au rendu serveur et à l'hydratation : la mise
 * en page passe par les classes `md:` de Tailwind, ce hook ne sert qu'aux
 * comportements (repli du rail, fermeture du tiroir).
 */
const QUERIES = [`(max-width: ${MOBILE_MAX}.98px)`, `(max-width: ${TABLET_MAX}.98px)`]

function subscribe(onChange: () => void) {
  const lists = QUERIES.map(q => window.matchMedia(q))
  lists.forEach(l => l.addEventListener('change', onChange))
  return () => lists.forEach(l => l.removeEventListener('change', onChange))
}

const getSnapshot = (): ViewportKind => viewportKind(window.innerWidth)
const getServerSnapshot = (): ViewportKind | null => null

export function useViewportKind(): ViewportKind | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
