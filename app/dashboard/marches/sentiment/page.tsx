import type { Metadata } from 'next'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import PageHeader from '@/components/ui/PageHeader'
import { LineChart } from '@/components/terminal/charts/LineChart'
import { DataStamp, SourceMentions } from '@/components/terminal/data/DataNotices'
import { requireMarketsViewer } from '@/lib/terminal/viewer-server'
import { readCot, readLastSuccess, readSeries } from '@/lib/market/read'
import { FRED_BY_CODE, FRED_EXCLUDED } from '@/lib/market/catalog'
import { fedLiquidity, yieldCurve } from '@/lib/market/macro'
import { marketRows, netOf, pctOfOi } from '@/lib/market/cot'
import {
  SENTIMENT_COMPONENTS, SENTIMENT_YEARS, ZONE_LABEL, sentimentAt, sentimentHistory,
  type SentimentComponentDef, type SentimentInputs, type SentimentZone,
} from '@/lib/market/sentiment'
import { isIngestLate, requestClock } from '@/lib/market/freshness'
import { minusDays, minusYears } from '@/lib/market/stats'
import { fmtNumber } from '@/lib/format'
import { formatDateKey } from '@/lib/time'

export const metadata: Metadata = { title: 'Sentiment de risque · Marchés · ATP' }

const FRED_CODES = ['STLFSI4', 'NFCIRISK', 'NFCICREDIT', 'DFII10', 'WALCL', 'WTREGEN', 'RRPONTSYD', 'DGS10', 'DGS2']

const ZONE_COLOR: Record<SentimentZone, string> = {
  aversion: 'var(--color-loss)',
  neutre: 'var(--color-neutral)',
  appetit: 'var(--color-profit)',
}

const sectionTitle = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
} as const
const mono = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' } as const

function formatRaw(def: SentimentComponentDef, v: number | null): string {
  if (v === null) return '—'
  switch (def.unit) {
    case 'index': return fmtNumber(v, 2)
    case 'pct': return `${fmtNumber(v, 2)} %`
    case 'billions': return `${fmtNumber(v)} Md$`
    case 'pctOi': return `${fmtNumber(v, 1, { sign: true })} % OI`
  }
}

