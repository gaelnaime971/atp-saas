import Link from 'next/link'
import { whopCheckoutUrl } from '@/lib/whop/checkout'

/**
 * /whop/abonnement-inactif — un compte connecté sans accès au dashboard
 * (règle lib/access/member-access : ni admin, ni abonnement Whop actif,
 * ni accès manuel valide) y est renvoyé par proxy.ts depuis /dashboard.
 * Route publique (préfixe /whop dans proxy.ts) : pas de boucle de
 * redirection.
 */
export default function SubscriptionInactivePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--color-surface-0)',
        color: 'var(--color-text-1)',
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            margin: 0,
            marginBottom: 16,
            letterSpacing: '-0.02em',
          }}
        >
          Ton abonnement n&apos;est plus actif
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--color-text-2)',
            margin: 0,
            marginBottom: 28,
          }}
        >
          L&apos;accès au dashboard est réservé aux membres ÉLITE PRO. Réabonne-toi
          sur Whop pour le retrouver : ton accès revient tout seul dans les minutes
          qui suivent.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={whopCheckoutUrl()}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 10,
              background: 'var(--color-accent)',
              color: 'var(--color-surface-0)',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Me réabonner sur Whop
          </a>
          <Link
            href="/logout"
            prefetch={false}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 10,
              border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
              color: 'var(--color-text-1)',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Me déconnecter
          </Link>
        </div>
      </div>
    </main>
  )
}
