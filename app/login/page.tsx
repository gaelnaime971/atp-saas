'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const checkoutUrl = process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL ?? '#'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        background: 'var(--color-surface-0)',
        overflow: 'hidden',
      }}
    >
      {/* Halo accent discret — pur décor, pointer-events none */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(var(--color-accent-rgb), 0.08) 0%, transparent 70%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
        }}
      >
        {/* Logo + titre */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Image
            src="/logo-atp-white.png"
            alt="Alpha Trading Pro"
            width={256}
            height={56}
            priority
            style={{
              display: 'inline-block',
              height: 56,
              width: 'auto',
              marginBottom: 20,
            }}
          />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--color-text-1)',
              margin: 0,
              marginBottom: 8,
            }}
          >
            Espace Trader
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--color-text-2)',
              margin: 0,
            }}
          >
            Connecte-toi à ton espace personnel
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            borderRadius: 'var(--radius-xl)',
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border-subtle)',
            padding: 24,
            boxShadow:
              '0 1px 2px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.24)',
          }}
        >
          {/* CTA PRIMAIRE — Whop OAuth */}
          <a
            href="/api/auth/whop/start"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 20px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-accent)',
              color: 'var(--color-surface-0)',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              transition:
                'background var(--motion-base) var(--motion-ease-out), transform var(--motion-fast) var(--motion-ease-out), box-shadow var(--motion-base) var(--motion-ease-out)',
              boxShadow: '0 6px 20px rgba(var(--color-accent-rgb), 0.22)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-accent-strong)'
              e.currentTarget.style.boxShadow =
                '0 8px 24px rgba(var(--color-accent-rgb), 0.32)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-accent)'
              e.currentTarget.style.boxShadow =
                '0 6px 20px rgba(var(--color-accent-rgb), 0.22)'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(1px)'
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Accéder à mon espace
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>

          {/* Toggle / Formulaire email — porte de service */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 16,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-3)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'color var(--motion-fast) var(--motion-ease-out)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = 'var(--color-text-2)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = 'var(--color-text-3)')
              }
            >
              Continuer avec mon email
            </button>
          ) : (
            <>
              {/* Divider */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '20px 0 16px',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: 'var(--color-border-subtle)',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-text-3)',
                  }}
                >
                  ou
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: 'var(--color-border-subtle)',
                  }}
                />
              </div>

              <form
                onSubmit={handleLogin}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-text-2)',
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="vous@exemple.com"
                    autoComplete="email"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border-subtle)',
                      color: 'var(--color-text-1)',
                      fontSize: 14,
                      outline: 'none',
                      transition:
                        'border-color var(--motion-fast) var(--motion-ease-out)',
                      fontFamily: 'inherit',
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        'var(--color-accent)')
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        'var(--color-border-subtle)')
                    }
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-text-2)',
                      marginBottom: 6,
                    }}
                  >
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border-subtle)',
                      color: 'var(--color-text-1)',
                      fontSize: 14,
                      outline: 'none',
                      transition:
                        'border-color var(--motion-fast) var(--motion-ease-out)',
                      fontFamily: 'inherit',
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        'var(--color-accent)')
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        'var(--color-border-subtle)')
                    }
                  />
                </div>

                {error && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--color-loss)',
                      background: 'rgba(var(--color-loss-rgb), 0.08)',
                      border: '1px solid rgba(var(--color-loss-rgb), 0.2)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 10px',
                      margin: 0,
                    }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-1)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                    transition:
                      'background var(--motion-fast) var(--motion-ease-out), border-color var(--motion-fast) var(--motion-ease-out)',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background =
                        'var(--color-surface-3)'
                      e.currentTarget.style.borderColor =
                        'var(--color-border-strong)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'var(--color-surface-2)'
                    e.currentTarget.style.borderColor =
                      'var(--color-border-subtle)'
                  }}
                >
                  {loading ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Point de conversion — pas encore membre */}
        <p
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 13,
            color: 'var(--color-text-3)',
          }}
        >
          Pas encore membre ?{' '}
          <a
            href={checkoutUrl}
            style={{
              color: 'var(--color-accent)',
              textDecoration: 'none',
              fontWeight: 500,
              transition: 'color var(--motion-fast) var(--motion-ease-out)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = 'var(--color-accent-strong)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = 'var(--color-accent)')
            }
          >
            Rejoindre ÉLITE PRO →
          </a>
        </p>
      </div>
    </main>
  )
}
