/**
 * Helper serveur pour l'OAuth 2.1 + PKCE Whop (OIDC compatible) + vérif
 * abonnement via la Current API `/api/v1`.
 *
 * Endpoints officiels Whop :
 *   https://api.whop.com/oauth/authorize   (redirect user)
 *   https://api.whop.com/oauth/token       (POST JSON, échange code → token)
 *   https://api.whop.com/oauth/userinfo    (GET Bearer, OIDC user info)
 *   https://api.whop.com/oauth/revoke      (POST JSON, logout)
 *
 * Vérif abonnement — Current API uniquement (la v2 a été arrêtée le
 * 13/11/2026 ; la code v2 et l'interrupteur de bascule ont été supprimés
 * lors du nettoyage post-migration) :
 *   GET https://api.whop.com/api/v1/memberships
 *     ?user_id=…&company_id=…&product_ids[]=…&statuses[]=…&first=…
 *     &after=<cursor>
 *   Authorization: Bearer <WHOP_API_KEY>
 *   Api-Version-Date: WHOP_API_VERSION_DATE (fallback DEFAULT ci-dessous)
 *
 *   Réponse : { data: [...], page_info: { has_next_page, end_cursor } }
 *   Chaque membership : { id, status, product:{id,title}, user:{id,email},
 *                         member:{access_level} }
 *
 * RÈGLE D'ACCÈS (défense en profondeur, voir evaluateMembershipAccess) :
 *   product.id === WHOP_PRODUCT_ID  ET  status ∈ ACTIVE_STATUSES
 *
 *   `member.access_level` n'est PAS suffisant seul : ce champ est GLOBAL au
 *   membre (toutes offres confondues chez le marchand) — un ÉLITE PRO expiré
 *   avec un abonnement Discord actif renverrait access_level=customer, ce qui
 *   aurait accordé l'accès à tort si on s'y fiait. On ne regarde plus que
 *   le status par membership.
 *
 * Fail-closed : erreur réseau, 4xx/5xx, timeout, parse → refus par défaut.
 * Les variables d'env sont lues via requireEnv (throw si manquante). Jamais
 * hardcodées, jamais loggées, jamais exposées au client.
 */

import crypto from 'node:crypto'
import { ACTIVE_STATUSES, isMembershipActive } from './status'

// ─── Endpoints Whop ─────────────────────────────────────────────────
const WHOP_AUTHORIZE_URL = 'https://api.whop.com/oauth/authorize'
const WHOP_TOKEN_URL     = 'https://api.whop.com/oauth/token'
const WHOP_USERINFO_URL  = 'https://api.whop.com/oauth/userinfo'
const WHOP_REVOKE_URL    = 'https://api.whop.com/oauth/revoke'

const WHOP_API_BASE = 'https://api.whop.com/api/v1'
// Date d'épinglage schéma — modifiable via env sans redéployer.
const WHOP_API_VERSION_DATE_DEFAULT = '2026-07-23'
// Current API : pagination par curseur ("first" = size, "after" = cursor).
// 50 est généreux (early-return dès la 1re membership valide pour
// hasActiveEliteProMembership).
const PAGE_SIZE = 50

// Safe-guard pagination pour la vérif d'un user : un user n'aura jamais 500
// memberships ÉLITE PRO (10 pages × 50 = 500). Early-return évite de
// charger inutilement.
const MAX_MEMBERSHIP_PAGES = 10

// Plafond pour le rapport de sync admin (toutes les memberships ÉLITE PRO
// actives, pas uniquement celles d'un user). 40 pages × 50 = 2 000. La
// route /api/admin/whop-sync-report expose ce plafond via query param pour
// pouvoir le bumper ponctuellement sans redéployer.
const SYNC_REPORT_DEFAULT_MAX_PAGES = 40
const SYNC_REPORT_HARD_MAX_PAGES = 200

// ─── Types ──────────────────────────────────────────────────────────

/** Format OIDC standard — Whop le renvoie sur /userinfo. */
export interface WhopUserInfo {
  sub: string                    // = whopUserId, format "user_xxxxxxxxxx"
  name?: string
  preferred_username?: string
  picture?: string
  email?: string
  email_verified?: boolean
}

export interface WhopTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

// ─── Env getter ────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`[Whop] Variable d'env ${name} manquante`)
  }
  return v
}

// ─── PKCE (RFC 7636) + state anti-CSRF ──────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32))
  const challenge = base64UrlEncode(
    crypto.createHash('sha256').update(verifier).digest(),
  )
  return { verifier, challenge }
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}

