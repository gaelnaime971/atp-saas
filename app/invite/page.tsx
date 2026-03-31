'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'code' | 'password'

export default function InvitePage() {
  const [step, setStep] = useState<Step>('code')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()
  const supabase = createClient()

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newCode = [...code]
    newCode[index] = value.slice(-1)
    setCode(newCode)
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setCode(pasted.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const fullCode = code.join('')
    if (fullCode.length !== 6) {
      setError('Entrez les 6 chiffres du code')
      return
    }
    if (!email) {
      setError('Entrez votre email')
      return
    }
    setError('')
    setStep('password')
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/invitations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: code.join(''), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur lors de la validation')
        if (res.status === 400) setStep('code')
        setLoading(false)
        return
      }

      // Sign in automatically
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        router.push('/login')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erreur réseau. Réessayez.')
      setLoading(false)
    }
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
            {step === 'code' ? 'Activer mon compte' : 'Choisir un mot de passe'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>
            {step === 'code'
              ? 'Entrez le code reçu par email'
              : 'Dernière étape — créez votre mot de passe'}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['Code', 'Mot de passe'].map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: i === 0 || step === 'password' ? 'var(--green)' : 'var(--bg3)',
                    color: i === 0 || step === 'password' ? '#09090b' : 'var(--text3)',
                  }}
                >
                  {i === 0 && step === 'password' ? '✓' : i + 1}
                </div>
                <span className="text-xs" style={{ color: (i === 0 && step === 'code') || (i === 1 && step === 'password') ? 'var(--text)' : 'var(--text3)' }}>
                  {label}
                </span>
              </div>
              {i === 0 && (
                <div className="flex-1 h-px mx-2" style={{ background: step === 'password' ? 'var(--green)' : 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-xl border p-6" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
          {step === 'code' ? (
            <form onSubmit={handleValidateCode} className="space-y-5">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="votre@email.com"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-3" style={{ color: 'var(--text2)' }}>
                  Code d&apos;invitation
                </label>
                <div className="flex gap-2 justify-between" onPaste={handleCodePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleCodeChange(i, e.target.value)}
                      onKeyDown={e => handleCodeKeyDown(i, e)}
                      className="w-12 h-12 text-center text-xl font-bold font-mono rounded-lg outline-none transition-all"
                      style={{
                        background: 'var(--bg3)',
                        border: `2px solid ${digit ? 'var(--green)' : 'var(--border)'}`,
                        color: digit ? 'var(--green)' : 'var(--text)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: 'var(--green)', color: '#09090b' }}
              >
                Valider le code →
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div
                className="flex items-center gap-3 p-3 rounded-lg border mb-2"
                style={{ background: 'var(--bg3)', borderColor: 'var(--border)' }}
              >
                <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center">
                  <span className="text-green-400 text-xs">✓</span>
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{email}</p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>Code : {code.join('')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep('code'); setError('') }}
                  className="ml-auto text-xs underline"
                  style={{ color: 'var(--text3)' }}
                >
                  Modifier
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{
                    background: 'var(--bg3)',
                    border: `1px solid ${confirm && confirm !== password ? '#ef4444' : 'var(--border)'}`,
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
                }}
              >
                {loading ? 'Création du compte...' : 'Créer mon compte'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--text3)' }}>
          Accès sur invitation uniquement — ATP Coaching
        </p>
      </div>
    </div>
  )
}
