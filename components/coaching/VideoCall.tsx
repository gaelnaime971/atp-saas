'use client'

import { useEffect, useRef, useState } from 'react'
import DailyIframe, { type DailyCall } from '@daily-co/daily-js'

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const callRef = useRef<DailyCall | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const onLeaveRef = useRef(onLeave)

  // Keep latest onLeave in a ref so the effect can stay deps-free
  useEffect(() => {
    onLeaveRef.current = onLeave
  }, [onLeave])

  useEffect(() => {
    let cancelled = false
    let frame: DailyCall | null = null

    async function start() {
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
        const data = (await res.json()) as TokenResponse

        if (cancelled || !containerRef.current) return

        // Cleanup any existing instance just in case (HMR / strict mode)
        const existing = DailyIframe.getCallInstance()
        if (existing) {
          try {
            await existing.destroy()
          } catch {
            /* ignore */
          }
        }

        frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '12px',
            background: '#000',
          },
        })
        callRef.current = frame

        frame.on('left-meeting', () => {
          onLeaveRef.current()
        })
        frame.on('error', (ev) => {
          console.error('Daily error:', ev)
          setError("Erreur dans l'appel vidéo")
        })

        await frame.join({ url: data.url, token: data.token })
        if (!cancelled) setLoading(false)
      } catch (err) {
        console.error('VideoCall start failed:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
          setLoading(false)
        }
      }
    }

    start()

    return () => {
      cancelled = true
      const call = callRef.current
      callRef.current = null
      if (call) {
        call.destroy().catch(() => {
          /* ignore */
        })
      }
    }
  }, [sessionId])

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
      <button
        onClick={onLeave}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10000,
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

      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          background: '#000',
        }}
      />

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
