'use client'

import { useRef, useEffect } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'

/**
 * JarvisOrb — filaments lumineux qui réagissent à la voix.
 *
 * Rendu : SVG + CSS. Pseudo-aléatoire à graine fixe → même visuel
 * à chaque chargement, aucune hydration mismatch.
 *
 * Réactivité à la voix : la prop `levelRef` est lue toutes les frames
 * (rAF) et poussée dans la variable CSS `--level` du conteneur, SANS
 * re-render React. Le niveau pilote l'échelle (0.94 à 1.08), l'intensité
 * du halo et l'opacité des particules.
 *
 * prefers-reduced-motion → orbe totalement figé.
 */

export type OrbState = 'veille' | 'ecoute' | 'reflexion' | 'parle' | 'ambre' | 'objectif'

const STATE_COLORS: Record<OrbState, string> = {
  veille:   '#3B4A42', // gris-vert sourd
  ecoute:   '#45D486', // vert ATP
  reflexion:'#B89560', // doré atténué
  parle:    '#DDB977', // doré
  ambre:    '#F2994A', // règle déclenchée (3G)
  objectif: '#E9C98A', // objectif atteint (3G)
}

// PRNG déterministe — même rendu à chaque chargement.
function mulberry32(seed: number): () => number {
  let s = seed
  return () => {
    let t = (s += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Ring {
  rotation: number
  radius: number
  perimeter: number
  dash: number
  gap: number
  thickness: number
  opacity: number
  flipDur: number
  flipDelay: number
  runDur: number
  runDelay: number
}

interface Particle {
  x: number
  y: number
  r: number
  twinkleDur: number
  twinkleDelay: number
}

function generateRings(seed: number): Ring[] {
  const rand = mulberry32(seed)
  return Array.from({ length: 18 }, (_, i) => {
    const rotation = i * 10 + (rand() - 0.5) * 8          // i*10° ±4°
    const radius = 70 + rand() * 26                        // 70 à 96
    const perimeter = 2 * Math.PI * radius
    const visibleFraction = 0.35 + rand() * 0.45           // 35 à 80 %
    const dash = visibleFraction * perimeter
    const gap = perimeter - dash
    const thickness = 1 + rand() * 0.8                     // 1 à 1,8
    const opacity = 0.45 + rand() * 0.55                   // 0,45 à 1
    const flipDur = 3 + rand() * 4                         // 3 à 7 s
    const flipDelay = -rand() * flipDur
    const runDur = 2 + rand() * 3                          // 2 à 5 s
    const runDelay = -rand() * runDur
    return { rotation, radius, perimeter, dash, gap, thickness, opacity, flipDur, flipDelay, runDur, runDelay }
  })
}

function generateParticles(seed: number): Particle[] {
  const rand = mulberry32(seed)
  return Array.from({ length: 22 }, () => {
    const angle = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 92                        // disque uniforme rayon 92
    const x = 110 + Math.cos(angle) * r
    const y = 110 + Math.sin(angle) * r
    const radius = 0.8 + rand() * 0.8                       // 0,8 à 1,6
    const twinkleDur = 0.8 + rand() * 1.6                   // 0,8 à 2,4 s
    const twinkleDelay = -rand() * twinkleDur
    return { x, y, r: radius, twinkleDur, twinkleDelay }
  })
}

const RINGS = generateRings(42)
const PARTICLES = generateParticles(314)

export function JarvisOrb({
  state,
  levelRef,
  size = 220,
}: {
  state: OrbState
  levelRef?: MutableRefObject<number>
  size?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const color = STATE_COLORS[state]

  // Pilote --level via rAF sans re-render React
  useEffect(() => {
    if (!levelRef || !containerRef.current) return
    let frame = 0
    const tick = () => {
      const el = containerRef.current
      if (el) el.style.setProperty('--level', String(levelRef.current))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [levelRef])

  return (
    <div
      ref={containerRef}
      className="jarvis-orb"
      data-state={state}
      style={{ '--orb-color': color, width: size, height: size } as CSSProperties}
    >
      <svg viewBox="0 0 220 220" className="orb-svg" aria-hidden>
        <g className="orb-rotation">
          {RINGS.map((r, i) => (
            <g key={i} transform={`rotate(${r.rotation} 110 110)`}>
              <g
                className="orb-ring-flip"
                style={{
                  animationDuration: `${r.flipDur}s`,
                  animationDelay: `${r.flipDelay}s`,
                  transformOrigin: '110px 110px',
                }}
              >
                <circle
                  cx="110" cy="110" r={r.radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={r.thickness}
                  opacity={r.opacity}
                  strokeDasharray={`${r.dash} ${r.gap}`}
                  className="orb-ring-run"
                  style={{
                    animationDuration: `${r.runDur}s`,
                    animationDelay: `${r.runDelay}s`,
                    ['--run-end' as string]: -r.perimeter,
                  } as CSSProperties}
                />
              </g>
            </g>
          ))}
        </g>
        <g className="orb-particles">
          {PARTICLES.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y} r={p.r}
              fill={color}
              style={{
                animationDuration: `${p.twinkleDur}s`,
                animationDelay: `${p.twinkleDelay}s`,
              }}
            />
          ))}
        </g>
      </svg>
      <style jsx>{`
        .jarvis-orb {
          --level: 0;
          position: relative;
          filter:
            drop-shadow(0 0 4px var(--orb-color))
            drop-shadow(0 0 calc((12px + var(--level) * 10px) * var(--orb-active, 0)) var(--orb-color));
          transform: scale(calc(0.94 + var(--level) * 0.14));
          transition: filter 0.4s ease;
          will-change: transform, filter;
        }
        .jarvis-orb[data-state="veille"] {
          --orb-active: 0;
        }
        .jarvis-orb:not([data-state="veille"]) {
          --orb-active: 1;
        }
        .orb-svg { width: 100%; height: 100%; display: block; }
        .orb-rotation {
          transform-origin: 110px 110px;
          animation: orbRotate 24s linear infinite;
        }
        @keyframes orbRotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .orb-ring-flip {
          animation-name: orbFlip;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes orbFlip {
          0%, 100% { transform: scaleY(1); }
          50%      { transform: scaleY(-1); }
        }
        .orb-ring-run {
          animation-name: orbRun;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes orbRun {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: var(--run-end); }
        }
        .orb-particles circle {
          animation-name: orbTwinkle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          opacity: calc(0.15 + var(--level) * 0.85);
        }
        @keyframes orbTwinkle {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 1; }
        }
        /* Veille : tout figé, pas de halo */
        .jarvis-orb[data-state="veille"] .orb-rotation,
        .jarvis-orb[data-state="veille"] .orb-ring-flip,
        .jarvis-orb[data-state="veille"] .orb-ring-run,
        .jarvis-orb[data-state="veille"] circle {
          animation: none !important;
        }
        /* Réflexion : éclats plus rapides */
        .jarvis-orb[data-state="reflexion"] .orb-ring-run {
          animation-duration: 1.2s !important;
        }
        /* Reduced motion : tout figé, aucun scale */
        @media (prefers-reduced-motion: reduce) {
          .jarvis-orb,
          .jarvis-orb .orb-rotation,
          .jarvis-orb .orb-ring-flip,
          .jarvis-orb .orb-ring-run,
          .jarvis-orb circle {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  )
}
