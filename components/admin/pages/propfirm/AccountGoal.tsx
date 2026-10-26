'use client'

/**
 * Trading perso — objectif par compte funded.
 *
 * Deux surfaces exportées :
 *   - AccountGoalBar : barre de progression affichée en tête de la
 *     FundedCard quand un objectif est défini. Cliquable pour éditer.
 *   - AccountGoalInlineButton : si pas d'objectif, un bouton "+
 *     Définir un objectif" compact.
 *
 * Les deux ouvrent le même modal pour saisir / modifier / supprimer
 * l'objectif. Écriture directe sur propfirm_accounts (goal_amount_eur,
 * goal_basis, goal_deadline, goal_notes).
 */

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeGoalProgress, validateGoalDraft, isValidGoal,
  BASIS_LABEL, STATUS_COLOR, formatProgressEur,
  type Goal, type GoalBasis, type GoalDraft, type GoalInput,
} from '@/lib/propfirm/goal'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AccountRef {
  id: string
  starting_balance: number
  current_balance: number
  goal_amount_eur: number | null
  goal_basis: GoalBasis | null
  goal_deadline: string | null
  goal_notes: string | null
}

interface Props {
  account: AccountRef
  pnls: Array<{ date: string; pnl: number }>
  lastPayoutDate: string | null
  onDone(): void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

function toGoal(a: AccountRef): Goal | null {
  if (a.goal_amount_eur == null || !a.goal_basis) return null
  return {
    amount_eur: Number(a.goal_amount_eur),
    basis: a.goal_basis,
    deadline: a.goal_deadline,
    notes: a.goal_notes,
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
}
const modal: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
  display: 'flex', flexDirection: 'column', gap: 16,
  maxHeight: '90vh', overflowY: 'auto',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit',
}
const textareaStyle: React.CSSProperties = {
  ...inputStyle, height: 60, padding: 10, resize: 'vertical',
}
const btn: React.CSSProperties = {
  height: 40, padding: '0 16px', borderRadius: 8, border: 'none',
  background: 'var(--color-accent)', color: '#09090b',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  ...btn, background: 'transparent', color: 'var(--text)',
  border: '1px solid var(--border)',
}
const btnDanger: React.CSSProperties = {
  ...btn, background: 'rgba(239,68,68,0.14)', color: '#ef4444',
  border: '1px solid rgba(239,68,68,0.35)',
}
const errText: React.CSSProperties = { color: '#ef4444', fontSize: 11, marginTop: 2 }

// ─── AccountGoalBar : barre + progression + clic → edit ─────────────────────

export function AccountGoalBar({ account, pnls, lastPayoutDate, onDone }: Props) {
  const [edit, setEdit] = useState(false)
  const goal = toGoal(account)

  const input: GoalInput = useMemo(() => ({
    goal,
    starting_balance: Number(account.starting_balance),
    current_balance: Number(account.current_balance),
    pnls,
    lastPayoutDate,
    todayISO: todayISO(),
  }), [goal, account, pnls, lastPayoutDate])

  const progress = useMemo(() => computeGoalProgress(input), [input])

  if (!goal) {
    return (
      <>
        <button type="button" onClick={() => setEdit(true)}
          style={{
            width: '100%', height: 36, padding: '0 12px',
            borderRadius: 8, border: '1px dashed var(--border)',
            background: 'transparent', color: 'var(--text3)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginBottom: 12,
          }}
        >🎯 Définir un objectif</button>
        {edit && (
          <GoalModal account={account} onClose={() => setEdit(false)}
            onDone={() => { setEdit(false); onDone() }} />
        )}
      </>
    )
  }

  const color = STATUS_COLOR[progress.status]
  const pctClamped = Math.max(0, Math.min(100, progress.pct))
  const statusLabel =
    progress.status === 'done' ? '🎯 Objectif atteint'
    : progress.status === 'late' ? `⏰ ${Math.abs(progress.daysLeft ?? 0)}j de retard`
    : progress.status === 'urgent' ? `⚠ ${progress.daysLeft ?? 0}j restants`
    : progress.daysLeft != null ? `${progress.daysLeft}j restants`
    : 'en cours'

  return (
    <>
      <button type="button" onClick={() => setEdit(true)}
        aria-label="Modifier l'objectif"
        style={{
          width: '100%', textAlign: 'left', border: 'none',
          background: 'transparent', padding: 0, cursor: 'pointer',
          fontFamily: 'inherit', color: 'inherit',
          marginBottom: 12,
        }}>
        <div style={{
          padding: '12px 14px',
          background: `linear-gradient(135deg, rgba(0,0,0,0) 0%, ${color}11 100%)`,
          border: `1px solid ${color}44`, borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                🎯 Objectif
              </span>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, fontFamily: 'ui-monospace' }}>
                {formatProgressEur(progress.current)} / {Math.round(progress.target).toLocaleString('fr-FR')} €
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {BASIS_LABEL[goal.basis]}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'ui-monospace', lineHeight: 1 }}>
                {progress.pct}<span style={{ fontSize: 12, color: 'var(--text3)' }}>%</span>
              </span>
              <span style={{ fontSize: 11, color, fontWeight: 600 }}>{statusLabel}</span>
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%', width: `${pctClamped}%`,
              background: progress.status === 'done'
                ? `linear-gradient(90deg, #22c55e, #4ade80)`
                : progress.status === 'late'
                  ? '#ef4444'
                  : progress.status === 'urgent'
                    ? '#f59e0b'
                    : 'linear-gradient(90deg, #3b82f6, #22c55e)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          {progress.status !== 'done' && (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Reste <strong style={{ fontFamily: 'ui-monospace', color: 'var(--text2)' }}>
                {Math.round(progress.remaining).toLocaleString('fr-FR')} €
              </strong> à atteindre
              {goal.deadline && (
                <> · deadline <strong style={{ color: 'var(--text2)' }}>
                  {new Date(goal.deadline + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </strong></>
              )}
            </div>
          )}
          {goal.notes && (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>— {goal.notes}</div>
          )}
        </div>
      </button>
      {edit && (
        <GoalModal account={account} onClose={() => setEdit(false)}
          onDone={() => { setEdit(false); onDone() }} />
      )}
    </>
  )
}