/** Nonce OIDC — OBLIGATOIRE dès qu'on demande le scope "openid" (Whop le
 *  rejette avec invalid_request / "nonce is required for openid scope"
 *  sinon). Vérifié au callback contre le claim "nonce" de l'id_token
 *  (anti-replay). Même entropie que state : 16 octets hex = 128 bits. */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

/** Décode le payload (2ᵉ partie) d'un JWT SANS vérifier la signature.
 *  Safe ici car l'id_token vient d'être récupéré via le flow OAuth sur TLS
 *  avec client_secret/PKCE — la source est trusted. Utilisé uniquement
 *  pour lire le claim "nonce" et le comparer au cookie posé à /start. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf-8')
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

// ─── OAuth : URL d'autorisation ─────────────────────────────────────

export function buildAuthorizeUrl(opts: {
  state: string
  codeChallenge: string
  redirectUri: string
  nonce: string                      // OBLIGATOIRE pour scope openid (OIDC)
}): string {
  const clientId = requireEnv('NEXT_PUBLIC_WHOP_APP_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: opts.state,
    nonce: opts.nonce,               // ← Whop le rejetait sans
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${WHOP_AUTHORIZE_URL}?${params.toString()}`
}

// ─── OAuth : échange code → token (JSON, PKCE) ──────────────────────

export async function exchangeCodeForToken(opts: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<WhopTokenResponse> {
  const clientId = requireEnv('NEXT_PUBLIC_WHOP_APP_ID')

  // App Whop en mode PUBLIC : PKCE strict, le code_verifier remplace le
  // client_secret. L'envoyer en plus ferait échouer la requête (le mode
  // public l'exclut explicitement, contrairement à ce qu'on avait supposé
  // initialement). Un re-passage éventuel en mode confidentiel exigerait
  // l'auth en Basic Auth header, pas dans le body — pattern différent.
  const body = {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: clientId,
    code_verifier: opts.codeVerifier,
  }

  const r = await fetch(WHOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!r.ok) {
    throw new Error(`[Whop] Token exchange échec HTTP ${r.status}`)
  }
  return (await r.json()) as WhopTokenResponse
}

// ─── OIDC : récupérer le user via /userinfo ─────────────────────────

export async function fetchWhopUserInfo(accessToken: string): Promise<WhopUserInfo> {
  const r = await fetch(WHOP_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`[Whop] fetchWhopUserInfo échec HTTP ${r.status}`)
  return (await r.json()) as WhopUserInfo
}

// ─── Vérif abonnement ÉLITE PRO (Current API) ──────────────────────

/** Shape item Current API. */
interface WhopMembership {
  id: string
  status?: string
  product?: { id?: string; title?: string }
  user?: { id?: string; email?: string }
  /** Global au MEMBRE (toutes offres confondues) — plus utilisé pour
   *  décider de l'accès à un produit précis, cf. evaluateMembershipAccess. */
  member?: { access_level?: 'customer' | 'admin' | 'no_access' }
  created_at?: string
}

interface WhopMembershipsListResponse {
  data?: WhopMembership[]
  page_info?: {
    has_next_page?: boolean
    end_cursor?: string | null
  }
}

export interface MembershipLine {
  id: string
  status: string | null
  productId: string | null
  memberAccessLevel: string | null
  /** 'status' si product.id matche ET status ∈ ACTIVE_STATUSES ; null sinon.
   *  Exposé pour la route admin — un admin peut voir noir sur blanc
   *  pourquoi la membership n'ouvre pas l'accès. */
  reasonValid: 'status' | null
}

export interface EliteProAccessDetail {
  granted: boolean
  /** Pages réellement interrogées (1 à MAX_MEMBERSHIP_PAGES). */
  pagesChecked: number
  /** Memberships lues, aplaties pour l'audit admin. `[]` sur erreur réseau. */
  memberships: MembershipLine[]
  /** Non-null si Whop a renvoyé un header Deprecation sur une des pages. */
  deprecationHeader: string | null
  /** Code HTTP si une page a retourné un échec ; null si tout OK. */
  errorStatus: number | null
  /** Libellé court pour logs/UI admin (403, timeout, parse…). */
  errorMessage: string | null
}

/**
 * Juge si une ligne membership donne accès ÉLITE PRO.
 *
 * DÉFENSE EN PROFONDEUR : la Current API filtre déjà `product_ids[]` et
 * `statuses[]` côté serveur, mais on re-vérifie côté client. Les DEUX
 * conditions doivent être vraies :
 *
 *   1. product.id === WHOP_PRODUCT_ID  (le filtre serveur peut se
 *      relâcher sur une future évolution)
 *   2. status ∈ ACTIVE_STATUSES         (active, trialing, completed,
 *      canceling, past_due — cf. lib/whop/status.ts)
 *
 * `member.access_level` est volontairement IGNORÉ comme signal d'accès :
 * c'est un champ GLOBAL au membre (toutes offres du marchand). Un ÉLITE PRO
 * expiré + un abonnement Discord actif donnerait `access_level=customer`,
 * ce qui aurait accordé l'accès à tort si on y faisait confiance. Il reste
 * exposé dans `memberships[].memberAccessLevel` pour l'audit admin.
 */
