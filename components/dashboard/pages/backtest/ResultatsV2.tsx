'use client'

/**
 * Backtest V2 — Résultats (maquette docs/backtest-v2/Resultats.dc.html).
 * Visible pour les emails de BACKTEST_V2_TESTERS.
 *
 * - Filtres : instrument, du / au, sens
 * - 6 KPI : backtests, taux de réussite (+ W/L/BE), R moyen, R total,
 *   profit factor ("—" sans perte), pire série de pertes.
 * - Courbe des R cumulés (SVG polyline, chronologique).
 * - "Analyser par" : catégories trader (y compris masquées si données)
 *   + Sens / Instrument / Jour de la semaine. Pour les paired : mode
 *   Élément / Unité / Combinaison. Alerte "Échantillon faible" < 10,
 *   case "Masquer les échantillons faibles", note multi.
 * - Meilleures combinaisons (zones + signal exacts) : top 3, min 10.
 * - Historique paginé en bas : Modifier (déclenche onEdit → switch
 *   onglet Saisie en mode édition), Supprimer.
 *
 * Lecture seule : parseLegacyEntry côté client traite les anciens
 * backtests sans criteria pour qu'ils s'agrègent et s'affichent
 * normalement même avant que le backfill serveur soit lancé.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  analyzeBy, profitFactor, worstLossStreak, cumulativeR,
  topCombinations, parseLegacyEntry, enrichDerivedDimensions,
  legacyZoneLabel, legacySignalLabel, legacyFibonacciLabel,
  timeframeLabel, MIN_TRADES_FOR_SIGNAL,
  type AnalyzeMode, type AnalyzeRow, type BacktestEntry,
  type CategorySelection, type CriteriaMap, type PairedValue,
} from '@/lib/backtest/criteria'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string
  key: string
  label: string
  selection: CategorySelection
  timeframes: string[]
  position: number
  hidden: boolean
}

interface BacktestRow {
  id: string
  trader_id: string
  date: string
  instrument: string
  direction: 'LONG' | 'SHORT'
  setup_types: string[] | null
  signals: string[] | null
  has_confluence: boolean
  r_result: number
  result: 'win' | 'loss' | 'be'
  notes: string | null
  image_url: string | null
  criteria: CriteriaMap | null
  created_at: string
}

type DirectionFilter = 'all' | 'LONG' | 'SHORT'

const INSTRUMENTS = ['ES', 'NQ', 'MNQ', 'YM', 'MYM', 'GC', 'MGC']

// ─── Catégories dérivées (préfixe `_`) exposées côté "Analyser par" ─────────

interface DerivedCategory {
  key: string
  label: string
  selection: 'single'
}
const DERIVED_CATEGORIES: ReadonlyArray<DerivedCategory> = [
  { key: '_sens',       label: 'Sens',               selection: 'single' },
  { key: '_instrument', label: 'Instrument',          selection: 'single' },
  { key: '_jour',       label: 'Jour de la semaine',  selection: 'single' },
]

// ─── Styles ─────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 20,
  display: 'flex', flexDirection: 'column', gap: 16,
}
const kpiStyle: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 6,
}
const kpiLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text3)' }
const kpiValue: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 26, fontWeight: 600,
}
const inputStyle: React.CSSProperties = {
  height: 42, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--text)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
}
const modeBtn = (active: boolean): React.CSSProperties => ({
  height: 34, padding: '0 12px', borderRadius: 7,
  border: `1px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
  background: active ? 'rgba(var(--color-accent-rgb), 0.14)' : 'transparent',
  color: active ? 'var(--color-accent)' : 'var(--text3)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})

// ─── Formatage FR ──────────────────────────────────────────────────────────

function fmtR(n: number, decimals = 1): string {
  const abs = Math.abs(n)
  const body = Number.isInteger(abs) ? `${abs}` : abs.toFixed(decimals).replace('.', ',')
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '')
  return n < 0 ? `-${body}` : `${sign}${body}`
}
function colorForR(n: number): string {
  if (n > 0) return 'var(--color-profit)'
  if (n < 0) return 'var(--color-loss)'
  return 'var(--text2)'
}

// ─── Composant principal ───────────────────────────────────────────────────

interface Props {
  onEdit?(id: string): void
}

export default function ResultatsV2({ onEdit }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [rows, setRows] = useState<BacktestRow[]>([])
  const [loading, setLoading] = useState(true)

  // Filtres
  const [fInstrument, setFInstrument] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fDirection, setFDirection] = useState<DirectionFilter>('all')

  // Analyser par
  const [analyzeKey, setAnalyzeKey] = useState<string>('')
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>('element')
  const [hideLow, setHideLow] = useState(false)

  // Historique
  const PAGE_SIZE = 10
  const [page, setPage] = useState(0)

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const [catsRes, btsRes] = await Promise.all([
      fetch('/api/backtest/criteria').then(r => r.ok ? r.json() : { categories: [] }),
      supabase.from('backtests')
        .select('id, trader_id, date, instrument, direction, setup_types, signals, has_confluence, r_result, result, notes, image_url, criteria, created_at')
        .eq('trader_id', user.id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    setCats((catsRes.categories as CategoryRow[]) ?? [])
    setRows((btsRes.data as BacktestRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { refresh() }, [refresh])

  // Choisir la 1re catégorie disponible à l'ouverture
  useEffect(() => {
    if (!analyzeKey && cats.length > 0) {
      setAnalyzeKey(cats[0].key)
      if (cats[0].selection === 'paired') setAnalyzeMode('element')
    }
  }, [cats, analyzeKey])

  // ─── Filtres appliqués ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fInstrument && r.instrument !== fInstrument) return false
      if (fFrom && r.date < fFrom) return false
      if (fTo && r.date > fTo) return false
      if (fDirection !== 'all' && r.direction !== fDirection) return false
      return true
    })
  }, [rows, fInstrument, fFrom, fTo, fDirection])

  // Enrichi avec parseLegacyEntry (pour anciens backtests) + dimensions
  const enriched: BacktestEntry[] = useMemo(() => {
    return filtered.map((r) => enrichDerivedDimensions({
      id: r.id,
      criteria: parseLegacyEntry({
        setup_types: r.setup_types, signals: r.signals, criteria: r.criteria,
      }),
      result: r.result,
      r_result: Number(r.r_result) || 0,
      date: r.date,
      instrument: r.instrument,
      direction: r.direction,
    }))
  }, [filtered])

  // ─── KPI ────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const n = enriched.length
    const wins = enriched.filter((e) => e.result === 'win').length
    const losses = enriched.filter((e) => e.result === 'loss').length
    const bes = enriched.filter((e) => e.result === 'be').length
    const winRate = n > 0 ? Math.round((wins / n) * 100) : 0
    const sumR = enriched.reduce((s, e) => s + (Number(e.r_result) || 0), 0)
    const totalR = Math.round(sumR * 100) / 100
    const avgR = n > 0 ? Math.round((sumR / n) * 100) / 100 : 0
    const pf = profitFactor(enriched)
    const streak = worstLossStreak(enriched)
    return { n, wins, losses, bes, winRate, totalR, avgR, pf, streak }
  }, [enriched])

  // ─── Catégorie en cours d'analyse ───────────────────────────────────────
  const allCategoriesForAnalyze: Array<{ key: string; label: string; selection: CategorySelection }> = useMemo(() => {
    // On garde même les catégories masquées (si elles ont des données)
    return [
      ...cats.map((c) => ({ key: c.key, label: c.label, selection: c.selection })),
      ...DERIVED_CATEGORIES,
    ]
  }, [cats])

  const currentCat = allCategoriesForAnalyze.find((c) => c.key === analyzeKey)

  // ─── Analyze ────────────────────────────────────────────────────────────
  const analyzed = useMemo(() => {
    if (!currentCat) return [] as AnalyzeRow[]
    const r = analyzeBy(enriched, currentCat.key, currentCat.selection, analyzeMode)
    // Libellés enrichis pour l'affichage (ex: "" → "Non précisée" en TF)
    return r.map((row) => {
      if (currentCat.selection === 'paired' && analyzeMode === 'timeframe') {
        return { ...row, label: timeframeLabel(row.key) }
      }
      return row
    })
  }, [enriched, currentCat, analyzeMode])

  const analyzedFiltered = hideLow ? analyzed.filter((r) => !r.insufficient) : analyzed

  // ─── Combinaisons ───────────────────────────────────────────────────────
  const combos = useMemo(() => topCombinations(enriched), [enriched])

  // ─── Historique paginé ─────────────────────────────────────────────────
  const historyAll = useMemo(() => {
    // Chrono décroissant pour l'historique (dernier en haut).
    return [...filtered].reverse()
  }, [filtered])
  const pageCount = Math.max(1, Math.ceil(historyAll.length / PAGE_SIZE))
  const pageRows = historyAll.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function deleteEntry(id: string) {
    if (!confirm('Supprimer ce backtest ?')) return
    await supabase.from('backtests').delete().eq('id', id)
    await refresh()
  }

  if (loading) {
    return <div style={{ padding: '32px 0', color: 'var(--text3)' }}>Chargement…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Filtres ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="f-inst" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Instrument</label>
          <select id="f-inst" value={fInstrument} onChange={e => setFInstrument(e.target.value)}
            style={{ ...inputStyle, minWidth: 140 }}>
            <option value="">Tous</option>
            {INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="f-du" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Du</label>
          <input id="f-du" type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
            style={{ ...inputStyle, width: 160 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="f-au" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Au</label>
          <input id="f-au" type="date" value={fTo} onChange={e => setFTo(e.target.value)}
            style={{ ...inputStyle, width: 160 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Sens</span>
          <div style={{ display: 'inline-flex', gap: 4, padding: 3, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)' }}>
            {(['all', 'LONG', 'SHORT'] as DirectionFilter[]).map((d) => (
              <button key={d} type="button" aria-pressed={fDirection === d}
                onClick={() => setFDirection(d)}
                style={modeBtn(fDirection === d)}>
                {d === 'all' ? 'Tous' : d === 'LONG' ? 'Achat' : 'Vente'}
              </button>
            ))}
          </div>
        </div>
        {(fInstrument || fFrom || fTo || fDirection !== 'all') && (
          <button type="button"
            onClick={() => { setFInstrument(''); setFFrom(''); setFTo(''); setFDirection('all') }}
            style={{
              height: 42, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            }}>Reset filtres</button>
        )}
      </div>

      {/* ─── 6 KPI ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div style={kpiStyle}>
          <span style={kpiLabel}>Backtests</span>
          <span style={kpiValue}>{kpi.n}</span>
        </div>
        <div style={kpiStyle}>
          <span style={kpiLabel}>Taux de réussite</span>
          <span style={kpiValue}>{kpi.winRate} %</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {kpi.wins} gagnants · {kpi.losses} perdants · {kpi.bes} BE
          </span>
        </div>
        <div style={kpiStyle}>
          <span style={kpiLabel}>R moyen</span>
          <span style={{ ...kpiValue, color: colorForR(kpi.avgR) }}>{fmtR(kpi.avgR, 2)} R</span>
        </div>
        <div style={kpiStyle}>
          <span style={kpiLabel}>R total</span>
          <span style={{ ...kpiValue, color: colorForR(kpi.totalR) }}>{fmtR(kpi.totalR, 1)} R</span>
        </div>
        <div style={kpiStyle}>
          <span style={kpiLabel}>Profit factor</span>
          <span style={kpiValue}>{kpi.pf == null ? '—' : kpi.pf.toString().replace('.', ',')}</span>
        </div>
        <div style={kpiStyle}>
          <span style={kpiLabel}>Pire série</span>
          <span style={{ ...kpiValue, color: kpi.streak > 0 ? 'var(--color-loss)' : 'var(--text2)' }}>
            {kpi.streak} perte{kpi.streak > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ─── Courbe des R cumulés ────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Courbe des R cumulés</h2>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {kpi.n} backtest{kpi.n > 1 ? 's' : ''}, du plus ancien au plus récent
          </span>
        </div>
        <CumulativeChart entries={enriched} total={kpi.totalR} />
      </section>

      {/* ─── Analyser par ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="analyse" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Analyser par</label>
              <select id="analyse" value={analyzeKey}
                onChange={(e) => {
                  setAnalyzeKey(e.target.value)
                  const c = allCategoriesForAnalyze.find((x) => x.key === e.target.value)
                  if (c?.selection === 'paired') setAnalyzeMode('element')
                }}
                style={{ ...inputStyle, minWidth: 220, border: '1px solid var(--color-accent)', fontWeight: 600 }}>
                {allCategoriesForAnalyze.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            {currentCat?.selection === 'paired' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Regrouper par</span>
                <div style={{ display: 'inline-flex', gap: 4, padding: 3, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg3)' }}>
                  <button type="button" aria-pressed={analyzeMode === 'element'}
                    onClick={() => setAnalyzeMode('element')} style={modeBtn(analyzeMode === 'element')}>Élément</button>
                  <button type="button" aria-pressed={analyzeMode === 'timeframe'}
                    onClick={() => setAnalyzeMode('timeframe')} style={modeBtn(analyzeMode === 'timeframe')}>Unité de temps</button>
                  <button type="button" aria-pressed={analyzeMode === 'pair'}
                    onClick={() => setAnalyzeMode('pair')} style={modeBtn(analyzeMode === 'pair')}>Combinaison exacte</button>
                </div>
              </div>
            )}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={hideLow} onChange={(e) => setHideLow(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
            Masquer les échantillons faibles
          </label>
        </div>

        <AnalyzeTable rows={analyzedFiltered} />

        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {currentCat?.selection === 'multi'
            ? 'Un trade peut compter dans plusieurs lignes. '
            : currentCat?.selection === 'paired' && analyzeMode !== 'pair'
              ? 'Un trade avec plusieurs paires compte dans plusieurs lignes. '
              : ''}
          En dessous de {MIN_TRADES_FOR_SIGNAL} trades, le résultat ne dit encore rien.
        </span>
      </section>

      {/* ─── Meilleures combinaisons ─────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tes meilleures combinaisons</h2>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            uniquement celles qui ont au moins {MIN_TRADES_FOR_SIGNAL} trades
          </span>
        </div>
        {combos.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>
            Il faut au moins {MIN_TRADES_FOR_SIGNAL} backtests sur une même combinaison.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {combos.map((c) => (
              <div key={c.key} style={{
                border: '1px solid var(--border)', borderRadius: 12, padding: 16,
                background: 'var(--bg3)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.tags.map((t, i) => (
                    <span key={`${c.key}-${i}`} style={{
                      height: 28, padding: '0 10px', borderRadius: 8,
                      background: 'rgba(var(--color-accent-rgb), 0.14)',
                      color: 'var(--color-accent)', fontSize: 12, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center',
                    }}>{t}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'ui-monospace', fontSize: 14 }}>
                  <span>{c.n} trades</span>
                  <span>{c.winRate} %</span>
                  <span style={{ color: colorForR(c.avgR), fontWeight: 600 }}>
                    {fmtR(c.avgR, 2)} R moyen
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Historique ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Historique</h2>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {historyAll.length} backtest{historyAll.length > 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text3)' }}>
                {['Date', 'Instr.', 'Sens', 'Setup', 'Issue', 'R', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const criteria = parseLegacyEntry({ setup_types: r.setup_types, signals: r.signals, criteria: r.criteria })
                const setupSummary = summarizeCriteria(criteria)
                const result = r.result
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 8px', fontFamily: 'ui-monospace', whiteSpace: 'nowrap' }}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg3)', fontSize: 11, fontWeight: 600 }}>{r.instrument}</span>
                    </td>
                    <td style={{ padding: '10px 8px', color: r.direction === 'LONG' ? 'var(--color-profit)' : 'var(--color-loss)', fontWeight: 700, fontSize: 12 }}>
                      {r.direction === 'LONG' ? 'Achat' : 'Vente'}
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text2)', fontSize: 12 }}>
                      {setupSummary || <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: result === 'win' ? 'rgba(var(--color-profit-rgb), 0.15)'
                          : result === 'loss' ? 'rgba(var(--color-loss-rgb), 0.15)'
                          : 'var(--bg3)',
                        color: result === 'win' ? 'var(--color-profit)'
                          : result === 'loss' ? 'var(--color-loss)'
                          : 'var(--text2)',
                      }}>
                        {result === 'win' ? 'Gagnant' : result === 'loss' ? 'Perdant' : 'BE'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', fontFamily: 'ui-monospace', fontWeight: 700, color: colorForR(Number(r.r_result) || 0) }}>
                      {fmtR(Number(r.r_result) || 0, 2)}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => onEdit?.(r.id)}
                        style={{
                          height: 30, padding: '0 10px', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginRight: 6,
                        }}>Modifier</button>
                      <button type="button" onClick={() => deleteEntry(r.id)}
                        aria-label="Supprimer"
                        style={{
                          height: 30, width: 30, borderRadius: 8,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: '#FF948A', cursor: 'pointer', fontFamily: 'inherit',
                        }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {historyAll.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Aucun backtest sur cette période.
          </div>
        )}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}
              style={{ ...inputStyle, height: 36, padding: '0 12px', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
              ← Précédent
            </button>
            <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text3)' }}>Page {page + 1} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}
              style={{ ...inputStyle, height: 36, padding: '0 12px', cursor: page >= pageCount - 1 ? 'default' : 'pointer', opacity: page >= pageCount - 1 ? 0.4 : 1 }}>
              Suivant →
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Résumé d'un backtest (colonne "Setup" de l'historique) ────────────────

function summarizeCriteria(c: CriteriaMap): string {
  const parts: string[] = []
  const zones = (c.zone as PairedValue[] | undefined) || []
  for (const z of zones) parts.push(legacyZoneLabel(z.element, z.timeframe))
  const fibos = (c.fibonacci as string[] | undefined) || []
  for (const f of fibos) parts.push(legacyFibonacciLabel(f))
  const sigs = (c.signal as PairedValue[] | undefined) || []
  for (const s of sigs) parts.push(legacySignalLabel(s.element, s.timeframe))
  const my = (c.my_setups as string[] | undefined) || []
  for (const m of my) parts.push(m)
  if (parts.length <= 3) return parts.join(', ')
  return parts.slice(0, 3).join(', ') + ` +${parts.length - 3}`
}

// ─── Courbe SVG ────────────────────────────────────────────────────────────

function CumulativeChart({ entries, total }: { entries: BacktestEntry[]; total: number }) {
  const points = useMemo(() => cumulativeR(entries), [entries])
  if (points.length === 0) {
    return (
      <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
        Aucune donnée sur la période sélectionnée.
      </div>
    )
  }
  // Normalisation SVG : viewBox 1000 × 200, y=0 en haut, y=200 en bas.
  // On aligne y=165.7 ≈ 0 R (ligne de référence pointillée).
  const vbW = 1000
  const vbH = 200
  const refY = 165.7
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.cum)))
  const xStep = points.length > 1 ? vbW / (points.length - 1) : 0
  const scaleY = (cum: number) => {
    // positif monte vers 0, négatif descend vers 200
    const headroom = vbH - refY - 10 // ~24
    const foot = refY - 10            // ~155
    return cum >= 0 ? refY - (cum / maxAbs) * foot : refY + (Math.abs(cum) / maxAbs) * headroom
  }
  const coords = points.map((p, i) => `${(i * xStep).toFixed(1)},${scaleY(p.cum).toFixed(1)}`).join(' ')
  const polygon = `0,${refY} ${coords} ${vbW},${refY}`
  return (
    <>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none" width="100%" height={200}
        role="img" aria-label={`Courbe des R cumulés : total ${fmtR(total, 1)} R sur ${points.length} backtests`}>
        <line x1={0} y1={refY} x2={vbW} y2={refY}
          stroke="var(--border)" strokeWidth={1} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <polygon points={polygon} fill="rgba(63,203,126,0.08)" stroke="none" />
        <polyline points={coords} fill="none" stroke={total >= 0 ? '#3FCB7E' : '#F06A5E'}
          strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'ui-monospace', fontSize: 12, color: 'var(--text3)' }}>
        <span>0 R</span>
        <span style={{ color: colorForR(total), fontWeight: 600 }}>{fmtR(total, 1)} R</span>
      </div>
    </>
  )
}

// ─── Table d'analyse ───────────────────────────────────────────────────────

function AnalyzeTable({ rows }: { rows: AnalyzeRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.totalR)))
  if (rows.length === 0) {
    return (
      <div style={{ color: 'var(--text3)', fontSize: 13, padding: '12px 0' }}>
        Aucune ligne sur cette dimension.
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 680, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 2fr) 80px 120px 100px 100px minmax(140px, 2fr)',
          gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)',
          fontSize: 12, fontWeight: 600, color: 'var(--text3)',
        }}>
          <span></span>
          <span style={{ textAlign: 'right' }}>Trades</span>
          <span style={{ textAlign: 'right' }}>Réussite</span>
          <span style={{ textAlign: 'right' }}>R moyen</span>
          <span style={{ textAlign: 'right' }}>R total</span>
          <span>Poids</span>
        </div>
        {rows.map((r) => {
          const barW = Math.round((Math.abs(r.totalR) / max) * 100)
          const low = r.insufficient
          return (
            <div key={r.key} style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 2fr) 80px 120px 100px 100px minmax(140px, 2fr)',
              gap: 12, alignItems: 'center', padding: 12, borderBottom: '1px solid var(--border)',
              color: low ? 'var(--text3)' : 'var(--text)',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: 600 }}>
                {r.label}
                {low && (
                  <span style={{
                    height: 22, padding: '0 8px', borderRadius: 6,
                    border: '1px solid var(--border)', color: 'var(--text3)',
                    fontSize: 11, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center',
                  }}>Échantillon faible</span>
                )}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 14 }}>{r.n}</span>
              <span style={{ textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 14 }}>{r.winRate} %</span>
              <span style={{ textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 14, color: low ? 'var(--text3)' : colorForR(r.avgR) }}>
                {fmtR(r.avgR, 2)} R
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 14, fontWeight: 600, color: low ? 'var(--text3)' : colorForR(r.totalR) }}>
                {fmtR(r.totalR, 1)} R
              </span>
              <span style={{ height: 8, borderRadius: 4, background: 'var(--bg3)', overflow: 'hidden', display: 'block' }}>
                <span style={{
                  display: 'block', height: 8, width: `${barW}%`, borderRadius: 4,
                  background: low ? 'var(--border)' : r.totalR >= 0 ? '#3FCB7E' : '#F06A5E',
                }} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
