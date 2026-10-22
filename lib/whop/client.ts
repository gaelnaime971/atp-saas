/**
 * Helper serveur pour l'OAuth 2.1 + PKCE Whop (OIDC compatible).
 *
 * Endpoints officiels Whop (confirmés doc + curl réel) :
 *   https://api.whop.com/oauth/authorize   (redirect user)
 *   https://api.whop.com/oauth/token       (POST JSON, échange code → token)
 *   https://api.whop.com/oauth/userinfo    (GET Bearer, OIDC user info)
 *   https://api.whop.com/oauth/revoke      (POST JSON, logout — étape 4)
 *
 * Vérif abonnement (confirmé curl 3 cas réels sur ce compte) :
 *   GET https://api.whop.com/v2/memberships?user_id={id}&page={n}
 *   Authorization: Bearer <WHOP_API_KEY>
 *   → { pagination:{current_page,total_page}, data: [...] }
 *   Chaque membership : { id, product, user, status, valid, ... }
 *   Règle d'accès : data[].some(m => m.product === WHOP_PRODUCT_ID && m.valid === true)
 *
 * Fail-closed : erreur réseau, 4xx/5xx, timeout → false. On refuse par défaut.
 * Les variables d'env sont lues via requireEnv (throw si manquante). Jamais
 * hardcodées, jamais loggées, jamais exposées au client.
 */

import crypto from 'node:crypto'
import { ACTIVE_STATUSES, isMembershipActive } from './status'

// ─── Endpoints Whop (confirmés doc officielle) ──────────────────────
const WHOP_AUTHORIZE_URL = 'https://api.whop.com/oauth/authorize'
const WHOP_TOKEN_URL     = 'https://api.whop.com/oauth/token'
const WHOP_USERINFO_URL  = 'https://api.whop.com/oauth/userinfo'
const WHOP_REVOKE_URL    = 'https://api.whop.com/oauth/revoke'

// Current API (remplace la v2 avant le 13/11/2026).
const WHOP_NEW_API_BASE = 'https://api.whop.com/api/v1'
// Date d'épinglage schéma — à aligner avec la version du schéma qu'on
// a validée pendant l'audit. Modifiable via env si besoin de rebumper
// sans redéployer.
const WHOP_NEW_API_VERSION_DATE_DEFAULT = '2026-07-23'
// Taille de page curseur. Current API : pagination par curseur, "first"
// = size, "after" = cursor. 50 est généreux (early-return dès 1er match).
const NEW_API_PAGE_SIZE = 50

// Safe-guard pagination memberships — un user n'aura jamais 500 memberships
// ÉLITE PRO (10 pages × 50 default = 500). Early-return dès la 1re valide
// évite de charger inutilement les autres pages.
const MAX_MEMBERSHIP_PAGES = 10

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

interface WhopMembershipV2 {
  id: string                     // "mem_xxxxx"
  product: string                // "prod_xxxxx" (confirmé — PAS product_id)
  user: string                   // "user_xxxxx"
  status: string                 // "trialing" | "completed" | "canceled" | ...
  valid: boolean                 // true pour trialing + completed, false pour canceled
  email?: string
}

