/**
 * Statuts Whop qui donnent accès au dashboard — source unique.
 *
 * Factorisé entre le webhook (/api/webhooks/whop) et la vérification
 * d'abonnement au login (hasActiveEliteProMembership*) pour que les
 * deux côtés ne puissent JAMAIS diverger. Avant cette étape, chacun
 * avait sa propre logique : le webhook via allowlist stricte, l'API
 * v2 via le flag `valid` renvoyé par Whop. Avec la Current API, le
 * champ `valid` disparaît → on s'aligne sur la même allowlist
 * statuts, visible et testée ici.
 *
 * Décision produit (reprise mot pour mot du webhook) :
 *   active     : paiement OK, en cours
 *   trialing   : essai en cours
 *   completed  : paiement one-shot / lifetime achevé
 *   canceling  : annulation prévue, accès maintenu jusqu'à fin période
 *   past_due   : grâce — Whop redébite auto, on garde l'accès. Quand
 *                les retries échouent vraiment, Whop passe à "canceled"
 *                et on coupe à ce moment-là.
 * Exclus → inactif :
 *   canceled, expired  : accès terminé proprement
 *   unresolved         : état indéterminé, fail-closed
 *   drafted            : pas encore effectif
 */

export const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'trialing',
  'completed',
  'canceling',
  'past_due',
])

/** Pure, insensible à la casse, tolère undefined/null. */
export function isMembershipActive(status: unknown): boolean {
  if (typeof status !== 'string') return false
  return ACTIVE_STATUSES.has(status.toLowerCase())
}
