/**
 * Authentification des routes /api/cron/* (même règle que
 * /api/cron/whop-reconcile) : en-tête `Authorization: Bearer <CRON_SECRET>`
 * envoyé par Vercel Cron, comparaison à temps constant. Sans secret
 * configuré, tout est refusé.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function cronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false
  const match = /^Bearer\s+(.+)$/.exec(authorization ?? '')
  if (!match) return false
  return timingSafeEqual(match[1].trim(), secret)
}
