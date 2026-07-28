'use client'

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion, MOTION, EASE } from '@/lib/motion'

/**
 * Reveal — fade-in + slide-up léger au mount, via GSAP.
 *
 * Utilisé pour l'entrée en cascade des sections du Dashboard. Chaque
 * appelant contrôle son délai explicitement via `delay` (ms) — pas de
 * "stagger group" auto avec dépendances entre wrappers, plus simple
 * à raisonner et à ordonnancer manuellement.
 *
 * Règles :
 *  - Le contenu est TOUJOURS visible finalement — jamais d'opacity 0
 *    permanent en cas de bug GSAP. `visibility` pas touchée, `opacity`
 *    animée de 0 à 1 puis GSAP la laisse à 1.
 *  - Reduced-motion : rend directement sans tween (skip fromTo).
 *  - Pas de délai qui retarde une action user — ce composant est
 *    réservé au chargement initial de sections, jamais à l'affichage
 *    d'une donnée réactive.
 *  - Slide-up de 8px seulement (subtil, pas de swoosh dramatique).
 */

interface Props {
  children: ReactNode
  /** Délai avant le fade-in en ms (permet la cascade manuelle). Défaut 0. */
  delay?: number
  className?: string
  style?: CSSProperties
}

export default function Reveal({ children, delay = 0, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const el = ref.current
    if (!el) return
    const tween = gsap.fromTo(el,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: MOTION.slow,   // 0.32s — reveal marqué mais court
        ease: EASE.out,
        delay: delay / 1000,     // ms → s pour GSAP
      },
    )
    return () => { tween.kill() }
  }, [delay])

  return <div ref={ref} className={className} style={style}>{children}</div>
}
