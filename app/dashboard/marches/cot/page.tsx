import type { Metadata } from 'next'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { LineChart } from '@/components/terminal/charts/LineChart'
import { DataStamp, SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { readCot, readLastSuccess } from '@/lib/market/read'
import { COT_BY_CODE, COT_MARKETS, type CotMarketCode } from '@/lib/market/catalog'
import { COT_CATEGORIES, cotSnapshot, marketRows, netHistory, percentileReading, type CotCategory } from '@/lib/market/cot'
import { isDataLate, isIngestLate, requestClock } from '@/lib/market/freshness'
import { minusYears } from '@/lib/market/stats'
import { fmtNumber, fmtPct } from '@/lib/format'
import { formatDateKey } from '@/lib/time'

export const metadata: Metadata = { title: 'COT · Marchés · ATP' }

// Couleurs des catégories : palette catégorielle existante (zéro vert/rouge).
const CATEGORY_COLOR: Record<CotCategory, string> = {
  assetMgr: 'var(--color-series-1)',
  levMoney: 'var(--color-series-5)',
  dealer: 'var(--color-series-4)',
}

const sectionTitle = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
} as const
const mono = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' } as const
const signed = (n: number | null) => (n === null ? '—' : fmtNumber(n, 0, { sign: true }))
const toneOf = (n: number | null) => (n === null || n === 0 ? 'var(--color-text-2)' : n > 0 ? 'var(--color-profit)' : 'var(--color-loss)')

