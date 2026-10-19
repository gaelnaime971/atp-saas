'use client'

import { useState, useRef, useEffect } from 'react'
import { readAiError, networkAiError, type AiErrorInfo } from '@/lib/ai/client-errors'
import { AiErrorBanner } from '@/components/ai/AiErrorBanner'

/**
 * POC Jarvis — texte + voix (étape 2B). Zéro design, uniquement
 * fonctionnel. Chat texte et push-to-talk cohabitent.
 */

interface ServerTimings {
  auth?: number
  context?: number
  quota?: number
  groq?: number
  stt?: number
  brain?: number
  tts?: number
  total?: number
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  via?: 'text' | 'voice'
  transcription?: string         // ce que Jarvis a compris (voix)
  durationMs?: number
  voiceTimeToPlayMs?: number     // "temps jusqu'à la voix" (arrêt micro → début lecture)
  callsToday?: number
  callsLimit?: number
  casquette?: string
  server?: ServerTimings
  cacheHits?: string[]
  audioFailed?: boolean
}

const MAX_RECORD_MS = 30_000

function decodeB64Url(s: string): string {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
    return decodeURIComponent(escape(atob(b64)))
  } catch { return '' }
}

export default function JarvisPoc({ email }: { email: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AiErrorInfo | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [recording, setRecording] = useState(false)
  const [recordElapsed, setRecordElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const recordStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => () => {
    // Nettoyage au démontage
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current)
  }, [])

  // ─── Chat texte ───
  const send = async () => {
    const text = input.trim()
    if (!text || loading || recording) return
    const nextMsgs: Msg[] = [...messages, { role: 'user', content: text, via: 'text' }]
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
        via: 'text',
        durationMs: duration,
        callsToday: d.callsToday,
        callsLimit: d.callsLimit,
        casquette: d.casquette,
        server: d.timings as ServerTimings | undefined,
        cacheHits: Array.isArray(d.cacheHits) ? d.cacheHits : undefined,
      }])
    } catch {
      setError(networkAiError())
    } finally {
      setLoading(false)
    }
  }

  // ─── Voix : démarrer l'enregistrement ───
  const startRecord = async () => {
    if (loading || recording) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType })
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => void onRecordStop()
      rec.start()
      recordStartRef.current = performance.now()
      setRecording(true)
      setRecordElapsed(0)
      // Timer visuel
      const timer = setInterval(() => {
        const ms = performance.now() - recordStartRef.current
        setRecordElapsed(Math.min(ms, MAX_RECORD_MS))
        if (ms >= MAX_RECORD_MS) {
          clearInterval(timer)
          stopRecord()
        }
      }, 100)
      recordStopTimerRef.current = setTimeout(() => stopRecord(), MAX_RECORD_MS)
      // Store timer id ailleurs — on peut compter sur recordStopTimerRef pour le kill
      ;(rec as unknown as { _tickTimer?: ReturnType<typeof setInterval> })._tickTimer = timer
    } catch (err) {
      console.error('[jarvis] mic error', err)
      setError({
        kind: 'unavailable',
        title: 'Micro inaccessible',
        message: 'Autorise l\'accès au micro dans ton navigateur et réessaie.',
      })
    }
  }

  // ─── Voix : arrêter manuellement ou par timer ───
  const stopRecord = () => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    const t = (rec as unknown as { _tickTimer?: ReturnType<typeof setInterval> })._tickTimer
    if (t) clearInterval(t)
    if (recordStopTimerRef.current) {
      clearTimeout(recordStopTimerRef.current)
      recordStopTimerRef.current = null
    }
    rec.stop()
  }

  // ─── Voix : traitement après arrêt ───
  const onRecordStop = async () => {
    const tStop = performance.now()
    setRecording(false)
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach(t => t.stop())

    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
    chunksRef.current = []
    recorderRef.current = null

    if (blob.size < 2000) {
      // Trop court — probablement un clic involontaire
      setError({
        kind: 'unavailable',
        title: 'Enregistrement trop court',
        message: 'Appuie et parle un peu plus longtemps.',
      })
      return
    }

    setLoading(true)
    const durationSec = (tStop - recordStartRef.current) / 1000
    const file = new File([blob], 'jarvis.webm', { type: blob.type })
    const form = new FormData()
    form.append('audio', file)
    form.append('durationSec', String(durationSec.toFixed(2)))
    form.append('history', JSON.stringify(
      messages.map(m => ({ role: m.role, content: m.content })).slice(-10),
    ))

    try {
      const r = await fetch('/api/jarvis/voice', { method: 'POST', body: form })
      if (!r.ok) {
        setError(await readAiError(r))
        setLoading(false)
        return
      }

      const ct = r.headers.get('Content-Type') || ''
      const casquette = r.headers.get('X-Jarvis-Casquette') || undefined
      const callsToday = Number(r.headers.get('X-Jarvis-CallsToday') || 0)
      const callsLimit = Number(r.headers.get('X-Jarvis-CallsLimit') || 0)
      const cacheHits = (r.headers.get('X-Jarvis-CacheHits') || '').split(',').filter(Boolean)

      let transcription = ''
      let reply = ''
      let server: ServerTimings | undefined
      let audioFailed = false
      let voiceTimeToPlayMs: number | undefined

      if (ct.startsWith('application/json')) {
        // Fallback texte (TTS KO)
        const d = await r.json()
        transcription = d.transcription || ''
        reply = d.reply || ''
        server = d.timings
        audioFailed = Boolean(d.audioFailed)
      } else if (ct.startsWith('audio/')) {
        transcription = decodeB64Url(r.headers.get('X-Jarvis-Transcription') || '')
        reply = decodeB64Url(r.headers.get('X-Jarvis-Reply') || '')
        const tStr = r.headers.get('X-Jarvis-Timings')
        if (tStr) {
          try { server = JSON.parse(decodeB64Url(tStr)) as ServerTimings } catch { /* ignore */ }
        }
        const audioBlob = await r.blob()
        if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current)
        const audioUrl = URL.createObjectURL(audioBlob)
        currentAudioUrlRef.current = audioUrl
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        voiceTimeToPlayMs = await new Promise<number | undefined>((resolve) => {
          const onPlaying = () => { resolve(Math.round(performance.now() - tStop)); audio.removeEventListener('playing', onPlaying) }
          audio.addEventListener('playing', onPlaying)
          audio.play().catch(() => resolve(undefined))
          // Garde-fou 10 s au cas où l'event playing ne part jamais
          setTimeout(() => resolve(undefined), 10_000)
        })
      }

      setMessages(h => [...h, {
        role: 'user',
        content: transcription || '(transcription vide)',
        via: 'voice',
        transcription,
      }, {
        role: 'assistant',
        content: reply || '(vide)',
        via: 'voice',
        voiceTimeToPlayMs,
        callsToday,
        callsLimit,
        casquette,
        server,
        cacheHits,
        audioFailed,
      }])
    } catch {
      setError(networkAiError())
    } finally {
      setLoading(false)
    }
  }

  const recordBtnLabel = recording
    ? `⏹ Stop (${(recordElapsed / 1000).toFixed(1)}s)`
    : '🎙 Parler'

  return (
    <div style={{
      maxWidth: 720, margin: '40px auto', padding: 16,
      fontFamily: 'system-ui, sans-serif', color: '#111',
      background: '#fff', minHeight: '100vh',
    }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>Jarvis — POC</h1>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        Connecté : <code>{email}</code> · texte /api/jarvis/chat · voix /api/jarvis/voice
      </div>

      <div
        ref={scrollRef}
        style={{
          border: '1px solid #d1d5db', borderRadius: 8, padding: 12,
          height: 'calc(100vh - 320px)', minHeight: 320, overflowY: 'auto',
          background: '#f9fafb', marginBottom: 12, fontSize: 14, lineHeight: 1.5,
        }}
      >
        {messages.length === 0 && !loading && !recording && (
          <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
            Clique sur « Parler » ou écris une question. Jarvis connaît la bible ATP, ta routine du jour et tes stats 30 j.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: m.role === 'user' ? '#2563eb' : '#059669', marginBottom: 2 }}>
              {m.role === 'user' ? 'TRADER' : 'JARVIS'}
              {m.via === 'voice' && ' · 🎤'}
              {m.audioFailed && ' · ⚠ voix KO (texte seulement)'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {m.role === 'assistant' && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>
                {m.voiceTimeToPlayMs != null && <>🔊 voix dans {m.voiceTimeToPlayMs} ms · </>}
                {m.durationMs != null && <>⏱ total client {m.durationMs} ms · </>}
                {m.server && (
                  <>
                    serveur {m.server.total ?? '?'} ms{' '}
                    {m.via === 'voice' ? (
                      <>(stt {m.server.stt ?? '?'} · brain {m.server.brain ?? '?'} · tts {m.server.tts ?? '?'})</>
                    ) : (
                      <>(auth {m.server.auth ?? '?'} · db/ctx {m.server.context ?? '?'} · quota {m.server.quota ?? '?'} · groq {m.server.groq ?? '?'})</>
                    )}
                  </>
                )}
                {m.cacheHits && m.cacheHits.length > 0 && (
                  <> · 💾 cache {m.cacheHits.join('+')}</>
                )}
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
        {recording && (
          <div style={{ color: '#dc2626', fontWeight: 600 }}>
            🔴 Enregistrement en cours — {(recordElapsed / 1000).toFixed(1)}s / 30s. Clique Stop pour arrêter.
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12 }}>
          <AiErrorBanner error={error} compact />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={recording ? stopRecord : startRecord}
          disabled={loading && !recording}
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 600,
            background: recording ? '#dc2626' : (loading ? '#9ca3af' : '#1f2937'),
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: loading && !recording ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {recordBtnLabel}
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ou écris à Jarvis…"
          disabled={loading || recording}
          style={{
            flex: 1, padding: '10px 12px', fontSize: 14,
            border: '1px solid #d1d5db', borderRadius: 6,
            background: '#fff', color: '#111',
          }}
        />
        <button
          onClick={send}
          disabled={loading || recording || !input.trim()}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            background: loading || recording || !input.trim() ? '#9ca3af' : '#059669',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: loading || recording || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Envoyer
        </button>
      </div>
    </div>
  )
}
