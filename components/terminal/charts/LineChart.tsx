/**
 * Graphiques des pages Terminal, rendus côté serveur (SVG, sans JS) :
 * le tracé s'étire à la largeur (preserveAspectRatio="none", trait non
 * déformé), les libellés restent en HTML pour rester lisibles sur mobile.
 * Couleurs : tokens uniquement (passés par l'appelant).
 */

export interface ChartPoint { date: string; value: number }
export interface ChartSeries { id: string; label: string; color: string; points: ChartPoint[]; dashed?: boolean }
export interface ChartZone { from: number; to: number; color: string; label?: string }

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) out.push(Number(v.toFixed(10)))
  return out
}

const t = (date: string) => Date.parse(`${date}T00:00:00Z`)

export function LineChart({ series, height = 220, format = v => v.toLocaleString('fr-FR'), zones = [], domain, zeroLine = false, ariaLabel }: {
  series: ChartSeries[]
  height?: number
  format?: (v: number) => string
  zones?: ChartZone[]
  domain?: [number, number]
  zeroLine?: boolean
  ariaLabel: string
}) {
  const all = series.flatMap(s => s.points)
  if (all.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-text-3)' }}>Pas assez de données.</div>
  }
  const x0 = Math.min(...all.map(p => t(p.date)))
  const x1 = Math.max(...all.map(p => t(p.date)))
  let [y0, y1] = domain ?? [Math.min(...all.map(p => p.value)), Math.max(...all.map(p => p.value))]
  if (!domain) {
    if (zeroLine) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0) }
    const pad = (y1 - y0) * 0.08 || 1
    y0 -= pad
    y1 += pad
  }
  const X = (d: string) => ((t(d) - x0) / (x1 - x0 || 1)) * 1000
  const Y = (v: number) => 100 - ((v - y0) / (y1 - y0 || 1)) * 100
  const ticks = domain ? niceTicks(y0, y1, 4).filter(v => v >= y0 && v <= y1) : niceTicks(y0, y1, 4)

  // Repères de mois : 1er de chaque mois (au plus 7 libellés).
  const months: { date: string; label: string }[] = []
  const start = new Date(x0)
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); d.getTime() <= x1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const m = d.getUTCMonth()
    months.push({ date: d.toISOString().slice(0, 10), label: m === 0 ? `${MONTHS[0]} ${String(d.getUTCFullYear()).slice(2)}` : MONTHS[m] })
  }
  const stepMonths = Math.ceil(months.length / 7) || 1
  const shownMonths = months.filter((_, i) => i % stepMonths === 0)

  return (
    <figure style={{ margin: 0 }} aria-label={ariaLabel} role="img">
      <div style={{ position: 'relative', height, marginLeft: 52, marginBottom: 22 }}>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
          {zones.map((z, i) => {
            const top = Y(Math.min(Math.max(z.to, y0), y1))
            const bottom = Y(Math.min(Math.max(z.from, y0), y1))
            return <rect key={i} x={0} y={top} width={1000} height={Math.max(0, bottom - top)} fill={z.color} />
          })}
          {ticks.map(v => (
            <line key={v} x1={0} x2={1000} y1={Y(v)} y2={Y(v)} stroke="var(--color-border-subtle)" vectorEffect="non-scaling-stroke" />
          ))}
          {zeroLine && y0 < 0 && y1 > 0 && (
            <line x1={0} x2={1000} y1={Y(0)} y2={Y(0)} stroke="var(--color-text-3)" vectorEffect="non-scaling-stroke" />
          )}
          {series.map(s => (
            <polyline
              key={s.id}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              points={s.points.map(p => `${X(p.date).toFixed(2)},${Y(p.value).toFixed(2)}`).join(' ')}
            />
          ))}
        </svg>
        {ticks.map(v => (
          <span key={v} style={{ position: 'absolute', right: '100%', marginRight: 8, top: `${Y(v)}%`, transform: 'translateY(-50%)', fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
            {format(v)}
          </span>
        ))}
        {shownMonths.map(m => (
          <span key={m.date} style={{ position: 'absolute', top: '100%', marginTop: 6, left: `${X(m.date) / 10}%`, transform: 'translateX(-50%)', fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>
            {m.label}
          </span>
        ))}
      </div>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 11, color: 'var(--color-text-2)' }}>
          {series.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span aria-hidden style={{ width: 14, height: 2, background: s.color, display: 'inline-block' }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  )
}

/** Mini-graphique (1 an) : tracé seul, sans axes. */
export function Sparkline({ points, color = 'var(--color-accent)', height = 40, ariaLabel }: {
  points: ChartPoint[]
  color?: string
  height?: number
  ariaLabel: string
}) {
  if (points.length < 2) return <div style={{ height }} />
  const xs = points.map(p => t(p.date))
  const ys = points.map(p => p.value)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const X = (d: string) => ((t(d) - x0) / (x1 - x0 || 1)) * 100
  const Y = (v: number) => 95 - ((v - y0) / (y1 - y0 || 1)) * 90
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={ariaLabel}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round"
        points={points.map(p => `${X(p.date).toFixed(2)},${Y(p.value).toFixed(2)}`).join(' ')} />
    </svg>
  )
}
