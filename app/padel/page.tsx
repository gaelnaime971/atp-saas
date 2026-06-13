'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface ParsedField {
  index: number
  entryId: string
  label: string
  type: number
  required: boolean
  options?: string[] | null
}

interface ParsedForm {
  formId: string
  title: string
  description?: string
  fields: ParsedField[]
}

interface PlayerData { nom: string; tel: string; licence: string }

interface SubmitResult {
  success: boolean
  status?: number
  finalUrl?: string
  elapsedMs?: number
  error?: string
}

const STORAGE_KEY = 'padel-inscription-v1'

// Detect which kind of field a label refers to. Case-insensitive.
function classifyLabel(label: string): { kind: 'nom' | 'tel' | 'licence' | 'unknown'; player: 1 | 2 | null } {
  const l = label.toLowerCase()
  let player: 1 | 2 | null = null
  if (/\b(joueur|j)\s*1\b/.test(l) || /\b1\b/.test(l) && !/2/.test(l)) player = 1
  else if (/\b(joueur|j)\s*2\b/.test(l) || /\b2\b/.test(l) && !/1/.test(l)) player = 2

  if (/nom|pr[ée]nom|name/.test(l)) return { kind: 'nom', player }
  if (/t[ée]l[ée]?phone|portable|mobile|gsm|whatsapp|phone/.test(l)) return { kind: 'tel', player }
  if (/licence|license|num[ée]ro\s*ffft|fftt|ffp/.test(l)) return { kind: 'licence', player }
  return { kind: 'unknown', player }
}

// Auto-map detected text fields to the 6 player slots
function autoMap(fields: ParsedField[]): Record<string, string> {
  // returns mapping: slot -> entryId, slot = 'p1_nom' | 'p1_tel' | 'p1_licence' | 'p2_*'
  const mapping: Record<string, string> = {}
  const textFields = fields.filter(f => f.type === 0 || f.type === 1)
  for (const f of textFields) {
    const c = classifyLabel(f.label)
    if (c.kind === 'unknown' || c.player == null) continue
    const slot = `p${c.player}_${c.kind}`
    if (!mapping[slot]) mapping[slot] = f.entryId
  }
  return mapping
}

const LS_KEY_MEMO = 'padel-inscription-form-memo'

