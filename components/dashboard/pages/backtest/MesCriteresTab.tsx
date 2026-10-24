'use client'

/**
 * Backtest V2 — onglet "Mes critères" (maquette docs/backtest-v2/
 * Criteres.dc.html). Visible uniquement pour les emails de
 * BACKTEST_V2_TESTERS (gated par le parent Backtest.tsx).
 *
 * Fonctionnalités :
 *   - Liste des critères du trader avec drag handle + boutons monter/
 *     descendre pour le clavier, nom, badge ATP|Perso, type (Choix
 *     unique / Choix multiple / Élément + unité de temps), options en
 *     étiquettes (barrées si hidden).
 *   - Mode édition inline par carte : renommer, ajouter/retirer des
 *     options, masquer ou réafficher une option ATP, unités de temps
 *     pour un critère paired.
 *   - Critère ATP : masquage (entier ou option par option), jamais
 *     supprimé. Critère perso : supprimable après confirmation, avec
 *     "Tes anciens backtests gardent leurs valeurs".
 *   - "Ajouter un critère" : les 5 modèles en un clic + "Critère
 *     vierge" qui ouvre un panneau "Nouveau critère" (nom, type en 3
 *     cartes, options, unités si paired, Créer / Annuler).
 *   - Validation en français à côté du champ : nom unique, ≥ 2 options
 *     pour unique/multi, ≥ 1 élément + ≥ 1 unité pour paired.
 *
 * Zéro I/O direct : toutes les mutations passent par /api/backtest/
 * criteria/*. Les positions sont persistées à la volée via PATCH.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  isAtpCategory, moveItem, validateCategoryDraft, isValidCategoryDraft,
  type CategorySelection, type CategoryDraft, type ValidationErrors,
} from '@/lib/backtest/criteria'

// ─── Types côté client ─────────────────────────────────────────────────────

interface CategoryRow {
  id: string
  trader_id: string
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

// ─── Modèles ajoutables en un clic ──────────────────────────────────────────

interface Template { key: string; label: string; options: string[] }
const TEMPLATES: ReadonlyArray<Template> = [
  { key: 'session',    label: 'Moment de la séance',  options: ['Préopen', 'Open', 'Après-midi'] },
  { key: 'context',    label: 'Contexte',             options: ['Tendance', 'Range'] },
  { key: 'management', label: 'Gestion',              options: ['Ricain', 'Hybride'] },
  { key: 'news',       label: 'Jour de news',         options: ['Oui', 'Non'] },
  { key: 'mindset',    label: 'État d\'esprit',       options: ['Calme', 'Impatient', 'Fatigué'] },
]
const SELECTION_LABEL: Record<CategorySelection, string> = {
  single: 'Choix unique',
  multi:  'Choix multiple',
  paired: 'Élément + unité de temps',
}
const PAIRED_TF_SUGGESTIONS = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', '100T']

// ─── Styles (tokens dashboard) ──────────────────────────────────────────────

const chip: React.CSSProperties = {
  height: 30, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg3)',
  color: 'var(--text2)', fontSize: 12,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const chipMono: React.CSSProperties = { ...chip, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
const chipHidden: React.CSSProperties = { ...chip, borderStyle: 'dashed', color: 'var(--text3)', textDecoration: 'line-through' }
const chipGold: React.CSSProperties = {
  ...chip, border: '1px solid var(--color-accent)',
  background: 'rgba(var(--color-accent-rgb), 0.12)', color: 'var(--color-accent)',
}
const btnGhost: React.CSSProperties = {
  height: 36, padding: '0 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnAccent: React.CSSProperties = {
  ...btnGhost, border: 'none', background: 'var(--color-accent)', color: '#15130F',
}
const btnDanger: React.CSSProperties = {
  ...btnGhost, color: '#FF948A', borderColor: 'var(--border)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 42, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--text)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit',
}
const errText: React.CSSProperties = { color: '#FF948A', fontSize: 12, marginTop: 4 }

// ─── Composant principal ────────────────────────────────────────────────────

export default function MesCriteresTab() {
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [opts, setOpts] = useState<OptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)

  const existingLabels = useMemo(() => cats.map(c => c.label), [cats])

  const refresh = useCallback(async () => {
    const r = await fetch('/api/backtest/criteria')
    if (!r.ok) { setError('Impossible de charger tes critères.'); setLoading(false); return }
    const d = await r.json()
    setCats(d.categories ?? [])
    setOpts(d.options ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // ─── Mutations ──────────────────────────────────────────────────────────

  async function reorder(from: number, to: number) {
    const next = moveItem(cats, from, to)
    setCats(next.map((c, i) => ({ ...c, position: i })))
    // persistance : PATCH chaque position modifiée
    const toUpdate = next.filter((c, i) => c.position !== i).concat(
      next.map((c, i) => ({ ...c, position: i })).filter((c, i) => c.position !== cats[cats.findIndex(x => x.id === c.id)]?.position),
    )
    void toUpdate
    // Approche simple : PATCH tout l'ordre
    await Promise.all(next.map((c, i) =>
      fetch(`/api/backtest/criteria/categories/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      }),
    ))
  }

  async function patchCategory(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/backtest/criteria/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) await refresh()
  }

  async function deleteCategory(id: string) {
    const r = await fetch(`/api/backtest/criteria/categories/${id}`, { method: 'DELETE' })
    if (r.ok) await refresh()
  }

  async function patchOption(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/backtest/criteria/options/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) await refresh()
  }

  async function deleteOption(id: string) {
    const r = await fetch(`/api/backtest/criteria/options/${id}`, { method: 'DELETE' })
    if (r.ok) await refresh()
  }

  async function addOption(categoryId: string, label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    const r = await fetch('/api/backtest/criteria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'option', category_id: categoryId, label: trimmed }),
    })
    if (r.ok) await refresh()
  }

  async function addTemplate(templateKey: string) {
    const r = await fetch('/api/backtest/criteria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'template', template_key: templateKey }),
    })
    if (r.ok) await refresh()
  }

  async function createCategory(draft: CategoryDraft) {
    const createRes = await fetch('/api/backtest/criteria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'category',
        label: draft.label.trim(),
        selection: draft.selection,
        timeframes: draft.selection === 'paired' ? draft.timeframes : [],
      }),
    })
    if (!createRes.ok) return false
    const { category } = await createRes.json()
    if (!category?.id) return false
    // Puis crée les options en séquence
    for (const label of draft.options.filter(Boolean)) {
      await fetch('/api/backtest/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'option', category_id: category.id, label: label.trim() }),
      })
    }
    await refresh()
    return true
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '32px 0', color: 'var(--text3)', fontSize: 14 }}>
        Chargement de tes critères…
      </div>
    )
  }

  if (error) {
    return <div style={{ color: '#FF948A' }}>{error}</div>
  }

  // Templates déjà installés : key présente dans cats → masquer du bouton.
  const installedKeys = new Set(cats.map(c => c.key))
  const availableTemplates = TEMPLATES.filter(t => !installedKeys.has(t.key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ margin: 0, color: 'var(--text2)', fontSize: 14, lineHeight: 1.5, maxWidth: 760 }}>
        Compose ton formulaire de backtest. Les critères ATP se masquent sans se perdre, tes
        critères perso apparaissent automatiquement dans la saisie et dans les résultats.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: showDraft ? '2fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Liste des critères */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {cats.map((cat, idx) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              options={opts.filter(o => o.category_id === cat.id).sort((a, b) => a.position - b.position)}
              canMoveUp={idx > 0}
              canMoveDown={idx < cats.length - 1}
              editing={editingId === cat.id}
              onToggleEdit={() => setEditingId(editingId === cat.id ? null : cat.id)}
              onMoveUp={() => reorder(idx, idx - 1)}
              onMoveDown={() => reorder(idx, idx + 1)}
              onPatchCategory={(patch) => patchCategory(cat.id, patch)}
              onDeleteCategory={() => {
                if (confirm(`Supprimer "${cat.label}" ? Tes anciens backtests gardent leurs valeurs.`)) {
                  void deleteCategory(cat.id)
                }
              }}
              onPatchOption={patchOption}
              onDeleteOption={deleteOption}
              onAddOption={(label) => addOption(cat.id, label)}
            />
          ))}

          {/* "Ajouter un critère" */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 10,
            padding: 16, borderRadius: 14, border: '1px dashed var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Ajouter un critère</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableTemplates.map(t => (
                <button
                  key={t.key} type="button"
                  onClick={() => addTemplate(t.key)}
                  style={{ ...btnGhost, height: 40, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>+</span>
                  {t.label} · {t.options.join(', ')}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowDraft(true)}
                style={{
                  ...btnGhost, height: 40,
                  border: '1px solid var(--color-accent)',
                  background: 'rgba(var(--color-accent-rgb), 0.10)',
                  color: 'var(--color-accent)',
                }}
              >
                + Critère vierge
              </button>
            </div>
          </div>
        </div>

        {/* Panneau "Nouveau critère" */}
        {showDraft && (
          <NewCategoryPanel
            existingLabels={existingLabels}
            onCancel={() => setShowDraft(false)}
            onCreate={async (draft) => {
              const ok = await createCategory(draft)
              if (ok) setShowDraft(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Carte d'un critère ────────────────────────────────────────────────────

interface CardProps {
  cat: CategoryRow
  options: OptionRow[]
  canMoveUp: boolean
  canMoveDown: boolean
  editing: boolean
  onToggleEdit(): void
  onMoveUp(): void
  onMoveDown(): void
  onPatchCategory(patch: Record<string, unknown>): void
  onDeleteCategory(): void
  onPatchOption(id: string, patch: Record<string, unknown>): void
  onDeleteOption(id: string): void
  onAddOption(label: string): void
}

function CategoryCard({
  cat, options, canMoveUp, canMoveDown, editing,
  onToggleEdit, onMoveUp, onMoveDown,
  onPatchCategory, onDeleteCategory,
  onPatchOption, onDeleteOption, onAddOption,
}: CardProps) {
  const atp = isAtpCategory(cat.key)
  const [newOpt, setNewOpt] = useState('')
  const [renameValue, setRenameValue] = useState(cat.label)
  useEffect(() => { setRenameValue(cat.label) }, [cat.label])

  // Éléments (options) + unités (timeframes)
  const visibleOptions = options
  const paired = cat.selection === 'paired'

  return (
    <article style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      {/* Poignée + boutons clavier */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button
          type="button" aria-label={`Déplacer ${cat.label}`}
          style={{
            width: 32, height: 32, border: 0, borderRadius: 8,
            background: 'transparent', color: 'var(--text3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab',
          }}
          disabled title="Glisser-déposer bientôt — pour l'instant, utilise ↑ ↓"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        <button type="button" aria-label="Monter" disabled={!canMoveUp} onClick={onMoveUp}
          style={{ ...btnGhost, width: 32, height: 28, padding: 0, opacity: canMoveUp ? 1 : 0.4 }}>↑</button>
        <button type="button" aria-label="Descendre" disabled={!canMoveDown} onClick={onMoveDown}
          style={{ ...btnGhost, width: 32, height: 28, padding: 0, opacity: canMoveDown ? 1 : 0.4 }}>↓</button>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Head */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {editing ? (
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => { if (renameValue.trim() && renameValue !== cat.label) onPatchCategory({ label: renameValue.trim() }) }}
              style={{ ...inputStyle, height: 32, maxWidth: 240 }}
            />
          ) : (
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{cat.label}</h3>
          )}
          <span style={{
            height: 22, padding: '0 8px', borderRadius: 6,
            background: atp ? 'rgba(var(--color-accent-rgb), 0.14)' : 'rgba(63,203,126,0.14)',
            color: atp ? 'var(--color-accent)' : '#7BE3A9',
            fontSize: 11, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center',
          }}>{atp ? 'ATP' : 'Perso'}</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{SELECTION_LABEL[cat.selection]}</span>
          {cat.hidden && <span style={{ ...chipHidden, height: 22 }}>Masquée</span>}
        </div>

        {/* Options */}
        <OptionsBlock
          label={paired ? 'Éléments' : undefined}
          options={visibleOptions}
          editing={editing}
          atp={atp}
          onPatchOption={onPatchOption}
          onDeleteOption={onDeleteOption}
        />

        {/* Unités (si paired) */}
        {paired && (
          <TimeframesBlock
            cat={cat}
            editing={editing}
            onPatchCategory={onPatchCategory}
          />
        )}

        {/* Add option (mode édition) */}
        {editing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newOpt}
              onChange={e => setNewOpt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newOpt.trim()) {
                  onAddOption(newOpt); setNewOpt('')
                }
              }}
              placeholder={paired ? 'Ajouter un élément puis Entrée' : 'Ajouter une option puis Entrée'}
              style={{ ...inputStyle, height: 36, maxWidth: 280 }}
            />
            <button
              type="button" onClick={() => { if (newOpt.trim()) { onAddOption(newOpt); setNewOpt('') } }}
              style={btnGhost}
            >Ajouter</button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {editing ? (
          <>
            {atp && (
              <button type="button" onClick={() => onPatchCategory({ hidden: !cat.hidden })} style={btnGhost}>
                {cat.hidden ? 'Réafficher' : 'Masquer'}
              </button>
            )}
            <button type="button" onClick={onToggleEdit} style={btnGhost}>Terminer</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onToggleEdit} style={btnGhost}>Modifier</button>
            {!atp && (
              <button
                type="button" aria-label={`Supprimer ${cat.label}`}
                onClick={onDeleteCategory}
                style={{ ...btnDanger, width: 40, padding: 0 }}
              >🗑</button>
            )}
          </>
        )}
      </div>
    </article>
  )
}

// ─── Bloc "Options" (éléments pour paired) ─────────────────────────────────

interface OptionsBlockProps {
  label?: string
  options: OptionRow[]
  editing: boolean
  atp: boolean
  onPatchOption(id: string, patch: Record<string, unknown>): void
  onDeleteOption(id: string): void
}
function OptionsBlock({ label, options, editing, onPatchOption, onDeleteOption }: OptionsBlockProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {label && <span style={{ fontSize: 12, color: 'var(--text3)', width: 70 }}>{label}</span>}
      {options.map(o => {
        const style = o.hidden ? chipHidden : chip
        return (
          <span key={o.id} style={{ ...style, gap: 6 }}>
            {o.label}
            {editing && (
              <>
                {o.origin === 'atp' ? (
                  <button
                    type="button" aria-label={o.hidden ? 'Réafficher' : 'Masquer'}
                    onClick={() => onPatchOption(o.id, { hidden: !o.hidden })}
                    style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer', fontSize: 11 }}
                  >{o.hidden ? '↺' : '✕'}</button>
                ) : (
                  <button
                    type="button" aria-label="Supprimer"
                    onClick={() => onDeleteOption(o.id)}
                    style={{ background: 'none', border: 0, color: '#FF948A', cursor: 'pointer', fontSize: 11 }}
                  >✕</button>
                )}
              </>
            )}
          </span>
        )
      })}
      {options.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Aucune option.</span>
      )}
    </div>
  )
}

// ─── Bloc "Unités" (paired) ─────────────────────────────────────────────────

function TimeframesBlock({
  cat, editing, onPatchCategory,
}: { cat: CategoryRow; editing: boolean; onPatchCategory(p: Record<string, unknown>): void }) {
  const [input, setInput] = useState('')
  const current = cat.timeframes
  const toggle = (tf: string) => {
    const next = current.includes(tf) ? current.filter(t => t !== tf) : [...current, tf]
    onPatchCategory({ timeframes: next })
  }
  const addCustom = () => {
    const t = input.trim()
    if (!t || current.includes(t)) return
    onPatchCategory({ timeframes: [...current, t] })
    setInput('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text3)', width: 70 }}>Unités</span>
      {current.map(tf => (
        <span key={tf} style={{ ...chipMono, ...(editing ? {} : {}), gap: 6 }}>
          {tf}
          {editing && (
            <button type="button" aria-label={`Retirer ${tf}`}
              onClick={() => toggle(tf)}
              style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer', fontSize: 11 }}
            >✕</button>
          )}
        </span>
      ))}
      {editing && (
        <>
          {PAIRED_TF_SUGGESTIONS.filter(t => !current.includes(t)).map(tf => (
            <button key={tf} type="button" onClick={() => toggle(tf)}
              style={{ ...chipMono, cursor: 'pointer', borderStyle: 'dashed' }}
            >+ {tf}</button>
          ))}
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            placeholder="M30, D1…"
            style={{ ...inputStyle, height: 30, width: 90, fontSize: 12 }}
          />
        </>
      )}
    </div>
  )
}

// ─── Panneau "Nouveau critère" ──────────────────────────────────────────────

interface NewPanelProps {
  existingLabels: ReadonlyArray<string>
  onCancel(): void
  onCreate(draft: CategoryDraft): void | Promise<void>
}

function NewCategoryPanel({ existingLabels, onCancel, onCreate }: NewPanelProps) {
  const [label, setLabel] = useState('')
  const [selection, setSelection] = useState<CategorySelection>('single')
  const [options, setOptions] = useState<string[]>([])
  const [optInput, setOptInput] = useState('')
  const [timeframes, setTimeframes] = useState<string[]>(['M5', 'M15', 'H1'])
  const [tfInput, setTfInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const draft: CategoryDraft = { label, selection, options, timeframes }
  const errors: ValidationErrors = submitted ? validateCategoryDraft(draft, existingLabels) : {}
  const canSubmit = isValidCategoryDraft(draft, existingLabels)

  const addOpt = () => {
    const t = optInput.trim()
    if (!t) return
    if (options.some(o => o.toLowerCase() === t.toLowerCase())) { setOptInput(''); return }
    setOptions([...options, t]); setOptInput('')
  }
  const removeOpt = (o: string) => setOptions(options.filter(x => x !== o))

  const toggleTf = (tf: string) => {
    setTimeframes(timeframes.includes(tf) ? timeframes.filter(t => t !== tf) : [...timeframes, tf])
  }
  const addTf = () => {
    const t = tfInput.trim()
    if (!t || timeframes.includes(t)) { setTfInput(''); return }
    setTimeframes([...timeframes, t]); setTfInput('')
  }

  const submit = async () => {
    setSubmitted(true)
    if (!canSubmit) return
    await onCreate(draft)
  }

  return (
    <aside style={{
      background: 'var(--bg2)', border: '1px solid var(--color-accent)',
      borderRadius: 14, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
    }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Nouveau critère</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="cr-name" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Nom</label>
        <input id="cr-name" type="text" value={label} onChange={e => setLabel(e.target.value)} style={inputStyle} />
        {errors.label && <div style={errText}>{errors.label}</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Type</span>
        {(['single', 'multi', 'paired'] as CategorySelection[]).map(s => {
          const active = selection === s
          return (
            <button
              key={s} type="button"
              aria-pressed={active}
              onClick={() => setSelection(s)}
              style={{
                minHeight: 52, padding: '8px 12px', borderRadius: 10,
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border)'}`,
                background: active ? 'rgba(var(--color-accent-rgb), 0.12)' : 'transparent',
                color: 'var(--text)',
                textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--color-accent)' : 'var(--text)' }}>
                {SELECTION_LABEL[s]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                {s === 'single' && 'Une seule réponse par backtest'}
                {s === 'multi' && 'Plusieurs réponses possibles'}
                {s === 'paired' && 'Comme les zones : OB M15, FVG M5…'}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="cr-opt" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>
          {selection === 'paired' ? 'Éléments' : 'Options'}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map(o => (
            <span key={o} style={{ ...chip, gap: 4, paddingRight: 4 }}>
              {o}
              <button type="button" aria-label={`Retirer ${o}`} onClick={() => removeOpt(o)}
                style={{ background: 'none', border: 0, color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
            </span>
          ))}
        </div>
        <input
          id="cr-opt" type="text" value={optInput}
          onChange={e => setOptInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOpt() } }}
          placeholder={selection === 'paired' ? 'Ajouter un élément puis Entrée' : 'Ajouter une option puis Entrée'}
          style={inputStyle}
        />
        {errors.options && <div style={errText}>{errors.options}</div>}
      </div>

      {selection === 'paired' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>Unités de temps proposées</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PAIRED_TF_SUGGESTIONS.map(tf => {
              const active = timeframes.includes(tf)
              return (
                <button key={tf} type="button" onClick={() => toggleTf(tf)}
                  style={active ? chipGold : chipMono}>{tf}</button>
              )
            })}
            {timeframes.filter(t => !PAIRED_TF_SUGGESTIONS.includes(t)).map(tf => (
              <span key={tf} style={{ ...chipGold, gap: 4, paddingRight: 4 }}>
                {tf}
                <button type="button" onClick={() => toggleTf(tf)}
                  style={{ background: 'none', border: 0, color: 'var(--color-accent)', cursor: 'pointer' }}>✕</button>
              </span>
            ))}
            <input
              value={tfInput} onChange={e => setTfInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTf() } }}
              placeholder="M30…"
              style={{ ...inputStyle, height: 30, width: 90, fontSize: 12 }}
            />
          </div>
          {errors.timeframes && <div style={errText}>{errors.timeframes}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={submit} style={{ ...btnAccent, height: 46 }}>Créer le critère</button>
        <button type="button" onClick={onCancel} style={{ ...btnGhost, height: 46 }}>Annuler</button>
      </div>
    </aside>
  )
}
