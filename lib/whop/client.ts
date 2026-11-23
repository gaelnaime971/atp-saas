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

/**
 * Shape REELLE renvoyée par GET /api/v1/memberships (Current API).
 * Confirmé par capture d'une page brute + schéma OpenAPI officiel :
 *   https://api.whop.com/api/v1/openapi.json  →  components.schemas.Membership
 *
 * ATTENTION — plusieurs champs sont présents DEUX fois dans la réponse :
 *   `product_id` (string top-level)  +  `product: {id, title, logo_url}`
 *   `user_id`    (string top-level, peut être null si membership orpheline)
 *   `plan_id`    (string top-level, "plan_xxx" — correspond au variant acheté)
 *
 * Il n'y a PAS de champ `user: {id, email}` (c'était une fausse hypothèse).
 * L'email n'est PAS retourné par /memberships ; il faut taper /members
 * en parallèle pour le résoudre (cf. fetchActiveEliteProMemberEmails).
 *
 * `member` est toujours null côté lecture serveur (clé API) — il n'est
 * peuplé que sur les lectures côté acheteur ("caller-side reads"). On
 * continue à le typer pour ne rien perdre si Whop le remplit un jour,
 * mais aucune décision ne repose dessus.
 */
interface WhopMembership {
  id: string
  status?: string
  user_id?: string | null
  product_id?: string
  plan_id?: string
  product?: { id?: string; title?: string; logo_url?: string }
  member?: { access_level?: 'customer' | 'admin' | 'no_access' } | null
  current_period_start?: string | null
  current_period_end?: string | null
  expires_at?: string | null
  canceled_at?: string | null
  cancel_at_period_end?: boolean
  billing_period_days?: number | null
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
  // product_id est le champ canonique (string top-level, OpenAPI) ; la clé
  // product.id est l'objet nested — les deux sont renvoyés avec la même
  // valeur. On tolère les deux pour rester robuste à un futur changement
  // de shape côté Whop.
  const linked = m.product_id ?? m.product?.id
  if (linked !== productId) return null
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

export type MembershipKind = 'subscription' | 'one_time' | 'unknown'

export interface SyncMembership {
  membershipId: string
  whopUserId: string | null
  /** Rempli post-fetch via fetchActiveEliteProMemberEmails. Reste null si
   *  le user n'est pas dans la liste /members (membership orpheline),
   *  ou si la permission member:email:read manque (voir le flag
   *  emailsPermissionMissing du retour). */
  email: string | null
  status: string | null
  createdAt: string | null
  planId: string | null
  /** Nom lisible dérivé (Mensuel/Semestriel/Annuel) ou title du plan si
   *  Whop l'a défini. Rempli après lookup via fetchEliteProPlans. */
  planName: string | null
  /** 'subscription' si billing_period_days > 0, 'one_time' sinon. */
  kind: MembershipKind
  /** Date de prochain renouvellement (abonnement) ou d'expiration
   *  (achat unique à durée limitée). Null = sans expiration (lifetime). */
  renewsOrExpiresAt: string | null
  cancelAtPeriodEnd: boolean
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
 * NB : l'email et planName sont laissés à null ici — ils sont enrichis
 * par l'appelant via fetchActiveEliteProMemberEmails (/members) et
 * fetchEliteProPlans (/plans). /memberships ne les renvoie pas.
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
      const linkedProduct = m.product_id ?? m.product?.id
      if (linkedProduct !== productId) continue
      if (!isMembershipActive(m.status)) continue

      const bpd = typeof m.billing_period_days === 'number' ? m.billing_period_days : null
      const kind: MembershipKind = bpd !== null
        ? (bpd > 0 ? 'subscription' : 'one_time')
        : 'unknown'
      // Date qu'un humain veut voir : renouvellement si abonnement en
      // cours, expiration si achat unique à durée limitée. Les deux
      // peuvent coexister dans la réponse — current_period_end prime
      // sur expires_at côté abonnement car il reflète le prochain cycle.
      const renewsOrExpiresAt = kind === 'subscription'
        ? (m.current_period_end ?? null)
        : (m.expires_at ?? m.current_period_end ?? null)

