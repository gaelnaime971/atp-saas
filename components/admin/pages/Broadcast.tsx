'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

type RecipientMode = 'all' | 'active' | 'manual'

interface Trader {
  id: string
  full_name: string
  email: string | null
}

export default function Broadcast() {
  const [traders, setTraders] = useState<Trader[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all')
  const [selectedTraders, setSelectedTraders] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [result, setResult] = useState<{ success: boolean; sent?: number; error?: string } | null>(null)

  const supabase = createClient()

  const fetchTraders = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'trader')
      .order('full_name')
    if (data) {
      setTraders(data.map((t: any) => ({ id: t.id, full_name: t.full_name ?? 'Unnamed', email: t.email })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTraders() }, [fetchTraders])

  function toggleTrader(id: string) {
    setSelectedTraders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function recipientLabel(): string {
    if (recipientMode === 'all') return `Tous les traders (${traders.length})`
    if (recipientMode === 'active') return 'Traders actifs (30 derniers jours)'
    return `${selectedTraders.length} trader${selectedTraders.length > 1 ? 's' : ''} sélectionné${selectedTraders.length > 1 ? 's' : ''}`
  }

  async function handleSend() {
    setShowConfirm(false)
    setSending(true)
    setResult(null)

    try {
      const body: { subject: string; message: string; recipients: 'all' | 'active' | string[] } = {
        subject,
        message,
        recipients: recipientMode === 'manual' ? selectedTraders : recipientMode,
      }

      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, sent: data.sent })
        setSubject('')
        setMessage('')
        setSelectedTraders([])
      } else {
        setResult({ success: false, error: data.error ?? 'Erreur inconnue' })
      }
    } catch {
      setResult({ success: false, error: 'Erreur réseau' })
    } finally {
      setSending(false)
    }
  }

  const canSend = subject.trim() && message.trim() && (recipientMode !== 'manual' || selectedTraders.length > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#e8edf5]">Broadcast</h1>
        <p className="text-[#5a6a82] text-sm mt-1">Envoyer un message à tous vos traders</p>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          result.success
            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {result.success
            ? `Email envoyé avec succès à ${result.sent} trader${(result.sent ?? 0) > 1 ? 's' : ''}.`
            : `Erreur : ${result.error}`
          }
        </div>
      )}

      {/* Form */}
      <Card>
        <div className="space-y-5">
          {/* Subject */}
          <div>
            <label className="block text-xs text-[#5a6a82] mb-1.5">Sujet</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
              placeholder="ex: Nouveau contenu disponible"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs text-[#5a6a82] mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
              style={{ minHeight: '200px' }}
              placeholder="Rédigez votre message ici..."
            />
          </div>

          {/* Recipient selector */}
          <div>
            <label className="block text-xs text-[#5a6a82] mb-2">Destinataires</label>
            <div className="flex flex-col gap-2">
              {([
                { value: 'all', label: 'Tous les traders' },
                { value: 'active', label: 'Traders actifs uniquement' },
                { value: 'manual', label: 'Sélection manuelle' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientMode"
                    checked={recipientMode === opt.value}
                    onChange={() => setRecipientMode(opt.value)}
                    className="w-4 h-4 accent-green-500"
                  />
                  <span className="text-sm text-[#e8edf5]">{opt.label}</span>
                </label>
              ))}
            </div>

            {/* Manual trader selection */}
            {recipientMode === 'manual' && (
              <div className="mt-3 ml-6 space-y-1.5 max-h-48 overflow-y-auto">
                {traders.map(t => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTraders.includes(t.id)}
                      onChange={() => toggleTrader(t.id)}
                      className="w-4 h-4 accent-green-500 rounded"
                    />
                    <span className="text-sm text-[#a0aec0]">{t.full_name}</span>
                    {t.email && <span className="text-xs text-[#5a6a82]">({t.email})</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowPreview(!showPreview)}
              disabled={!subject.trim() && !message.trim()}
            >
              {showPreview ? 'Masquer aperçu' : 'Aperçu'}
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!canSend}
              loading={sending}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Envoyer
            </Button>
            <span className="text-xs text-[#5a6a82] ml-auto">{recipientLabel()}</span>
          </div>
        </div>
      </Card>

      {/* Preview */}
      {showPreview && (subject.trim() || message.trim()) && (
        <Card className="border border-blue-500/20">
          <h3 className="text-xs text-[#5a6a82] uppercase tracking-wider mb-3">Aperçu email</h3>
          <div className="bg-[#0d1117] rounded-lg p-5 border border-[rgba(255,255,255,0.05)]">
            <p className="text-xs text-[#5a6a82] mb-1">Sujet:</p>
            <p className="text-sm font-medium text-[#e8edf5] mb-4">{subject || '(pas de sujet)'}</p>
            <div className="border-t border-[rgba(255,255,255,0.05)] pt-4">
              <p className="text-sm text-[#a0aec0] whitespace-pre-wrap">{message || '(pas de message)'}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="max-w-md w-full border border-[rgba(255,255,255,0.1)]">
            <h3 className="text-sm font-semibold text-[#e8edf5] mb-2">Confirmer l&apos;envoi</h3>
            <p className="text-sm text-[#a0aec0] mb-4">
              Vous êtes sur le point d&apos;envoyer cet email à {recipientLabel().toLowerCase()}.
              Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>Annuler</Button>
              <Button onClick={handleSend} loading={sending}>Confirmer l&apos;envoi</Button>
            </div>
          </Card>
        </div>
      )}

      {/* History placeholder */}
      <Card>
        <h2 className="text-sm font-semibold text-[#e8edf5] mb-4">Derniers envois</h2>
        <div className="text-center py-8">
          <svg className="w-10 h-10 mx-auto mb-3 text-[#5a6a82]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[#5a6a82] text-sm">Historique bientôt disponible</p>
        </div>
      </Card>
    </div>
  )
}
