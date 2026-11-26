import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { canSeeTerminal } from '@/lib/terminal/access'
import { hasDashboardAccess, INACTIVE_PATH, readAccessProfile } from '@/lib/access/member-access'

export async function proxy(request: NextRequest) {
  // Jarvis (POC gated par JARVIS_ENABLED + JARVIS_ALLOWED_EMAILS) gère
  // son propre auth + accès via requireJarvisAccess() DANS la route
  // handler. Court-circuiter le middleware évite 2 round-trips Supabase
  // (getUser + SELECT profiles) qui ajoutent ~1s par requête sans
  // apporter de valeur ici. Zéro risque de session morte : le client
  // @supabase/ssr côté app rafraîchit déjà le token depuis les cookies
  // à chaque navigation, et la route Jarvis fait son propre getUser().
  if (request.nextUrl.pathname.startsWith('/api/jarvis/')) {
    return NextResponse.next({ request })
  }

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
  const publicRoutes = ['/login', '/admin/login', '/admin/setup', '/invite', '/logout', '/offre', '/methode-atp', '/trading-night-guadeloupe', '/paiement', '/padel', '/koh-samui', '/marches', '/maquettes', '/whop', '/aaron']
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
    // Une seule lecture : role + colonnes d'accès (lib/access/member-access).
    const profile = await readAccessProfile(cols =>
      supabase.from('profiles').select(cols).eq('id', user.id).maybeSingle(),
    )

    const isAdmin = profile?.role === 'admin'

    // Already logged in → redirect away from login/home pages
    if (pathname === '/' || pathname === '/login' || pathname === '/admin/login') {
      return NextResponse.redirect(
        new URL(isAdmin ? '/admin/dashboard' : '/dashboard', request.url)
      )
    }

    // Admin trying to access trader area. Exception : l'espace Marchés
    // (/dashboard/marches et ses sous-pages) reste ouvert à l'admin pour
    // qu'il voie ses propres écrans. Le reste de /dashboard redirige.
    const isMarketsSpace =
      pathname === '/dashboard/marches' || pathname.startsWith('/dashboard/marches/')
    if (pathname.startsWith('/dashboard') && isAdmin && !isMarketsSpace) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    // Trader trying to access admin area
    if (pathname.startsWith('/admin') && !isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Interrupteur de l'espace Marchés (TERMINAL_ACCESS, lib/terminal/access).
    // Absent ou ≠ "all" → réservé aux admins ; un membre est renvoyé sur
    // /dashboard. Fail-closed : profile null → pas admin → redirigé (sauf
    // "all"). Doublé dans app/dashboard/marches/layout.tsx.
    if (isMarketsSpace && !canSeeTerminal({ isAdmin, access: process.env.TERMINAL_ACCESS })) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // ─── ACCÈS AU DASHBOARD ─────────────────────────────────────────
    // Règle unique, toujours active (lib/access/member-access) : admin,
    // abonnement Whop actif en base, ou accès manuel valide. Sinon →
    // page « Ton abonnement n'est plus actif ». Fail-closed : profil
    // illisible → pas d'accès. Les routes /api membres appliquent la
    // même règle via requireMember() (lib/ai/quota).
    if (pathname.startsWith('/dashboard') && !hasDashboardAccess(profile)) {
      return NextResponse.redirect(new URL(INACTIVE_PATH, request.url))
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
