/**
 * /whop/request-access — placeholder étape 3.
 *
 * Affichée quand :
 *   - L'user Whop a un abonnement ÉLITE PRO valide MAIS n'a pas de profile
 *     Supabase correspondant (pas de création auto, décision produit).
 *   - OU toute erreur technique du callback OAuth (query ?error=X).
 *
 * Design minimal — refonte complète à l'étape 4 (avec /login remanié).
 */

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function RequestAccessPage({ searchParams }: Props) {
  const { error } = await searchParams
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
          Accès dashboard non disponible
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
          Ton abonnement Whop est bien actif, mais tu n&apos;as pas encore de compte sur
          le dashboard Alpha Trading Pro. Contacte-nous pour qu&apos;on t&apos;ouvre
          l&apos;accès.
        </p>
        <a
          href="mailto:gael.n971@gmail.com?subject=Acc%C3%A8s%20dashboard%20ATP"
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
          Nous contacter
        </a>
        {error && (
          <p
            style={{
              marginTop: 32,
              fontSize: 11,
              color: 'var(--color-text-3, #52525b)',
              fontFamily: 'monospace',
            }}
          >
            Code technique : {error}
          </p>
        )}
      </div>
    </main>
  )
}
