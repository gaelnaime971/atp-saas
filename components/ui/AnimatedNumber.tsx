'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion, MOTION, EASE } from '@/lib/motion'

/**
 * AnimatedNumber — count-up numérique via GSAP.
 *
 * Anime une valeur numérique vers `value` via tween GSAP + setState React.
 * Trois comportements :
 *  - Premier render : anime de 0 → value (effet "montée initiale",
 *    signature d'un dashboard premium au load).
 *  - Renders suivants : anime de l'ancienne valeur → nouvelle valeur
 *    (transition douce au changement de filtre, pas de saut brutal).
 *  - prefers-reduced-motion : set direct sans anim.
 *
 * Le formatage est délégué à l'appelant (function `format`) — le composant
 * ne connaît ni les unités ni les locales. Chaque call rendra la valeur
 * courante (peut être flottante pendant le tween), à l'appelant d'arrondir
 * dans son format s'il veut un int propre (ex Sessions).
 *
 * PAS pour les valeurs temps réel (session live qui tick chaque seconde) :
 * ré-animer à chaque tick = fatigue visuelle. Réservé aux valeurs qui
 * changent sur ACTION user (load, changement filtre, nouvelle analyse).
 */

interface Props {
  /** Valeur cible. Change → nouvelle animation depuis la valeur courante. */
  value: number
  /** Formatage. Reçoit la valeur en cours de tween (float). */
  format: (n: number) => string
  /** Durée du tween en SECONDES. Défaut MOTION.countUp (0.6s). */
  duration?: number
  className?: string
  style?: React.CSSProperties
}

export default function AnimatedNumber({
  value,
  format,
  duration = MOTION.countUp,
  className,
  style,
}: Props) {
  const [display, setDisplay] = useState<number>(value)
  const proxyRef = useRef({ v: value })
  const firstRunRef = useRef(true)

  useEffect(() => {
    // Reduced motion : instant, pas de tween.
    if (prefersReducedMotion()) {
      setDisplay(value)
      proxyRef.current.v = value
      firstRunRef.current = false
      return
    }

    // Premier render → départ 0. Sinon → départ = valeur courante du proxy
    // (peut être un tween interrompu, GSAP gérera le killTweensOf).
    const from = firstRunRef.current ? 0 : proxyRef.current.v
    firstRunRef.current = false

    proxyRef.current.v = from
    setDisplay(from)  // render initial avec la valeur de départ pour éviter un flash

    const tween = gsap.to(proxyRef.current, {
      v: value,
      duration,
      ease: EASE.out,
      onUpdate: () => setDisplay(proxyRef.current.v),
    })
    return () => { tween.kill() }
  }, [value, duration])

  return <span className={className} style={style}>{format(display)}</span>
}
