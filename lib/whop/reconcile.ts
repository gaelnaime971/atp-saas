/**
 * Calcul PUR du plan de réconciliation profils ↔ Whop.
 *
 * Partagé entre :
 *   • GET  /api/admin/whop-sync-report          (simulation lecture seule)
 *   • POST /api/admin/whop-sync-report?apply=1  (application + journal admin)
 *   • GET  /api/cron/whop-reconcile             (cron quotidien)
 *
 * Règle unique (Whop = source de vérité) :
 *   Pour chaque profil TRADER :
 *     1. On cherche un matching sur whop_user_id, puis sur email (lower).
 *     2. Si match + flag=false              → set true  + journal
 *     3. Si match + whop_user_id vide       → link whop_user_id + journal
 *        (le set true précédent couvre l'activation ; link traité séparément)
 *     4. Si pas de match + flag=true        → set false + journal
 *
 *   Les profils ADMIN sont IGNORÉS — la règle d'accès
 *   (lib/access/member-access) les laisse passer par leur rôle.
 *
 *   JAMAIS de suppression. JAMAIS d'écriture sur l'auth.users.
 *
 * Reste pur : aucun I/O, uniquement des maps + sets. Testable au cycle
 * complet sans réseau ni DB.
 */

import type { SyncMembership } from './client'

export interface ProfileForReconcile {
  id: string
  email: string | null
  role: 'admin' | 'trader' | null
  whop_user_id: string | null
  whop_subscription_active: boolean
}

export type ChangeKind =
  | 'set_subscription_active'
  | 'set_subscription_inactive'
  | 'link_whop_user_id'

export interface ReconcileOp {
  kind: ChangeKind
  profileId: string
  email: string | null
  /** Snapshot des champs touchés AVANT. */
  before: {
    whop_subscription_active: boolean
    whop_user_id: string | null
  }
  /** Snapshot des champs touchés APRÈS (uniquement les colonnes qui changent). */
  after: {
    whop_subscription_active?: boolean
    whop_user_id?: string | null
  }
  /** Comment le match s'est fait (ou pourquoi pas de match). */
  reason:
    | 'matched_by_whop_user_id'
    | 'matched_by_email'
    | 'no_match_but_flag_true'
}

export interface ReconcileSummary {
  totals: {
    profilesInspected: number
    adminsSkipped: number
    tradersMatched: number
    opsPlanned: number
    byKind: Record<ChangeKind, number>
  }
}

export interface ReconcileResult {
  ops: ReconcileOp[]
  summary: ReconcileSummary
}

/**
 * Construit le plan — pure, pas d'I/O.
 */
export function computeSyncPlan(
  memberships: SyncMembership[],
  profiles: ProfileForReconcile[],
): ReconcileResult {
  // 1. Index memberships Whop pour lookups O(1).
  //    - par user_id (clé primaire du rapprochement)
  //    - par email (lower-case, fallback)
  const activeByWhopUserId = new Set<string>()
  const activeByEmail = new Map<string, { whopUserId: string | null }>()
  for (const m of memberships) {
    if (m.whopUserId) activeByWhopUserId.add(m.whopUserId)
    if (m.email) {
      const key = m.email.toLowerCase()
      // On garde l'entrée qui a un whopUserId si disponible.
      const existing = activeByEmail.get(key)
      if (!existing || (existing.whopUserId === null && m.whopUserId)) {
        activeByEmail.set(key, { whopUserId: m.whopUserId })
      }
    }
  }

  const ops: ReconcileOp[] = []
  const byKind: Record<ChangeKind, number> = {
    set_subscription_active: 0,
    set_subscription_inactive: 0,
    link_whop_user_id: 0,
  }

  let adminsSkipped = 0
  let tradersMatched = 0

  for (const p of profiles) {
    // Les admins sont hors du cycle Whop (whitelist côté middleware).
    if (p.role === 'admin') {
      adminsSkipped++
      continue
    }

    // Match par whop_user_id d'abord, puis par email.
    let matchedWhopUserId: string | null = null
    let matchReason: 'matched_by_whop_user_id' | 'matched_by_email' | null = null

    if (p.whop_user_id && activeByWhopUserId.has(p.whop_user_id)) {
      matchedWhopUserId = p.whop_user_id
      matchReason = 'matched_by_whop_user_id'
    } else if (p.email) {
      const byEmail = activeByEmail.get(p.email.toLowerCase())
      if (byEmail) {
        matchedWhopUserId = byEmail.whopUserId
        matchReason = 'matched_by_email'
      }
    }

    const isActiveOnWhop = matchReason !== null
    if (isActiveOnWhop) tradersMatched++

    if (isActiveOnWhop) {
      // a) flag à false → passer à true
      if (!p.whop_subscription_active) {
        ops.push({
          kind: 'set_subscription_active',
          profileId: p.id,
          email: p.email,
          before: {
            whop_subscription_active: false,
            whop_user_id: p.whop_user_id,
          },
          after: { whop_subscription_active: true },
          reason: matchReason!,
        })
        byKind.set_subscription_active++
      }

      // b) match par email + whop_user_id vide → remplir le lien.
      //    Jamais d'OVERWRITE d'un whop_user_id existant (sécurité :
      //    deux profils liés au même Whop seraient une anomalie, pas
      //    une "correction").
      if (
        matchReason === 'matched_by_email' &&
        matchedWhopUserId &&
        !p.whop_user_id
      ) {
        ops.push({
          kind: 'link_whop_user_id',
          profileId: p.id,
          email: p.email,
          before: {
            whop_subscription_active: p.whop_subscription_active,
            whop_user_id: null,
          },
          after: { whop_user_id: matchedWhopUserId },
          reason: 'matched_by_email',
        })
        byKind.link_whop_user_id++
      }
    } else if (p.whop_subscription_active) {
      // Pas de match + flag true → passer à false.
      ops.push({
        kind: 'set_subscription_inactive',
        profileId: p.id,
        email: p.email,
        before: {
          whop_subscription_active: true,
          whop_user_id: p.whop_user_id,
        },
        after: { whop_subscription_active: false },
        reason: 'no_match_but_flag_true',
      })
      byKind.set_subscription_inactive++
    }
  }

  return {
    ops,
    summary: {
      totals: {
        profilesInspected: profiles.length,
        adminsSkipped,
        tradersMatched,
        opsPlanned: ops.length,
        byKind,
      },
    },
  }
}