      result.memberships.push({
        membershipId: m.id,
        whopUserId: m.user_id ?? null,
        email: null,
        status: typeof m.status === 'string' ? m.status : null,
        createdAt: m.created_at ?? null,
        planId: m.plan_id ?? null,
        planName: null,
        kind,
        renewsOrExpiresAt,
        cancelAtPeriodEnd: m.cancel_at_period_end === true,
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

// ─── /members : résolution user_id → email ─────────────────────────

export interface MemberEmailFetch {
  /** Map `user_id` → email (lowercased). Vide sur erreur. */
  emailsByUserId: Map<string, string>
  /** true si /members a renvoyé 200 mais TOUS les emails étaient null ou
   *  absents — symptomatique d'un scope `member:email:read` manquant
   *  côté App Whop. */
  emailsPermissionMissing: boolean
  pagesChecked: number
  errorStatus: number | null
  errorMessage: string | null
}

interface WhopMember {
  id?: string
  email?: string | null
  user?: { id?: string | null }
}

interface WhopMembersListResponse {
  data?: WhopMember[]
  page_info?: { has_next_page?: boolean; end_cursor?: string | null }
}

/**
 * Récupère la table user_id → email pour TOUS les membres ÉLITE PRO
 * actifs (membership_status=active, product_ids=[WHOP_PRODUCT_ID]).
 *
 * L'endpoint /memberships ne renvoie pas d'email (confirmé page brute +
 * OpenAPI). /members, lui, expose `email` top-level + `user.id` — on
 * construit la map côté serveur et on la join côté appelant.
 *
 * Si le scope `member:email:read` manque sur l'App Whop, l'API répond
 * 200 mais `email: null` sur toutes les lignes → on le signale via
 * `emailsPermissionMissing` pour que l'admin corrige côté dashboard
 * Whop sans deviner.
 */
export async function fetchActiveEliteProMemberEmails(
  opts: { maxPages?: number } = {},
): Promise<MemberEmailFetch> {
  const result: MemberEmailFetch = {
    emailsByUserId: new Map(),
    emailsPermissionMissing: false,
    pagesChecked: 0,
    errorStatus: null,
    errorMessage: null,
  }

  let apiKey: string
  let productId: string
  try {
    apiKey = requireEnv('WHOP_API_KEY')
    productId = requireEnv('WHOP_PRODUCT_ID')
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
  let totalRows = 0
  let rowsWithEmail = 0

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams()
    params.set('first', String(PAGE_SIZE))
    params.append('product_ids[]', productId)
    // /members accepte `membership_status` SINGULIER avec les valeurs
    // "active" ou "inactive" (vérifié par expérience : l'array
    // membership_status[]=active renvoie 400). C'est différent des
    // filtres /memberships qui attendent un tableau statuses[].
    //
    // IMPORTANT — couverture vérifiée sur le compte prod le 23/11/2026 :
    // "active" sur /members est l'UNION des 5 statuts actifs côté
    // /memberships (active + trialing + completed + canceling + past_due),
    // pas le seul status literal "active". Preuve empirique : 67
    // memberships (16 active + 50 completed + 1 trialing) → 60 user_ids
    // distincts → tous les 60 présents dans /members?membership_status=
    // active → 67/67 memberships joignables à un email. Pas besoin de
    // taper /members?membership_status=inactive en plus.
    params.set('membership_status', 'active')
    if (cursor) params.set('after', cursor)
    const url = `${WHOP_API_BASE}/members?${params.toString()}`

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

    if (!r.ok) {
      result.errorStatus = r.status
      result.errorMessage = r.status === 403
        ? 'permissions insuffisantes (403) sur /members — cocher member:email:read'
        : r.status === 401
          ? 'clé Whop refusée (401)'
          : `HTTP ${r.status}`
      return result
    }

    let payload: WhopMembersListResponse
    try {
      payload = await r.json() as WhopMembersListResponse
    } catch {
      result.errorStatus = r.status
      result.errorMessage = 'JSON parse failed'
      return result
    }

    const items = Array.isArray(payload.data) ? payload.data : []
    for (const mb of items) {
      totalRows++
      const userId = mb.user?.id ?? null
      const email = typeof mb.email === 'string' && mb.email.length > 0
        ? mb.email.toLowerCase()
        : null
      if (email) rowsWithEmail++
      if (userId && email) result.emailsByUserId.set(userId, email)
    }

    const hasNext = payload.page_info?.has_next_page === true
    const endCursor = payload.page_info?.end_cursor ?? null
    if (!hasNext || !endCursor) break
    cursor = endCursor
  }

  // Signal explicite si /members répond 200 mais aucun email : le scope
  // Whop est probablement manquant — l'admin doit le voir sans deviner.
  if (totalRows > 0 && rowsWithEmail === 0) {
    result.emailsPermissionMissing = true
  }
  return result
}

// ─── /plans : table plan_id → nom lisible ──────────────────────────

export interface PlanInfo {
  id: string
  name: string
  kind: MembershipKind
  billingPeriodDays: number | null
  renewalPrice: number | null
  currency: string | null
}

export interface PlansFetch {
  plansById: Map<string, PlanInfo>
  errorStatus: number | null
  errorMessage: string | null
}

interface WhopPlan {
  id: string
  title?: string | null
  description?: string | null
  plan_type?: string | null
  billing_period?: number | null
  renewal_price?: number | string | null
  currency?: string | null
}

interface WhopPlansListResponse {
  data?: WhopPlan[]
}

/** Dérive un nom humain depuis la durée de facturation quand le plan Whop
 *  n'a ni title ni description (cas réel observé sur ÉLITE PRO). */
function derivePlanName(p: WhopPlan): string {
  const title = (p.title ?? '').trim()
  if (title) return title
  const desc = (p.description ?? '').trim()
  if (desc) return desc
  const bp = typeof p.billing_period === 'number' ? p.billing_period : null
  if (bp === null) return p.id
  if (bp === 30) return 'Mensuel'
  if (bp === 90) return 'Trimestriel'
  if (bp === 180) return 'Semestriel'
  if (bp === 365) return 'Annuel'
  return `${bp} jours`
}

/**
 * Catalogue plans du produit ÉLITE PRO. Un seul appel HTTP (tous les
 * plans tiennent largement sur une page). Appelé une fois en entrée du
 * rapport de sync, puis joint côté appelant via plan_id.
 */
export async function fetchEliteProPlans(): Promise<PlansFetch> {
  const result: PlansFetch = {
    plansById: new Map(),
    errorStatus: null,
    errorMessage: null,
  }

  let apiKey: string
  let productId: string
  try {
    apiKey = requireEnv('WHOP_API_KEY')
    productId = requireEnv('WHOP_PRODUCT_ID')
  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : 'env missing'
    return result
  }
  const apiVersionDate =
    (process.env.WHOP_API_VERSION_DATE || '').trim() || WHOP_API_VERSION_DATE_DEFAULT

  const params = new URLSearchParams()
  params.append('product_ids[]', productId)
  params.set('first', '100')
  const url = `${WHOP_API_BASE}/plans?${params.toString()}`

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

  if (!r.ok) {
    result.errorStatus = r.status
    result.errorMessage = `HTTP ${r.status}`
    return result
  }

  let payload: WhopPlansListResponse
  try {
    payload = await r.json() as WhopPlansListResponse
  } catch {
    result.errorStatus = r.status
    result.errorMessage = 'JSON parse failed'
    return result
  }

  const items = Array.isArray(payload.data) ? payload.data : []
  for (const p of items) {
    if (!p?.id) continue
    const bp = typeof p.billing_period === 'number' ? p.billing_period : null
    const price = typeof p.renewal_price === 'number'
      ? p.renewal_price
      : typeof p.renewal_price === 'string' && p.renewal_price.length > 0
        ? Number.parseFloat(p.renewal_price)
        : null
    const kind: MembershipKind = p.plan_type === 'renewal' || (bp !== null && bp > 0)
      ? 'subscription'
      : p.plan_type === 'one_time'
        ? 'one_time'
        : 'unknown'
    result.plansById.set(p.id, {
      id: p.id,
      name: derivePlanName(p),
      kind,
      billingPeriodDays: bp,
      renewalPrice: Number.isFinite(price as number) ? (price as number) : null,
      currency: typeof p.currency === 'string' ? p.currency : null,
    })
  }
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
