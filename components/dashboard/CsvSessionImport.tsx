'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ═══════════════════════════════════════════════════════════════
// CSV → Trading sessions import wizard
// ═══════════════════════════════════════════════════════════════
// A CSV of individual trades is uploaded, mapped to columns
// (Date + P&L are required, Instrument optional), aggregated by
// session_date, checked against existing sessions for duplicates,
// then bulk-inserted / updated into trading_sessions.

interface Props {
  existingDates: string[]
  onClose: () => void
  onImported: () => void
}

type Step = 'upload' | 'mapping' | 'preview' | 'dedup' | 'importing' | 'done'

interface ParsedCsv {
  headers: string[]
  rows: string[][]
  delimiter: string
  fileName: string
}

type FieldKey = 'date' | 'pnl' | 'instrument'

interface Mapping {
  date: number | null
  pnl: number | null
  instrument: number | null
  dateFormat: DateFormat
}

type DateFormat = 'auto' | 'iso' | 'dmy' | 'mdy' | 'ymd'

interface AggregatedSession {
  session_date: string
  pnl: number
  trades_count: number
  instrument: string
  wins: number
  losses: number
  breakevens: number
}

type DupStrategy = 'skip' | 'replace' | 'add'

// ── CSV parsing ────────────────────────────────────────

const DELIMS = [',', ';', '\t', '|']

function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find(l => l.trim().length > 0) || ''
  let best = ','
  let max = 0
  for (const d of DELIMS) {
    const count = (line.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length
    if (count > max) { max = count; best = d }
  }
  return best
}

function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const delim = delimiter || detectDelimiter(clean)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === delim) { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else { field += c }
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  const nonEmpty = rows.filter(r => r.length > 1 || (r[0] && r[0].trim() !== ''))
  const headers = (nonEmpty[0] || []).map(h => h.trim())
  const dataRows = nonEmpty.slice(1)
  return { headers, rows: dataRows, delimiter: delim, fileName: '' }
}

// ── Field guessing ─────────────────────────────────────

const GUESS_MAP: Record<FieldKey, string[]> = {
  date: [
    'date', 'trade date', 'entry date', 'exit date', 'timestamp',
    'time', 'filled time', 'closed time', 'close time', 'closed at',
    'date de trade', 'date entrée', 'datetime', 'jour',
  ],
  pnl: [
    'p&l', 'pnl', 'p/l', 'profit', 'net p&l', 'net pnl', 'net profit',
    'realized p&l', 'realized pnl', 'gross p&l', 'gain', 'gain/perte',
    'net', 'result', 'résultat', 'resultat', 'profit/loss',
  ],
  instrument: [
    'symbol', 'instrument', 'ticker', 'contract', 'market', 'produit',
    'sous-jacent', 'asset',
  ],
}

function guessColumn(headers: string[], key: FieldKey): number | null {
  const lower = headers.map(h => h.toLowerCase().trim())
  const candidates = GUESS_MAP[key]
  for (const cand of candidates) {
    const exact = lower.indexOf(cand)
    if (exact >= 0) return exact
  }
  for (let i = 0; i < lower.length; i++) {
    for (const cand of candidates) {
      if (lower[i].includes(cand)) return i
    }
  }
  return null
}

// ── Value parsing ──────────────────────────────────────

function parsePnl(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null
  let neg = false
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[$€£¥\s]/g, '').replace(/[+]/g, '')
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

