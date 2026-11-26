'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { adminLogin } from '@/lib/auth/admin-login'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Connexion Supabase puis rôle vérifié sur l'utilisateur connecté ;
    // pas admin → déconnexion. Message identique pour tous les échecs.
    const result = await adminLogin({
      signIn: async (em, pw) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pw })
        return error || !data.user ? null : data.user.id
      },
      readRole: async userId => {
        const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
        return (data as { role?: string } | null)?.role ?? null
      },
      signOut: () => supabase.auth.signOut(),
    }, email, password)
    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/admin/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
            <span className="text-green-400 text-sm font-bold font-mono">ATP</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Espace Admin</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>Accès réservé aux coaches</p>
        </div>

        <div className="rounded-xl border p-6" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@atpcoaching.fr"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: loading ? 'rgba(var(--color-accent-rgb), 0.5)' : 'var(--color-accent)',
                color: 'var(--color-surface-0)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Connexion...' : 'Accéder au dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text3)' }}>
          ATP Coaching — Plateforme de gestion
        </p>
      </div>
    </div>
  )
}
