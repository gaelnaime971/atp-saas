/**
 * Helper client partagé pour transformer la Response d'une route IA
 * en message user-facing propre. À utiliser par TOUS les callers des
 * 8 routes IA (SessionLive, AnalyseGraphique, StockAnalysis, AnalyseIA).
 *
 * Mapping :
 *   401 → session expirée (bouton reconnexion)
 *   429 → quota atteint (message serveur : limite + reset Paris)
 *   502 / autre / network → "momentanément indisponible" (jamais le détail)
 *
 * Aucune erreur technique brute (JSON Groq, stack trace) ne doit atteindre
 * l'écran du trader — c'était le pattern avant 1D.
 */

export type AiErrorKind = 'auth' | 'quota' | 'unavailable'

export interface AiErrorInfo {
  kind: AiErrorKind
  title: string
  message: string
  actionLabel?: string
  actionHref?: string
}

/**
 * Lit une Response non-ok retournée par une route IA et construit
 * l'AiErrorInfo correspondant. Si Response.json() échoue, on retombe
 * sur le message générique (jamais d'exception propagée).
 */
export async function readAiError(response: Response): Promise<AiErrorInfo> {
  if (response.status === 401) {
    return {
      kind: 'auth',
      title: 'Session expirée',
      message: 'Ta session a expiré. Reconnecte-toi pour continuer.',
      actionLabel: 'Se reconnecter',
      actionHref: '/login',
    }
  }

  if (response.status === 429) {
    let message = 'Tu as atteint ta limite quotidienne. Elle se réinitialise à minuit (heure de Paris).'
    try {
      const data = await response.clone().json() as { message?: unknown }
      if (typeof data.message === 'string' && data.message.trim()) message = data.message
    } catch { /* fallback générique */ }
    return { kind: 'quota', title: 'Limite atteinte', message }
  }

  return {
    kind: 'unavailable',
    title: 'Analyse IA indisponible',
    message: 'L\'analyse IA est momentanément indisponible. Réessaie dans quelques minutes.',
  }
}

/**
 * Variante synchrone pour les cas où la Response n'est pas disponible
 * (exception réseau avant la réponse, timeout) — toujours "unavailable".
 */
export function networkAiError(): AiErrorInfo {
  return {
    kind: 'unavailable',
    title: 'Analyse IA indisponible',
    message: 'L\'analyse IA est momentanément indisponible. Réessaie dans quelques minutes.',
  }
}
