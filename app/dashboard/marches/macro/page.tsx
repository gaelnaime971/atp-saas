import type { Metadata } from 'next'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { Sparkline } from '@/components/terminal/charts/LineChart'
import { DataStamp, SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { readLastSuccess, readSeries } from '@/lib/market/read'
import { FRED_BY_CODE, type FredFrequency } from '@/lib/market/catalog'
import { fedLiquidity, macroFigure, type MacroFigure } from '@/lib/market/macro'
import { isDataLate, isIngestLate, requestClock } from '@/lib/market/freshness'
import { minusYears } from '@/lib/market/stats'
import { fmtNumber } from '@/lib/format'
import { formatDateKey } from '@/lib/time'
import type { Observation } from '@/lib/market/fred'

export const metadata: Metadata = { title: 'Macro US · Marchés · ATP' }

const CODES = ['DGS2', 'DGS10', 'T10Y2Y', 'DFII10', 'T10YIE', 'WALCL', 'WTREGEN', 'RRPONTSYD', 'ICSA', 'UNRATE', 'GDPNOW']

type Kind = 'rate' | 'pct' | 'count' | 'billions'

interface CardDef {
  id: string
  label: string
  hint: string
  kind: Kind
  frequency: FredFrequency
  source: string
  /** Codes FRED cités. */
  codes: string[]
}

const GROUPS: { title: string; cards: CardDef[] }[] = [
  {
    title: 'Taux et liquidité',
    cards: [
      { id: 'DGS2', label: 'Taux à 2 ans', hint: 'Bon du Trésor US, échéance constante', kind: 'rate', frequency: 'D', source: 'Fed (H.15)', codes: ['DGS2'] },
      { id: 'DGS10', label: 'Taux à 10 ans', hint: 'Bon du Trésor US, échéance constante', kind: 'rate', frequency: 'D', source: 'Fed (H.15)', codes: ['DGS10'] },
      { id: 'T10Y2Y', label: 'Courbe 10 ans − 2 ans', hint: 'Négative = courbe inversée', kind: 'rate', frequency: 'D', source: 'Fed de St. Louis', codes: ['T10Y2Y'] },
      { id: 'DFII10', label: 'Taux réel à 10 ans', hint: 'Bon indexé sur l’inflation (TIPS)', kind: 'rate', frequency: 'D', source: 'Fed (H.15)', codes: ['DFII10'] },
      { id: 'T10YIE', label: 'Inflation attendue à 10 ans', hint: 'Point mort : 10 ans nominal − réel', kind: 'rate', frequency: 'D', source: 'Fed de St. Louis', codes: ['T10YIE'] },
      { id: 'LIQ', label: 'Liquidité de la Fed', hint: 'Bilan − compte du Trésor − reverse repo', kind: 'billions', frequency: 'W', source: 'Fed (H.4.1), Fed de New York', codes: ['WALCL', 'WTREGEN', 'RRPONTSYD'] },
    ],
  },
  {
    title: 'Emploi et croissance',
    cards: [
      { id: 'ICSA', label: 'Inscriptions au chômage', hint: 'Nouvelles demandes, chaque semaine', kind: 'count', frequency: 'W', source: 'Département du Travail', codes: ['ICSA'] },
      { id: 'UNRATE', label: 'Taux de chômage', hint: 'Chaque mois', kind: 'pct', frequency: 'M', source: 'Bureau of Labor Statistics', codes: ['UNRATE'] },
      { id: 'GDPNOW', label: 'GDPNow', hint: 'Croissance du trimestre en cours, rythme annualisé', kind: 'pct', frequency: 'Q', source: 'Fed d’Atlanta', codes: ['GDPNOW'] },
    ],
  },
]

const sectionTitle = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: 0, fontWeight: 500,
} as const
const mono = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' } as const

function formatValue(kind: Kind, v: number): string {
  switch (kind) {
    case 'rate':
    case 'pct': return `${fmtNumber(v, 2)} %`
    case 'count': return fmtNumber(v)
    case 'billions': return `${fmtNumber(v)} Md$`
  }
}

