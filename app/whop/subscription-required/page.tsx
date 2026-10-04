/**
 * /whop/subscription-required — placeholder étape 3.
 *
 * Affichée quand l'user Whop s'est authentifié mais n'a PAS de membership
 * ÉLITE PRO valide (ex. abonné 49€ qui n'a que le pack lives+Discord, ou
 * ancien abonné dont l'abonnement est canceled).
 *
 * Design minimal — refonte complète à l'étape 4 avec CTA upgrade propre.
 */

export default function SubscriptionRequiredPage() {
  const checkoutUrl = process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL ?? '#'
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--color-surface-0, #09090b)',
        color: 'var(--color-text-1, #f0f0f3)',
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
          Abonnement ÉLITE PRO requis
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--color-text-2, #a1a1aa)',
            margin: 0,
            marginBottom: 24,
          }}
        >
          Le dashboard Alpha Trading Pro est réservé aux abonnés ÉLITE PRO —
          formations, contenu avancé et outils de suivi inclus. L&apos;abonnement
          lives + Discord seul ne donne pas accès au dashboard.
        </p>
        <a
          href={checkoutUrl}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            borderRadius: 10,
            background: 'var(--color-accent, #c9a574)',
            color: 'var(--color-surface-0, #09090b)',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Passer à ÉLITE PRO →
        </a>
      </div>
    </main>
  )
}
