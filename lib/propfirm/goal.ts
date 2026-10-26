/**
 * Trading perso — logique PURE autour de l'objectif d'un compte funded.
 *
 * Un objectif = montant en € de profit à atteindre, calculé depuis
 * `goal_basis` :
 *   - 'since_last_payout' : current_balance - starting_balance ou,
 *     si un payout existe, somme des P&L depuis la date du dernier
 *     payout (le solde est reseté chaque payout côté caller) ;
 *   - 'since_start'       : current_balance - starting_balance pur,
 *     tel que remis à zéro par le dernier reset.
 *
 * Optionnel : deadline date → calcule `daysLeft` et un code couleur.
 */

export type GoalBasis = 'since_last_payout' | 'since_start'

export interface Goal {
  amount_eur: number
  basis: GoalBasis
  deadline: string | null       // YYYY-MM-DD
  notes: string | null
}

export interface GoalDraft {
  amount_eur: number
  basis: GoalBasis
  deadline: string              // '' = pas de deadline
  notes: string
}

export interface GoalProgress {
  /** Progrès actuel en € (peut être négatif). */
  current: number
  /** Montant visé en €. */
  target: number
  /** Pourcentage, non borné (peut dépasser 100). */
  pct: number
  /** Reste à atteindre en € (≥ 0). */
  remaining: number
  /** Jours restants avant la deadline, null si pas de deadline.
   *  Négatif si deadline dépassée. */
  daysLeft: number | null
  /** Code visuel : 'done' si atteint, 'late' si deadline dépassée,
   *  'urgent' si deadline dans ≤ 7 j, 'on_track' sinon. */
  status: 'done' | 'late' | 'urgent' | 'on_track' | 'none'
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface GoalErrors {
  amount_eur?: string
  basis?: string
  deadline?: string
}

export function validateGoalDraft(d: GoalDraft): GoalErrors {
  const e: GoalErrors = {}
  if (!Number.isFinite(d.amount_eur) || d.amount_eur <= 0) {
    e.amount_eur = 'Montant requis (> 0).'
  }
  if (d.basis !== 'since_last_payout' && d.basis !== 'since_start') {
    e.basis = 'Base de calcul requise.'
  }
  if (d.deadline) {
    // Valide la date (YYYY-MM-DD)
    const d2 = new Date(d.deadline + 'T12:00:00')
    if (isNaN(d2.getTime())) e.deadline = 'Date invalide.'
  }
  return e
}

export function isValidGoal(e: GoalErrors): boolean {
  return !e.amount_eur && !e.basis && !e.deadline
}

// ─── Calcul du progrès ──────────────────────────────────────────────────────

export interface GoalInput {
  goal: Goal | null
  starting_balance: number
  current_balance: number
  /** P&L classé par date croissante (anciennement) ou décroissante
   *  — on filtre selon lastPayoutDate. */
  pnls: Array<{ date: string; pnl: number }>
  /** Date du dernier payout (YYYY-MM-DD) ou null. */
  lastPayoutDate: string | null
  /** Date "d'aujourd'hui" (YYYY-MM-DD). Injectable pour les tests. */
  todayISO: string
}

export function computeGoalProgress(input: GoalInput): GoalProgress {
  const g = input.goal
  if (!g || !Number.isFinite(g.amount_eur) || g.amount_eur <= 0) {
    return {
      current: 0, target: 0, pct: 0, remaining: 0,
      daysLeft: null, status: 'none',
    }
  }

  // Progression en €
  let current: number
  if (g.basis === 'since_last_payout' && input.lastPayoutDate) {
    current = input.pnls
      .filter(p => p.date > input.lastPayoutDate!)
      .reduce((s, p) => s + (Number(p.pnl) || 0), 0)
  } else {
    current = (Number(input.current_balance) || 0) - (Number(input.starting_balance) || 0)
  }

  const target = Number(g.amount_eur)
  const pct = target > 0 ? Math.round((current / target) * 100) : 0
  const remaining = Math.max(0, target - current)

  // Deadline
  let daysLeft: number | null = null
  if (g.deadline) {
    const dl = new Date(g.deadline + 'T12:00:00').getTime()
    const now = new Date(input.todayISO + 'T12:00:00').getTime()
    if (Number.isFinite(dl) && Number.isFinite(now)) {
      daysLeft = Math.round((dl - now) / 86_400_000)
    }
  }

  let status: GoalProgress['status']
  if (current >= target) status = 'done'
  else if (daysLeft != null && daysLeft < 0) status = 'late'
  else if (daysLeft != null && daysLeft <= 7) status = 'urgent'
  else status = 'on_track'

  return { current, target, pct, remaining, daysLeft, status }
}

// ─── Format ─────────────────────────────────────────────────────────────────

export function formatProgressEur(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.round(n))
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${abs.toLocaleString('fr-FR')} €`
}

export const BASIS_LABEL: Readonly<Record<GoalBasis, string>> = {
  since_last_payout: 'depuis le dernier payout',
  since_start:       'depuis le début du compte',
}

export const STATUS_COLOR: Readonly<Record<GoalProgress['status'], string>> = {
  done:     '#22c55e',
  late:     '#ef4444',
  urgent:   '#f59e0b',
  on_track: '#3b82f6',
  none:     '#64748b',
}
