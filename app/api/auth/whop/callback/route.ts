/**
 * GET /api/auth/whop/callback?code=XXX&state=YYY
 *
 * Point de retour de l'OAuth Whop. Enchaîne :
 *   1. Récupère + valide le state (anti-CSRF, matché contre le cookie posé par /start)
 *   2. Récupère le code_verifier (PKCE) depuis son cookie
 *   3. Échange code → access_token (POST JSON vers Whop /oauth/token)
 *   4. Récupère user info OIDC (sub = whopUserId, email)
 *   5. Vérifie membership ÉLITE PRO valide (fail-closed, paginé)
 *   6. Cherche profile Supabase par whop_user_id puis par email
 *   7. Si pas de profile → AUTO-CRÉATION via admin.createUser (le trigger
 *      SQL handle_new_user crée automatiquement la ligne profiles)
 *   8. Si pas d'abonnement → /whop/subscription-required
 *   9. Si OK → lie whop_user_id + flag TRUE, génère un hashed_token admin,
 *      le consomme server-side via verifyOtp (pose les cookies sb-* en
 *      direct, pas de hash fragment via /auth/v1/verify) → /dashboard
 *
 * Les cookies PKCE + state sont systématiquement nettoyés (succès OU échec)
 * via clearCookies().
 *
 * Politique d'erreur : silencieuse côté user — toute erreur backend finit sur
 * /whop/request-access?error=X (X = raison technique pour debug admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createSSRClient } from '@/lib/supabase/server'
import {
  exchangeCodeForToken,
  fetchWhopUserInfo,
  hasActiveEliteProMembership,
  decodeJwtPayload,
} from '@/lib/whop/client'

const PKCE_COOKIE = 'whop_pkce_verifier'
const STATE_COOKIE = 'whop_oauth_state'
const NONCE_COOKIE = 'whop_oidc_nonce'

function clearOAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(PKCE_COOKIE)
  response.cookies.delete(STATE_COOKIE)
  response.cookies.delete(NONCE_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const oauthError = request.nextUrl.searchParams.get('error')

  const toPage = (path: string) =>
    clearOAuthCookies(NextResponse.redirect(`${origin}${path}`))

  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value
  const storedState = request.cookies.get(STATE_COOKIE)?.value
  const storedNonce = request.cookies.get(NONCE_COOKIE)?.value

  // L'user a refusé l'autorisation côté Whop, ou Whop a renvoyé une erreur.
  if (oauthError) {
    return toPage(`/whop/request-access?error=oauth_${oauthError}`)
  }

  // Validation state (anti-CSRF strict) + présence des cookies PKCE + nonce.
  if (!code || !state || !storedState || state !== storedState || !codeVerifier || !storedNonce) {
    return toPage('/whop/request-access?error=invalid_state')
  }

  try {
    // 1. Échange code → access_token (JSON body, PKCE S256).
    const token = await exchangeCodeForToken({
      code,
      codeVerifier,
      redirectUri: `${origin}/api/auth/whop/callback`,
    })

    // 1b. Vérif nonce OIDC — le claim "nonce" de l'id_token doit matcher
    //     le cookie posé à /start (anti-replay). Si Whop ne renvoie pas
    //     d'id_token malgré le scope openid, on skip la vérif (le nonce
    //     a quand même été envoyé à /authorize, Whop a fait sa part).
    if (token.id_token) {
      const payload = decodeJwtPayload(token.id_token)
      const claimedNonce = payload?.nonce
      if (typeof claimedNonce !== 'string' || claimedNonce !== storedNonce) {
        return toPage('/whop/request-access?error=nonce_mismatch')
      }
    }

    // 2. User info OIDC.
    const user = await fetchWhopUserInfo(token.access_token)
    const whopUserId = user.sub
    const whopEmail = user.email ?? null

    if (!whopUserId) {
      return toPage('/whop/request-access?error=no_sub')
    }

    // 3. Vérif abonnement ÉLITE PRO — paginé, early-return, fail-closed.
    const hasAccess = await hasActiveEliteProMembership(whopUserId)
    if (!hasAccess) {
      return toPage('/whop/subscription-required')
    }

    // 4. Supabase admin — bypass RLS pour chercher + update le profile.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return toPage('/whop/request-access?error=supabase_env')
    }
    const admin = createAdminClient(supabaseUrl, serviceKey)

    // Cherche le profile par whop_user_id en priorité (match déjà lié),
    // sinon par email (premier login Whop → association automatique).
    let profile: { id: string; email: string | null } | null = null

    const { data: byWhop } = await admin
      .from('profiles')
      .select('id, email')
      .eq('whop_user_id', whopUserId)
      .maybeSingle()
    if (byWhop) profile = byWhop as { id: string; email: string | null }

    if (!profile && whopEmail) {
      // ilike (case-insensitive) au lieu de eq : les emails saisis à
      // l'inscription dashboard et ceux stockés chez Whop peuvent diverger
      // en casse (Jean@gmail.com vs jean@gmail.com) — avec eq, un vrai
      // abonné serait bloqué à tort. Les wildcards SQL (% _) dans un email
      // RFC-valide sont quasi impossibles → risque de faux-positif nul en
      // pratique sur une base de membres.
      const { data: byEmail } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', whopEmail)
        .maybeSingle()
      if (byEmail) profile = byEmail as { id: string; email: string | null }
    }

    // 5. Pas de profile → AUTO-CRÉATION (décision produit : un abonné ÉLITE PRO
    //    valide = accès direct, pas d'invitation manuelle).
    //
    //    IMPORTANT : la migration 20260324000000_initial_schema.sql installe
    //    un trigger `on_auth_user_created` qui, à chaque INSERT dans
    //    auth.users, crée AUTOMATIQUEMENT la ligne profiles(id, email,
    //    full_name, role) à partir de raw_user_meta_data. On ne fait donc
    //    PAS d'INSERT manuel ici — on passe full_name + role via
    //    user_metadata, le trigger s'occupe du reste. L'UPDATE qui suit
    //    (étape 6) posera whop_user_id + whop_subscription_active=true sur
    //    la ligne fraîchement créée (idempotent).
    if (!profile) {
      if (!whopEmail) {
        return toPage('/whop/request-access?error=no_email_for_create')
      }
      const displayName =
        user.name ?? user.preferred_username ?? null

      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: whopEmail,
          email_confirm: true,          // bypass vérif email (confiance OIDC Whop)
          user_metadata: {
            full_name: displayName,
            role: 'trader',             // lu par handle_new_user()
          },
        })
      if (createErr || !created?.user?.id) {
        return toPage('/whop/request-access?error=auto_create_failed')
      }

      profile = { id: created.user.id, email: whopEmail }
    }

    // 6. Lie whop_user_id + flag true. Idempotent — un re-run ne casse rien,
    //    update inoffensif si les valeurs sont déjà posées.
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        whop_user_id: whopUserId,
        whop_subscription_active: true,
      })
      .eq('id', profile.id)
    if (updateError) {
      return toPage('/whop/request-access?error=update_profile')
    }

    // 7. Email pour le magic link — profile.email d'abord (source de vérité
    //    Supabase), fallback sur l'email Whop.
    const authEmail = profile.email ?? whopEmail
    if (!authEmail) {
      return toPage('/whop/request-access?error=no_email')
    }

    // 8. Génère un hashed_token admin et consomme-le côté serveur avec
    //    verifyOtp — pas de redirection via action_link Supabase.
    //
    //    Pourquoi : generateLink en appel admin produit un action_link en
    //    flow IMPLICIT (token dans le fragment #access_token=...). Le
    //    fragment n'est jamais envoyé au serveur → @supabase/ssr (cookies)
    //    ne peut pas poser la session → proxy.ts voit "non connecté" et
    //    renvoie sur /login avec le hash perdu. En consommant le
    //    hashed_token server-side via verifyOtp, le client SSR écrit
    //    directement les cookies de session Supabase et on redirige propre
    //    vers /dashboard — aucun token ne transite par le navigateur.
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: authEmail,
      })
    if (linkError || !linkData?.properties?.hashed_token) {
      return toPage('/whop/request-access?error=magiclink_failed')
    }

    // 9. Client SSR (lit/écrit les cookies de session via next/headers).
    //    verifyOtp valide le hashed_token admin ET pose les cookies
    //    sb-* automatiquement — pas besoin de les copier à la main.
    const supabaseUser = await createSSRClient()
    const { error: verifyError } = await supabaseUser.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })
    if (verifyError) {
      return toPage('/whop/request-access?error=verify_otp_failed')
    }

    // 10. Session Supabase posée en cookies — redirect propre vers /dashboard.
    //     Les cookies OAuth Whop temporaires sont nettoyés par clearOAuthCookies.
    return clearOAuthCookies(NextResponse.redirect(`${origin}/dashboard`))
  } catch {
    return toPage('/whop/request-access?error=exception')
  }
}