// ─── Modal de saisie ───────────────────────────────────────────────────────

function GoalModal({ account, onClose, onDone }: {
  account: AccountRef; onClose(): void; onDone(): void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const existing = toGoal(account)
  const [d, setD] = useState<GoalDraft>({
    amount_eur: existing?.amount_eur ?? 5000,
    basis: existing?.basis ?? 'since_last_payout',
    deadline: existing?.deadline ?? '',
    notes: existing?.notes ?? '',
  })
  const errors = validateGoalDraft(d)
  const canSave = isValidGoal(errors)

  async function save() {
    setSubmitted(true)
    if (!canSave) return
    setSaving(true)
    const { error } = await supabase.from('propfirm_accounts').update({
      goal_amount_eur: d.amount_eur,
      goal_basis: d.basis,
      goal_deadline: d.deadline || null,
      goal_notes: d.notes.trim() || null,
    }).eq('id', account.id)
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    onDone()
  }

  async function clearGoal() {
    if (!confirm('Supprimer cet objectif ?')) return
    setSaving(true)
    const { error } = await supabase.from('propfirm_accounts').update({
      goal_amount_eur: null,
      goal_basis: null,
      goal_deadline: null,
      goal_notes: null,
    }).eq('id', account.id)
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    onDone()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          🎯 {existing ? 'Modifier l\'objectif' : 'Définir un objectif'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle} htmlFor="goal-amount">Montant à atteindre (€)</label>
          <input id="goal-amount" type="number" step="any" min={0}
            value={d.amount_eur}
            onChange={(e) => setD({ ...d, amount_eur: Number(e.target.value) })}
            style={inputStyle} />
          {submitted && errors.amount_eur && <div style={errText}>{errors.amount_eur}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Base de calcul</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['since_last_payout', 'since_start'] as GoalBasis[]).map((b) => {
              const active = d.basis === b
              return (
                <label key={b} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'var(--bg3)',
                  fontSize: 12,
                }}>
                  <input type="radio" name="goal-basis" checked={active}
                    onChange={() => setD({ ...d, basis: b })}
                    style={{ accentColor: 'var(--color-accent)' }} />
                  <span style={{ color: active ? 'var(--color-accent)' : 'var(--text)' }}>
                    {b === 'since_last_payout' ? 'Depuis le dernier payout' : 'Depuis le début du compte'}
                  </span>
                </label>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {d.basis === 'since_last_payout'
              ? 'Le progrès reset à chaque payout — bien pour viser un prochain payout.'
              : 'Le progrès cumule tout depuis l\'ouverture (ou le dernier reset) — bien pour un scale-up.'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle} htmlFor="goal-deadline">Deadline (optionnel)</label>
          <input id="goal-deadline" type="date" value={d.deadline}
            onChange={(e) => setD({ ...d, deadline: e.target.value })}
            style={inputStyle} />
          {submitted && errors.deadline && <div style={errText}>{errors.deadline}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle} htmlFor="goal-notes">Note (optionnel)</label>
          <textarea id="goal-notes" value={d.notes}
            onChange={(e) => setD({ ...d, notes: e.target.value })}
            placeholder="Prochain payout prévu, scale-up vers 200k…"
            style={textareaStyle} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {existing && (
            <button type="button" onClick={clearGoal} disabled={saving} style={btnDanger}>
              Supprimer
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
            <button type="button" onClick={save} disabled={saving}
              style={{ ...btn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Enregistrement…' : existing ? 'Modifier' : 'Définir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
