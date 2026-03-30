import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { trader_id } = await request.json()
  if (!trader_id) return NextResponse.json({ error: 'trader_id requis' }, { status: 400 })

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delete profile first (cascade will handle related data)
  const { error: profileError } = await adminSupabase.from('profiles').delete().eq('id', trader_id)
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  // Then delete auth user
  const { error: authError } = await adminSupabase.auth.admin.deleteUser(trader_id)
  if (authError) {
    // Auth deletion failed but profile is gone — log but don't block
    console.error('Auth delete failed:', authError.message)
  }

  return NextResponse.json({ success: true })
}