function formatChange(kind: Kind, d: number): string {
  switch (kind) {
    case 'rate': return `${fmtNumber(d * 100, 0, { sign: true })} pb`
    case 'pct': return `${fmtNumber(d, 1, { sign: true })} pt`
    case 'count': return fmtNumber(d, 0, { sign: true })
    case 'billions': return `${fmtNumber(d, 0, { sign: true })} Md$`
  }
}

function formatPeriod(date: string, frequency: FredFrequency): string {
  const [y, m] = date.split('-').map(Number)
  if (frequency === 'Q') return `T${Math.floor((m - 1) / 3) + 1} ${y}`
  if (frequency === 'M') return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1))
  return formatDateKey(date, { year: true })
}

export default async function MacroPage() {
  await requireMarketsViewer()
  const { now, today } = requestClock()
  const [series, lastOk] = await Promise.all([readSeries(CODES, minusYears(today, 2)), readLastSuccess()])

  const header = (
    <PageHeader
      breadcrumb={<>Marchés · Analyse</>}
      title="Macro US"
      subtitle="Taux, liquidité de la Fed, emploi et croissance : les séries qui pilotent les indices US."
    />
  )

  if (!series.ok || Object.values(series.data).every(o => o.length === 0)) {
    return (
      <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
        {header}
        <EmptyState title="Données macro indisponibles" description={series.ok ? 'Aucune série chargée pour le moment.' : series.error} />
        <SourceMentions fred />
      </div>
    )
  }

  const data = series.data
  const resolve = (id: string): Observation[] =>
    id === 'LIQ' ? fedLiquidity(data.WALCL ?? [], data.WTREGEN ?? [], data.RRPONTSYD ?? []) : data[id] ?? []
  const figures = Object.fromEntries(GROUPS.flatMap(g => g.cards).map(c => [c.id, macroFigure(resolve(c.id))])) as Record<string, MacroFigure>
  const latest = Object.values(figures).map(f => f.last?.date).filter((d): d is string => !!d).sort().at(-1) ?? null
  const ingestLate = lastOk.ok && isIngestLate(lastOk.data.fred, now)

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      {header}
      <DataStamp date={latest} late={ingestLate} lateReason="Mise à jour automatique en retard" />

      {GROUPS.map(group => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 style={{ ...sectionTitle, fontSize: 12 }}>{group.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {group.cards.map(card => {
              const f = figures[card.id]
              const late = isDataLate(f.last?.date ?? null, card.frequency, today)
              return (
                <Card key={card.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', margin: 0 }}>{card.label}</h3>
                      <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '2px 0 0 0' }}>{card.hint}</p>
                    </div>
                    {late && f.last && <Badge tone="warn" size="sm">en retard</Badge>}
                  </div>
                  {f.last ? (
                    <>
                      <div className="flex items-baseline gap-3 flex-wrap" style={{ marginTop: 12 }}>
                        <span style={{ ...mono, fontSize: 26, fontWeight: 600, color: 'var(--color-text-1)' }}>{formatValue(card.kind, f.last.value)}</span>
                        {f.change !== null && f.previous && (
                          <span style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)' }}>
                            {formatChange(card.kind, f.change)} <span style={{ color: 'var(--color-text-3)' }}>vs {formatPeriod(f.previous.date, card.frequency)}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
                        {card.frequency === 'Q' ? 'Estimation pour le ' : 'Au '}{formatPeriod(f.last.date, card.frequency)}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <Sparkline points={f.year} color="var(--color-accent)" ariaLabel={`${card.label} sur un an`} />
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '12px 0 0 0' }}>Pas encore de donnée.</p>
                  )}
                  <div style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', marginTop: 10, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
                    {card.source} · FRED {card.codes.join(', ')}
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: 0, lineHeight: 1.5 }}>
        Variation : par rapport à la publication précédente (pb = point de base, 0,01 %). Liquidité de la Fed en milliards de dollars, chaque mercredi : bilan et compte du Trésor (millions de $, hebdomadaires) ramenés en milliards, moins le reverse repo du jour (milliards de $).
      </p>
      <SourceMentions fred providers={[...new Set(CODES.map(c => FRED_BY_CODE[c].provider))]} />
    </div>
  )
}
