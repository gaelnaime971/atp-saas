'use client'

import { useState, useRef, useEffect } from 'react'
import { readAiError, networkAiError, type AiErrorInfo } from '@/lib/ai/client-errors'
import { AiErrorBanner } from '@/components/ai/AiErrorBanner'

/**
 * POC Jarvis — zéro design, uniquement fonctionnel. Validation du
 * cerveau en texte avant d'ajouter la voix en 2B.
 */

interface Msg {
  role: 'user' | 'assistant'
  content: string
  durationMs?: number
  callsToday?: number
  callsLimit?: number
  casquette?: string
}

export default function JarvisPoc({ email }: { email: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AiErrorInfo | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const nextMsgs: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMsgs)
    setInput('')
    setLoading(true)
    setError(null)
    const t0 = performance.now()
    try {
      const r = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMsgs
            .map(m => ({ role: m.role, content: m.content }))
            .slice(-10),
        }),
      })
      if (!r.ok) {
        setError(await readAiError(r))
        setLoading(false)
        return
      }
      const d = await r.json()
      const duration = Math.round(performance.now() - t0)
      setMessages(h => [...h, {
        role: 'assistant',
        content: d.reply || '(vide)',
        durationMs: duration,
        callsToday: d.callsToday,
        callsLimit: d.callsLimit,
        casquette: d.casquette,
      }])
    } catch {
      setError(networkAiError())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      maxWidth: 720, margin: '40px auto', padding: 16,
      fontFamily: 'system-ui, sans-serif', color: '#111',
      background: '#fff', minHeight: '100vh',
    }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Jarvis — POC</h1>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        Connecté : <code>{email}</code> · route <code>/api/jarvis/chat</code> · modèle gpt-oss-120b (text)
      </div>

      <div
        ref={scrollRef}
        style={{
          border: '1px solid #d1d5db', borderRadius: 8, padding: 12,
          height: 'calc(100vh - 280px)', minHeight: 320, overflowY: 'auto',
          background: '#f9fafb', marginBottom: 12, fontSize: 14, lineHeight: 1.5,
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
            Pose ta première question à Jarvis. Il connaît la bible ATP, ta routine du jour et tes stats 30j.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: m.role === 'user' ? '#2563eb' : '#059669', marginBottom: 2 }}>
              {m.role === 'user' ? 'TRADER' : 'JARVIS'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {m.role === 'assistant' && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                {m.durationMs != null && <>⏱ {m.durationMs} ms</>}
                {m.casquette && <> · 🎩 {m.casquette}</>}
                {m.callsToday != null && m.callsLimit != null && (
                  <> · 📊 {m.callsToday} / {m.callsLimit === -1 ? '∞' : m.callsLimit} aujourd'hui</>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
            Jarvis réfléchit…
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12 }}>
          <AiErrorBanner error={error} compact />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Demande à Jarvis…"
          disabled={loading}
          style={{
            flex: 1, padding: '10px 12px', fontSize: 14,
            border: '1px solid #d1d5db', borderRadius: 6,
            background: '#fff', color: '#111',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: loading || !input.trim() ? '#9ca3af' : '#059669',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Envoyer
        </button>
      </div>
    </div>
  )
}
