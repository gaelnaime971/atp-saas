'use client'

/**
 * Trading perso — gestion opérationnelle des comptes financés.
 *
 * Deux surfaces exportées :
 *
 *   - PromoteToFundedButton : bouton + modal sur une carte Challenge
 *     "passed" pour passer le compte en financé (reset du solde,
 *     payout split, règles DD funded).
 *
 *   - FundedActionsPanel : panneau d'actions pour un compte funded :
 *     Scale-up, Reset, Clôturer. Chaque action ouvre un formulaire
 *     court, valide, écrit (UPDATE propfirm_accounts + INSERT
 *     propfirm_account_events) et appelle onDone pour que le parent
 *     rafraîchisse. Timeline des événements affichée en bas.
 */

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  EVENT_LABEL, EVENT_COLOR,
  validatePromote, validateScaleUp, validateReset, validateClose, isValid,
  buildPromoteMutation, buildScaleUpMutation, buildResetMutation, buildCloseMutation,
  describeEvent, formatEur,
  type AccountSnapshot, type AccountEvent,
  type PromoteDraft, type ScaleUpDraft, type ResetDraft, type CloseDraft,
} from '@/lib/propfirm/events'

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
const input: React.CSSProperties = {
  width: '100%', height: 38, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit',
}
const textarea: React.CSSProperties = {
  ...input, height: 72, padding: 10, resize: 'vertical',
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
const errText: React.CSSProperties = { color: '#ef4444', fontSize: 11, marginTop: 2 }

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

// ─── PromoteToFundedButton ─────────────────────────────────────────────────

export function PromoteToFundedButton({
  account, onDone,
}: {
  account: AccountSnapshot
  onDone(): void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{
          height: 32, padding: '0 10px', borderRadius: 6,
          background: 'rgba(34,197,94,0.15)', color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.35)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >💰 Passer en financé</button>
      {open && (
        <PromoteModal account={account} onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onDone() }} />
      )}
    </>
  )
}

