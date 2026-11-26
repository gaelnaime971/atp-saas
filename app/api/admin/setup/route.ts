import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Création du tout premier admin. Une fois un admin en place, la route
// n'existe plus pour personne : 404 en GET comme en POST, sans rien
// révéler. Fail-closed : si le comptage échoue, on répond 404 aussi
// (avant, une erreur de lecture valait « aucun admin » et ouvrait la
// création).
async function setupClosed(supabase: ReturnType<typeof adminSupabase>): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
  return !!error || count == null || count > 0
}

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

// Aucun admin → la page /admin/setup peut proposer la création.
export async function GET() {
  if (await setupClosed(adminSupabase())) return NOT_FOUND()
  return NextResponse.json({ adminExists: false })
}

// Create the first admin
export async function POST(request: NextRequest) {
  const supabase = adminSupabase()

  // Un admin existe déjà (ou vérification impossible) → 404.
  if (await setupClosed(supabase)) return NOT_FOUND()

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