interface WhopMembershipsListResponse {
  pagination?: { current_page: number; total_page: number }
  data: WhopMembershipV2[]
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

// ─── Vérif abonnement ÉLITE PRO (paginé + early-return) ─────────────

/**
 * Vérifie qu'un user Whop a au moins une membership VALIDE sur le produit
 * WHOP_PRODUCT_ID (ÉLITE PRO = prod_JkPZ6NZeqULBR). Toutes les formules du
 * produit (mensuel/semestriel/annuel) comptent — c'est le produit qui donne
 * accès, pas le plan interne.
 *
 * Multi-memberships gérés via .some() (confirmé produit — un user peut
 * avoir plusieurs memberships ÉLITE PRO : une trialing valide + plusieurs
 * canceled historiquement, on prend valid:true sur n'importe laquelle).
 *
 * Pagination : parcourt page par page, early-return dès la 1re membership
 * ÉLITE PRO valide trouvée (pas besoin de charger la suite). Safe-guard
 * MAX_MEMBERSHIP_PAGES contre une boucle infinie si l'API bugguait.
 *
 * Trialing inclus : décision produit — un essai gratuit a accès au dashboard
 * (valid:true quand status:"trialing" OU "completed"). Les canceled/expirés
 * ont valid:false → naturellement exclus par le filtre valid===true.
 *
 * Fail-closed : erreur réseau, 4xx/5xx, timeout, parse → false.
 */
export async function hasActiveEliteProMembership(whopUserId: string): Promise<boolean> {
  const apiKey = requireEnv('WHOP_API_KEY')
  const productId = requireEnv('WHOP_PRODUCT_ID')
  try {
    for (let page = 1; page <= MAX_MEMBERSHIP_PAGES; page++) {
      const url =
        `https://api.whop.com/v2/memberships` +
        `?user_id=${encodeURIComponent(whopUserId)}&page=${page}`
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      })
      if (!r.ok) return false
      const payload = (await r.json()) as WhopMembershipsListResponse
      const list = Array.isArray(payload?.data) ? payload.data : []

      // Early-return : dès qu'une page contient une ÉLITE PRO valide, c'est OK.
      // .some() scanne la page courante — garantit qu'on couvre TOUTES les
      // memberships du user (pas la première au hasard).
      if (list.some(m => m.product === productId && m.valid === true)) {
        return true
      }

      // Fin de pagination atteinte proprement (dernière page lue).
      const totalPages = payload?.pagination?.total_page ?? 1
      if (page >= totalPages) return false
    }
    // Safe-guard atteint — très improbable, mais fail-closed par principe.
    return false
  } catch {
    return false
  }
}

// ─── Vérif abonnement — Current API (nouvelle génération) ──────────
//
// Remplace /v2/memberships (deprecated 13/11/2026). Différences :
//   - base `/api/v1`, header Api-Version-Date, scope company_id requis
//   - filtres server-side (product_ids[], statuses[], user_id)
//   - pagination curseur (first + after) au lieu de page/per
//   - `product` / `user` deviennent des OBJETS (plus des strings)
//   - `valid: boolean` disparaît → on juge l'accès via
//     `member.access_level ∈ {customer, admin}` OU `status ∈ ALLOWLIST`
//
// Deux surfaces exportées :
//   - fetchEliteProAccessNew(whopUserId) : résultat détaillé
//     (observabilité, route admin de comparaison) ;
//   - hasActiveEliteProMembershipNew(whopUserId) : booléen fail-closed
//     — même signature que l'ancienne fonction v2 pour swap trivial.

/** Shape item (Current API — observée doc + migration v2→v5). */
interface WhopMembershipNew {
  id: string
  status?: string
  product?: { id?: string; title?: string }
  user?: { id?: string; email?: string }
  member?: { access_level?: 'customer' | 'admin' | 'no_access' }
  created_at?: string
}

interface WhopMembershipsListResponseNew {
  data?: WhopMembershipNew[]
  page_info?: {
    has_next_page?: boolean
    end_cursor?: string | null
  }
}

export interface EliteProAccessDetail {
  granted: boolean
  /** Pages réellement interrogées (1 à MAX_MEMBERSHIP_PAGES). */
  pagesChecked: number
  /** Memberships lues (toutes pages confondues), aplaties pour l'admin
   *  compare. Reste `[]` sur erreur réseau. */
  memberships: Array<{
    id: string
    status: string | null
    productId: string | null
    memberAccessLevel: string | null
    /** Pourquoi cette membership a-t-elle (ou pas) été jugée valide ?
     *  'access_level' = member.access_level ∈ customer/admin
     *  'status'       = status ∈ ACTIVE_STATUSES
     *  null           = ni l'un ni l'autre */
    reasonValid: 'access_level' | 'status' | null
  }>
  /** Non-null si Whop a renvoyé un header Deprecation sur une des
   *  pages — on veut le voir dans la route admin, c'est l'indicateur
   *  que l'URL utilisée n'est pas la bonne. */
  deprecationHeader: string | null
  /** Code HTTP si une page a retourné un échec ; null si tout OK. */
  errorStatus: number | null
  /** Libellé court pour logs/UI admin (403, timeout, parse…). */
  errorMessage: string | null
}

