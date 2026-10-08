/**
 * GET /unsubscribe?token=<base64url(email)>.<HMAC>
 *
 * Page de désabonnement (lien pied de page des emails). Server component :
 *   1. Vérifie le token HMAC
 *   2. Si valide → UPDATE prospects SET unsubscribed = true (idempotent)
 *   3. Affiche page confirmation dans la DA ATP
 *
 * Idempotent : cliquer 2x = même résultat, pas d'erreur.
 * Pas de leak d'info : email absent de la base → même message "désabonné".
 *
 * Pour le 1-click Gmail/Outlook (RFC 8058), voir app/api/unsubscribe/route.ts (POST).
 */

import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe'

export const dynamic = 'force-dynamic'

async function processUnsubscribe(token: string | undefined): Promise<{
  ok: boolean
  email: string | null
}> {
  if (!token) return { ok: false, email: null }
  const email = verifyUnsubscribeToken(token)
  if (!email) return { ok: false, email: null }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, email: null }

  const admin = createClient(url, key)
  // UPDATE idempotent — pas d'erreur si l'email n'existe pas (match 0 row).
  // ilike pour tolérer les différences de casse Jean@gmail / jean@gmail.
  await admin
    .from('prospects')
    .update({ unsubscribed: true })
    .ilike('email', email)

  return { ok: true, email }
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const { ok, email } = await processUnsubscribe(token)

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        background: 'var(--color-surface-0)',
        color: 'var(--color-text-1)',
        position: 'relative',
      }}
    >
      {/* Halo accent discret */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(var(--color-accent-rgb), 0.08) 0%, transparent 70%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          padding: '40px 32px',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {ok ? (
          <>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--color-accent-soft)',
                border: '1px solid rgba(var(--color-accent-rgb), 0.24)',
                color: 'var(--color-accent)',
                marginBottom: 20,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 12,
              }}
            >
              Tu es désabonné.
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
                margin: 0,
                marginBottom: 24,
              }}
            >
              {email ? (
                <>
                  Nous n&apos;enverrons plus d&apos;emails à{' '}
                  <strong style={{ color: 'var(--color-text-1)' }}>
                    {email}
                  </strong>
                  . À bientôt — peut-être.
                </>
              ) : (
                <>
                  Ta demande a bien été prise en compte. Nous ne t&apos;écrirons
                  plus.
                </>
              )}
            </p>
            <a
              href="/"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-2)',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Retour sur Alpha Trading Pro
            </a>
          </>
        ) : (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                margin: 0,
                marginBottom: 12,
                color: 'var(--color-text-1)',
              }}
            >
              Lien invalide ou expiré
            </h1>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
                margin: 0,
              }}
            >
              Ce lien de désabonnement n&apos;a pas pu être vérifié. Si tu
              souhaites te désabonner, réponds à l&apos;email que tu as reçu
              avec « STOP ».
            </p>
          </>
        )}
      </div>
    </main>
  )
}
