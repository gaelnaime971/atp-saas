import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { email, code, password } = await request.json()

    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Find valid invitation
    const { data: invitation, error: inviteError } = await adminSupabase
      .from('invitations')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('code', code.trim())
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Code invalide ou expiré' }, { status: 400 })
    }

    // Create Supabase auth user
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: invitation.full_name,
        role: 'trader',
      },
    })

    if (createError) {
      // If user already exists, try updating password
      if (createError.message.includes('already')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cet email' }, { status: 409 })
      }
      console.error('Create user error:', createError)
      return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 })
    }

    // Update profile with invitation data
    if (newUser.user) {
      await adminSupabase
        .from('profiles')
        .update({
          plan_type: invitation.plan_type,
          propfirm_name: invitation.propfirm_name,
        })
        .eq('id', newUser.user.id)
    }

    // Mark invitation as used
    await adminSupabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invitation.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Validate invitation error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
