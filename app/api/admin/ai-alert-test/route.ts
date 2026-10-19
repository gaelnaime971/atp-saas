import { NextResponse, after } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { notifyAdmin } from '@/lib/email/notify-admin'
import { sendProviderFailureEmailForTest } from '@/lib/ai/provider-alerts'

/**
 * Route de test admin-only pour vérifier le pipeline d'alerte email
 * (étape 1E) sans casser l'IA ni ouvrir une route publique.
 *
 * Protection :
 *   - Nécessite une session Supabase authentifiée
 *   - Nécessite profiles.role = 'admin' (vérif serveur, pas client-side)
 *   - 401 sans session, 403 sans rôle admin
 *
 * Modes (query param `mode`) :
 *   - 'ping' (défaut) → appel direct notifyAdmin() avec un sujet [TEST].
 *     Teste uniquement : env ALERT_EMAIL + env EMAIL_FROM + Resend + boîte
 *     de réception. Ne touche PAS la table anti-spam.
 *   - 'simulate' → appel sendProviderFailureEmailForTest() avec un ctx
 *     fictif (model='test-model-xxx', kind='model_decommissioned').
 *     Génère l'email de panne durable au format RÉEL — même sujet, même
 *     corps, même mise en page que la vraie alerte. Préfixe sujet [TEST]
 *     et bannière d'avertissement dans le mail. Bypass l'anti-spam DB.
 *
 * Dans les deux cas : after() → la réponse HTTP revient immédiatement,
 * l'envoi email part en tâche de fond. Si Resend ou l'env est KO, c'est
 * loggé sous [notify-admin] / [ai-alert] mais la réponse reste 200.
 */
export async function POST(request: Request) {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') || 'ping'

  if (mode === 'simulate') {
    after(async () => {
      await sendProviderFailureEmailForTest(
        {
          route: '/api/ai-chart',
          model: 'test/simulated-vision-model',
          status: 400,
          detail: { code: 'model_decommissioned', message: 'Simulation déclenchée depuis /api/admin/ai-alert-test?mode=simulate' },
        },
        'model_decommissioned',
      )
    })
    return NextResponse.json({ ok: true, mode: 'simulate', message: 'Email de simulation déclenché en arrière-plan.' })
  }

  // mode 'ping' par défaut
  after(async () => {
    await notifyAdmin({
      subject: '[TEST] [ATP IA] Vérification du pipeline d\'alerte email',
      html: `<p>Si tu reçois cet email, le pipeline <code>notifyAdmin()</code> fonctionne et <code>ALERT_EMAIL</code> est correctement configuré.</p>
<p>Déclenché depuis <code>/api/admin/ai-alert-test</code> (mode <code>ping</code>) à ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.</p>`,
      text: `Si tu reçois cet email, le pipeline notifyAdmin() fonctionne et ALERT_EMAIL est correctement configuré.\n\nDéclenché depuis /api/admin/ai-alert-test (mode ping) à ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`,
    })
  })

  return NextResponse.json({ ok: true, mode: 'ping', message: 'Email de ping déclenché en arrière-plan.' })
}
