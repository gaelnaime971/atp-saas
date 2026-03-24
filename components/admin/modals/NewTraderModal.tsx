'use client'

import { useState, useEffect } from 'react'

interface NewTraderModalProps {
  onClose: () => void
  onSuccess: () => void
}

const PLANS = ['1:1 Mensuel', '1:1 Trimestriel', 'Groupe', 'Annuel']

export default function NewTraderModal({ onClose, onSuccess }: NewTraderModalProps) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    plan_type: '',
    propfirm_name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    setForm({ first_name: '', last_name: '', email: '', plan_type: '', propfirm_name: '' })
    setError('')
    setSuccess(false)
    setGeneratedCode(null)
    setEmailSent(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          full_name: `${form.first_name} ${form.last_name}`.trim(),
          plan_type: form.plan_type,
          propfirm_name: form.propfirm_name || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'envoi de l\'invitation')
        return
      }

      setSuccess(true)
      setGeneratedCode(data.code)
      setEmailSent(data.emailSent)
      if (data.emailSent) {
        setTimeout(() => { onSuccess(); onClose() }, 2000)
      } else {
        onSuccess()
      }
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Nouveau Trader</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Une invitation sera envoyée par email</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--text3)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Prénom</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                required
                placeholder="Jean"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Nom</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                required
                placeholder="Dupont"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              placeholder="jean.dupont@exemple.com"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Plan de coaching</label>
            <select
              value={form.plan_type}
              onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}
              required
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: form.plan_type ? 'var(--text)' : 'var(--text3)' }}
            >
              <option value="" disabled>Sélectionner un plan</option>
              {PLANS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
              Prop Firm <span style={{ color: 'var(--text3)' }}>(optionnel)</span>
            </label>
            <input
              type="text"
              value={form.propfirm_name}
              onChange={e => setForm(f => ({ ...f, propfirm_name: e.target.value }))}
              placeholder="FTMO, MyForexFunds..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {success && emailSent && (
            <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              Invitation envoyée avec succès !
            </p>
          )}

          {success && !emailSent && generatedCode && (
            <div className="rounded-lg border p-4" style={{ background: 'var(--bg3)', borderColor: 'rgba(34,197,94,0.25)' }}>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text2)' }}>
                Email non envoyé (domaine non vérifié). Partagez ce code manuellement :
              </p>
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <span className="text-2xl font-bold font-mono tracking-[0.3em] text-green-400">{generatedCode}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(generatedCode)}
                  className="text-xs px-2 py-1 rounded border transition-colors hover:bg-white/5"
                  style={{ color: 'var(--text3)', borderColor: 'var(--border)' }}
                >
                  Copier
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
                Le trader entre ce code sur <span className="font-mono">/invite</span> avec son email
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: success ? 'rgba(34,197,94,0.5)' : 'var(--green)',
                color: '#0f1117',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Envoi...' : success ? 'Envoyé ✓' : 'Envoyer l\'invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