function evaluateMembershipAccess(
  m: WhopMembership,
  productId: string,
): 'status' | null {
  if (m.product?.id !== productId) return null
  if (isMembershipActive(m.status)) return 'status'
  return null
}

export async function fetchEliteProAccess(whopUserId: string): Promise<EliteProAccessDetail> {
  const detail: EliteProAccessDetail = {
    granted: false,
    pagesChecked: 0,
    memberships: [],
    deprecationHeader: null,
    errorStatus: null,
    errorMessage: null,
  }

  let apiKey: string
  let productId: string
  let companyId: string
  try {
    apiKey = requireEnv('WHOP_API_KEY')
    productId = requireEnv('WHOP_PRODUCT_ID')
    companyId = requireEnv('WHOP_COMPANY_ID')
  } catch (err) {
    detail.errorMessage = err instanceof Error ? err.message : 'env missing'
    return detail
  }
  const apiVersionDate =
    (process.env.WHOP_API_VERSION_DATE || '').trim() || WHOP_API_VERSION_DATE_DEFAULT

  let cursor: string | null = null
  for (let page = 1; page <= MAX_MEMBERSHIP_PAGES; page++) {
    const params = new URLSearchParams()
    params.set('user_id', whopUserId)
    params.set('company_id', companyId)
    params.set('first', String(PAGE_SIZE))
    params.append('product_ids[]', productId)
    for (const s of ACTIVE_STATUSES) params.append('statuses[]', s)
    if (cursor) params.set('after', cursor)
    const url = `${WHOP_API_BASE}/memberships?${params.toString()}`

    let r: Response
    try {
      r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Api-Version-Date': apiVersionDate,
          Accept: 'application/json',
        },
        cache: 'no-store',
      })
    } catch (err) {
      detail.errorStatus = 0
      detail.errorMessage = err instanceof Error ? err.message : 'network/timeout'
      console.error('[whop] fetch error', { page, url, err })
      return detail
    }

    detail.pagesChecked = page

    const dep = r.headers.get('deprecation')
    if (dep && !detail.deprecationHeader) {
      detail.deprecationHeader = dep
      console.warn('[whop] Deprecation header on current URL', { url, dep })
    }

    if (!r.ok) {
      detail.errorStatus = r.status
      if (r.status === 403) {
        detail.errorMessage = 'permissions insuffisantes (403) — cocher member:basic:read + member:email:read sur l\'App'
        console.error('[whop] 403 — permissions', { url })
      } else if (r.status === 401) {
        detail.errorMessage = 'clé Whop refusée (401)'
      } else {
        detail.errorMessage = `HTTP ${r.status}`
      }
      return detail
    }

    let payload: WhopMembershipsListResponse
    try {
      payload = await r.json() as WhopMembershipsListResponse
    } catch (err) {
      detail.errorStatus = r.status
      detail.errorMessage = 'JSON parse failed'
      console.error('[whop] parse error', { url, err })
      return detail
    }

    const items = Array.isArray(payload.data) ? payload.data : []
    for (const m of items) {
      const reason = evaluateMembershipAccess(m, productId)
      detail.memberships.push({
        id: m.id,
        status: typeof m.status === 'string' ? m.status : null,
        productId: m.product?.id ?? null,
        memberAccessLevel: m.member?.access_level ?? null,
        reasonValid: reason,
      })
      if (reason !== null) {
        // Early-return : première valide trouvée = accès accordé.
        detail.granted = true
        return detail
      }
    }

    const hasNext = payload.page_info?.has_next_page === true
    const endCursor = payload.page_info?.end_cursor ?? null
    if (!hasNext || !endCursor) return detail
    cursor = endCursor
  }
  // Safe-guard MAX_MEMBERSHIP_PAGES atteint, fail-closed par principe.
  return detail
}

/**
 * Version booléenne pour l'auth callback. Fail-closed sur toute erreur :
 * réseau, 4xx/5xx, parse, env manquante.
 */
export async function hasActiveEliteProMembership(whopUserId: string): Promise<boolean> {
  const detail = await fetchEliteProAccess(whopUserId)
  return detail.granted
}

// ─── Rapport de sync admin — liste toutes les ÉLITE PRO actives ────

