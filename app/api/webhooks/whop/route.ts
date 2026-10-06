/**
 * POST /api/webhooks/whop
 *
 * Reçoit les événements Whop (membership activated / deactivated / updated)
 * et synchronise profiles.whop_subscription_active en temps réel.
 *
 * SÉCURITÉ — vérif signature Standard Webhooks AVANT tout traitement :
 *   - Headers : webhook-id, webhook-timestamp, webhook-signature
 *   - String signée : `${id}.${timestamp}.${rawBody}` (points séparateurs)
 *   - Algo : HMAC-SHA256, encodage base64
 *   - Comparaison : constant-time via crypto.timingSafeEqual
 *   - Anti-replay : rejet si timestamp > 5 min
 *   - Secret : WHOP_WEBHOOK_SECRET (ws_...) tel quel — pas de strip de préfixe
 *   - Raw body lu AVANT tout parse JSON (sinon la sig ne matcherait plus)
 *
 * TRAITEMENT (défensif multi-noms d'events, à resserrer après 1er payload réel) :
 *   - Filtre strict sur WHOP_PRODUCT_ID (ÉLITE PRO prod_JkPZ6NZeqULBR)
 *   - Lookup profile par whop_user_id, fallback .ilike email
 *   - Pas de création auto depuis webhook (uniquement au login OAuth)
 *   - UPDATE whop_subscription_active = true/false — idempotent
 *   - 200 { received: true } sur succès ET sur skip (user inconnu, autre produit, event inconnu)
 *   - 401 sur signature invalide ou timestamp expiré
 *   - 500 sur erreur DB transitoire (Whop retriera)
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 5 * 60

interface WhopWebhookPayload {
  action?: string
  event?: string
  type?: string
  data?: {
    product?: string
    user?: string
    email?: string
    valid?: boolean
    status?: string
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`[Whop webhook] env ${name} manquante`)
  }
  return v
}

function verifySignature(
  rawBody: string,
  webhookId: string,
  webhookTimestamp: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64')
  const expectedBuf = Buffer.from(expected, 'base64')

  // Le header peut porter plusieurs sigs (rotation de clé Whop) séparées par
  // espace, chacune préfixée "v1,". On valide si AU MOINS une matche.
  const receivedSigs = signatureHeader
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3))

  for (const sig of receivedSigs) {
    try {
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length !== expectedBuf.length) continue
      if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return true
    } catch {
      // base64 invalide → sig invalide, on essaie la suivante
    }
  }
  return false
}

export async function POST(request: NextRequest) {
  let webhookSecret: string
  let productId: string
  try {
    webhookSecret = requireEnv('WHOP_WEBHOOK_SECRET')
    productId = requireEnv('WHOP_PRODUCT_ID')
  } catch {
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  // 1. Headers obligatoires
  const webhookId = request.headers.get('webhook-id')
  const webhookTimestamp = request.headers.get('webhook-timestamp')
  const webhookSignature = request.headers.get('webhook-signature')

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return new NextResponse('Missing webhook headers', { status: 401 })
  }

  // 2. Anti-replay (timestamp doit être < 5 min de now)
  const timestampSec = parseInt(webhookTimestamp, 10)
  if (!Number.isFinite(timestampSec)) {
    return new NextResponse('Invalid timestamp', { status: 401 })
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - timestampSec) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
    return new NextResponse('Timestamp expired', { status: 401 })
  }

  // 3. CRITIQUE : raw body AVANT tout JSON.parse (la sig est calculée dessus,
  //    un re-stringify changerait l'ordre des clés / espaces).
  const rawBody = await request.text()

  // 4. Vérif signature constant-time
  if (
    !verifySignature(
      rawBody,
      webhookId,
      webhookTimestamp,
      webhookSignature,
      webhookSecret,
    )
  ) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  // ─── À PARTIR D'ICI, la requête est AUTHENTIFIÉE ──────────────────

  // 5. Parse JSON du payload
  let payload: WhopWebhookPayload
  try {
    payload = JSON.parse(rawBody) as WhopWebhookPayload
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  // === DEBUG TEMPORAIRE — à retirer après validation du format payload ===
  console.log('[WEBHOOK DEBUG] ─────────────────────────────────')
  console.log(
    '[WEBHOOK DEBUG] event/action:',
    payload?.action ?? payload?.event ?? payload?.type ?? 'UNKNOWN',
  )
  console.log('[WEBHOOK DEBUG] data.product:', payload?.data?.product)
  console.log('[WEBHOOK DEBUG] data.user:', payload?.data?.user)
  console.log('[WEBHOOK DEBUG] data.valid:', payload?.data?.valid)
  console.log('[WEBHOOK DEBUG] data.email:', payload?.data?.email)
  console.log('[WEBHOOK DEBUG] data.status:', payload?.data?.status)
  console.log(
    '[WEBHOOK DEBUG] payload top-level keys:',
    Object.keys(payload ?? {}),
  )
  console.log(
    '[WEBHOOK DEBUG] data keys:',
    payload?.data ? Object.keys(payload.data) : null,
  )
  console.log('[WEBHOOK DEBUG] ─────────────────────────────────')
  // === FIN DEBUG =========================================================

  // 6. Extract event + data (défensif sur plusieurs noms de champs possibles)
  const eventName = String(
    payload?.action ?? payload?.event ?? payload?.type ?? '',
  ).toLowerCase()
  const data = payload?.data ?? {}

  // 7. Filtre strict produit ÉLITE PRO — tout autre produit = skip silencieux
  if (data.product !== productId) {
    return NextResponse.json({ received: true, skipped: 'other_product' })
  }

  // 8. Détermine le nouveau flag selon event name (défensif multi-noms).
  //    activated / went_valid / created → true
  //    deactivated / went_invalid / canceled / cancelled / expired → false
  //    updated / changed → suit data.valid tel que Whop le fournit
  //    autre → ignore + 200
  let nextActive: boolean | null = null
  if (
    eventName.includes('went_valid') ||
    eventName.includes('activated') ||
    eventName.endsWith('.created')
  ) {
    nextActive = true
  } else if (
    eventName.includes('went_invalid') ||
    eventName.includes('deactivated') ||
    eventName.includes('canceled') ||
    eventName.includes('cancelled') ||
    eventName.includes('expired')
  ) {
    nextActive = false
  } else if (
    eventName.includes('updated') ||
    eventName.includes('changed')
  ) {
    nextActive = data.valid === true
  }

  if (nextActive === null) {
    return NextResponse.json({
      received: true,
      skipped: `unknown_event:${eventName}`,
    })
  }

  // 9. Supabase admin — bypass RLS pour lookup + update
  let supabaseUrl: string
  let serviceKey: string
  try {
    supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  } catch {
    return new NextResponse('Supabase env missing', { status: 500 })
  }
  const admin = createAdminClient(supabaseUrl, serviceKey)

  // 10. Lookup profile : whop_user_id en priorité, email .ilike en fallback
  let profileId: string | null = null

  if (data.user) {
    const { data: byWhop } = await admin
      .from('profiles')
      .select('id')
      .eq('whop_user_id', data.user)
      .maybeSingle()
    if (byWhop?.id) profileId = byWhop.id
  }

  if (!profileId && data.email) {
    const { data: byEmail } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', data.email)
      .maybeSingle()
    if (byEmail?.id) profileId = byEmail.id
  }

  if (!profileId) {
    // Pas de création auto depuis webhook — l'auto-création est au login OAuth
    // (étape 3). Ici, user Whop sans compte dashboard = pas d'action.
    return NextResponse.json({ received: true, skipped: 'no_profile' })
  }

  // 11. UPDATE flag + (si first-time) lier le whop_user_id. Idempotent.
  const updateData: Record<string, unknown> = {
    whop_subscription_active: nextActive,
  }
  if (nextActive && data.user) {
    updateData.whop_user_id = data.user
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update(updateData)
    .eq('id', profileId)

  if (updateError) {
    // 500 → Whop va retrier automatiquement (bon pour les erreurs transitoires DB).
    return new NextResponse('Update failed', { status: 500 })
  }

  return NextResponse.json({
    received: true,
    event: eventName,
    active: nextActive,
  })
}