function parseDate(raw: string, format: DateFormat): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  const datePart = s.split(/[T\s]/)[0]

  const tryIso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart)
  if (tryIso && (format === 'auto' || format === 'iso' || format === 'ymd')) {
    const [, y, m, d] = tryIso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const slash = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/.exec(datePart)
  if (slash) {
    const [, a, b, c] = slash
    const year = c.length === 2 ? `20${c}` : c
    let dd: string, mm: string
    if (format === 'mdy') { mm = a; dd = b }
    else if (format === 'dmy') { dd = a; mm = b }
    else {
      const na = Number(a), nb = Number(b)
      if (na > 12) { dd = a; mm = b }
      else if (nb > 12) { mm = a; dd = b }
      else { dd = a; mm = b }
    }
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  const ymdReverse = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/.exec(datePart)
  if (ymdReverse) {
    const [, y, m, d] = ymdReverse
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

// ── Aggregation ────────────────────────────────────────

function aggregate(rows: string[][], mapping: Mapping): { aggregated: AggregatedSession[]; skipped: number } {
  const bucket: Record<string, AggregatedSession & { _instruments: Record<string, number> }> = {}
  let skipped = 0
  for (const r of rows) {
    if (mapping.date == null || mapping.pnl == null) { skipped++; continue }
    const date = parseDate(r[mapping.date] || '', mapping.dateFormat)
    const pnl = parsePnl(r[mapping.pnl] || '')
    if (!date || pnl == null) { skipped++; continue }
    const instrument = mapping.instrument != null ? (r[mapping.instrument] || '').trim() : ''
    if (!bucket[date]) {
      bucket[date] = {
        session_date: date, pnl: 0, trades_count: 0, instrument: '',
        wins: 0, losses: 0, breakevens: 0, _instruments: {},
      }
    }
    const b = bucket[date]
    b.pnl += pnl
    b.trades_count += 1
    if (pnl > 0) b.wins++
    else if (pnl < 0) b.losses++
    else b.breakevens++
    if (instrument) b._instruments[instrument] = (b._instruments[instrument] || 0) + 1
  }
  const aggregated = Object.values(bucket).map(b => {
    const insts = Object.entries(b._instruments).sort((a, z) => z[1] - a[1])
    const primary = insts[0]?.[0] || ''
    const extras = insts.slice(1).length
    return {
      session_date: b.session_date,
      pnl: Math.round(b.pnl * 100) / 100,
      trades_count: b.trades_count,
      instrument: extras > 0 ? `${primary} +${extras}` : primary,
      wins: b.wins,
      losses: b.losses,
      breakevens: b.breakevens,
    }
  }).sort((a, z) => a.session_date.localeCompare(z.session_date))
  return { aggregated, skipped }
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function CsvSessionImport({ existingDates, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<Mapping>({ date: null, pnl: null, instrument: null, dateFormat: 'auto' })
  const [dupStrategy, setDupStrategy] = useState<DupStrategy>('skip')
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)

  const supabase = createClient()

  const handleFile = async (file: File) => {
    setImportError(null)
    try {
      const text = await file.text()
      const p = parseCsv(text)
      p.fileName = file.name
      setParsed(p)
      setMapping({
        date: guessColumn(p.headers, 'date'),
        pnl: guessColumn(p.headers, 'pnl'),
        instrument: guessColumn(p.headers, 'instrument'),
        dateFormat: 'auto',
      })
      setStep('mapping')
    } catch (e) {
      setImportError(`Erreur de lecture : ${(e as Error).message}`)
    }
  }

  const aggregation = useMemo(() => {
    if (!parsed || mapping.date == null || mapping.pnl == null) return null
    return aggregate(parsed.rows, mapping)
  }, [parsed, mapping])

  const dupDates = useMemo(() => {
    if (!aggregation) return new Set<string>()
    const set = new Set(existingDates)
    return new Set(aggregation.aggregated.filter(a => set.has(a.session_date)).map(a => a.session_date))
  }, [aggregation, existingDates])

  const gotoPreview = () => {
    if (!aggregation) return
    setSelectedDates(new Set(aggregation.aggregated.map(a => a.session_date)))
    setStep('preview')
  }

  const gotoDedup = () => setStep(dupDates.size > 0 ? 'dedup' : 'importing')

  const runImport = async () => {
    if (!aggregation) return
    setStep('importing')
    setImportError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setImportError('Non authentifié'); return }

    const toInsert = aggregation.aggregated.filter(a => selectedDates.has(a.session_date))
    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const sess of toInsert) {
      const isDup = dupDates.has(sess.session_date)
      if (isDup && dupStrategy === 'skip') { skipped++; continue }

      const result: 'win' | 'loss' | 'breakeven' = sess.pnl > 0 ? 'win' : sess.pnl < 0 ? 'loss' : 'breakeven'
      const winRate = sess.trades_count > 0 ? Math.round((sess.wins / sess.trades_count) * 100) : 0
      const setupJson = JSON.stringify({
        session_type: 'Live',
        win_rate: winRate,
        imported_from_csv: true,
        source_file: parsed?.fileName || null,
        breakdown: { wins: sess.wins, losses: sess.losses, breakevens: sess.breakevens },
      })
      const notesLine = `Import CSV — ${sess.trades_count} trades (${sess.wins}W / ${sess.losses}L${sess.breakevens > 0 ? ` / ${sess.breakevens}BE` : ''})`

      if (isDup && dupStrategy === 'replace') {
        const { error } = await supabase.from('trading_sessions')
          .delete()
          .eq('trader_id', user.id)
          .eq('session_date', sess.session_date)
        if (error) { setImportError(error.message); return }
      }

      if (isDup && dupStrategy === 'add') {
        const { data: existing } = await supabase.from('trading_sessions')
          .select('id, pnl, trades_count, setup')
          .eq('trader_id', user.id)
          .eq('session_date', sess.session_date)
          .limit(1)
          .maybeSingle()
        if (existing) {
          let existingMeta: Record<string, unknown> = {}
          try { existingMeta = existing.setup ? JSON.parse(existing.setup) : {} } catch { /* keep empty */ }
          const mergedTrades = Number(existing.trades_count) + sess.trades_count
          const mergedPnl = Math.round((Number(existing.pnl) + sess.pnl) * 100) / 100
          const mergedResult: 'win' | 'loss' | 'breakeven' = mergedPnl > 0 ? 'win' : mergedPnl < 0 ? 'loss' : 'breakeven'
          const { error } = await supabase.from('trading_sessions')
            .update({
              pnl: mergedPnl,
              trades_count: mergedTrades,
              result: mergedResult,
              setup: JSON.stringify({ ...existingMeta, merged_with_csv: true, source_file: parsed?.fileName || null }),
            })
            .eq('id', existing.id)
          if (error) { setImportError(error.message); return }
          updated++
          continue
        }
      }

      const { error } = await supabase.from('trading_sessions').insert({
        trader_id: user.id,
        session_date: sess.session_date,
        pnl: sess.pnl,
        result,
        trades_count: sess.trades_count,
        instrument: sess.instrument || null,
        setup: setupJson,
        notes: notesLine,
      })
      if (error) { setImportError(error.message); return }
      if (isDup && dupStrategy === 'replace') updated++
      else inserted++
    }

    setImportedCount(inserted + updated + skipped)
    setStep('done')
    onImported()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border flex flex-col" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Import de sessions</div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Depuis un fichier CSV de trades</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5" style={{ color: 'var(--text3)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
          <div className="flex items-center gap-2">
            {(['upload', 'mapping', 'preview', 'dedup', 'importing'] as const).map((s, i, arr) => {
              const active = step === s
              const done = (arr as readonly Step[]).indexOf(step) > i || step === 'done'
              const label = { upload: 'Fichier', mapping: 'Colonnes', preview: 'Aperçu', dedup: 'Doublons', importing: 'Import' }[s]
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5 flex-1">
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? 'var(--color-profit)' : done ? 'rgba(var(--color-profit-rgb), 0.2)' : 'var(--bg2)',
                      color: active ? '#000' : done ? 'var(--color-profit)' : 'var(--text3)',
                      border: `1px solid ${active || done ? 'var(--color-profit)' : 'var(--border)'}`,
                      fontSize: 10, fontWeight: 700,
                    }}>{done ? '✓' : i + 1}</div>
                    <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text3)', fontWeight: active ? 600 : 500 }}>{label}</span>
                  </div>
                  {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: done ? 'var(--color-profit)' : 'var(--border)' }} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 overflow-y-auto flex-1">
          {step === 'upload' && <UploadStep onFile={handleFile} error={importError} />}
          {step === 'mapping' && parsed && (
            <MappingStep parsed={parsed} mapping={mapping} setMapping={setMapping} aggregation={aggregation} />
          )}
          {step === 'preview' && aggregation && (
            <PreviewStep
              aggregated={aggregation.aggregated}
              skipped={aggregation.skipped}
              dupDates={dupDates}
              selectedDates={selectedDates}
              setSelectedDates={setSelectedDates}
            />
          )}
          {step === 'dedup' && (
            <DedupStep dupCount={dupDates.size} strategy={dupStrategy} setStrategy={setDupStrategy} />
          )}
          {step === 'importing' && (
            <div className="py-8 text-center">
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Import en cours…</div>
            </div>
          )}
          {step === 'done' && (
            <div className="py-8 text-center space-y-2">
              <div style={{ fontSize: 36 }}>✅</div>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{importedCount} sessions traitées</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Ton dashboard a été mis à jour.</div>
            </div>
          )}
          {importError && step !== 'upload' && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(var(--color-loss-rgb), 0.1)', border: '1px solid rgba(var(--color-loss-rgb), 0.3)', borderRadius: 8, fontSize: 11, color: '#fca5a5' }}>
              {importError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => {
              if (step === 'mapping') setStep('upload')
              else if (step === 'preview') setStep('mapping')
              else if (step === 'dedup') setStep('preview')
              else onClose()
            }}
            disabled={step === 'upload' || step === 'importing' || step === 'done'}
            className="px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)',
              cursor: (step === 'upload' || step === 'importing' || step === 'done') ? 'not-allowed' : 'pointer',
              opacity: (step === 'upload' || step === 'importing' || step === 'done') ? 0.4 : 1,
            }}
          >
            ← Retour
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
              {step === 'done' ? 'Fermer' : 'Annuler'}
            </button>
            {step === 'mapping' && (
              <button
                onClick={gotoPreview}
                disabled={mapping.date == null || mapping.pnl == null || !aggregation || aggregation.aggregated.length === 0}
                className="px-4 py-2 rounded-lg text-xs font-bold"
                style={{
                  background: (mapping.date != null && mapping.pnl != null && aggregation && aggregation.aggregated.length > 0) ? 'var(--color-accent)' : 'var(--bg3)',
                  color: (mapping.date != null && mapping.pnl != null && aggregation && aggregation.aggregated.length > 0) ? '#000' : 'var(--text3)',
                  cursor: (mapping.date != null && mapping.pnl != null && aggregation && aggregation.aggregated.length > 0) ? 'pointer' : 'not-allowed',
                }}
              >
                Aperçu →
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={gotoDedup}
                disabled={selectedDates.size === 0}
                className="px-4 py-2 rounded-lg text-xs font-bold"
                style={{ background: selectedDates.size > 0 ? 'var(--color-accent)' : 'var(--bg3)', color: selectedDates.size > 0 ? '#000' : 'var(--text3)', cursor: selectedDates.size > 0 ? 'pointer' : 'not-allowed' }}
              >
                {dupDates.size > 0 ? `Gérer ${dupDates.size} doublon${dupDates.size > 1 ? 's' : ''} →` : `Importer ${selectedDates.size} sessions`}
              </button>
            )}
            {step === 'dedup' && (
              <button onClick={runImport} className="px-4 py-2 rounded-lg text-xs font-bold" style={{ background: 'var(--color-accent)', color: '#000', cursor: 'pointer' }}>
                Importer {selectedDates.size} sessions
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Steps
// ═══════════════════════════════════════════════════════════════

function UploadStep({ onFile, error }: { onFile: (f: File) => void; error: string | null }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-profit)' : 'var(--border)'}`,
          background: dragOver ? 'rgba(var(--color-profit-rgb), 0.05)' : 'var(--bg3)',
          borderRadius: 12, padding: 40, textAlign: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>Glisse ton fichier CSV ici</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>ou clique pour parcourir</div>
        <label className="inline-block px-4 py-2 rounded-lg cursor-pointer" style={{ background: 'var(--color-accent)', color: '#000', fontSize: 11, fontWeight: 700 }}>
          Choisir un fichier
          <input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} style={{ display: 'none' }} />
        </label>
      </div>
      <div style={{ padding: 12, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Formats acceptés :</strong> CSV trade-par-trade exporté depuis ton broker (Tradovate, NinjaTrader, Topstep, TradingView, MT4/MT5, IBKR, etc.). Les trades seront regroupés par date pour former des sessions.
      </div>
      {error && (
        <div style={{ padding: 10, background: 'rgba(var(--color-loss-rgb), 0.1)', border: '1px solid rgba(var(--color-loss-rgb), 0.3)', borderRadius: 8, fontSize: 11, color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  )
}

function MappingStep({
  parsed, mapping, setMapping, aggregation,
}: {
  parsed: ParsedCsv
  mapping: Mapping
  setMapping: (m: Mapping) => void
  aggregation: { aggregated: AggregatedSession[]; skipped: number } | null
}) {
  const optionEls = parsed.headers.map((h, i) => (
    <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>
  ))
  const set = (patch: Partial<Mapping>) => setMapping({ ...mapping, ...patch })

  return (
    <div className="space-y-4">
      <div style={{ padding: 10, background: 'var(--bg3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)' }}>
        <strong style={{ color: 'var(--text)' }}>{parsed.fileName}</strong> · {parsed.rows.length} trades détectés · délimiteur <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{parsed.delimiter === '\t' ? '⇥ tabulation' : parsed.delimiter}</code>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MapField label="Date du trade" required value={mapping.date} onChange={v => set({ date: v })} options={optionEls} preview={mapping.date != null ? parsed.rows[0]?.[mapping.date] : undefined} />
        <MapField label="P&L (€ ou $)" required value={mapping.pnl} onChange={v => set({ pnl: v })} options={optionEls} preview={mapping.pnl != null ? parsed.rows[0]?.[mapping.pnl] : undefined} />
        <MapField label="Instrument / Symbole" value={mapping.instrument} onChange={v => set({ instrument: v })} options={optionEls} preview={mapping.instrument != null ? parsed.rows[0]?.[mapping.instrument] : undefined} allowNone />
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Format de date</label>
          <select value={mapping.dateFormat} onChange={e => set({ dateFormat: e.target.value as DateFormat })} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="auto">Auto-détection</option>
            <option value="iso">ISO — 2024-03-15</option>
            <option value="dmy">Français — 15/03/2024</option>
            <option value="mdy">US — 03/15/2024</option>
          </select>
        </div>
      </div>

      {aggregation && (
        <div style={{ padding: 12, background: 'rgba(var(--color-profit-rgb), 0.05)', border: '1px solid rgba(var(--color-profit-rgb), 0.2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>
            ✓ {aggregation.aggregated.length} session{aggregation.aggregated.length > 1 ? 's' : ''} détectée{aggregation.aggregated.length > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
            {parsed.rows.length - aggregation.skipped} trades regroupés
            {aggregation.skipped > 0 && ` · ${aggregation.skipped} lignes ignorées (date ou P&L manquant)`}
          </div>
        </div>
      )}
    </div>
  )
}

function MapField({
  label, required, value, onChange, options, preview, allowNone,
}: {
  label: string
  required?: boolean
  value: number | null
  onChange: (v: number | null) => void
  options: React.ReactNode
  preview?: string
  allowNone?: boolean
}) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label} {required && <span style={{ color: 'var(--color-loss)' }}>*</span>}
      </label>
      <select
        value={value == null ? '' : value}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg text-xs outline-none"
        style={{ background: 'var(--bg3)', border: `1px solid ${value == null && required ? 'rgba(var(--color-loss-rgb), 0.5)' : 'var(--border)'}`, color: 'var(--text)' }}
      >
        {(allowNone || !required) && <option value="">— Ne pas mapper —</option>}
        {options}
      </select>
      {preview && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontFamily: 'monospace' }}>
          Exemple : <span style={{ color: 'var(--text2)' }}>{preview}</span>
        </div>
      )}
    </div>
  )
}

function PreviewStep({
  aggregated, skipped, dupDates, selectedDates, setSelectedDates,
}: {
  aggregated: AggregatedSession[]
  skipped: number
  dupDates: Set<string>
  selectedDates: Set<string>
  setSelectedDates: (s: Set<string>) => void
}) {
  const toggle = (date: string) => {
    const next = new Set(selectedDates)
    if (next.has(date)) next.delete(date); else next.add(date)
    setSelectedDates(next)
  }
  const toggleAll = () => {
    if (selectedDates.size === aggregated.length) setSelectedDates(new Set())
    else setSelectedDates(new Set(aggregated.map(a => a.session_date)))
  }
  const totalPnl = aggregated.filter(a => selectedDates.has(a.session_date)).reduce((s, a) => s + a.pnl, 0)
  const totalTrades = aggregated.filter(a => selectedDates.has(a.session_date)).reduce((s, a) => s + a.trades_count, 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <PreviewKpi label="Sessions" value={String(selectedDates.size)} />
        <PreviewKpi label="Trades" value={String(totalTrades)} />
        <PreviewKpi label="P&L cumulé" value={`${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)'} />
        <PreviewKpi label="Doublons détectés" value={String([...dupDates].filter(d => selectedDates.has(d)).length)} color={dupDates.size > 0 ? 'var(--color-warn)' : 'var(--text2)'} />
      </div>

      {skipped > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text3)', padding: 8, background: 'var(--bg3)', borderRadius: 6 }}>
          ⚠ {skipped} ligne{skipped > 1 ? 's' : ''} du CSV ignorée{skipped > 1 ? 's' : ''} (date ou P&L invalide).
        </div>
      )}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg3)' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={toggleAll} className="text-xs font-semibold" style={{ color: 'var(--green)', cursor: 'pointer' }}>
            {selectedDates.size === aggregated.length ? 'Tout décocher' : 'Tout cocher'} ({aggregated.length})
          </button>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
            <span style={{ color: 'var(--color-warn)' }}>●</span> Doublon avec session existante
          </div>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="w-full text-xs">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}></th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Trades</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>P&L</th>
                <th style={thStyle}>W/L/BE</th>
                <th style={thStyle}>Instrument</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map(a => {
                const isDup = dupDates.has(a.session_date)
                const isSel = selectedDates.has(a.session_date)
                return (
                  <tr key={a.session_date} style={{ borderBottom: '1px solid var(--border)', opacity: isSel ? 1 : 0.4 }}>
                    <td style={{ padding: '6px 10px' }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(a.session_date)} style={{ accentColor: 'var(--color-profit)', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text)', fontFamily: 'monospace' }}>
                      {isDup && <span style={{ color: 'var(--color-warn)', marginRight: 4 }}>●</span>}
                      {new Date(a.session_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text2)', fontFamily: 'monospace' }}>{a.trades_count}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: a.pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                      {a.pnl >= 0 ? '+' : ''}{a.pnl.toFixed(2)}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: 10 }}>
                      <span style={{ color: 'var(--color-profit)' }}>{a.wins}</span>/<span style={{ color: 'var(--color-loss)' }}>{a.losses}</span>{a.breakevens > 0 ? <>/<span style={{ color: 'var(--text3)' }}>{a.breakevens}</span></> : null}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text2)' }}>{a.instrument || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 10,
  color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
}

function PreviewKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text)', marginTop: 2, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function DedupStep({
  dupCount, strategy, setStrategy,
}: {
  dupCount: number
  strategy: DupStrategy
  setStrategy: (s: DupStrategy) => void
}) {
  const options: { id: DupStrategy; title: string; desc: string; icon: string }[] = [
    { id: 'skip', title: 'Ignorer', desc: 'Garder les sessions existantes intactes, ne rien importer pour ces dates.', icon: '⏭' },
    { id: 'replace', title: 'Remplacer', desc: 'Supprimer les sessions existantes et les recréer depuis le CSV.', icon: '🔄' },
    { id: 'add', title: 'Additionner', desc: 'Ajouter le P&L et le nombre de trades du CSV à la session existante (utile si tu tradais sur plusieurs comptes).', icon: '➕' },
  ]
  return (
    <div className="space-y-3">
      <div style={{ padding: 12, background: 'rgba(var(--color-warn-rgb), 0.08)', border: '1px solid rgba(var(--color-warn-rgb), 0.3)', borderRadius: 8, fontSize: 11, color: 'var(--text2)' }}>
        ⚠ <strong style={{ color: 'var(--color-warn)' }}>{dupCount} session{dupCount > 1 ? 's' : ''}</strong> existe{dupCount > 1 ? 'nt' : ''} déjà pour ces dates. Choisis comment les gérer :
      </div>
      <div className="space-y-2">
        {options.map(o => {
          const active = strategy === o.id
          return (
            <label key={o.id} className="flex items-start gap-3 cursor-pointer" style={{
              padding: 12, borderRadius: 8,
              background: active ? 'rgba(var(--color-profit-rgb), 0.05)' : 'var(--bg3)',
              border: `1px solid ${active ? 'var(--color-profit)' : 'var(--border)'}`,
              transition: 'all 0.15s ease',
            }}>
              <input type="radio" name="dup" checked={active} onChange={() => setStrategy(o.id)} className="mt-0.5" style={{ accentColor: 'var(--color-profit)', cursor: 'pointer' }} />
              <div className="flex-1">
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--color-profit)' : 'var(--text)' }}>{o.icon} {o.title}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}>{o.desc}</div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
