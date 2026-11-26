import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  decideInvitationAttempt,
  INVITE_REFUSAL,
  type PendingInvitation,
} from '@/lib/invitations/attempts'

/**
 * POST /api/invitations/validate — page publique /invite.
 *
 * Vérifie le code ET crée le compte dans la MÊME requête : il n'existe
 * aucun autre chemin de création de compte par invitation, donc pas de
 * contournement possible de la limite d'essais.
 *
 * - 5 codes faux → invitation(s) de cet e-mail bloquée(s) 15 min, même
 *   avec le bon code (lib/invitations/attempts.ts).
 * - Compteur écrit en compare-and-set (eq failed_attempts) : des essais
 *   en parallèle ne dépassent pas la limite ; un essai qui perd la
 *   course est refusé.
 * - Invitation consommée (used_at) AVANT la création du compte, de façon
 *   atomique ; libérée si la création échoue.
 * - Un seul message pour tous les refus : « Code invalide ou expiré ».
 */

type InvitationRow = PendingInvitation & {
  email: string
  full_name: string | null
  plan_type: string | null
  propfirm_name: string | null
  whop_link: string | null
  whop_email: string | null
  admin_observations: string | null
}

const COLUMNS =
  'id, email, code, expires_at, used_at, failed_attempts, locked_until, full_name, plan_type, propfirm_name, whop_link, whop_email, admin_observations'

const refuse = () => NextResponse.json({ error: INVITE_REFUSAL }, { status: 400 })

/** Échappe les jokers de ILIKE (% _ \) : l'e-mail est cherché tel quel. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

export async function POST(request: NextRequest) {
  try {
    const { email, code, password } = await request.json()

    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }

    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 })
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const emailNorm = String(email).toLowerCase().trim()
    const codeNorm = String(code).trim()

    // Toutes les invitations de cet e-mail (casse ignorée, jokers échappés),
    // puis égalité stricte côté serveur par sécurité.
    const { data: rows, error: lookupError } = await adminSupabase
      .from('invitations')
      .select(COLUMNS)
      .ilike('email', escapeLike(emailNorm))
    if (lookupError) {
      console.error('Invitation lookup failed:', { code: lookupError.code, message: lookupError.message })
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    const invitations = ((rows ?? []) as InvitationRow[])
      .filter(inv => (inv.email ?? '').toLowerCase().trim() === emailNorm)

    const decision = decideInvitationAttempt(invitations, codeNorm)

    if (decision.kind === 'refuse') return refuse()

    if (decision.kind === 'wrong') {
      // Compare-and-set : n'incrémente que si personne n'a écrit entre-temps.
      for (const u of decision.updates) {
        await adminSupabase
          .from('invitations')
          .update({ failed_attempts: u.failed_attempts, locked_until: u.locked_until })
          .eq('id', u.id)
          .eq('failed_attempts', u.expectAttempts)
          .select('id')
      }
      return refuse()
    }

    // Bon code : consomme l'invitation de façon atomique (toujours libre,
    // compteur inchangé depuis la lecture → aucun blocage posé entre-temps).
    const invitation = decision.invitation
    const { data: claimed } = await adminSupabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .eq('failed_attempts', decision.expectAttempts)
      .is('used_at', null)
      .select('id')
    if (!claimed || claimed.length !== 1) return refuse()

    const release = () => adminSupabase
      .from('invitations')
      .update({ used_at: null })
      .eq('id', invitation.id)

    // Création du compte, uniquement après validation du code ci-dessus.
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
      await release()
      if (createError.message.includes('already')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cet email' }, { status: 409 })
      }
      console.error('Create user error:', { message: createError.message })
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Validate invitation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
