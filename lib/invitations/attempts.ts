// ═══════════════════════════════════════════════════════════════
// Codes d'invitation : génération et limite d'essais.
// Logique pure, testée dans attempts.test.ts ; appliquée par
// app/api/invitations (génération) et app/api/invitations/validate.
//
// - Code : 6 chiffres, tiré avec crypto (format inchangé pour l'UI et
//   les e-mails ; les invitations déjà envoyées restent valables).
// - Limite : 5 codes faux → invitation bloquée 15 minutes. Le compteur
//   (failed_attempts) ne fait que croître ; chaque multiple de 5 pose
//   un blocage (locked_until). Monotone = pas d'effet ABA pour le
//   compare-and-set côté route.
// - Un seul message pour tous les refus.
// ═══════════════════════════════════════════════════════════════

import { randomInt, timingSafeEqual } from 'node:crypto'

export const INVITE_MAX_ATTEMPTS = 5
export const INVITE_LOCK_MINUTES = 15
export const INVITE_REFUSAL = 'Code invalide ou expiré'

/** 6 chiffres, 100000 à 999999, tirés avec un générateur cryptographique. */
export function generateInvitationCode(): string {
  return String(randomInt(100000, 1000000))
}

/** Comparaison à temps constant (codes normalisés, longueur égale exigée). */
export function codesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(String(expected).trim())
  const b = Buffer.from(String(given).trim())
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface PendingInvitation {
  id: string
  code: string
  expires_at: string
  used_at: string | null
  failed_attempts: number | null
  locked_until: string | null
}

export type AttemptDecision<T extends PendingInvitation> =
  | { kind: 'refuse' }
  | { kind: 'accept'; invitation: T; expectAttempts: number }
  | {
      kind: 'wrong'
      updates: Array<{ id: string; expectAttempts: number; failed_attempts: number; locked_until: string | null }>
    }

const isLocked = (inv: PendingInvitation, now: Date) =>
  !!inv.locked_until && new Date(inv.locked_until).getTime() > now.getTime()

/**
 * Décide d'un essai pour un e-mail donné.
 * `invitations` : toutes les invitations de cet e-mail (on filtre ici).
 */
export function decideInvitationAttempt<T extends PendingInvitation>(
  invitations: T[],
  code: string,
  now: Date = new Date(),
): AttemptDecision<T> {
  const pending = invitations.filter(
    inv => !inv.used_at && new Date(inv.expires_at).getTime() > now.getTime(),
  )
  if (pending.length === 0) return { kind: 'refuse' }

  // Un blocage actif sur une invitation de cet e-mail bloque tout l'e-mail,
  // même avec le bon code (sinon plusieurs invitations multiplieraient les essais).
  if (pending.some(inv => isLocked(inv, now))) return { kind: 'refuse' }

  const match = pending.find(inv => codesMatch(inv.code, code))
  if (match) return { kind: 'accept', invitation: match, expectAttempts: match.failed_attempts ?? 0 }

  const lockUntil = new Date(now.getTime() + INVITE_LOCK_MINUTES * 60_000).toISOString()
  return {
    kind: 'wrong',
    updates: pending.map(inv => {
      const before = inv.failed_attempts ?? 0
      const after = before + 1
      return {
        id: inv.id,
        expectAttempts: before,
        failed_attempts: after,
        locked_until: after % INVITE_MAX_ATTEMPTS === 0 ? lockUntil : inv.locked_until,
      }
    }),
  }
}
