import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Public routes
  const publicRoutes = ['/login', '/admin/login', '/admin/setup', '/invite', '/logout', '/offre', '/methode-atp', '/trading-night-guadeloupe', '/paiement', '/padel', '/koh-samui', '/marches', '/maquettes', '/whop']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  const isApiRoute = pathname.startsWith('/api')

  // Not authenticated → redirect to appropriate login
  if (!user && !isPublicRoute && !isApiRoute && pathname !== '/') {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    // SELECT étendu : email + whop_subscription_active lus en une seule
    // requête (déjà faite aujourd'hui pour role). Zéro impact perf.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, email, whop_subscription_active')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    // Already logged in → redirect away from login/home pages
    if (pathname === '/' || pathname === '/login' || pathname === '/admin/login') {
      return NextResponse.redirect(
        new URL(isAdmin ? '/admin/dashboard' : '/dashboard', request.url)
      )
    }

    // Admin trying to access trader area
    if (pathname.startsWith('/dashboard') && isAdmin) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    // Trader trying to access admin area
    if (pathname.startsWith('/admin') && !isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // ─── GATE WHOP (étape 6) ────────────────────────────────────────
    // Filtre d'accès dashboard sur whop_subscription_active, désactivé
    // par défaut via interrupteur WHOP_GATE_ENABLED. 3 garde-fous :
    //
    //   1. Interrupteur STRICT : seule la valeur littérale "true" active
    //      le gate. undefined / "false" / "1" / "True" → gate OFF.
    //      Défaut sûr : rien de configuré sur Vercel = aucun blocage.
    //
    //   2. Bypass admin + whitelist email (WHOP_BYPASS_EMAILS, séparé
    //      par virgules, case-insensitive). Sortie de secours blindée
    //      pour l'admin et le compte test — jamais enfermés dehors.
    //      L'admin passe DEUX fois : d'abord via les redirects au-dessus
    //      (/dashboard → /admin/dashboard), puis via isAdmin ici.
    //
    //   3. Fail-open naturel : si profile == null (erreur de lecture
    //      DB, timeout), on NE REDIRIGE PAS. Mieux vaut laisser passer
    //      2s à tort que bloquer des payeurs sur un glitch réseau.
    //      Inverse du webhook (fail-closed car il écrit) — ici on gère
    //      l'accès de gens, donc fail-open.
    const gateEnabled = process.env.WHOP_GATE_ENABLED === 'true'

    if (gateEnabled && pathname.startsWith('/dashboard')) {
      const bypassEmails = (process.env.WHOP_BYPASS_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      const email = profile?.email?.toLowerCase()
      const isBypassed =
        isAdmin ||
        (email !== undefined && bypassEmails.includes(email))

      if (
        !isBypassed &&
        profile &&
        profile.whop_subscription_active !== true
      ) {
        return NextResponse.redirect(
          new URL('/whop/subscription-required', request.url)
        )
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|webm|mov)$).*)',
    { source: '/' },
  ],
}
