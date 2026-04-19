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

    // Find valid invitation — try case-insensitive email match
    const emailNorm = email.toLowerCase().trim()
    const codeNorm = code.trim()

    const { data: invitation, error: inviteError } = await adminSupabase
      .from('invitations')
      .select('*')
      .ilike('email', emailNorm)
      .eq('code', codeNorm)
      .is('used_at', null)
      .single()

    if (inviteError || !invitation) {
      console.error('Invitation lookup failed:', { emailNorm, codeNorm, inviteError })
      // Check if code exists but is expired or used
      const { data: anyInvite } = await adminSupabase
        .from('invitations')
        .select('email, code, used_at, expires_at')
        .ilike('email', emailNorm)
        .eq('code', codeNorm)
        .single()

      if (anyInvite?.used_at) {
        return NextResponse.json({ error: 'Ce code a déjà été utilisé' }, { status: 400 })
      }
      if (anyInvite && new Date(anyInvite.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Ce code a expiré. Demande un nouveau code à ton coach.' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Code invalide. Vérifie ton email et ton code.' }, { status: 400 })
    }

    // Check expiration separately for clearer error
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Ce code a expiré. Demande un nouveau code à ton coach.' }, { status: 400 })
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
          whop_link: invitation.whop_link,
          whop_email: invitation.whop_email,
          admin_observations: invitation.admin_observations,
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
