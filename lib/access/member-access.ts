/**
 * Règle UNIQUE d'accès au dashboard membre (pages /dashboard via proxy.ts,
 * routes API membres via requireMember() dans lib/ai/quota.ts, affichage
 * admin › Traders). Toujours active : remplace WHOP_GATE_ENABLED et
 * WHOP_BYPASS_EMAILS (cf. docs/design/terminal/DECISIONS.md).
 *
 *   1. admin                                   → oui
 *   2. abonnement Whop actif en base           → oui
 *      (profiles.whop_subscription_active, tenu à jour par le webhook
 *      et le cron de réconciliation)
 *   3. accès manuel accordé par l'admin        → oui jusqu'à la date de
 *      fin INCLUSE (profiles.manual_access_until, jour calendaire de
 *      Paris) ; date vide = sans fin
 *   4. sinon (dont profil illisible)           → non
 *
 * Pur : aucune lecture réseau, la date du jour est passée en argument.
 */

export interface AccessProfile {
  role?: string | null
  whop_subscription_active?: boolean | null
  manual_access?: boolean | null
  /** 'YYYY-MM-DD' (colonne date) ; null = sans fin. */
  manual_access_until?: string | null
}

export type AccessKind = 'admin' | 'whop' | 'manual' | 'manual-expired' | 'none'

export interface AccessStatus {
  granted: boolean
  kind: AccessKind
  /** Date de fin de l'accès manuel ('YYYY-MM-DD'), null = sans fin ou sans objet. */
  until: string | null
}

/** Colonnes de profiles à lire pour appliquer la règle. */
export const ACCESS_PROFILE_COLUMNS =
  'role, whop_subscription_active, manual_access, manual_access_until'

/** Jour calendaire de Paris au format 'YYYY-MM-DD'. */
export function parisToday(now: Date = new Date()): string {
  return now.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Garde la partie jour d'une valeur date/timestamp ; null si illisible. */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null
  const day = value.slice(0, 10)
  return DAY_RE.test(day) ? day : null
}

export function memberAccess(
  profile: AccessProfile | null | undefined,
  today: string = parisToday(),
): AccessStatus {
  if (!profile) return { granted: false, kind: 'none', until: null }
  if (profile.role === 'admin') return { granted: true, kind: 'admin', until: null }
  if (profile.whop_subscription_active === true) return { granted: true, kind: 'whop', until: null }

  if (profile.manual_access === true) {
    // Une date de fin présente mais illisible ne vaut pas « sans fin » :
    // on refuse plutôt que d'ouvrir un accès illimité par erreur.
    if (profile.manual_access_until) {
      const until = dayOf(profile.manual_access_until)
      if (!until) return { granted: false, kind: 'manual-expired', until: null }
      return until >= today
        ? { granted: true, kind: 'manual', until }
        : { granted: false, kind: 'manual-expired', until }
    }
    return { granted: true, kind: 'manual', until: null }
  }

  return { granted: false, kind: 'none', until: null }
}

export function hasDashboardAccess(
  profile: AccessProfile | null | undefined,
  today: string = parisToday(),
): boolean {
  return memberAccess(profile, today).granted
}

/** Libellé admin › Traders. */
export function accessLabel(status: AccessStatus): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }
  switch (status.kind) {
    case 'admin': return 'Admin'
    case 'whop': return 'Whop'
    case 'manual': return status.until ? `Manuel jusqu'au ${fmt(status.until)}` : 'Manuel sans fin'
    case 'manual-expired': return status.until ? `Manuel expiré le ${fmt(status.until)}` : 'Manuel expiré'
    case 'none': return 'Aucun'
  }
}

/** Page affichée aux comptes sans accès (route publique, préfixe /whop). */
export const INACTIVE_PATH = '/whop/abonnement-inactif'

/** Corps des 403 de requireMember(). */
export const INACTIVE_API_ERROR = 'subscription_inactive'

// ─── Lecture du profil ──────────────────────────────────────────────────

/**
 * Port de lecture : exécute un SELECT des colonnes données sur la ligne
 * profiles de l'utilisateur. Ex. :
 *   cols => supabase.from('profiles').select(cols).eq('id', user.id).maybeSingle()
 */
export type ProfileSelect = (
  columns: string,
) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

/**
 * Lit les colonnes d'accès du profil. null si la lecture échoue
 * (→ refus, fail-closed).
 *
 * Transition : tant que la migration 20261126000004 n'est pas appliquée,
 * manual_access n'existe pas (erreur 42703) ; on relit alors les seules
 * colonnes historiques pour que les admins et les abonnés Whop gardent
 * leur accès. À retirer une fois la migration appliquée partout.
 */
export async function readAccessProfile(select: ProfileSelect): Promise<AccessProfile | null> {
  const first = await select(ACCESS_PROFILE_COLUMNS)
  if (!first.error) return (first.data as AccessProfile | null) ?? null

  if (first.error.code === '42703') {
    console.error('[access] colonnes manual_access absentes : migration 20261126000004 non appliquée')
    const legacy = await select('role, whop_subscription_active')
    if (!legacy.error) return (legacy.data as AccessProfile | null) ?? null
  }

  console.error('[access] lecture du profil impossible', { code: first.error.code })
  return null
}

// ─── Accès manuel : modification par l'admin ────────────────────────────

export type ManualAccessPatch = { manual_access: boolean; manual_access_until: string | null }

/**
 * Valide une action admin › Traders et renvoie les colonnes à écrire.
 *   - grant : date de fin facultative ('' = sans fin), jour valide, pas
 *     dans le passé (une date passée n'ouvrirait aucun accès) ;
 *   - revoke : efface l'accès manuel et sa date.
 */
export function manualAccessPatch(
  action: 'grant' | 'revoke',
  untilInput: string,
  today: string = parisToday(),
): { ok: true; patch: ManualAccessPatch } | { ok: false; error: string } {
  if (action === 'revoke') return { ok: true, patch: { manual_access: false, manual_access_until: null } }

  const until = untilInput.trim()
  if (!until) return { ok: true, patch: { manual_access: true, manual_access_until: null } }
  if (!DAY_RE.test(until) || Number.isNaN(new Date(`${until}T00:00:00Z`).getTime())
      || new Date(`${until}T00:00:00Z`).toISOString().slice(0, 10) !== until) {
    return { ok: false, error: 'Date de fin invalide' }
  }
  if (until < today) return { ok: false, error: 'La date de fin est déjà passée' }
  return { ok: true, patch: { manual_access: true, manual_access_until: until } }
}
