import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ connected: false })

  const { data: row } = await adminSupabase
    .from('google_calendar_tokens')
    .select('connected_email, expires_at, created_at')
    .eq('admin_id', user.id)
    .maybeSingle()

  if (!row) return NextResponse.json({ connected: false })

  return NextResponse.json({
    connected: true,
    email: row.connected_email,
    connected_at: row.created_at,
  })
}