function PromoteModal({ account, onClose, onDone }: {
  account: AccountSnapshot; onClose(): void; onDone(): void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [d, setD] = useState<PromoteDraft>({
    new_starting_balance: account.account_size,
    payout_split_pct: account.payout_split_pct ?? 80,
    max_total_dd_pct: account.max_total_dd_pct ?? 10,
    trailing_dd: account.trailing_dd,
    notes: '',
    event_date: todayISO(),
  })
  const errors = validatePromote(d)
  const canSave = isValid(errors)

  async function save() {
    setSubmitted(true)
    if (!canSave) return
    setSaving(true)
    const { patch, event } = buildPromoteMutation(account, d)
    const [u, e] = await Promise.all([
      supabase.from('propfirm_accounts').update(patch).eq('id', account.id),
      supabase.from('propfirm_account_events').insert({
        account_id: account.id, ...event,
      }),
    ])
    setSaving(false)
    if (u.error || e.error) {
      alert('Erreur : ' + (u.error?.message || e.error?.message))
      return
    }
    onDone()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>💰 Passer en financé</h3>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {account.label} · {account.propfirm} · {formatEur(account.account_size)}
        </div>

        <Field label="Solde de départ (funded)" error={submitted ? errors.new_starting_balance : undefined}>
          <input type="number" step="any" value={d.new_starting_balance}
            onChange={(e) => setD({ ...d, new_starting_balance: Number(e.target.value) })}
            style={input} />
        </Field>

        <Field label="Payout split (% que tu gardes)" error={submitted ? errors.payout_split_pct : undefined}>
          <input type="number" min={1} max={100} value={d.payout_split_pct}
            onChange={(e) => setD({ ...d, payout_split_pct: Number(e.target.value) })}
            style={input} />
        </Field>

        <Field label="Max DD total (% du capital, funded)" error={submitted ? errors.max_total_dd_pct : undefined}>
          <input type="number" step="0.1" value={d.max_total_dd_pct ?? ''}
            onChange={(e) => setD({ ...d, max_total_dd_pct: e.target.value === '' ? null : Number(e.target.value) })}
            style={input} />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={d.trailing_dd}
            onChange={(e) => setD({ ...d, trailing_dd: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: 'var(--color-accent)' }} />
          Trailing DD (le DD max suit l'equity haute)
        </label>

        <Field label="Date de passage en financé" error={submitted ? errors.event_date : undefined}>
          <input type="date" value={d.event_date}
            onChange={(e) => setD({ ...d, event_date: e.target.value })}
            style={input} />
        </Field>

        <Field label="Note (optionnel)">
          <textarea value={d.notes}
            onChange={(e) => setD({ ...d, notes: e.target.value })}
            placeholder="Première validation, bonus, …"
            style={textarea} />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
          <button type="button" onClick={save} disabled={saving} style={{ ...btn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Passer en financé'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── FundedActionsPanel ────────────────────────────────────────────────────

type ActionKind = 'scale_up' | 'reset' | 'close' | null

export function FundedActionsPanel({
  account, events, onDone,
}: {
  account: AccountSnapshot
  events: AccountEvent[]
  onDone(): void
}) {
  const [action, setAction] = useState<ActionKind>(null)
  const sorted = useMemo(
    () => [...events].sort((a, b) => (b.event_date || '').localeCompare(a.event_date || '')),
    [events],
  )

  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 8,
      background: 'var(--bg3)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Gérer ce compte
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <ActionBtn label="⬆ Scale-up" onClick={() => setAction('scale_up')} color="#a855f7" />
        <ActionBtn label="↻ Reset" onClick={() => setAction('reset')} color="#f59e0b" />
        <ActionBtn label="✕ Clôturer" onClick={() => setAction('close')} color="#64748b" />
      </div>

      {sorted.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
            Historique ({sorted.length})
          </summary>
          <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((ev) => (
              <li key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: EVENT_COLOR[ev.kind] + '22',
                  color: EVENT_COLOR[ev.kind],
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{EVENT_LABEL[ev.kind]}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)' }}>
                  {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
                <span style={{ color: 'var(--text2)', flex: 1 }}>{describeEvent(ev)}</span>
                {ev.notes && (
                  <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>— {ev.notes}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {action === 'scale_up' && (
        <ScaleUpModal account={account} onClose={() => setAction(null)}
          onDone={() => { setAction(null); onDone() }} />
      )}
      {action === 'reset' && (
        <ResetModal account={account} onClose={() => setAction(null)}
          onDone={() => { setAction(null); onDone() }} />
      )}
      {action === 'close' && (
        <CloseModal account={account} onClose={() => setAction(null)}
          onDone={() => { setAction(null); onDone() }} />
      )}
    </div>
  )
}

function ActionBtn({ label, onClick, color }: { label: string; onClick(): void; color: string }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        height: 32, padding: '0 10px', borderRadius: 6,
        background: color + '22', color, border: '1px solid ' + color + '55',
        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{label}</button>
  )
}

// ─── Scale-up ──────────────────────────────────────────────────────────────

function ScaleUpModal({ account, onClose, onDone }: {
  account: AccountSnapshot; onClose(): void; onDone(): void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [d, setD] = useState<ScaleUpDraft>({
    new_account_size: Math.round(account.account_size * 2),
    new_starting_balance: Math.round(account.account_size * 2),
    notes: '',
    event_date: todayISO(),
  })
  const errors = validateScaleUp(d, account.account_size)
  const canSave = isValid(errors)

  async function save() {
    setSubmitted(true)
    if (!canSave) return
    setSaving(true)
    const { patch, event } = buildScaleUpMutation(account, d)
    const [u, e] = await Promise.all([
      supabase.from('propfirm_accounts').update(patch).eq('id', account.id),
      supabase.from('propfirm_account_events').insert({ account_id: account.id, ...event }),
    ])
    setSaving(false)
    if (u.error || e.error) { alert('Erreur : ' + (u.error?.message || e.error?.message)); return }
    onDone()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⬆ Scale-up</h3>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {account.label} — taille actuelle : {formatEur(account.account_size)}
        </div>
        <Field label="Nouvelle taille de compte" error={submitted ? errors.new_account_size : undefined}>
          <input type="number" step="1000" value={d.new_account_size}
            onChange={(e) => {
              const n = Number(e.target.value)
              setD({ ...d, new_account_size: n, new_starting_balance: n })
            }}
            style={input} />
        </Field>
        <Field label="Nouveau solde de départ" error={submitted ? errors.new_starting_balance : undefined}>
          <input type="number" step="1000" value={d.new_starting_balance}
            onChange={(e) => setD({ ...d, new_starting_balance: Number(e.target.value) })}
            style={input} />
        </Field>
        <Field label="Date" error={submitted ? errors.event_date : undefined}>
          <input type="date" value={d.event_date}
            onChange={(e) => setD({ ...d, event_date: e.target.value })} style={input} />
        </Field>
        <Field label="Note (optionnel)">
          <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} style={textarea} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
          <button type="button" onClick={save} disabled={saving}
            style={{ ...btn, background: '#a855f7', color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Scale-up'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reset ─────────────────────────────────────────────────────────────────

function ResetModal({ account, onClose, onDone }: {
  account: AccountSnapshot; onClose(): void; onDone(): void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [d, setD] = useState<ResetDraft>({
    cost_eur: 0,
    new_starting_balance: account.account_size,
    notes: '',
    event_date: todayISO(),
  })
  const errors = validateReset(d)
  const canSave = isValid(errors)

  async function save() {
    setSubmitted(true)
    if (!canSave) return
    setSaving(true)
    const { patch, event } = buildResetMutation(account, d)
    const [u, e] = await Promise.all([
      supabase.from('propfirm_accounts').update(patch).eq('id', account.id),
      supabase.from('propfirm_account_events').insert({ account_id: account.id, ...event }),
    ])
    setSaving(false)
    if (u.error || e.error) { alert('Erreur : ' + (u.error?.message || e.error?.message)); return }
    onDone()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>↻ Reset du compte</h3>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {account.label} — remet le solde à la valeur de départ.
        </div>
        <Field label="Coût du reset (€)" error={submitted ? errors.cost_eur : undefined}>
          <input type="number" step="any" min={0} value={d.cost_eur}
            onChange={(e) => setD({ ...d, cost_eur: Number(e.target.value) })} style={input} />
        </Field>
        <Field label="Solde de départ après reset" error={submitted ? errors.new_starting_balance : undefined}>
          <input type="number" step="any" value={d.new_starting_balance}
            onChange={(e) => setD({ ...d, new_starting_balance: Number(e.target.value) })} style={input} />
        </Field>
        <Field label="Date" error={submitted ? errors.event_date : undefined}>
          <input type="date" value={d.event_date}
            onChange={(e) => setD({ ...d, event_date: e.target.value })} style={input} />
        </Field>
        <Field label="Note (optionnel)">
          <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })}
            placeholder="Raison du reset…" style={textarea} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
          <button type="button" onClick={save} disabled={saving}
            style={{ ...btn, background: '#f59e0b', color: '#000', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Close ─────────────────────────────────────────────────────────────────

const CLOSE_REASON_LABELS: Record<CloseDraft['reason'], string> = {
  profit_withdrawn: 'Profit retiré, compte terminé',
  rule_breach: 'Violation de règle (compte cassé)',
  scaled_elsewhere: 'Scale-up vers un autre compte',
  other: 'Autre',
}

function CloseModal({ account, onClose, onDone }: {
  account: AccountSnapshot; onClose(): void; onDone(): void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [d, setD] = useState<CloseDraft>({
    reason: 'profit_withdrawn',
    notes: '',
    event_date: todayISO(),
  })
  const errors = validateClose(d)
  const canSave = isValid(errors)

  async function save() {
    setSubmitted(true)
    if (!canSave) return
    setSaving(true)
    const { patch, event } = buildCloseMutation(account, d)
    const [u, e] = await Promise.all([
      supabase.from('propfirm_accounts').update(patch).eq('id', account.id),
      supabase.from('propfirm_account_events').insert({ account_id: account.id, ...event }),
    ])
    setSaving(false)
    if (u.error || e.error) { alert('Erreur : ' + (u.error?.message || e.error?.message)); return }
    onDone()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>✕ Clôturer le compte</h3>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {account.label} — le compte sera marqué comme fermé.
        </div>
        <Field label="Raison" error={submitted ? errors.reason : undefined}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(Object.keys(CLOSE_REASON_LABELS) as Array<CloseDraft['reason']>).map((k) => {
              const active = d.reason === k
              return (
                <label key={k} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(var(--color-accent-rgb), 0.10)' : 'var(--bg3)',
                  fontSize: 12,
                }}>
                  <input type="radio" name="close-reason" checked={active}
                    onChange={() => setD({ ...d, reason: k })}
                    style={{ accentColor: 'var(--color-accent)' }} />
                  <span style={{ color: active ? 'var(--color-accent)' : 'var(--text)' }}>
                    {CLOSE_REASON_LABELS[k]}
                  </span>
                </label>
              )
            })}
          </div>
        </Field>
        <Field label="Date" error={submitted ? errors.event_date : undefined}>
          <input type="date" value={d.event_date}
            onChange={(e) => setD({ ...d, event_date: e.target.value })} style={input} />
        </Field>
        <Field label="Note (optionnel)">
          <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} style={textarea} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Annuler</button>
          <button type="button" onClick={save} disabled={saving}
            style={{
              ...btn,
              background: d.reason === 'rule_breach' ? '#ef4444' : '#64748b',
              color: '#fff', opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Enregistrement…' : 'Clôturer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Field helper ──────────────────────────────────────────────────────────

function Field({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {error && <div style={errText}>{error}</div>}
    </div>
  )
}
