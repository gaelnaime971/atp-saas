import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl } from '@/lib/google'
import { randomBytes } from 'crypto'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Use admin user id as state (signed with random suffix for CSRF protection-ish)
    const state = `${user.id}:${randomBytes(16).toString('hex')}`
    const url = buildAuthUrl(state)

    // Store state in a cookie so callback can verify
    const res = NextResponse.redirect(url)
    res.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 min
      path: '/',
    })
    return res
  } catch (err) {
    console.error('OAuth start error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
