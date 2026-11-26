// ═══════════════════════════════════════════════════════════════
// Aiguillage du callback OAuth Whop (app/api/auth/whop/callback) quand
// l'accès n'est pas accordé. Logique pure, testée dans callback.test.ts.
//
// La règle d'accès ne change pas : refus dans tous les cas. Seuls le
// message et le log diffèrent selon la cause :
//   - variable de config absente → NOM loggé côté serveur, page
//     « Connexion momentanément indisponible » ;
//   - pas d'abonnement ÉLITE PRO  → page « Abonnement ÉLITE PRO requis ».
// ═══════════════════════════════════════════════════════════════

export const WHOP_UNAVAILABLE_PATH = '/whop/unavailable'
export const WHOP_SUBSCRIPTION_REQUIRED_PATH = '/whop/subscription-required'

/** Premier nom de variable absent ou vide parmi `names` (jamais de valeur). */
export function firstMissingEnv(
  names: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const name of names) {
    const v = env[name]
    if (!v || v.length === 0) return name
  }
  return null
}

/**
 * Où envoyer le membre après la vérif d'abonnement. `null` = accès
 * accordé, le callback continue. Sinon : page de refus + éventuel nom de
 * variable manquante à logger.
 */
export function accessRedirect(access: { granted: boolean; missingEnv: string | null }):
  | null
  | { path: string; missingEnv: string | null } {
  if (access.missingEnv) return { path: WHOP_UNAVAILABLE_PATH, missingEnv: access.missingEnv }
  if (!access.granted) return { path: WHOP_SUBSCRIPTION_REQUIRED_PATH, missingEnv: null }
  return null
}

/** Ligne de log serveur : le nom seulement, jamais la valeur. */
export function logMissingConfig(envName: string): void {
  console.error(`[whop/callback] Variable de config manquante : ${envName}. Connexion refusée.`)
}