export default function PadelPage() {
  const [formUrl, setFormUrl] = useState('')
  const [parsed, setParsed] = useState<ParsedForm | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [p1, setP1] = useState<PlayerData>({ nom: '', tel: '', licence: '' })
  const [p2, setP2] = useState<PlayerData>({ nom: '', tel: '', licence: '' })

  // entryId mapping per slot — auto-detected, but user can override
  const [mapping, setMapping] = useState<Record<string, string>>({})

  // Other fields not auto-mappable
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  const [now, setNow] = useState<Date>(new Date())
  const [scheduleAt, setScheduleAt] = useState<string>('') // HH:MM:SS
  const [scheduled, setScheduled] = useState<boolean>(false)
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 50)
    return () => clearInterval(t)
  }, [])

  // Restore from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        setFormUrl(d.formUrl || '')
        setP1(d.p1 || { nom: '', tel: '', licence: '' })
        setP2(d.p2 || { nom: '', tel: '', licence: '' })
      }
      const memo = localStorage.getItem(LS_KEY_MEMO)
      if (memo) {
        const d = JSON.parse(memo)
        if (d.formId) {
          // optional: re-attach the mapping
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formUrl, p1, p2 }))
    } catch { /* ignore */ }
  }, [formUrl, p1, p2])

  // Auto-parse when URL changes (debounced)
  useEffect(() => {
    const url = formUrl.trim()
    if (!url || !url.includes('forms')) return
    const t = setTimeout(() => { void parse(url) }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formUrl])

  const parse = useCallback(async (url?: string) => {
    const u = (url ?? formUrl).trim()
    if (!u) return
    setParsing(true)
    setParseError(null)
    try {
      const r = await fetch('/api/padel/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const d = await r.json()
      if (!r.ok) { setParseError(d.error || `Erreur (${r.status})`); setParsed(null); return }
      setParsed(d)
      const m = autoMap(d.fields)
      setMapping(m)
      setExtraValues({})
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setParsing(false)
    }
  }, [formUrl])

  // Find unmapped non-text fields that need user input
  const extraFields = useMemo(() => {
    if (!parsed) return []
    const mappedIds = new Set(Object.values(mapping))
    return parsed.fields.filter(f => {
      if (f.type === 11 || f.type === 12) return false // image, video — ignore
      if (mappedIds.has(f.entryId)) return false
      return f.required || f.type === 2 || f.type === 3 || f.type === 4 // include required + any choice field
    })
  }, [parsed, mapping])

  const buildValues = useCallback(() => {
    const values: Record<string, string> = {}
    if (mapping.p1_nom) values[mapping.p1_nom] = p1.nom
    if (mapping.p1_tel) values[mapping.p1_tel] = p1.tel
    if (mapping.p1_licence) values[mapping.p1_licence] = p1.licence
    if (mapping.p2_nom) values[mapping.p2_nom] = p2.nom
    if (mapping.p2_tel) values[mapping.p2_tel] = p2.tel
    if (mapping.p2_licence) values[mapping.p2_licence] = p2.licence
    for (const [entryId, value] of Object.entries(extraValues)) {
      if (value) values[entryId] = value
    }
    return values
  }, [mapping, p1, p2, extraValues])

  const handleSubmit = useCallback(async () => {
    if (!parsed) return
    setSending(true)
    setResult(null)
    const t0 = performance.now()
    try {
      const r = await fetch('/api/padel/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: parsed.formId, values: buildValues() }),
      })
      const d = await r.json()
      const elapsed = Math.round(performance.now() - t0)
      setResult({ ...d, elapsedMs: d.elapsedMs ?? elapsed })
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Erreur réseau' })
    } finally {
      setSending(false)
    }
  }, [parsed, buildValues])

  // Cancel any pending schedule when component unmounts
  useEffect(() => () => {
    if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current)
  }, [])

  const scheduleSubmit = useCallback(() => {
    if (scheduled) {
      if (scheduleTimerRef.current) clearTimeout(scheduleTimerRef.current)
      setScheduled(false)
      return
    }
    const m = scheduleAt.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (!m) return
    const target = new Date()
    target.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0)
    if (target.getTime() < Date.now()) target.setDate(target.getDate() + 1)
    const delay = target.getTime() - Date.now()
    setScheduled(true)
    scheduleTimerRef.current = setTimeout(() => {
      void handleSubmit()
      setScheduled(false)
    }, delay)
  }, [scheduleAt, scheduled, handleSubmit])

  const canSubmit = parsed
    && p1.nom.trim() && p1.tel.trim() && p1.licence.trim()
    && p2.nom.trim() && p2.tel.trim() && p2.licence.trim()
    && mapping.p1_nom && mapping.p1_tel && mapping.p1_licence
    && mapping.p2_nom && mapping.p2_tel && mapping.p2_licence
    && extraFields.filter(f => f.required).every(f => extraValues[f.entryId])

  // Countdown if scheduled
  let countdown = ''
  if (scheduled && scheduleAt) {
    const m = scheduleAt.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (m) {
      const target = new Date(now)
      target.setHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0)
      if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1)
      const ms = target.getTime() - now.getTime()
      const s = Math.max(0, ms / 1000)
      countdown = `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e7eb', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>🎾 Padel · Auto-inscription</h1>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Submit ultra-rapide aux Google Forms de tournoi</div>
          </div>
          <div style={{ background: '#111', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#22c55e' }}>
            {now.toLocaleTimeString('fr-FR', { hour12: false })}.<span style={{ color: '#666' }}>{String(now.getMilliseconds()).padStart(3, '0')}</span>
          </div>
        </div>

        {/* Form URL */}
        <Section title="1. Lien du Google Form">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="url"
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              placeholder="https://docs.google.com/forms/d/e/.../viewform"
              style={{ ...inputStyle, flex: 1 }}
            />
            {formUrl.trim() && (
              <a
                href={formUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' }}
                title="Ouvre le lien dans un nouvel onglet (utile pour les liens forms.gle — copie ensuite l'URL longue depuis la barre d'adresse)"
              >
                🔗 Ouvrir
              </a>
            )}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {parsing && <span style={{ fontSize: 11, color: '#9ca3af' }}>Détection en cours…</span>}
            {parseError && (
              <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.4 }}>
                ⚠ {parseError}
                {/forms\.gle|goo\.gl/.test(formUrl) && (
                  <span style={{ display: 'block', color: '#f59e0b', marginTop: 4 }}>
                    💡 Astuce : clique 🔗 Ouvrir → laisse Google rediriger → copie l&apos;URL <strong>docs.google.com/forms/d/e/...</strong> depuis la barre d&apos;adresse → reviens et colle-la ici.
                  </span>
                )}
              </span>
            )}
            {parsed && !parsing && (
              <>
                <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                  ✓ {parsed.fields.filter(f => f.type !== 11 && f.type !== 12).length} champs détectés
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>· {parsed.title}</span>
              </>
            )}
          </div>
        </Section>

        {/* Mapping verification */}
        {parsed && (
          <Section title="2. Mapping détecté (vérifie)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
              {(['p1_nom', 'p1_tel', 'p1_licence', 'p2_nom', 'p2_tel', 'p2_licence'] as const).map(slot => {
                const [pl, kind] = slot.split('_') as ['p1' | 'p2', 'nom' | 'tel' | 'licence']
                const player = pl === 'p1' ? '1' : '2'
                const kindLabel = kind === 'nom' ? 'Nom/Prénom' : kind === 'tel' ? 'Téléphone' : 'Licence'
                const matchedEntry = mapping[slot]
                const matchedField = parsed.fields.find(f => f.entryId === matchedEntry)
                return (
                  <div key={slot} style={{ padding: '6px 10px', background: '#111', border: `1px solid ${matchedEntry ? '#1f2937' : '#5b1414'}`, borderRadius: 6 }}>
                    <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      J{player} · {kindLabel}
                    </div>
                    <select
                      value={matchedEntry || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [slot]: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 2, fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="">— Choisir un champ —</option>
                      {parsed.fields.filter(f => f.type === 0 || f.type === 1).map(f => (
                        <option key={f.entryId} value={f.entryId}>{f.label}</option>
                      ))}
                    </select>
                    {matchedField && (
                      <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>→ {matchedField.label}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Extra fields */}
        {parsed && extraFields.length > 0 && (
          <Section title="3. Champs supplémentaires détectés">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {extraFields.map(f => (
                <div key={f.entryId}>
                  <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                    {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  {f.type === 2 || f.type === 3 ? (
                    <select
                      value={extraValues[f.entryId] || ''}
                      onChange={e => setExtraValues(prev => ({ ...prev, [f.entryId]: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">— Choisir —</option>
                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={extraValues[f.entryId] || ''}
                      onChange={e => setExtraValues(prev => ({ ...prev, [f.entryId]: e.target.value }))}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Players */}
        <Section title={parsed ? '4. Données des joueurs' : '2. Données des joueurs'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([['1', p1, setP1], ['2', p2, setP2]] as const).map(([num, data, setData]) => (
              <div key={num} style={{ padding: 10, background: '#0c0c0c', border: '1px solid #1f2937', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Joueur {num}
                </div>
                <input
                  type="text"
                  value={data.nom}
                  onChange={e => setData(d => ({ ...d, nom: e.target.value }))}
                  placeholder="Nom et prénom"
                  style={{ ...inputStyle, marginBottom: 6 }}
                />
                <input
                  type="tel"
                  value={data.tel}
                  onChange={e => setData(d => ({ ...d, tel: e.target.value }))}
                  placeholder="Téléphone"
                  style={{ ...inputStyle, marginBottom: 6 }}
                />
                <input
                  type="text"
                  value={data.licence}
                  onChange={e => setData(d => ({ ...d, licence: e.target.value }))}
                  placeholder="Numéro de licence"
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Schedule */}
        <Section title={parsed ? '5. Envoi' : '3. Envoi'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              type="text"
              value={scheduleAt}
              onChange={e => setScheduleAt(e.target.value)}
              placeholder="12:00:00"
              style={{ ...inputStyle, width: 110, fontFamily: 'JetBrains Mono, monospace', textAlign: 'center' }}
            />
            <button
              onClick={scheduleSubmit}
              disabled={!canSubmit && !scheduled}
              style={{
                ...btnStyle,
                background: scheduled ? '#5b1414' : '#1f2937',
                color: scheduled ? '#fca5a5' : '#e5e7eb',
                cursor: (canSubmit || scheduled) ? 'pointer' : 'not-allowed',
                opacity: (canSubmit || scheduled) ? 1 : 0.5,
              }}
            >
              {scheduled ? '✕ Annuler programmation' : '⏰ Programmer'}
            </button>
            {scheduled && countdown && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: '#22c55e', fontWeight: 700 }}>
                T-{countdown}
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || sending}
            style={{
              ...btnStyle,
              width: '100%',
              padding: '14px',
              fontSize: 16,
              fontWeight: 800,
              background: !canSubmit || sending ? '#1f2937' : '#22c55e',
              color: !canSubmit || sending ? '#6b7280' : '#000',
              cursor: !canSubmit || sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? '⏳ Envoi en cours…' : '🚀 ENVOYER MAINTENANT'}
          </button>

          {result && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              background: result.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: 8,
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 700, color: result.success ? '#22c55e' : '#ef4444' }}>
                {result.success ? '✓ Soumis avec succès' : '⚠ Échec'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {result.elapsedMs != null && <>Latence : <strong style={{ color: '#e5e7eb' }}>{result.elapsedMs}ms</strong> · </>}
                {result.status && <>Status : {result.status} · </>}
                {result.finalUrl && <>URL : <code style={{ color: '#6b7280' }}>{result.finalUrl.slice(0, 80)}</code></>}
                {result.error && <>{result.error}</>}
              </div>
            </div>
          )}
        </Section>

        <div style={{ marginTop: 24, fontSize: 10, color: '#4b5563', textAlign: 'center' }}>
          Données sauvegardées localement dans ton navigateur · Aucune connexion requise
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, background: '#0f0f0f', border: '1px solid #1f2937', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#0a0a0a',
  border: '1px solid #1f2937',
  borderRadius: 6,
  color: '#e5e7eb',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #1f2937',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  background: '#1f2937',
  color: '#e5e7eb',
}
