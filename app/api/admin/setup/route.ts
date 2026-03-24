import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Check if an admin exists
export async function GET() {
  const supabase = adminSupabase()
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  return NextResponse.json({ adminExists: (count ?? 0) > 0 })
}

// Create the first admin
export async function POST(request: NextRequest) {
  const supabase = adminSupabase()

  // Guard: refuse if admin already exists
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Un administrateur existe déjà' }, { status: 409 })
  }

  const { email, password, full_name } = await request.json()

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Mot de passe trop court (8 caractères minimum)' }, { status: 400 })
  }

  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin' },
  })

  if (createError || !newUser.user) {
    return NextResponse.json({ error: createError?.message ?? 'Erreur création compte' }, { status: 500 })
  }

  // Upsert profile with admin role (handles race condition with trigger)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      email: email,
      full_name,
      role: 'admin',
    }, { onConflict: 'id' })

  if (profileError) {
    return NextResponse.json({ error: 'Compte créé mais profil non mis à jour' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
