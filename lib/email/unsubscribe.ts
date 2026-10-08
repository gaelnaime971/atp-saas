/**
 * Helper désabonnement — token signé HMAC-SHA256 stateless (RFC 8058).
 *
 * Format du token : `<base64url(email)>.<base64url(HMAC-SHA256(email))>`
 *   - Partie 1 = email lisible (base64url, pas chiffrement — l'email est
 *     connu du destinataire, c'est le sien)
 *   - Partie 2 = signature HMAC avec UNSUBSCRIBE_SECRET → empêche de
 *     désabonner un email tiers en devinant son adresse
 *   - Séparateur `.` (comme un JWT à 2 segments)
 *
 * URL finale : https://<domain>/unsubscribe?token=<base64url>.<base64url>
 *
 * Secret jamais logué, jamais exposé au client. Rotation = tous les
 * anciens liens meurent (à ne faire qu'en cas de fuite réelle).
 */

import crypto from 'node:crypto'

function requireSecret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET
  if (!s || s.length < 16) {
    throw new Error('[unsubscribe] UNSUBSCRIBE_SECRET manquant ou trop court')
  }
  return s
}

function signEmail(email: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(email.toLowerCase())
    .digest('base64url')
}

/** Génère le token signé pour un email donné. */
export function buildUnsubscribeToken(email: string): string {
  const secret = requireSecret()
  const emailB64 = Buffer.from(email.toLowerCase()).toString('base64url')
  const sig = signEmail(email, secret)
  return `${emailB64}.${sig}`
}

/** Construit l'URL complète prête à injecter dans un email HTML. */
export function buildUnsubscribeUrl(email: string, origin: string): string {
  const token = buildUnsubscribeToken(email)
  return `${origin}/unsubscribe?token=${token}`
}

/**
 * Vérifie un token reçu. Retourne l'email si valide, null sinon.
 * Comparaison constant-time (crypto.timingSafeEqual) contre les timing
 * attacks — même si le gain pratique est faible ici.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const secret = requireSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [emailB64, sigReceived] = parts
    const email = Buffer.from(emailB64, 'base64url').toString('utf-8')
    if (!email || !email.includes('@')) return null
    const sigExpected = signEmail(email, secret)
    const bufA = Buffer.from(sigReceived)
    const bufB = Buffer.from(sigExpected)
    if (bufA.length !== bufB.length) return null
    if (!crypto.timingSafeEqual(bufA, bufB)) return null
    return email
  } catch {
    return null
  }
}
