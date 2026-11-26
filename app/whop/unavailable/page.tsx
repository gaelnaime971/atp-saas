import Link from 'next/link'

/**
 * /whop/unavailable — le callback OAuth Whop n'a pas pu vérifier l'accès
 * parce qu'une variable de config manque côté serveur (son NOM est dans
 * les logs, cf. lib/whop/callback.ts). L'accès est refusé, mais ce n'est
 * pas un problème d'abonnement : on ne dit donc pas « abonnement requis ».
 * Route publique (préfixe /whop dans proxy.ts).
 */
export default function WhopUnavailablePage() {
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
          Connexion momentanément indisponible
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
          Réessaie dans quelques minutes.
        </p>
        <Link
          href="/login"
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
          Réessayer
        </Link>
      </div>
    </main>
  )
}
