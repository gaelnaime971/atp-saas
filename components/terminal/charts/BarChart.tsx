/**
 * Barres verticales autour de zéro (rendu serveur, HTML/CSS, sans JS) :
 * vert au-dessus de zéro, rouge en dessous, colonne mise en avant
 * encadrée. Sous 640 px : libellés courts, valeurs masquées (le détail
 * est dans le tableau de la page). Couleurs : tokens uniquement.
 */

export interface Bar {
  key: string | number
  label: string
  /** Libellé court pour mobile (ex. « J » pour janvier). */
  short?: string
  /** null = pas de donnée (colonne vide). */
  value: number | null
  /** Ligne sous le libellé (ex. part des années en hausse). */
  sub?: string
}

export function BarChart({ bars, highlight, height = 180, format, ariaLabel }: {
  bars: Bar[]
  highlight?: string | number
  height?: number
  format: (v: number) => string
  ariaLabel: string
}) {
  const values = bars.flatMap(b => (b.value === null ? [] : [b.value]))
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const upShare = max / span
  return (
    <figure style={{ margin: 0 }} role="img" aria-label={ariaLabel}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 4 }}>
        {bars.map(b => {
          const on = highlight !== undefined && b.key === highlight
          const h = b.value === null ? 0 : (Math.abs(b.value) / span) * 100
          const color = b.value !== null && b.value < 0 ? 'var(--color-loss)' : 'var(--color-profit)'
          const label = b.value === null ? '' : format(b.value)
          return (
            <div key={b.key} className="flex flex-col items-center" style={{
              borderRadius: 'var(--radius-md)', padding: '4px 0',
              background: on ? 'var(--color-surface-2)' : 'transparent',
              outline: on ? '1px solid var(--color-border-subtle)' : 'none',
            }}>
              <div style={{ position: 'relative', width: '100%', height, margin: '14px 0' }}>
                {/* moitié haute (positifs) */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${upShare * 100}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {b.value !== null && b.value >= 0 && (
                    <>
                      <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--color-text-2)', marginBottom: 3, whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ width: '62%', maxWidth: 28, height: `${(h / (upShare * 100 || 1)) * 100}%`, background: color, borderRadius: '3px 3px 0 0', minHeight: 1 }} />
                    </>
                  )}
                </div>
                {/* moitié basse (négatifs) */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(1 - upShare) * 100}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)' }}>
                  {b.value !== null && b.value < 0 && (
                    <>
                      <span style={{ width: '62%', maxWidth: 28, height: `${(h / ((1 - upShare) * 100 || 1)) * 100}%`, background: color, borderRadius: '0 0 3px 3px', minHeight: 1 }} />
                      <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--color-text-2)', marginTop: 3, whiteSpace: 'nowrap' }}>{label}</span>
                    </>
                  )}
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, marginTop: 8, color: on ? 'var(--color-accent)' : 'var(--color-text-3)', fontWeight: on ? 600 : 400 }}>
                {b.short ? <><span className="sm:hidden">{b.short}</span><span className="hidden sm:inline">{b.label}</span></> : b.label}
              </span>
              {b.sub && <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{b.sub}</span>}
            </div>
          )
        })}
      </div>
    </figure>
  )
}
