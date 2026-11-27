import Badge from '@/components/ui/Badge'
import { formatDateKey } from '@/lib/time'
import { CFTC_SOURCE, CFTC_URL, FRED_NOTICE, FRED_TERMS_URL } from '@/lib/market/catalog'

/**
 * Bandeaux communs des pages Terminal (Server Components, sans JS) :
 * - DataStamp : date des données affichées, avertissement si en retard ;
 * - SourceMentions : mentions exigées par chaque source.
 */

const mono = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' } as const

export function DataStamp({ label = 'Données au', date, late, lateReason }: {
  label?: string
  date: string | null
  late: boolean
  lateReason?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)' }}>
      <span>{label} {date ? formatDateKey(date, { year: true }) : '—'}</span>
      {late && (
        <Badge tone="warn" size="sm" bordered>
          {lateReason ?? 'Mise à jour en retard'}
        </Badge>
      )}
    </div>
  )
}

export function SourceMentions({ fred = false, cftc = false, providers = [] }: {
  fred?: boolean
  cftc?: boolean
  /** Organismes producteurs des séries affichées (citation). */
  providers?: string[]
}) {
  const unique = [...new Set(providers)]
  return (
    <footer style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {unique.length > 0 && <p style={{ margin: 0 }}>Sources : {unique.join(' · ')}, via FRED (Federal Reserve Bank of St. Louis).</p>}
      {cftc && (
        <p style={{ margin: 0 }}>
          Source : <a href={CFTC_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>{CFTC_SOURCE}</a>. Positions du mardi, publiées en principe le vendredi suivant.
        </p>
      )}
      {fred && (
        <p style={{ margin: 0 }}>
          {FRED_NOTICE}{' '}
          En utilisant ces pages, tu acceptes les{' '}
          <a href={FRED_TERMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-2)' }}>conditions d’utilisation de l’API FRED</a>.
        </p>
      )}
    </footer>
  )
}