/** Juge si une ligne membership donne accès ÉLITE PRO.
 *  Expose la RAISON (access_level ou status) pour l'audit admin. */
function evaluateMembershipAccess(m: WhopMembershipNew): 'access_level' | 'status' | null {
  const lvl = m.member?.access_level
  if (lvl === 'customer' || lvl === 'admin') return 'access_level'
  if (isMembershipActive(m.status)) return 'status'
  return null
}

export async function fetchEliteProAccessNew(whopUserId: string): Promise<EliteProAccessDetail> {
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
    (process.env.WHOP_API_VERSION_DATE || '').trim() || WHOP_NEW_API_VERSION_DATE_DEFAULT

  let cursor: string | null = null
  for (let page = 1; page <= MAX_MEMBERSHIP_PAGES; page++) {
    const params = new URLSearchParams()
    params.set('user_id', whopUserId)
    params.set('company_id', companyId)
    params.set('first', String(NEW_API_PAGE_SIZE))
    params.append('product_ids[]', productId)
    for (const s of ACTIVE_STATUSES) params.append('statuses[]', s)
    if (cursor) params.set('after', cursor)
    const url = `${WHOP_NEW_API_BASE}/memberships?${params.toString()}`

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
      console.error('[whop-new-api] fetch error', { page, url, err })
      return detail
    }

    detail.pagesChecked = page

    const dep = r.headers.get('deprecation')
    if (dep && !detail.deprecationHeader) {
      detail.deprecationHeader = dep
      console.warn('[whop-new-api] Deprecation header on current URL', { url, dep })
    }

    if (!r.ok) {
      detail.errorStatus = r.status
      if (r.status === 403) {
        detail.errorMessage = 'permissions insuffisantes (403) — cocher member:basic:read + member:email:read sur l\'App'
        console.error('[whop-new-api] 403 — permissions', { url })
      } else if (r.status === 401) {
        detail.errorMessage = 'clé Whop refusée (401)'
      } else {
        detail.errorMessage = `HTTP ${r.status}`
      }
      return detail
    }

    let payload: WhopMembershipsListResponseNew
    try {
      payload = await r.json() as WhopMembershipsListResponseNew
    } catch (err) {
      detail.errorStatus = r.status
      detail.errorMessage = 'JSON parse failed'
      console.error('[whop-new-api] parse error', { url, err })
      return detail
    }

    const items = Array.isArray(payload.data) ? payload.data : []
    for (const m of items) {
      // Garde-fou : la Current API filtre déjà par product_ids[], mais on
      // reverify côté client — défense en profondeur, protège d'un future
      // relâchement du filtre serveur.
      if (m.product?.id !== productId) continue
      const reason = evaluateMembershipAccess(m)
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
 * Même signature que `hasActiveEliteProMembership` (v2), mais tape la
 * Current API. Fail-closed sur toute erreur : réseau, 4xx/5xx, parse,
 * env manquante. Comportement d'accès identique en pratique :
 * trialing + active + completed + canceling + past_due → accès ;
 * canceled + expired + unresolved + drafted → refus.
 */
export async function hasActiveEliteProMembershipNew(whopUserId: string): Promise<boolean> {
  const detail = await fetchEliteProAccessNew(whopUserId)
  return detail.granted
}

// ─── OAuth : revoke token (pour le logout, étape 4) ─────────────────

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