export default async function CotPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  await requireMarketsViewer()
  const { m } = await searchParams
  const market: CotMarketCode = (COT_MARKETS.find(x => x.code === (Array.isArray(m) ? m[0] : m))?.code ?? 'NQ')

  const { now, today } = requestClock()
  const since = minusYears(today, 4) // 3 ans de percentile + marge
  const [cot, lastOk] = await Promise.all([readCot(since), readLastSuccess()])

  const header = (subtitle: string) => (
    <PageHeader
      breadcrumb={<>Marchés · Positionnement</>}
      title="COT · positionnement des grands acteurs"
      subtitle={subtitle}
      actions={
        <nav aria-label="Marché" className="flex flex-wrap gap-1.5">
          {COT_MARKETS.map(x => (
            <Link
              key={x.code}
              href={`?m=${x.code}`}
              aria-current={x.code === market ? 'page' : undefined}
              title={x.label}
              className="inline-flex items-center justify-center min-h-11 md:min-h-0"
              style={{
                ...mono, fontSize: 12, padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-md)', textDecoration: 'none',
                border: '1px solid var(--color-border-subtle)',
                background: x.code === market ? 'var(--color-accent)' : 'var(--color-surface-1)',
                color: x.code === market ? 'var(--color-surface-0)' : 'var(--color-text-2)',
                fontWeight: x.code === market ? 600 : 500,
              }}
            >
              {x.code}
            </Link>
          ))}
        </nav>
      }
    />
  )

  if (!cot.ok || cot.data.length === 0) {
    return (
      <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
        {header('Positions des institutionnels, des spéculateurs et des banques, chaque semaine.')}
        <EmptyState title="Données COT indisponibles" description={cot.ok ? 'Aucun rapport chargé pour le moment.' : cot.error} />
        <SourceMentions cftc />
      </div>
    )
  }

  const byMarket = Object.fromEntries(COT_MARKETS.map(x => [x.code, marketRows(cot.data, x.code)])) as Record<CotMarketCode, ReturnType<typeof marketRows>>
  const rows = byMarket[market]
  const snap = cotSnapshot(rows)
  const def = COT_BY_CODE[market]
  if (!snap) {
    return (
      <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
        {header(def.label)}
        <EmptyState title={`Pas de rapport pour ${def.label}`} description="Les données de ce marché ne sont pas encore chargées." />
        <SourceMentions cftc />
      </div>
    )
  }

  const late = isDataLate(snap.reportDate, 'COT', today)
  const ingestLate = lastOk.ok && isIngestLate(lastOk.data.cftc, now)
  const history = netHistory(rows, minusYears(snap.reportDate, 1))

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      {header(`${def.label} · rapport du ${formatDateKey(snap.reportDate, { long: true })}, publié en principe le ${formatDateKey(snap.publishedOn, { long: true })} · futures seuls`)}
      <DataStamp label="Positions au" date={snap.reportDate} late={late || ingestLate} lateReason={ingestLate ? 'Mise à jour automatique en retard' : 'Rapport en retard'} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {COT_CATEGORIES.map(c => {
          const s = snap.categories[c.id]
          return (
            <Card key={c.id}>
              <div style={{ ...sectionTitle, margin: 0 }}>{c.label} · {c.detail}</div>
              <div style={{ ...mono, fontSize: 28, fontWeight: 600, color: toneOf(s.net), marginTop: 8 }}>{signed(s.net)}</div>
              <div style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)', marginTop: 4 }}>
                {fmtPct(s.pctOi, 1, { sign: true })} de l’open interest
              </div>
              <div style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)', marginTop: 2 }}>
                Δ sem. <span style={{ color: toneOf(s.change) }}>{signed(s.change)}</span>
              </div>
              <PercentileBar value={s.percentile} />
            </Card>
          )
        })}
        <Card>
          <div style={{ ...sectionTitle, margin: 0 }}>Open interest</div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 600, color: 'var(--color-text-1)', marginTop: 8 }}>{fmtNumber(snap.openInterest)}</div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)', marginTop: 4 }}>contrats</div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)', marginTop: 2 }}>
            Δ sem. <span style={{ color: toneOf(snap.openInterestChange) }}>{signed(snap.openInterestChange)}</span>
          </div>
        </Card>
      </div>

      <Card>
        <h2 style={sectionTitle}>Positions nettes · 1 an · {market} (contrats)</h2>
        <LineChart
          ariaLabel={`Positions nettes sur un an, ${def.label}`}
          zeroLine
          format={v => fmtCompactFr(v)}
          series={history.map(h => {
            const c = COT_CATEGORIES.find(x => x.id === h.category)!
            return { id: h.category, label: `${c.label} (${c.detail})`, color: CATEGORY_COLOR[h.category], points: h.points, dashed: h.category === 'dealer' }
          })}
        />
      </Card>

      <Card>
        <h2 style={sectionTitle}>Tous les marchés · dernier rapport</h2>
        <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', fontWeight: 500, padding: '0 0 8px 0' }}>Marché</th>
                <th style={{ textAlign: 'left', fontWeight: 500 }}>Catégorie</th>
                <th style={{ fontWeight: 500 }}>Nette</th>
                <th style={{ fontWeight: 500 }}>Δ sem.</th>
                <th style={{ fontWeight: 500 }}>% OI</th>
                <th style={{ fontWeight: 500 }}>Percentile 3 ans</th>
                <th style={{ textAlign: 'left', fontWeight: 500, paddingLeft: 16 }}>Lecture</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-1.5">
              {COT_MARKETS.flatMap(x => {
                const s = cotSnapshot(byMarket[x.code])
                if (!s) return []
                return COT_CATEGORIES.map((c, i) => {
                  const v = s.categories[c.id]
                  const reading = percentileReading(v.percentile)
                  return (
                    <tr key={`${x.code}-${c.id}`} style={{ borderTop: i === 0 ? '1px solid var(--color-border-subtle)' : 'none', background: x.code === market ? 'var(--color-surface-2)' : undefined }}>
                      <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>
                        {i === 0 && <><strong style={{ ...mono, color: 'var(--color-text-1)' }}>{x.code}</strong> <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{x.label}</span></>}
                      </td>
                      <td style={{ color: 'var(--color-text-2)' }}>{c.label}</td>
                      <td style={{ ...mono, textAlign: 'right', color: toneOf(v.net) }}>{signed(v.net)}</td>
                      <td style={{ ...mono, textAlign: 'right', color: toneOf(v.change) }}>{signed(v.change)}</td>
                      <td style={{ ...mono, textAlign: 'right', color: 'var(--color-text-2)' }}>{fmtPct(v.pctOi, 1, { sign: true })}</td>
                      <td style={{ ...mono, textAlign: 'right', color: 'var(--color-text-1)' }}>{v.percentile === null ? '—' : Math.round(v.percentile)}</td>
                      <td style={{ paddingLeft: 16, color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                        {reading.label} {reading.extreme && <Badge tone="warn" size="sm">extrême</Badge>}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0.875rem 0 0 0', lineHeight: 1.5 }}>
          Percentile 3 ans : rang de la position nette (en % de l’open interest) parmi les rapports des 3 dernières années. 0 = la plus vendeuse, 100 = la plus acheteuse. Le COT donne le décor, pas le timing.
        </p>
      </Card>

      <SourceMentions cftc />
    </div>
  )
}

function fmtCompactFr(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1000) return `${fmtNumber(v / 1000, abs >= 10_000 ? 0 : 1)} k`
  return fmtNumber(v)
}

function PercentileBar({ value }: { value: number | null }) {
  const reading = percentileReading(value)
  return (
    <div style={{ marginTop: 12 }}>
      <div className="flex items-baseline justify-between" style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
        <span>Percentile 3 ans</span>
        <span style={{ color: 'var(--color-text-1)', fontSize: 13, fontWeight: 600 }}>{value === null ? '—' : Math.round(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-3)', marginTop: 6 }}>
        {value !== null && (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${value}%`, borderRadius: 'var(--radius-full)', background: reading.extreme ? 'var(--color-warn)' : 'var(--color-accent)' }} />
        )}
        {[20, 80].map(s => (
          <span key={s} aria-hidden style={{ position: 'absolute', left: `${s}%`, top: -2, bottom: -2, width: 1, background: 'var(--color-text-3)' }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 6 }}>{reading.label}</div>
    </div>
  )
}
