'use client'

/**
 * Backtest V2 — nouvelle saisie (maquette docs/backtest-v2/Main.dc.html).
 * Visible uniquement pour les emails de BACKTEST_V2_TESTERS.
 *
 * Trois sections selon la maquette :
 *   1. Contexte  : date, instrument (7 ATP + "Autre"), sens Achat/Vente
 *   2. Setup     : critères du trader dans son ordre, sans masqués
 *                  * paired  : chip élément → row unités (grisées si prises)
 *                  * multi   : chips multi-sélection
 *                  * single  : chips exclusives
 *                  Badge "Confluence détectée : N éléments" + lien
 *   3. Résultat  : Gagnant/Perdant/BE, mode En R / En points, R calculé,
 *                  notes, capture d'écran
 *
 * Boutons : "Enregistrer et saisir le suivant" (garde date/instrument/sens),
 * "Enregistrer" (reset complet). Validation en français inline.
 *
 * Écriture : `criteria` (nouveau format) + double-écriture via
 * `projectToLegacy` dans setup_types/signals/has_confluence pour que les
 * stats du coach IA et de l'ancienne page continuent de tourner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  addPair, removePair, takenTimeframesForElement,
  computeRFromPoints, countConfluence,
  projectToLegacy, timeframeLabel,
  validateSaisie, isSaisieSubmittable, resolveR,
  readPaired, readMulti, readSingle,
  type CategorySelection, type CriteriaMap, type PairedValue,
  type SaisieDraft, type ResultMode,
} from '@/lib/backtest/criteria'

// ─── Types (lus depuis /api/backtest/criteria) ──────────────────────────────

interface CategoryRow {
  id: string
  key: string
  label: string
  selection: CategorySelection
  timeframes: string[]
  position: number
  hidden: boolean
}
interface OptionRow {
  id: string
  category_id: string
  value: string
  label: string
  origin: 'atp' | 'custom'
  hidden: boolean
  position: number
}

// ─── Catalogue instrument (identique à l'ancien) ────────────────────────────

const INSTRUMENTS = ['ES', 'NQ', 'MNQ', 'YM', 'MYM', 'GC', 'MGC']

// ─── Styles (tokens dashboard) ──────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 20,
  display: 'flex', flexDirection: 'column', gap: 18,
}
const stepBadgeStyle: React.CSSProperties = {
  width: 26, height: 26, borderRadius: '50%',
  background: 'rgba(var(--color-accent-rgb), 0.16)', color: 'var(--color-accent)',
  fontSize: 13, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text3)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--text)', padding: '0 14px', fontSize: 14, fontFamily: 'inherit',
}
const inputMono: React.CSSProperties = {
  ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const chipBase: React.CSSProperties = {
  height: 40, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text2)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit',
}
const chipMono: React.CSSProperties = {
  ...chipBase, minWidth: 52, padding: '0 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const chipActive: React.CSSProperties = {
  ...chipBase,
  border: '1px solid var(--color-accent)',
  background: 'rgba(var(--color-accent-rgb), 0.14)',
  color: 'var(--color-accent)', fontWeight: 600,
}
const chipMonoActive: React.CSSProperties = {
  ...chipMono,
  border: '1px solid var(--color-accent)',
  background: 'rgba(var(--color-accent-rgb), 0.14)',
  color: 'var(--color-accent)', fontWeight: 600,
}
const chipDisabled: React.CSSProperties = {
  ...chipMono, color: 'var(--text3)', cursor: 'not-allowed', opacity: 0.5,
}
const tagStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  height: 36, padding: '0 4px 0 12px', borderRadius: 10,
  background: 'rgba(var(--color-accent-rgb), 0.14)',
  border: '1px solid rgba(var(--color-accent-rgb), 0.45)',
  color: 'var(--color-accent)', fontSize: 13, fontWeight: 600,
}
const errText: React.CSSProperties = { color: '#FF948A', fontSize: 12, marginTop: 4 }
const warnText: React.CSSProperties = { color: '#DDB977', fontSize: 12, marginTop: 4 }

// ─── Composant principal ────────────────────────────────────────────────────

interface Props {
  onGoToCriteria?(): void   // le parent peut déclencher le switch d'onglet
}

export default function SaisieV2({ onGoToCriteria }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [opts, setOpts] = useState<OptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ─── État de la saisie ─────────────────────────────────────────────────
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [instrument, setInstrument] = useState('')
  const [direction, setDirection] = useState<'LONG' | 'SHORT' | ''>('')
  const [criteria, setCriteria] = useState<CriteriaMap>({})
  const [result, setResult] = useState<'win' | 'loss' | 'be' | ''>('')
  const [mode, setMode] = useState<ResultMode>('r')
  const [rInput, setRInput] = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [slPointsInput, setSlPointsInput] = useState('')
  const [notes, setNotes] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [savedToast, setSavedToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Fetch critères + user ─────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const r = await fetch('/api/backtest/criteria')
    if (r.ok) {
      const d = await r.json()
      setCats((d.categories as CategoryRow[]) ?? [])
      setOpts((d.options as OptionRow[]) ?? [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { refresh() }, [refresh])

  // ─── Issue → défaut proposé pour "En R" ────────────────────────────────
  useEffect(() => {
    if (mode !== 'r') return
    if (!result) return
    if (rInput && rInput !== '-1' && rInput !== '0') return
    if (result === 'loss' && (!rInput || rInput === '0')) setRInput('-1')
    else if (result === 'be' && (!rInput || rInput === '-1')) setRInput('0')
    // win : pas de valeur par défaut (l'utilisateur renseigne son R)
  }, [result, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draft pour validation ─────────────────────────────────────────────
  const draft: SaisieDraft = {
    date, instrument,
    direction: direction || '',
    result, mode,
    rInput, pointsInput, slPointsInput,
    criteria,
  }
  const errors = validateSaisie(draft)
  const showErr = (k: keyof typeof errors) => submitted && errors[k]
  const canSubmit = isSaisieSubmittable(draft)

  // ─── Setters sur criteria ──────────────────────────────────────────────
  const togglePaired = (catKey: string, element: string, timeframe: string) => {
    const current = readPaired(criteria, catKey)
    const already = current.some(p => p.element === element && p.timeframe === timeframe)
    const next = already
      ? removePair(current, element, timeframe)
      : addPair(current, element, timeframe)
    setCriteria({ ...criteria, [catKey]: next })
  }
  const toggleMulti = (catKey: string, value: string) => {
    const current = readMulti(criteria, catKey)
    const next = current.includes(value) ? current.filter(x => x !== value) : [...current, value]
    setCriteria({ ...criteria, [catKey]: next })
  }
  const toggleSingle = (catKey: string, value: string) => {
    const current = readSingle(criteria, catKey)
    setCriteria({ ...criteria, [catKey]: current === value ? '' : value })
  }

  // ─── Upload image (identique ancien) ───────────────────────────────────
  async function uploadImage(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `backtests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('chat-images').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      setImagePreview(URL.createObjectURL(file))
    }
    setUploading(false)
  }

  // ─── Enregistrer ───────────────────────────────────────────────────────
  async function save(mode: 'next' | 'done') {
    setSubmitted(true)
    if (!canSubmit || !userId) return
    setSaving(true)

    const rFinal = resolveR(draft) ?? 0
    const legacy = projectToLegacy(criteria)
    const pointsNum = Number(pointsInput.replace(',', '.')) || 0
    const slNum = Number(slPointsInput.replace(',', '.')) || 0

    const { error } = await supabase.from('backtests').insert({
      trader_id: userId,
      date,
      instrument,
      direction,
      // Nouveau format :
      criteria,
      // Double-écriture pour compat :
      setup_types: legacy.setup_types,
      signals: legacy.signals,
      has_confluence: legacy.has_confluence,
      r_result: rFinal,
      points: pointsNum,
      sl_points: slNum,
      result,
      notes: notes.trim() || null,
      image_url: imageUrl,
    })
    setSaving(false)
    if (error) { alert('Erreur à l\'enregistrement : ' + error.message); return }

    setSavedToast('Backtest enregistré.')
    setTimeout(() => setSavedToast(null), 2500)

    if (mode === 'next') {
      // Garde date / instrument / direction. Reset le reste.
      setCriteria({})
      setResult('')
      setRInput('')
      setPointsInput('')
      setSlPointsInput('')
      setNotes('')
      setImagePreview(null)
      setImageUrl(null)
      setSubmitted(false)
    } else {
      // Reset complet (y compris contexte).
      setDate(new Date().toISOString().split('T')[0])
      setInstrument('')
      setDirection('')
      setCriteria({})
      setResult('')
      setRInput('')
      setPointsInput('')
      setSlPointsInput('')
      setNotes('')
      setImagePreview(null)
      setImageUrl(null)
      setSubmitted(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '32px 0', color: 'var(--text3)' }}>Chargement…</div>
  }

  const visibleCats = cats.filter(c => !c.hidden)
  const confluence = countConfluence(criteria)

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Section 1 : Contexte ─────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={stepBadgeStyle}>1</span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Contexte</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {/* Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="bt-date" style={labelStyle}>Date</label>
            <input id="bt-date" type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          {/* Instrument */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Instrument</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {INSTRUMENTS.map(i => {
                const active = instrument === i
                return (
                  <button
                    key={i} type="button" aria-pressed={active}
                    onClick={() => setInstrument(i)}
                    style={active ? chipActive : chipBase}
                  >{i}</button>
                )
              })}
            </div>
            {showErr('instrument') && <div style={errText}>{errors.instrument}</div>}
          </div>
          {/* Sens */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Sens</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <DirectionBtn kind="LONG" active={direction === 'LONG'} onClick={() => setDirection('LONG')} />
              <DirectionBtn kind="SHORT" active={direction === 'SHORT'} onClick={() => setDirection('SHORT')} />
            </div>
            {showErr('direction') && <div style={errText}>{errors.direction}</div>}
          </div>
        </div>
      </section>

      {/* ─── Section 2 : Setup ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={stepBadgeStyle}>2</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Setup</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {confluence >= 2 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                height: 32, padding: '0 12px', borderRadius: 999,
                background: 'rgba(63,203,126,0.12)', color: '#7BE3A9',
                fontSize: 12, fontWeight: 600,
              }}>
                ✓ Confluence détectée : {confluence} éléments
              </span>
            )}
            <a
              href="#" onClick={e => { e.preventDefault(); onGoToCriteria?.() }}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent)' }}
            >Gérer mes critères</a>
          </div>
        </div>

        {visibleCats.map((cat) => (
          <CriteriaBlock
            key={cat.id}
            cat={cat}
            options={opts.filter(o => o.category_id === cat.id && !o.hidden).sort((a, b) => a.position - b.position)}
            criteria={criteria}
            onTogglePaired={togglePaired}
            onToggleMulti={toggleMulti}
            onToggleSingle={toggleSingle}
          />
        ))}
      </section>

      {/* ─── Section 3 : Résultat ──────────────────────────────────────── */}
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={stepBadgeStyle}>3</span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Résultat</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22, alignItems: 'start' }}>
          {/* Issue */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Issue du trade</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <IssueBtn label="Gagnant" kind="win" active={result === 'win'} onClick={() => setResult('win')} />
              <IssueBtn label="Perdant" kind="loss" active={result === 'loss'} onClick={() => setResult('loss')} />
              <IssueBtn label="BE" kind="be" active={result === 'be'} onClick={() => setResult('be')} />
            </div>
            {showErr('result') && <div style={errText}>{errors.result}</div>}
          </div>

          {/* Mode de saisie + inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={labelStyle}>Saisie du résultat</span>
              <div style={{
                display: 'inline-flex', gap: 4, padding: 3,
                border: '1px solid var(--border)', borderRadius: 9,
              }}>
                <ModeBtn active={mode === 'r'} onClick={() => setMode('r')}>En R</ModeBtn>
                <ModeBtn active={mode === 'points'} onClick={() => setMode('points')}>En points</ModeBtn>
              </div>
            </div>
            {mode === 'r' ? (
              <>
                <label htmlFor="bt-r" style={labelStyle}>Résultat en R</label>
                <input
                  id="bt-r" type="text" value={rInput}
                  onChange={e => setRInput(e.target.value)}
                  placeholder="+2,5"
                  style={{ ...inputMono, height: 48, fontSize: 18, fontWeight: 600 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {result === 'loss'
                    ? '-1 R par défaut (stop plein). Modifie-le pour une perte partielle.'
                    : result === 'be'
                      ? '0 R : sortie au prix d\'entrée.'
                      : 'Le R obtenu sur ce trade, par exemple +2,5.'}
                </span>
                {showErr('r') && <div style={errText}>{errors.r}</div>}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="bt-pts" style={labelStyle}>Points</label>
                    <input id="bt-pts" type="text" value={pointsInput}
                      onChange={e => setPointsInput(e.target.value)}
                      placeholder="12"
                      style={{ ...inputMono, height: 48, fontSize: 16 }} />
                    {showErr('points') && <div style={errText}>{errors.points}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="bt-sl" style={labelStyle}>Stop en points</label>
                    <input id="bt-sl" type="text" value={slPointsInput}
                      onChange={e => setSlPointsInput(e.target.value)}
                      placeholder="5"
                      style={{ ...inputMono, height: 48, fontSize: 16 }} />
                    {showErr('slPoints') && <div style={errText}>{errors.slPoints}</div>}
                  </div>
                </div>
                <RCalcLine pointsInput={pointsInput} slInput={slPointsInput} />
              </>
            )}
          </div>
        </div>

        {/* Notes + Image */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="bt-notes" style={labelStyle}>Notes (facultatif)</label>
            <textarea id="bt-notes" rows={3}
              value={notes} onChange={e => setNotes(e.target.value)}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={labelStyle}>Capture du graphique (facultatif)</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }}
            />
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{
                height: 84, borderRadius: 10,
                border: '1px dashed var(--border)', background: 'transparent',
                color: 'var(--text3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              {uploading ? 'Upload…' : imagePreview ? 'Changer la capture' : '📷 Ajouter une capture'}
            </button>
            {imagePreview && (
              <img src={imagePreview} alt="aperçu" style={{ height: 40, borderRadius: 6, border: '1px solid var(--border)' }} />
            )}
          </div>
        </div>
      </section>

      {/* ─── Avertissement setup (non bloquant) ─────────────────────────── */}
      {errors.setupWarning && submitted && (
        <div style={warnText}>⚠ {errors.setupWarning}</div>
      )}

      {/* ─── Boutons ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button type="button" disabled={saving} onClick={() => save('next')}
          style={{
            height: 50, padding: '0 22px', border: 0, borderRadius: 12,
            background: 'var(--color-accent)', color: '#15130F',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >Enregistrer et saisir le suivant</button>
        <button type="button" disabled={saving} onClick={() => save('done')}
          style={{
            height: 50, padding: '0 20px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
          }}
        >Enregistrer</button>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>
          La date, l'instrument et le sens restent remplis pour la saisie suivante.
        </span>
        {savedToast && (
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7BE3A9' }}>✓ {savedToast}</span>
        )}
      </div>
    </div>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function DirectionBtn({ kind, active, onClick }: { kind: 'LONG' | 'SHORT'; active: boolean; onClick(): void }) {
  const isBuy = kind === 'LONG'
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{
        height: 48, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        border: active ? `1px solid ${isBuy ? 'var(--color-profit)' : 'var(--color-loss)'}` : '1px solid var(--border)',
        background: active
          ? (isBuy ? 'rgba(var(--color-profit-rgb), 0.16)' : 'rgba(var(--color-loss-rgb), 0.16)')
          : 'var(--bg3)',
        color: active ? (isBuy ? 'var(--color-profit)' : 'var(--color-loss)') : 'var(--text3)',
        fontSize: 15, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {isBuy ? '↗ Achat' : '↘ Vente'}
    </button>
  )
}

function IssueBtn({ label, kind, active, onClick }: {
  label: string; kind: 'win' | 'loss' | 'be'; active: boolean; onClick(): void
}) {
  const colorMap = {
    win:  { border: 'var(--color-profit)', bg: 'rgba(var(--color-profit-rgb), 0.16)', color: 'var(--color-profit)' },
    loss: { border: 'var(--color-loss)',   bg: 'rgba(var(--color-loss-rgb), 0.16)',   color: 'var(--color-loss)' },
    be:   { border: 'rgba(184,189,196,0.6)', bg: 'rgba(184,189,196,0.12)',             color: 'var(--text)' },
  }
  const c = colorMap[kind]
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{
        height: 48, borderRadius: 10, fontFamily: 'inherit',
        border: active ? `1px solid ${c.border}` : '1px solid var(--border)',
        background: active ? c.bg : 'var(--bg3)',
        color: active ? c.color : 'var(--text3)',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}
    >{label}</button>
  )
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{
        height: 32, padding: '0 12px', borderRadius: 7,
        border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
        background: active ? 'rgba(var(--color-accent-rgb), 0.14)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--text3)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{children}</button>
  )
}

function RCalcLine({ pointsInput, slInput }: { pointsInput: string; slInput: string }) {
  const p = Number(pointsInput.replace(',', '.'))
  const sl = Number(slInput.replace(',', '.'))
  const r = computeRFromPoints(p, sl)
  if (r == null) return <span style={{ fontSize: 13, color: 'var(--text3)' }}>Renseigne points + stop pour voir le R.</span>
  const sign = r > 0 ? '+' : ''
  return (
    <span style={{ fontSize: 13, color: 'var(--text2)' }}>
      R calculé : <strong style={{ fontFamily: 'ui-monospace', color: 'var(--color-accent)' }}>
        {sign}{r.toString().replace('.', ',')} R
      </strong>
    </span>
  )
}

// ─── Un bloc critère ───────────────────────────────────────────────────────

interface BlockProps {
  cat: CategoryRow
  options: OptionRow[]
  criteria: CriteriaMap
  onTogglePaired(catKey: string, element: string, timeframe: string): void
  onToggleMulti(catKey: string, value: string): void
  onToggleSingle(catKey: string, value: string): void
}

function CriteriaBlock({ cat, options, criteria, onTogglePaired, onToggleMulti, onToggleSingle }: BlockProps) {
  if (cat.selection === 'paired') {
    return <PairedBlock cat={cat} options={options} criteria={criteria} onToggle={onTogglePaired} />
  }
  if (cat.selection === 'multi') {
    const selected = readMulti(criteria, cat.key)
    return (
      <ScalarBlock
        cat={cat} options={options}
        hint="plusieurs possibles"
        isActive={(v) => selected.includes(v)}
        onToggle={(v) => onToggleMulti(cat.key, v)}
      />
    )
  }
  // single
  const selected = readSingle(criteria, cat.key)
  return (
    <ScalarBlock
      cat={cat} options={options}
      hint="une seule réponse"
      isActive={(v) => selected === v}
      onToggle={(v) => onToggleSingle(cat.key, v)}
    />
  )
}

function ScalarBlock({ cat, options, hint, isActive, onToggle }: {
  cat: CategoryRow; options: OptionRow[]; hint: string
  isActive(value: string): boolean; onToggle(value: string): void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.label}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => {
          const active = isActive(o.value)
          const mono = cat.key === 'fibonacci'
          const base = mono ? (active ? chipMonoActive : chipMono) : (active ? chipActive : chipBase)
          return (
            <button key={o.id} type="button" aria-pressed={active}
              onClick={() => onToggle(o.value)}
              style={base}
            >{o.label}</button>
          )
        })}
      </div>
    </div>
  )
}

function PairedBlock({ cat, options, criteria, onToggle }: {
  cat: CategoryRow; options: OptionRow[]; criteria: CriteriaMap
  onToggle(catKey: string, element: string, timeframe: string): void
}) {
  const current = readPaired(criteria, cat.key)
  const [selectedElement, setSelectedElement] = useState<string>('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.label}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>élément puis unité de temps, plusieurs possibles</span>
      </div>

      {/* Paires déjà ajoutées */}
      {current.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {current.map((p, i) => (
            <span key={`${p.element}-${p.timeframe}-${i}`} style={tagStyle}>
              {p.element}{p.timeframe ? ` ${p.timeframe}` : ''}
              <button type="button" aria-label={`Retirer ${p.element} ${p.timeframe}`}
                onClick={() => onToggle(cat.key, p.element, p.timeframe)}
                style={{
                  width: 28, height: 28, border: 0, borderRadius: 6,
                  background: 'transparent', color: 'var(--color-accent)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                }}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Sélecteur élément + unité */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
        borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 4 }}>Ajouter</span>
          {options.map(o => {
            const active = selectedElement === o.value
            return (
              <button key={o.id} type="button" aria-pressed={active}
                onClick={() => setSelectedElement(active ? '' : o.value)}
                style={active ? chipActive : chipBase}
              >{o.label}</button>
            )
          })}
        </div>
        {selectedElement && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
            paddingLeft: 12, borderLeft: '2px solid rgba(var(--color-accent-rgb), 0.35)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 4 }}>
              Unité de temps du {selectedElement}
            </span>
            {cat.timeframes.map(tf => {
              const taken = takenTimeframesForElement(current, selectedElement).has(tf)
              return (
                <button key={tf} type="button"
                  disabled={taken}
                  aria-label={taken ? `${timeframeLabel(tf)}, déjà ajouté` : timeframeLabel(tf)}
                  onClick={() => { onToggle(cat.key, selectedElement, tf); /* reste sur élément pour chaîner */ }}
                  style={taken ? chipDisabled : chipMono}
                >{timeframeLabel(tf)}</button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
