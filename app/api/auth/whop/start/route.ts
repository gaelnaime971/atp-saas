/**
 * GET /api/auth/whop/start
 *
 * Point d'entrée de l'OAuth Whop. Génère un couple PKCE (verifier/challenge)
 * et un state anti-CSRF, les stocke dans 2 cookies HTTP-only (10 min), puis
 * redirige vers l'URL d'autorisation Whop.
 *
 * Les cookies sont relus au /callback pour :
 *   - valider que le state renvoyé par Whop correspond (anti-CSRF)
 *   - fournir le code_verifier à l'échange code → token (PKCE)
 *
 * Le middleware proxy.ts exclut déjà /api de la redirection /login
 * (isApiRoute = pathname.startsWith('/api')), donc cette route est
 * accessible à un visiteur non-connecté — comportement souhaité.
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizeUrl, generatePkcePair, generateState } from '@/lib/whop/client'

const PKCE_COOKIE = 'whop_pkce_verifier'
const STATE_COOKIE = 'whop_oauth_state'
const COOKIE_MAX_AGE_SEC = 10 * 60   // 10 minutes

export async function GET(request: NextRequest) {
  const { verifier, challenge } = generatePkcePair()
  const state = generateState()

  // L'origin de la requête (http://localhost:3000 en dev, https://alphatradingpro-coaching.fr
  // en prod) donne la bonne redirect URI — doit matcher l'une des URI
  // configurées côté Whop app (dev + prod).
  const redirectUri = `${request.nextUrl.origin}/api/auth/whop/callback`

  const authorizeUrl = buildAuthorizeUrl({
    state,
    codeChallenge: challenge,
    redirectUri,
  })

  const response = NextResponse.redirect(authorizeUrl)

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE_SEC,
    path: '/',
  }
  response.cookies.set(PKCE_COOKIE, verifier, cookieOpts)
  response.cookies.set(STATE_COOKIE, state, cookieOpts)

  return response
}
