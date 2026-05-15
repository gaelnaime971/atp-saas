'use client'

import { useEffect, useRef, useState } from 'react'

interface VideoCallProps {
  sessionId: string
  onLeave: () => void
}

interface TokenResponse {
  token: string
  url: string
  roomName: string
}

export default function VideoCall({ sessionId, onLeave }: VideoCallProps) {
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TokenResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const onLeaveRef = useRef(onLeave)

  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  // Fetch the meeting token + room URL
  useEffect(() => {
    let cancelled = false
    async function fetchToken() {
      try {
        const res = await fetch('/api/coaching/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error || 'Erreur récupération token vidéo')
        }
        const d = (await res.json()) as TokenResponse
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      } catch (err) {
        console.error('VideoCall token fetch failed:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
          setLoading(false)
        }
      }
    }
    fetchToken()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Listen for Daily Prebuilt postMessage events (left-meeting → close overlay)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return
      const msg = e.data as { action?: string; event?: string }
      // Daily Prebuilt emits { action: 'left-meeting' } and similar.
      // The SDK normally wraps these — without the SDK we read them raw.
      if (msg.action === 'left-meeting' || msg.event === 'left-meeting') {
        onLeaveRef.current()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const iframeSrc = data
    ? `${data.url}?t=${encodeURIComponent(data.token)}`
    : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10000,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {iframeSrc && (
          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(34,197,94,0.85)',
              color: '#000',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Ouvrir l'appel dans un nouvel onglet"
          >
            ⎘ Nouvel onglet
          </a>
        )}
        <button
          onClick={onLeave}
          style={{
            background: 'rgba(239,68,68,0.9)',
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>×</span> Quitter l&apos;appel
        </button>
      </div>

      {iframeSrc && (
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          allow="camera; microphone; autoplay; display-capture; fullscreen; clipboard-write; encrypted-media"
          allowFullScreen
          title="Appel coaching ATP"
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 0,
            background: '#000',
          }}
        />
      )}

      {loading && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              border: '3px solid rgba(255,255,255,0.15)',
              borderTopColor: '#22c55e',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginRight: 12,
            }}
          />
          Connexion à l&apos;appel…
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(20,20,20,0.95)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#fca5a5',
            padding: 20,
            borderRadius: 12,
            maxWidth: 360,
            textAlign: 'center',
            fontSize: 13,
          }}
        >
          <p style={{ marginBottom: 12, fontWeight: 600 }}>Impossible de rejoindre l&apos;appel</p>
          <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>{error}</p>
          <button
            onClick={onLeave}
            style={{
              background: '#22c55e',
              color: '#000',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