export interface SyncMembership {
  membershipId: string
  whopUserId: string | null
  email: string | null
  status: string | null
  createdAt: string | null
}

export interface SyncReportFetch {
  memberships: SyncMembership[]
  pagesChecked: number
  truncated: boolean
  deprecationHeader: string | null
  errorStatus: number | null
  errorMessage: string | null
}

/**
 * Liste TOUTES les memberships ÉLITE PRO actives chez Whop (pagination
 * curseur). Pour le rapport admin de rattrapage post-13/11.
 *
 * Même filtres que fetchEliteProAccess (product_ids[], statuses[]), mais
 * sans user_id → on tire TOUT le set. Plafonné à `maxPages` pour éviter
 * une dérive runtime ; `truncated=true` indique qu'il reste des pages.
 *
 * Fail-closed sur erreur réseau — renvoie ce qu'on a lu jusque-là + le
 * détail d'erreur, pas d'exception.
 */
export async function listActiveEliteProMemberships(
  opts: { maxPages?: number } = {},
): Promise<SyncReportFetch> {
  const result: SyncReportFetch = {
    memberships: [],
    pagesChecked: 0,
    truncated: false,
    deprecationHeader: null,
    errorStatus: null,
    errorMessage: null,
  }

  let apiKey: string
  let productId: string
  let companyId: string
  try {
    apiKey = requireEnv('WHOP_API_KEY')
    productId = requireEnv('WHOP_PRODUCT_ID')
    companyId = requireEnv('WHOP_COMPANY_ID')
  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : 'env missing'
    return result
  }
  const apiVersionDate =
    (process.env.WHOP_API_VERSION_DATE || '').trim() || WHOP_API_VERSION_DATE_DEFAULT

  const maxPages = Math.min(
    SYNC_REPORT_HARD_MAX_PAGES,
    Math.max(1, Math.floor(opts.maxPages ?? SYNC_REPORT_DEFAULT_MAX_PAGES)),
  )

  let cursor: string | null = null
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams()
    params.set('company_id', companyId)
    params.set('first', String(PAGE_SIZE))
    params.append('product_ids[]', productId)
    for (const s of ACTIVE_STATUSES) params.append('statuses[]', s)
    if (cursor) params.set('after', cursor)
    const url = `${WHOP_API_BASE}/memberships?${params.toString()}`

    let r: Response
    try {
      r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Api-Version-Date': apiVersionDate,
          Accept: 'application/json',
        },
        cache: 'no-store',
      })
    } catch (err) {
      result.errorStatus = 0
      result.errorMessage = err instanceof Error ? err.message : 'network/timeout'
      return result
    }

    result.pagesChecked = page

    const dep = r.headers.get('deprecation')
    if (dep && !result.deprecationHeader) result.deprecationHeader = dep

    if (!r.ok) {
      result.errorStatus = r.status
      result.errorMessage = r.status === 403
        ? 'permissions insuffisantes (403)'
        : r.status === 401
          ? 'clé Whop refusée (401)'
          : `HTTP ${r.status}`
      return result
    }

    let payload: WhopMembershipsListResponse
    try {
      payload = await r.json() as WhopMembershipsListResponse
    } catch {
      result.errorStatus = r.status
      result.errorMessage = 'JSON parse failed'
      return result
    }

    const items = Array.isArray(payload.data) ? payload.data : []
    for (const m of items) {
      // Même défense en profondeur que fetchEliteProAccess : on ne garde
      // que les memberships qui matchent STRICTEMENT product + status.
      if (m.product?.id !== productId) continue
      if (!isMembershipActive(m.status)) continue
      result.memberships.push({
        membershipId: m.id,
        whopUserId: m.user?.id ?? null,
        email: m.user?.email ?? null,
        status: typeof m.status === 'string' ? m.status : null,
        createdAt: m.created_at ?? null,
      })
    }

    const hasNext = payload.page_info?.has_next_page === true
    const endCursor = payload.page_info?.end_cursor ?? null
    if (!hasNext || !endCursor) return result
    cursor = endCursor
  }
  result.truncated = true
  return result
}

// ─── OAuth : revoke token (pour le logout) ──────────────────────────

export async function revokeWhopToken(accessToken: string): Promise<void> {
  const clientId = requireEnv('NEXT_PUBLIC_WHOP_APP_ID')
  // Mode PUBLIC (voir exchangeCodeForToken) : pas de client_secret.
  const body = {
    token: accessToken,
    client_id: clientId,
  }
  // Best effort — pas de throw. Le user doit pouvoir se déconnecter côté
  // Supabase même si Whop ne révoque pas (ex. Whop down temporairement).
  try {
    await fetch(WHOP_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch { /* silent */ }
}
