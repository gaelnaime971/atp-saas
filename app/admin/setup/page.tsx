'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'checking' | 'available' | 'blocked'

export default function AdminSetupPage() {
  const [status, setStatus] = useState<Status>('checking')
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/setup')
      .then(r => r.json())
      .then(({ adminExists }) => {
        if (adminExists) {
          setStatus('blocked')
          setTimeout(() => router.push('/admin/login'), 2500)
        } else {
          setStatus('available')
        }
      })
      .catch(() => setStatus('blocked'))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Erreur lors de la création')
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/admin/login'), 2000)
  }

  // Loading state
  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Admin already exists
  if (status === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-10a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Accès non autorisé</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Un administrateur existe déjà — redirection...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
            <span className="text-green-400 text-sm font-bold font-mono">ATP</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            Configuration initiale
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>
            Créez le compte administrateur
          </p>
        </div>

        {/* Info banner */}
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl border mb-6 text-xs"
          style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)', color: 'var(--text2)' }}
        >
          <svg className="w-4 h-4 text-green-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Cette page n&apos;est accessible qu&apos;une seule fois, tant qu&apos;aucun administrateur n&apos;existe.
          </span>
        </div>

        {done ? (
          <div
            className="rounded-xl border p-8 text-center"
            style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
          >
            <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Compte créé avec succès</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Redirection vers la connexion...</p>
          </div>
        ) : (
          <div className="rounded-xl border p-6" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Nom complet
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  required
                  placeholder="Votre nom"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  placeholder="admin@atpcoaching.fr"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  placeholder="8 caractères minimum"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg3)',
                    border: `1px solid ${form.confirm && form.confirm !== form.password ? '#ef4444' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
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
                  background: 'var(--green)',
                  color: '#09090b',
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Création...' : 'Créer le compte administrateur'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
