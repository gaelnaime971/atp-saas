/**
 * Trading perso — logique PURE autour des événements de cycle de vie
 * d'un compte propfirm (passage en financé, scale-up, reset, clôture,
 * breach). Zéro I/O : les composants React s'en servent pour construire
 * les mutations qu'ils envoient ensuite à Supabase.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AccountEventKind =
  | 'funded_start'
  | 'scale_up'
  | 'reset'
  | 'closed'
  | 'rule_breach'
  | 'note'

export interface AccountEvent {
  id: string
  account_id: string
  kind: AccountEventKind
  event_date: string         // YYYY-MM-DD
  payload: Record<string, unknown>
  notes: string | null
  created_at: string
}

/** Snapshot utile côté UI quand on construit le modal d'action. */
export interface AccountSnapshot {
  id: string
  label: string
  propfirm: string
  account_size: number
  starting_balance: number
  current_balance: number
  phase: 'p1' | 'p2' | 'funded' | 'failed'
  status: 'active' | 'passed' | 'failed' | 'paused'
  max_total_dd_pct: number | null
  payout_split_pct: number | null
  trailing_dd: boolean
}

// ─── Libellés + couleurs côté UI ───────────────────────────────────────────

export const EVENT_LABEL: Readonly<Record<AccountEventKind, string>> = {
  funded_start: 'Passage en financé',
  scale_up:     'Scale-up',
  reset:        'Reset',
  closed:       'Clôture',
  rule_breach:  'Violation de règle',
  note:         'Note',
}

export const EVENT_COLOR: Readonly<Record<AccountEventKind, string>> = {
  funded_start: '#22c55e',
  scale_up:     '#a855f7',
  reset:        '#f59e0b',
  closed:       '#64748b',
  rule_breach:  '#ef4444',
  note:         '#3b82f6',
}

// ─── Validation des formulaires d'action ────────────────────────────────────

export interface PromoteDraft {
  new_starting_balance: number      // par défaut = account_size
  payout_split_pct: number          // 1..100, défaut 80
  max_total_dd_pct: number | null   // optionnel
  trailing_dd: boolean
  notes: string
  event_date: string
}

export interface ScaleUpDraft {
  new_account_size: number
  new_starting_balance: number      // par défaut = new_account_size
  notes: string
  event_date: string
}

export interface ResetDraft {
  cost_eur: number                  // frais payés pour le reset
  new_starting_balance: number      // par défaut = account_size
  notes: string
  event_date: string
}

export interface CloseDraft {
  reason: 'profit_withdrawn' | 'rule_breach' | 'scaled_elsewhere' | 'other'
  notes: string
  event_date: string
}

export interface ValidationErrors {
  [field: string]: string | undefined
}

function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function validatePromote(d: PromoteDraft): ValidationErrors {
  const e: ValidationErrors = {}
  if (!isPositive(d.new_starting_balance)) e.new_starting_balance = 'Solde de départ requis (> 0).'
  if (!(d.payout_split_pct >= 1 && d.payout_split_pct <= 100)) {
    e.payout_split_pct = 'Entre 1 et 100 %.'
  }
  if (d.max_total_dd_pct != null && !(d.max_total_dd_pct >= 0 && d.max_total_dd_pct <= 100)) {
    e.max_total_dd_pct = 'Entre 0 et 100 %.'
  }
  if (!d.event_date) e.event_date = 'Date requise.'
  return e
}

export function validateScaleUp(d: ScaleUpDraft, previousSize: number): ValidationErrors {
  const e: ValidationErrors = {}
  if (!isPositive(d.new_account_size)) e.new_account_size = 'Nouvelle taille requise (> 0).'
  else if (d.new_account_size <= previousSize) {
    e.new_account_size = `Doit être supérieur à l'ancienne taille (${previousSize.toLocaleString('fr-FR')} €).`
  }
  if (!isPositive(d.new_starting_balance)) e.new_starting_balance = 'Solde de départ requis (> 0).'
  if (!d.event_date) e.event_date = 'Date requise.'
  return e
}

export function validateReset(d: ResetDraft): ValidationErrors {
  const e: ValidationErrors = {}
  if (!Number.isFinite(d.cost_eur) || d.cost_eur < 0) e.cost_eur = 'Coût ≥ 0 (0 si gratuit).'
  if (!isPositive(d.new_starting_balance)) e.new_starting_balance = 'Solde de départ requis (> 0).'
  if (!d.event_date) e.event_date = 'Date requise.'
  return e
}

export function validateClose(d: CloseDraft): ValidationErrors {
  const e: ValidationErrors = {}
  const allowed = ['profit_withdrawn', 'rule_breach', 'scaled_elsewhere', 'other'] as const
  if (!allowed.includes(d.reason)) e.reason = 'Raison requise.'
  if (!d.event_date) e.event_date = 'Date requise.'
  return e
}

export function isValid(e: ValidationErrors): boolean {
  return Object.values(e).every(v => !v)
}

// ─── Construction des mutations (compte + event) ────────────────────────────
//
// Chaque action produit DEUX things : un UPDATE sur propfirm_accounts
// (compte_patch), et un INSERT sur propfirm_account_events (event_insert).
// Les composants React envoient ces deux objets à Supabase, en séquence.

