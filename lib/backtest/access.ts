/**
 * Backtest V2 — accès testeurs.
 *
 * Avant que la refonte soit activée pour tout le monde via l'env
 * `BACKTEST_V2_ENABLED`, les utilisateurs dont l'email est dans la
 * liste `BACKTEST_V2_TESTERS` voient l'onglet "Mes critères" et la
 * nouvelle saisie, tout en pouvant basculer sur l'ancienne page.
 *
 * Format `BACKTEST_V2_TESTERS` : liste CSV, insensible à la casse,
 * trim + strip guillemets autour de l'entrée ou de la liste entière
 * (erreur fréquente de config Vercel : `"a@x,b@y"`).
 *
 * Même pattern que `isTesterEmail` pour Jarvis (lib/jarvis/access.ts).
 */

function normalizeEmail(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, '').trim().toLowerCase()
}

function parseTesters(): Set<string> {
  const raw = (process.env.BACKTEST_V2_TESTERS || '').trim()
  const unquoted = raw.replace(/^["']+|["']+$/g, '')
  return new Set(unquoted.split(',').map(normalizeEmail).filter(Boolean))
}

/** Vrai si l'email appartient à BACKTEST_V2_TESTERS (ou si la refonte
 *  est activée pour tout le monde via BACKTEST_V2_ENABLED). */
export function isBacktestV2Tester(email: string | null | undefined): boolean {
  if (process.env.BACKTEST_V2_ENABLED === 'true') return true
  if (!email) return false
  return parseTesters().has(normalizeEmail(email))
}
