import { NextResponse, NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { exchangeCodeForTokens, fetchUserEmail } from '@/lib/google'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const baseRedirect = `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/dashboard`

  if (error) {
    return NextResponse.redirect(`${baseRedirect}?google=error&reason=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseRedirect}?google=error&reason=missing_params`)
  }

  // Verify state matches the cookie set during /start
  const cookieState = request.cookies.get('google_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(`${baseRedirect}?google=error&reason=state_mismatch`)
  }

  const adminId = state.split(':')[0]
  if (!adminId) {
    return NextResponse.redirect(`${baseRedirect}?google=error&reason=invalid_state`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // Should not happen because we use prompt=consent
      console.warn('No refresh_token received')
    }

    const email = await fetchUserEmail(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    // Upsert tokens
    await adminSupabase
      .from('google_calendar_tokens')
      .upsert({
        admin_id: adminId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || '', // will be empty if user already granted previously
        expires_at: expiresAt.toISOString(),
        connected_email: email,
        calendar_id: 'primary',
        updated_at: new Date().toISOString(),
      })

    const res = NextResponse.redirect(`${baseRedirect}?google=connected`)
    res.cookies.delete('google_oauth_state')
    return res
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(`${baseRedirect}?google=error&reason=exchange_failed`)
  }
}