export interface AccountPatch {
  phase?: AccountSnapshot['phase']
  status?: AccountSnapshot['status']
  starting_balance?: number
  current_balance?: number
  account_size?: number
  max_total_dd_pct?: number | null
  payout_split_pct?: number | null
  trailing_dd?: boolean
}

export interface EventInsert {
  kind: AccountEventKind
  event_date: string
  payload: Record<string, unknown>
  notes: string | null
}

export interface MutationBundle {
  patch: AccountPatch
  event: EventInsert
}

/**
 * Passage d'un challenge réussi en financé. Reset le solde au nouveau
 * starting_balance (par défaut = account_size), passe phase=funded et
 * status=active, pose les règles funded (DD, payout_split, trailing).
 */
export function buildPromoteMutation(
  snap: AccountSnapshot,
  d: PromoteDraft,
): MutationBundle {
  return {
    patch: {
      phase: 'funded',
      status: 'active',
      starting_balance: d.new_starting_balance,
      current_balance: d.new_starting_balance,
      payout_split_pct: d.payout_split_pct,
      max_total_dd_pct: d.max_total_dd_pct,
      trailing_dd: d.trailing_dd,
    },
    event: {
      kind: 'funded_start',
      event_date: d.event_date,
      payload: {
        prev_phase: snap.phase,
        prev_balance: snap.current_balance,
        new_balance: d.new_starting_balance,
        payout_split_pct: d.payout_split_pct,
        max_total_dd_pct: d.max_total_dd_pct,
        trailing_dd: d.trailing_dd,
      },
      notes: d.notes.trim() || null,
    },
  }
}

/** Scale-up : nouvelle taille de compte, nouveau starting_balance. */
export function buildScaleUpMutation(
  snap: AccountSnapshot,
  d: ScaleUpDraft,
): MutationBundle {
  return {
    patch: {
      account_size: d.new_account_size,
      starting_balance: d.new_starting_balance,
      current_balance: d.new_starting_balance,
    },
    event: {
      kind: 'scale_up',
      event_date: d.event_date,
      payload: {
        prev_size: snap.account_size,
        new_size: d.new_account_size,
        prev_balance: snap.current_balance,
        new_balance: d.new_starting_balance,
      },
      notes: d.notes.trim() || null,
    },
  }
}

/** Reset payant : remet le compte à son starting_balance d'origine. */
export function buildResetMutation(
  snap: AccountSnapshot,
  d: ResetDraft,
): MutationBundle {
  return {
    patch: {
      starting_balance: d.new_starting_balance,
      current_balance: d.new_starting_balance,
      status: 'active',
    },
    event: {
      kind: 'reset',
      event_date: d.event_date,
      payload: {
        prev_balance: snap.current_balance,
        new_balance: d.new_starting_balance,
        cost_eur: d.cost_eur,
      },
      notes: d.notes.trim() || null,
    },
  }
}

/**
 * Clôture d'un compte funded. La raison dirige le status :
 *   - 'rule_breach' → status='failed' (compte cassé)
 *   - autres        → status='passed' (clôture propre : profit retiré,
 *     scale-up vers un nouveau compte, départ volontaire).
 */
export function buildCloseMutation(
  snap: AccountSnapshot,
  d: CloseDraft,
): MutationBundle {
  const status: AccountSnapshot['status'] = d.reason === 'rule_breach' ? 'failed' : 'passed'
  return {
    patch: {
      status,
      phase: d.reason === 'rule_breach' ? 'failed' : snap.phase,
    },
    event: {
      kind: d.reason === 'rule_breach' ? 'rule_breach' : 'closed',
      event_date: d.event_date,
      payload: {
        reason: d.reason,
        final_balance: snap.current_balance,
        account_size: snap.account_size,
      },
      notes: d.notes.trim() || null,
    },
  }
}

// ─── Libellé lisible d'un événement (timeline) ─────────────────────────────

export function describeEvent(ev: AccountEvent): string {
  const p = ev.payload || {}
  switch (ev.kind) {
    case 'funded_start': {
      const bal = Number(p.new_balance) || 0
      return `Compte financé — solde ${bal.toLocaleString('fr-FR')} €`
    }
    case 'scale_up': {
      const prev = Number(p.prev_size) || 0
      const next = Number(p.new_size) || 0
      return `Scale-up ${prev.toLocaleString('fr-FR')} € → ${next.toLocaleString('fr-FR')} €`
    }
    case 'reset': {
      const cost = Number(p.cost_eur) || 0
      return cost > 0
        ? `Reset payant (${cost.toLocaleString('fr-FR')} €)`
        : 'Reset gratuit'
    }
    case 'closed': {
      const reason = typeof p.reason === 'string' ? p.reason : 'other'
      const map: Record<string, string> = {
        profit_withdrawn: 'Clôture — profit retiré',
        scaled_elsewhere: 'Clôture — scale-up vers un autre compte',
        other: 'Clôture',
      }
      return map[reason] ?? 'Clôture'
    }
    case 'rule_breach':
      return 'Violation de règle (compte cassé)'
    case 'note':
      return 'Note'
  }
}

// ─── Format FR ─────────────────────────────────────────────────────────────

export function formatEur(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('fr-FR')} €`
}