export default async function SentimentPage() {
  await requireMarketsViewer()
  const { now, today } = requestClock()
  const since = minusYears(today, SENTIMENT_YEARS + 2)
  const [series, cot, lastOk] = await Promise.all([readSeries(FRED_CODES, since), readCot(since), readLastSuccess()])

  const header = (
    <PageHeader
      breadcrumb={<>Marchés · Positionnement</>}
      title="Sentiment de risque ATP"
      subtitle="Un score de 0 (aversion) à 100 (appétit pour le risque), recalculé chaque soir sur 7 séries publiques."
    />
  )

  if (!series.ok || !cot.ok) {
    return (
      <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
        {header}
        <EmptyState title="Sentiment indisponible" description={(!series.ok ? series.error : !cot.ok ? cot.error : '') || 'Données indisponibles.'} />
        <SourceMentions fred cftc />
      </div>
    )
  }

  const d = series.data
  const positioningOf = (m: 'ES' | 'NQ') => marketRows(cot.data, m)
    .map(r => ({ date: r.reportDate, value: pctOfOi(netOf(r, 'assetMgr'), r.openInterest) }))
    .filter((o): o is { date: string; value: number } => o.value !== null)
  const inputs: SentimentInputs = {
    stress: d.STLFSI4 ?? [], marketRisk: d.NFCIRISK ?? [], credit: d.NFCICREDIT ?? [], realRate: d.DFII10 ?? [],
    liquidity: fedLiquidity(d.WALCL ?? [], d.WTREGEN ?? [], d.RRPONTSYD ?? []),
    curve: yieldCurve(d.DGS10 ?? [], d.DGS2 ?? []),
    positioning: { ES: positioningOf('ES'), NQ: positioningOf('NQ') },
  }
  // Composantes écartées pour copyright : aucune à ce jour (catalogue FRED).
  const excluded = SENTIMENT_COMPONENTS.filter(c => FRED_EXCLUDED.some(x => c.source.includes(x.code))).map(c => c.id)
  const current = sentimentAt(inputs, today, excluded)

  if (current.score === null) {
    return (
      <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
        {header}
        <EmptyState title="Sentiment indisponible" description="Aucune composante n’a encore de donnée." />
        <SourceMentions fred cftc />
      </div>
    )
  }

  const history = sentimentHistory(inputs, today, 52, excluded)
  const ago = (days: number) => sentimentAt(inputs, minusDays(today, days), excluded).score
  const compare = [{ label: '1 sem.', value: ago(7) }, { label: '1 mois', value: ago(30) }, { label: '1 an', value: ago(365) }]
  const latestData = current.components.map(c => c.rawDate).filter((x): x is string => !!x).sort().at(-1) ?? null
  const ingestLate = lastOk.ok && (isIngestLate(lastOk.data.fred, now) || isIngestLate(lastOk.data.cftc, now))
  const score = current.score
  const zone = current.zone!
  const missingLabels = current.missing.map(id => SENTIMENT_COMPONENTS.find(c => c.id === id)!.label)

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      {header}
      <DataStamp date={latestData} late={ingestLate} lateReason="Mise à jour automatique en retard" />
      {missingLabels.length > 0 && (
        <p role="status" style={{ fontSize: 12, color: 'var(--color-warn)', margin: 0 }}>
          Calculé sans {missingLabels.join(', ')} (pas de donnée disponible) : score sur {SENTIMENT_COMPONENTS.length - missingLabels.length} composantes.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>Score composite</h2>
          <Gauge score={score} zone={zone} />
          <div className="grid grid-cols-3 gap-2" style={{ marginTop: 16, textAlign: 'center' }}>
            {compare.map(c => (
              <div key={c.label}>
                <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>{c.label}</div>
                <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: c.value === null ? 'var(--color-text-3)' : 'var(--color-text-1)' }}>
                  {c.value === null ? '—' : Math.round(c.value)}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-2)', textAlign: 'center', margin: '14px 0 0 0' }}>
            Aversion sous 40 · neutre de 40 à 60 · appétit au-dessus de 60
          </p>
        </Card>
        <Card>
          <h2 style={sectionTitle}>Historique · 1 an (chaque semaine)</h2>
          <LineChart
            ariaLabel="Score de sentiment de risque sur un an"
            domain={[0, 100]}
            format={v => fmtNumber(v)}
            zones={[
              { from: 60, to: 100, color: 'rgba(var(--color-profit-rgb), 0.07)' },
              { from: 0, to: 40, color: 'rgba(var(--color-loss-rgb), 0.07)' },
            ]}
            series={[{ id: 'score', label: 'Score', color: 'var(--color-accent)', points: history }]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)] gap-5">
        <Card>
          <h2 style={sectionTitle}>Les composantes · percentile sur {SENTIMENT_YEARS} ans, orienté</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {current.components.map((c, i) => {
              const def = SENTIMENT_COMPONENTS.find(x => x.id === c.id)!
              const tone = c.oriented === null ? 'var(--color-text-3)' : c.oriented < 40 ? 'var(--color-loss)' : c.oriented > 60 ? 'var(--color-profit)' : 'var(--color-text-2)'
              return (
                <li key={c.id} className="grid items-center gap-x-4 gap-y-1 grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_3rem]"
                  style={{ padding: '0.75rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)' }}>
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{def.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-3)' }}>{def.hint}</span>
                  </span>
                  <span style={{ ...mono, fontSize: 13, color: 'var(--color-text-2)', textAlign: 'right' }}>{formatRaw(def, c.raw)}</span>
                  <span className="col-span-2 sm:col-span-1" style={{ position: 'relative', height: 6, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-3)' }}>
                    {c.oriented !== null && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${c.oriented}%`, borderRadius: 'var(--radius-full)', background: tone }} />}
                  </span>
                  <span className="hidden sm:block" style={{ ...mono, fontSize: 14, fontWeight: 600, color: tone, textAlign: 'right' }}>
                    {c.oriented === null ? '—' : Math.round(c.oriented)}
                  </span>
                  <span className="col-span-2 sm:col-span-4" style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                    {c.oriented === null
                      ? 'Pas de donnée : hors du calcul.'
                      : <>Percentile brut {Math.round(c.percentile!)}{def.direction === -1 ? ' (inversé)' : ''} · apporte {fmtNumber(c.contribution!, 1)} pt au score · {def.source}{c.rawDate ? ` · au ${formatDateKey(c.rawDate)}` : ''}</>}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
        <Card>
          <h2 style={sectionTitle}>Comment c’est calculé</h2>
          <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Pour chaque composante, on situe la valeur du jour parmi celles des {SENTIMENT_YEARS} dernières années : c’est son percentile (0 = la plus basse, 100 = la plus haute).</li>
            <li>On l’oriente pour que « haut » signifie appétit pour le risque : stress, risque de marché, crédit tendu et taux réel élevés poussent vers l’aversion, donc leur percentile est inversé (100 − percentile).</li>
            <li>Le positionnement est la moyenne des percentiles des institutionnels (asset managers) sur ES et NQ, en % de l’open interest, futures seuls.</li>
            <li>Le score est la moyenne simple des composantes disponibles : chacune apporte sa part. Sous 40 : aversion ; de 40 à 60 : neutre ; au-dessus de 60 : appétit.</li>
            <li>Séries hebdomadaires et quotidiennes : chaque composante utilise sa dernière valeur connue à la date. L’historique refait le calcul chaque semaine avec les seules données connues à cette date.</li>
          </ol>
          <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '12px 0 0 0', lineHeight: 1.5 }}>
            Un indicateur de contexte, pas un signal d’entrée. Données publiques de la Fed et de la CFTC, calcul ATP.
          </p>
        </Card>
      </div>

      <SourceMentions fred cftc providers={[...new Set(FRED_CODES.map(c => FRED_BY_CODE[c].provider))]} />
    </div>
  )
}

/** Jauge demi-cercle : arcs aversion / neutre / appétit, aiguille sur le score. */
function Gauge({ score, zone }: { score: number; zone: SentimentZone }) {
  const cx = 120
  const cy = 118
  const r = 96
  // angle : 180° (gauche, 0) → 0° (droite, 100)
  const point = (v: number, radius = r) => {
    const a = Math.PI - (v / 100) * Math.PI
    return { x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) }
  }
  const arc = (from: number, to: number) => {
    const p1 = point(from)
    const p2 = point(to)
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`
  }
  const needle = point(score, r - 18)
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 140" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={`Score ${Math.round(score)} sur 100, ${ZONE_LABEL[zone]}`}>
        <path d={arc(0, 39.5)} fill="none" stroke="var(--color-loss)" strokeWidth={12} strokeLinecap="butt" opacity={0.75} />
        <path d={arc(40.5, 59.5)} fill="none" stroke="var(--color-surface-3)" strokeWidth={12} />
        <path d={arc(60.5, 100)} fill="none" stroke="var(--color-profit)" strokeWidth={12} opacity={0.75} />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--color-text-1)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={6} fill="var(--color-surface-1)" stroke="var(--color-text-1)" strokeWidth={2} />
        <text x={point(0).x} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: 'var(--color-text-3)' }}>0</text>
        <text x={point(100).x} y={cy + 16} textAnchor="middle" style={{ fontFamily: 'var(--font-data)', fontSize: 9, fill: 'var(--color-text-3)' }}>100</text>
      </svg>
      <div style={{ ...mono, fontSize: 44, fontWeight: 700, color: 'var(--color-text-1)', lineHeight: 1, marginTop: -6 }}>{Math.round(score)}</div>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ZONE_COLOR[zone], marginTop: 6 }}>
        {ZONE_LABEL[zone]}
      </div>
    </div>
  )
}
