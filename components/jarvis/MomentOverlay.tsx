'use client'

/**
 * 3G — Overlays SVG posés par-dessus l'orbe : countdown avant l'Open,
 * anneau de pulse (stop), orbite de session (points des trades).
 *
 * Toutes les animations CSS respectent prefers-reduced-motion (règle
 * globale sur `@media (prefers-reduced-motion: reduce)` dans le
 * composant parent — ici on ne fait que décorer).
 *
 * Palette : vert #45D486, doré #DDB977, ambre #F2994A, pistes
 * #15241B / #1A2620 / #2A3A31.
 */

import type { MomentKind } from '@/lib/jarvis/moments'
import { ORBIT_FULL_MS, ORBIT_MARKERS, computeTradeAngle } from '@/lib/jarvis/moments'

interface Trade {
  at: string
  result_r: number | null
  result_usd: number | null
}

interface Props {
  kind: MomentKind
  size: number
  /** Minutes avant l'Open (positif = pas encore passé). */
  minutesToOpen: number | null
  /** Trades du jour (pour l'orbite). */
  trades: Trade[]
  /** Open du jour (ISO Paris). */
  openISO: string | null
  /** Heure courante (ISO). Permet un rendu déterministe côté tests. */
  nowISO?: string
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  // 0° = haut (12h), sens horaire.
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

export function MomentOverlay({ kind, size, minutesToOpen, trades, openISO, nowISO }: Props) {
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 4

  // Countdown ring (avant_open) : arc de longueur minutes/45.
  if (kind === 'avant_open' && minutesToOpen != null && minutesToOpen > 0) {
    const frac = Math.min(1, minutesToOpen / 45)
    const r = outerR - 2
    const circ = 2 * Math.PI * r
    const dash = circ * frac
    return (
      <svg className="jv-moment-overlay" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#15241B" strokeWidth={2} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="#45D486" strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
    )
  }

  // Stop pulse (ambre), anneau continu + animation CSS côté parent.
  if (kind === 'stop') {
    const r = outerR - 2
    return (
      <svg className="jv-moment-overlay jv-pulse-ambre" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F2994A" strokeWidth={2} />
      </svg>
    )
  }

  // Session orbit : trades + repères + point "maintenant".
  if (kind === 'session' || kind === 'mission') {
    const r = outerR - 2
    const now = nowISO ? new Date(nowISO) : new Date()
    const nowAngle = openISO ? computeTradeAngle(now, openISO) : null
    // Dernier trade (anneau qui s'agrandit)
    const lastTrade = trades.length > 0 ? trades[trades.length - 1] : null
    const lastAngle = (lastTrade && openISO) ? computeTradeAngle(lastTrade.at, openISO) : null
    return (
      <svg className="jv-moment-overlay" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Orbite fine */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1A2620" strokeWidth={1} />
        {/* Repères */}
        {ORBIT_MARKERS.map(mk => {
          const [x, y] = polarToCart(cx, cy, r, mk.angle)
          return <circle key={mk.label} cx={x} cy={y} r={2} fill="#2A3A31" />
        })}
        {/* Label "Open" en haut */}
        <text
          x={cx} y={cy - r - 6}
          textAnchor="middle" fontSize="9" fill="#9FB0A6"
          fontFamily="var(--font-oxanium), system-ui" letterSpacing="0.1em"
        >Open</text>
        {/* Trades */}
        {openISO && trades.map((t, i) => {
          const a = computeTradeAngle(t.at, openISO)
          const [x, y] = polarToCart(cx, cy, r, a)
          const result = t.result_r ?? (t.result_usd != null ? Math.sign(t.result_usd) : 0)
          const fill = result > 0 ? '#45D486' : result < 0 ? '#F2994A' : '#6B7A72'
          const isLast = i === trades.length - 1
          return (
            <g key={`${t.at}-${i}`}>
              {isLast && (
                <circle cx={x} cy={y} r={5} fill="none" stroke={fill} strokeWidth={1.5}
                        className="jv-trade-ping" opacity={0.6} />
              )}
              <circle cx={x} cy={y} r={3.5} fill={fill} stroke="#060807" strokeWidth={1} />
            </g>
          )
        })}
        {/* Point "maintenant" (doré) — uniquement entre Open et +2h */}
        {nowAngle != null && nowAngle > 0 && nowAngle < 360 && lastAngle !== nowAngle && (
          <circle
            cx={polarToCart(cx, cy, r, nowAngle)[0]}
            cy={polarToCart(cx, cy, r, nowAngle)[1]}
            r={2.5} fill="#DDB977"
          />
        )}
      </svg>
    )
  }

  return null
}

// expose the full-orbit duration so the parent can reason about session end
export const SESSION_ORBIT_MS = ORBIT_FULL_MS
