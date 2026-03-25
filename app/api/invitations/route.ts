import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { render } from '@react-email/components'
import InviteEmail from '@/emails/InviteEmail'
import { InviteTraderPayload } from '@/lib/types'

const resend = new Resend(process.env.RESEND_API_KEY)

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body: InviteTraderPayload = await request.json()
    const { email, full_name, plan_type, propfirm_name } = body

    if (!email || !full_name || !plan_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Invalidate any existing pending invitation for this email
    await adminSupabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('email', email)
      .is('used_at', null)

    // Generate unique code
    let code = generateCode()
    let attempts = 0
    while (attempts < 5) {
      const { data: existing } = await adminSupabase
        .from('invitations')
        .select('id')
        .eq('code', code)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (!existing) break
      code = generateCode()
      attempts++
    }

    const { error: inviteError } = await adminSupabase
      .from('invitations')
      .insert({
        email,
        full_name,
        plan_type,
        propfirm_name: propfirm_name || null,
        invited_by: user.id,
        code,
      })

    if (inviteError) {
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite`

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const emailHtml = await render(
      InviteEmail({ full_name, code, plan_type, inviteUrl, appUrl })
    )

    const { error: emailError } = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: email,
      subject: `Votre code d'accès ATP Coaching : ${code}`,
      html: emailHtml,
    })

    if (emailError) {
      console.error('Email send error:', emailError)
      // Return code anyway so admin can share it manually
      return NextResponse.json({
        success: true,
        code,
        emailSent: false,
        message: `Code généré. L'email n'a pas pu être envoyé (domaine non vérifié).`,
      })
    }

    return NextResponse.json({ success: true, code, emailSent: true, message: `Invitation envoyée à ${email}` })
  } catch (error) {
    console.error('Invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: invitations, error } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Get invitations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
