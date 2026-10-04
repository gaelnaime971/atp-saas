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
 *   7. Si pas de profile → /whop/request-access (pas de création auto, décidé produit)
 *   8. Si pas d'abonnement → /whop/subscription-required
 *   9. Si OK → lie whop_user_id + flag TRUE + magic link admin → /dashboard
 *
 * Les cookies PKCE + state sont systématiquement nettoyés (succès OU échec)
 * via clearCookies().
 *
 * Politique d'erreur : silencieuse côté user — toute erreur backend finit sur
 * /whop/request-access?error=X (X = raison technique pour debug admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  exchangeCodeForToken,
  fetchWhopUserInfo,
  hasActiveEliteProMembership,
} from '@/lib/whop/client'

const PKCE_COOKIE = 'whop_pkce_verifier'
const STATE_COOKIE = 'whop_oauth_state'

function clearOAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(PKCE_COOKIE)
  response.cookies.delete(STATE_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const oauthError = request.nextUrl.searchParams.get('error')

  const toPage = (path: string) =>
    clearOAuthCookies(NextResponse.redirect(`${origin}${path}`))

  // L'user a refusé l'autorisation côté Whop, ou Whop a renvoyé une erreur.
  if (oauthError) {
    return toPage(`/whop/request-access?error=oauth_${oauthError}`)
  }

  const codeVerifier = request.cookies.get(PKCE_COOKIE)?.value
  const storedState = request.cookies.get(STATE_COOKIE)?.value

  // Validation state (anti-CSRF strict) + présence des cookies PKCE.
  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    return toPage('/whop/request-access?error=invalid_state')
  }

  try {
    // 1. Échange code → access_token (JSON body, PKCE S256).
    const token = await exchangeCodeForToken({
      code,
      codeVerifier,
      redirectUri: `${origin}/api/auth/whop/callback`,
    })

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
      const { data: byEmail } = await admin
        .from('profiles')
        .select('id, email')
        .eq('email', whopEmail)
        .maybeSingle()
      if (byEmail) profile = byEmail as { id: string; email: string | null }
    }

    // 5. Pas de profile → page request-access. Pas de création auto (décision
    //    produit : seul le flow /invite existant crée les comptes).
    if (!profile) {
      return toPage('/whop/request-access')
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

    // 8. Magic link admin → le lien signe le user et redirige /dashboard.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: {
        redirectTo: `${origin}/dashboard`,
      },
    })
    if (linkError || !linkData?.properties?.action_link) {
      return toPage('/whop/request-access?error=magiclink_failed')
    }

    // 9. Redirect vers le action_link Supabase. Le user clique rien — c'est
    //    une redirection serveur. Supabase valide le lien, pose les cookies
    //    de session, puis redirige vers redirectTo (/dashboard).
    return clearOAuthCookies(NextResponse.redirect(linkData.properties.action_link))
  } catch {
    return toPage('/whop/request-access?error=exception')
  }
}
