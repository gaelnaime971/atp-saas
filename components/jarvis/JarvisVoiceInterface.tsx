'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { readAiError, networkAiError, type AiErrorInfo } from '@/lib/ai/client-errors'
import { AiErrorBanner } from '@/components/ai/AiErrorBanner'
import { JarvisOrb, type OrbState } from './JarvisOrb'

/**
 * Interface Jarvis beta (étape 3D). L'orbe lumineuse remplace l'UI
 * du POC. Le pipeline voix / texte / cerveau / quota / préchauffage
 * n'est PAS modifié : on consomme toujours /api/jarvis/{chat,voice,warm}.
 */

interface ServerTimings {
  auth?: number; form?: number; context?: number
  stt?: number; quota?: number; brain?: number; tts?: number; groq?: number
  total?: number
}
interface ServerRetries { whisper?: number; brain?: number; tts?: number }

interface Exchange {
  trader: string
  jarvis: string
  via: 'text' | 'voice'
  callsToday?: number
  callsLimit?: number
  casquette?: string
  server?: ServerTimings
  retries?: ServerRetries
  cacheHits?: string[]
  audioFailed?: boolean
  voiceTimeToPlayMs?: number
  durationMs?: number
}

const MAX_RECORD_MS = 30_000
const WARM_INTERVAL_MS = 4 * 60 * 1000

function decodeB64Url(s: string): string {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
    return decodeURIComponent(escape(atob(b64)))
  } catch { return '' }
}

interface CasquetteInfo { casquette: string; usOpenParisLabel: string | null; minutesToOpen: number | null }

export default function JarvisVoiceInterface({ email }: { email: string }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [input, setInput] = useState('')
  const [showText, setShowText] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<AiErrorInfo | null>(null)
  const [casquetteInfo, setCasquetteInfo] = useState<CasquetteInfo | null>(null)
  const [currentCallsToday, setCurrentCallsToday] = useState<number | null>(null)
  const [currentCallsLimit, setCurrentCallsLimit] = useState<number | null>(null)

  const levelRef = useRef(0) // 0..1 — pilote --level côté SVG
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  // ─── État de l'orbe ───
  const orbState: OrbState =
    recording ? 'ecoute'
    : loading ? 'reflexion'
    : playing ? 'parle'
    : 'veille'

  // ─── Statut texte (sous l'orbe) ───
  const statusLabel =
    recording ? 'Je t\'écoute…'
    : loading ? 'Jarvis réfléchit…'
    : playing ? 'Jarvis te parle'
    : 'En veille'

  // ─── Fetch casquette (toutes les 60s + au mount) ───
  // Simple ping : on dérive la casquette depuis l'ouverture
  // utilisateur. Si tu veux la précision serveur, elle est aussi
  // retournée dans la réponse de /api/jarvis/{chat,voice} → on
  // écrase casquetteInfo.casquette avec la vraie à chaque échange.
  useEffect(() => {
    const refresh = () => {
      // Appel léger côté client pour calculer la casquette locale
      // (sans round-trip serveur). Formule DST-aware côté serveur
      // dans lib/jarvis/casquette.ts ; côté client on fait la même.
      const info = computeCasquetteLocal()
      setCasquetteInfo(info)
    }
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [])

  // ─── Préchauffage ───
  useEffect(() => {
    const warm = () => {
      fetch('/api/jarvis/warm', { method: 'POST', keepalive: true })
        .then(r => r.ok && r.json())
        .then(d => d && console.debug('[jarvis-warm]', d))
        .catch(() => { /* silencieux */ })
    }
    warm()
    const id = setInterval(warm, WARM_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close().catch(() => { /* ignore */ })
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
  }, [])

  // ─── Chat texte ───
  const send = async () => {
    const text = input.trim()
    if (!text || loading || recording) return
    const nextHist = [...exchanges.flatMap<{ role: 'user'|'assistant'; content: string }>(e => [
      { role: 'user', content: e.trader }, { role: 'assistant', content: e.jarvis },
    ]), { role: 'user' as const, content: text }]
    setInput('')
    setLoading(true)
    setError(null)
    const t0 = performance.now()
    try {
      const r = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHist.slice(-10) }),
      })
      if (!r.ok) { setError(await readAiError(r)); setLoading(false); return }
      const d = await r.json()
      const duration = Math.round(performance.now() - t0)
      setExchanges(h => [...h, {
        trader: text, jarvis: d.reply || '(vide)',
        via: 'text', durationMs: duration,
        callsToday: d.callsToday, callsLimit: d.callsLimit,
        casquette: d.casquette, server: d.timings, cacheHits: d.cacheHits,
      }])
      setCurrentCallsToday(d.callsToday)
      setCurrentCallsLimit(d.callsLimit)
    } catch { setError(networkAiError()) } finally { setLoading(false) }
  }

  // ─── Voix ───
  const startRecord = useCallback(async () => {
    if (loading || recording) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // AnalyserNode micro → --level
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        analyserRef.current = analyser
        startLevelPump(analyser, levelRef, rafRef)
      } catch (e) {
        console.warn('[jarvis] AnalyserNode mic failed', e)
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType })
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => void onRecordStop()
      rec.start()
      recordStartRef.current = performance.now()
      setRecording(true)
      const tick = setInterval(() => {
        if (performance.now() - recordStartRef.current >= MAX_RECORD_MS) {
          clearInterval(tick)
          stopRecord()
        }
      }, 100)
      recordTickRef.current = tick
    } catch (err) {
      console.error('[jarvis] mic error', err)
      setError({
        kind: 'unavailable',
        title: 'Micro inaccessible',
        message: 'Autorise l\'accès au micro dans ton navigateur et réessaie.',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, recording])

  const stopRecord = () => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    if (recordTickRef.current) { clearInterval(recordTickRef.current); recordTickRef.current = null }
    rec.stop()
  }

  const onRecordStop = async () => {
    const tStop = performance.now()
    setRecording(false)
    cancelAnimationFrame(rafRef.current)
    levelRef.current = 0
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach(t => t.stop())
    try { await audioCtxRef.current?.close() } catch { /* ignore */ }
    audioCtxRef.current = null
    analyserRef.current = null

    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
    chunksRef.current = []
    recorderRef.current = null

    if (blob.size < 2000) {
      setError({ kind: 'unavailable', title: 'Enregistrement trop court', message: 'Appuie et parle un peu plus longtemps.' })
      return
    }
    setLoading(true)

    const durationSec = (tStop - recordStartRef.current) / 1000
    const file = new File([blob], 'jarvis.webm', { type: blob.type })
    const form = new FormData()
    form.append('audio', file)
    form.append('durationSec', String(durationSec.toFixed(2)))
    form.append('history', JSON.stringify(
      exchanges.flatMap(e => [
        { role: 'user' as const, content: e.trader },
        { role: 'assistant' as const, content: e.jarvis },
      ]).slice(-10),
    ))

    try {
      const r = await fetch('/api/jarvis/voice', { method: 'POST', body: form })
      if (!r.ok) { setError(await readAiError(r)); setLoading(false); return }

      const ct = r.headers.get('Content-Type') || ''
      const casquette = r.headers.get('X-Jarvis-Casquette') || undefined
      const callsToday = Number(r.headers.get('X-Jarvis-CallsToday') || 0)
      const callsLimit = Number(r.headers.get('X-Jarvis-CallsLimit') || 0)
      const cacheHits = (r.headers.get('X-Jarvis-CacheHits') || '').split(',').filter(Boolean)

      let transcription = ''
      let reply = ''
      let server: ServerTimings | undefined
      let retries: ServerRetries | undefined
      let audioFailed = false
      let voiceTimeToPlayMs: number | undefined

      if (ct.startsWith('application/json')) {
        const d = await r.json()
        transcription = d.transcription || ''
        reply = d.reply || ''
        server = d.timings; retries = d.retries
        audioFailed = Boolean(d.audioFailed)
      } else if (ct.startsWith('audio/')) {
        transcription = decodeB64Url(r.headers.get('X-Jarvis-Transcription') || '')
        reply = decodeB64Url(r.headers.get('X-Jarvis-Reply') || '')
        try { server = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Timings') || '')) } catch {}
        try { retries = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Retries') || '')) } catch {}
        voiceTimeToPlayMs = await playAudioStream(r, tStop, audioUrlRef, audioRef, levelRef, rafRef, setPlaying)
      }

      setExchanges(h => [...h, {
        trader: transcription || '(vide)', jarvis: reply || '(vide)',
        via: 'voice', voiceTimeToPlayMs,
        callsToday, callsLimit,
        casquette, server, retries, cacheHits, audioFailed,
      }])
      setCurrentCallsToday(callsToday)
      setCurrentCallsLimit(callsLimit)
    } catch { setError(networkAiError()) } finally { setLoading(false) }
  }

  // ─── Compteur échanges restants ───
  const remaining = computeRemaining(currentCallsToday, currentCallsLimit)

  const lastExchange = exchanges[exchanges.length - 1]
  const casquetteText = lastExchange?.casquette || casquetteInfo?.casquette || '—'
  const openCue = formatOpenCue(casquetteInfo)

  return (
    <div className="jv-root">
      <header className="jv-header">
        <div className="jv-brand">
          <Image src="/logo-atp-white.png" alt="ATP" width={28} height={28} priority />
          <span className="jv-brand-name">Jarvis</span>
        </div>
        <div className="jv-header-right">
          <span className="jv-casquette">{casquetteText}</span>
          {openCue && <span className="jv-open-cue">{openCue}</span>}
        </div>
      </header>

      <main className="jv-main">
        <div className="jv-orb-wrap">
          <JarvisOrb state={orbState} levelRef={levelRef} size={240} />
        </div>

        <div className="jv-status" aria-live="polite">{statusLabel}</div>

        <section className="jv-exchange" aria-live="polite">
          {lastExchange ? (
            <>
              <div className="jv-jarvis-reply">{lastExchange.jarvis}</div>
              {lastExchange.trader && lastExchange.trader !== '(vide)' && (
                <div className="jv-trader-echo">« {lastExchange.trader} »</div>
              )}
              {lastExchange.audioFailed && (
                <div className="jv-warn">voix KO — texte seul</div>
              )}
            </>
          ) : (
            <div className="jv-trader-echo">Clique Parler ou écris. Jarvis connaît la bible, ta routine et tes stats.</div>
          )}
        </section>

        <div className={`jv-counter ${remaining.cls}`}>{remaining.label}</div>

        {error && <div className="jv-error-wrap"><AiErrorBanner error={error} compact /></div>}

        <div className="jv-actions">
          <button
            type="button"
            className={`jv-btn jv-btn-mic ${recording ? 'is-recording' : ''}`}
            onClick={recording ? stopRecord : startRecord}
            disabled={loading && !recording}
          >
            {recording ? 'Terminer' : 'Parler'}
          </button>
        </div>

        <button type="button" className="jv-link" onClick={() => setShowText(v => !v)}>
          {showText ? 'Masquer l\'écriture' : 'Écrire'}
        </button>

        {showText && (
          <div className="jv-text-row">
            <input
              type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Écris à Jarvis…"
              disabled={loading || recording}
              className="jv-text-input"
            />
            <button type="button" className="jv-btn jv-btn-send" onClick={send}
              disabled={loading || recording || !input.trim()}>
              Envoyer
            </button>
          </div>
        )}

        {lastExchange?.server && (
          <details className="jv-details">
            <summary>Détails techniques</summary>
            <div className="jv-details-body">
              {lastExchange.voiceTimeToPlayMs != null && <>🔊 voix dans {lastExchange.voiceTimeToPlayMs} ms<br /></>}
              {lastExchange.durationMs != null && <>⏱ total client {lastExchange.durationMs} ms<br /></>}
              serveur {lastExchange.server.total ?? '?'} ms{' '}
              {lastExchange.via === 'voice' ? (
                <>(auth {lastExchange.server.auth ?? '?'} · form {lastExchange.server.form ?? '?'} · ctx {lastExchange.server.context ?? '?'} · stt {lastExchange.server.stt ?? '?'} · quota {lastExchange.server.quota ?? '?'} · brain {lastExchange.server.brain ?? '?'} · tts {lastExchange.server.tts ?? '?'})</>
              ) : (
                <>(auth {lastExchange.server.auth ?? '?'} · db/ctx {lastExchange.server.context ?? '?'} · quota {lastExchange.server.quota ?? '?'} · groq {lastExchange.server.groq ?? '?'})</>
              )}
              {lastExchange.retries && (() => {
                const extra: string[] = []
                if ((lastExchange.retries.whisper ?? 1) > 1) extra.push(`stt×${lastExchange.retries.whisper}`)
                if ((lastExchange.retries.brain ?? 1) > 1) extra.push(`brain×${lastExchange.retries.brain}`)
                if ((lastExchange.retries.tts ?? 1) > 1) extra.push(`tts×${lastExchange.retries.tts}`)
                return extra.length > 0 ? <> · 🔁 {extra.join(', ')}</> : null
              })()}
              {lastExchange.cacheHits && lastExchange.cacheHits.length > 0 && <> · 💾 {lastExchange.cacheHits.join('+')}</>}
            </div>
          </details>
        )}

        <div className="jv-account">Connecté : {email}</div>
      </main>

      <style jsx>{`
        .jv-root {
          min-height: 100vh;
          background: #060807;
          color: #E9EEEA;
          font-family: var(--font-manrope), system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 20px 40px;
        }
        .jv-header {
          width: 100%;
          max-width: 420px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 0 16px;
          border-bottom: 1px solid rgba(159, 176, 166, 0.12);
        }
        .jv-brand { display: flex; align-items: center; gap: 10px; }
        .jv-brand-name {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-weight: 600; letter-spacing: 0.08em;
          font-size: 18px; color: #E9EEEA;
        }
        .jv-header-right {
          display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
          font-family: var(--font-oxanium), system-ui, sans-serif;
        }
        .jv-casquette {
          font-size: 12px; font-weight: 600;
          color: #DDB977; letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .jv-open-cue { font-size: 11px; color: #9FB0A6; }
        .jv-main {
          width: 100%; max-width: 420px;
          display: flex; flex-direction: column; align-items: center;
          padding-top: 24px;
          gap: 16px;
        }
        .jv-orb-wrap { padding: 8px; }
        .jv-status {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 14px; font-weight: 500;
          color: #9FB0A6; letter-spacing: 0.1em;
          text-transform: uppercase;
          min-height: 20px;
        }
        .jv-exchange {
          text-align: center; width: 100%; min-height: 60px;
          display: flex; flex-direction: column; gap: 6px; align-items: center;
        }
        .jv-jarvis-reply {
          font-size: 15px; line-height: 1.5; color: #E9EEEA;
          max-width: 340px;
        }
        .jv-trader-echo {
          font-size: 12px; color: #9FB0A6; font-style: italic;
          max-width: 340px;
        }
        .jv-warn { font-size: 11px; color: #F2994A; }
        .jv-counter {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 11px; letter-spacing: 0.06em;
          color: #9FB0A6;
          min-height: 16px;
        }
        .jv-counter.warn { color: #F2994A; }
        .jv-counter.stop { color: #DD5555; }
        .jv-error-wrap { width: 100%; max-width: 340px; }
        .jv-actions { padding: 4px 0; }
        .jv-btn {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.3s ease, background 0.3s;
        }
        .jv-btn-mic {
          width: 220px; height: 48px;
          border-radius: 999px;
          font-size: 14px;
          background: linear-gradient(180deg, #E6C487, #C8A75F);
          color: #0B100E; border: none;
          box-shadow: 0 0 20px rgba(221, 185, 119, 0.25);
        }
        .jv-btn-mic:hover:not(:disabled) { transform: translateY(-1px); }
        .jv-btn-mic:disabled { opacity: 0.5; cursor: not-allowed; }
        .jv-btn-mic.is-recording {
          background: linear-gradient(180deg, #4CDC8E, #37B06C);
          color: #0B100E;
          box-shadow: 0 0 30px rgba(69, 212, 134, 0.4);
        }
        .jv-link {
          background: none; border: none;
          color: #9FB0A6; font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
          padding: 4px 8px;
          font-family: inherit;
        }
        .jv-text-row {
          display: flex; gap: 8px; width: 100%; max-width: 340px;
        }
        .jv-text-input {
          flex: 1; padding: 10px 14px;
          background: rgba(159, 176, 166, 0.08);
          border: 1px solid rgba(159, 176, 166, 0.2);
          border-radius: 8px;
          color: #E9EEEA; font-family: inherit; font-size: 14px;
        }
        .jv-text-input:focus { outline: 1px solid #45D486; }
        .jv-btn-send {
          padding: 10px 16px; font-size: 12px;
          background: #45D486; color: #0B100E;
          border: none; border-radius: 8px;
        }
        .jv-btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .jv-details {
          width: 100%; max-width: 340px;
          font-size: 11px; color: #9FB0A6;
        }
        .jv-details summary {
          cursor: pointer; padding: 6px 0;
          color: #9FB0A6; font-family: var(--font-oxanium), system-ui, sans-serif;
          letter-spacing: 0.06em;
        }
        .jv-details-body {
          padding: 6px 0; line-height: 1.5;
          font-family: ui-monospace, monospace; font-size: 10px;
        }
        .jv-account {
          font-size: 10px; color: #4A5852;
          margin-top: 20px;
          font-family: ui-monospace, monospace;
        }
      `}</style>
    </div>
  )
}

// ─── Compute casquette locale ─────────────────────────────────────
function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const provisional = Date.UTC(y, m - 1, d, hh, mm, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(provisional))
  const got = {
    y: +parts.find(p => p.type === 'year')!.value,
    m: +parts.find(p => p.type === 'month')!.value,
    d: +parts.find(p => p.type === 'day')!.value,
    hh: +parts.find(p => p.type === 'hour')!.value,
    mm: +parts.find(p => p.type === 'minute')!.value,
  }
  const wanted = Date.UTC(y, m - 1, d, hh, mm, 0)
  const got_ms = Date.UTC(got.y, got.m - 1, got.d, got.hh, got.mm, 0)
  return new Date(provisional + (wanted - got_ms))
}

function computeCasquetteLocal(): CasquetteInfo {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const weekday = wdMap[parts.find(p => p.type === 'weekday')!.value] ?? 0
  if (weekday === 0 || weekday === 6) return { casquette: 'marché-fermé', usOpenParisLabel: null, minutesToOpen: null }
  const y = +parts.find(p => p.type === 'year')!.value
  const m = +parts.find(p => p.type === 'month')!.value
  const d = +parts.find(p => p.type === 'day')!.value
  const openUtc = zonedTimeToUtc(y, m, d, 9, 30, 'America/New_York')
  const diffMin = Math.round((openUtc.getTime() - now.getTime()) / 60000)
  let casquette: string
  if (diffMin > 45) casquette = 'hors-session'
  else if (diffMin > 30) casquette = 'Manager'
  else if (diffMin > 0) casquette = 'Analyste'
  else if (diffMin > -90) casquette = 'Trader'
  else casquette = 'Comptable'
  const parisLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(openUtc)
  return { casquette, usOpenParisLabel: parisLabel, minutesToOpen: diffMin }
}

function formatOpenCue(info: CasquetteInfo | null): string | null {
  if (!info) return null
  if (info.minutesToOpen == null) return null
  const m = info.minutesToOpen
  if (m > 0) return `Open dans ${m} min`
  if (m === 0) return 'Open'
  const past = -m
  if (past < 60) return `Open +${past} min`
  return `Open +${Math.floor(past / 60)}h${String(past % 60).padStart(2, '0')}`
}

function computeRemaining(callsToday: number | null, callsLimit: number | null): { label: string; cls: string } {
  if (callsToday == null || callsLimit == null) return { label: '', cls: '' }
  if (callsLimit === -1) return { label: 'Échanges illimités', cls: '' }
  const left = Math.max(0, callsLimit - callsToday)
  if (left === 0) return { label: 'Plus d\'échange aujourd\'hui, reprise à minuit', cls: 'stop' }
  const cls = left <= 3 ? 'warn' : ''
  const noun = left === 1 ? 'échange restant' : 'échanges restants'
  return { label: `${left} ${noun} aujourd\'hui`, cls }
}

// ─── Analyser pump : --level depuis AnalyserNode ───
function startLevelPump(
  analyser: AnalyserNode,
  levelRef: React.MutableRefObject<number>,
  rafRef: React.MutableRefObject<number>,
) {
  const buf = new Uint8Array(analyser.fftSize)
  let smoothed = 0
  const tick = () => {
    analyser.getByteTimeDomainData(buf)
    // RMS normalisé 0..1
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / buf.length)
    // Lissage temporel + boost (le micro webm/opus a tendance à être bas)
    const target = Math.min(1, rms * 3.5)
    smoothed = smoothed * 0.7 + target * 0.3
    levelRef.current = smoothed
    rafRef.current = requestAnimationFrame(tick)
  }
  rafRef.current = requestAnimationFrame(tick)
}

// ─── Stream audio + AnalyserNode sortie ───
async function playAudioStream(
  response: Response,
  tStop: number,
  urlRef: React.MutableRefObject<string | null>,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  levelRef: React.MutableRefObject<number>,
  rafRef: React.MutableRefObject<number>,
  setPlaying: (b: boolean) => void,
): Promise<number | undefined> {
  if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
  const supportsStream = typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported('audio/mpeg') &&
    response.body !== null

  const attachAnalyser = (audio: HTMLAudioElement) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      src.connect(ctx.destination)
      startLevelPump(analyser, levelRef, rafRef)
      audio.addEventListener('ended', () => {
        cancelAnimationFrame(rafRef.current)
        levelRef.current = 0
        setPlaying(false)
        ctx.close().catch(() => { /* ignore */ })
      }, { once: true })
    } catch (e) {
      console.warn('[jarvis] AnalyserNode output failed', e)
      audio.addEventListener('ended', () => { levelRef.current = 0; setPlaying(false) }, { once: true })
    }
  }

  const awaitPlaying = (audio: HTMLAudioElement): Promise<number | undefined> => new Promise(resolve => {
    const onPlaying = () => { audio.removeEventListener('playing', onPlaying); setPlaying(true); resolve(Math.round(performance.now() - tStop)) }
    audio.addEventListener('playing', onPlaying)
    setTimeout(() => resolve(undefined), 10_000)
  })

  if (!supportsStream) {
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    attachAnalyser(audio)
    const p = awaitPlaying(audio)
    audio.play().catch(() => { /* ignore */ })
    return p
  }

  const ms = new MediaSource()
  const url = URL.createObjectURL(ms)
  urlRef.current = url
  const audio = new Audio(url)
  audioRef.current = audio
  attachAnalyser(audio)
  const sourceOpen = new Promise<void>(resolve => ms.addEventListener('sourceopen', () => resolve(), { once: true }))
  const playingPromise = awaitPlaying(audio)
  audio.play().catch(err => console.error('[jarvis] audio.play error', err))
  await sourceOpen
  const sb = ms.addSourceBuffer('audio/mpeg')
  const reader = response.body!.getReader()
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        await new Promise<void>((res, rej) => {
          const onEnd = () => { sb.removeEventListener('updateend', onEnd); sb.removeEventListener('error', onErr); res() }
          const onErr = () => { sb.removeEventListener('updateend', onEnd); sb.removeEventListener('error', onErr); rej(new Error('sb error')) }
          sb.addEventListener('updateend', onEnd)
          sb.addEventListener('error', onErr)
          try { sb.appendBuffer(value) } catch (e) { rej(e as Error) }
        })
      }
      if (ms.readyState === 'open') ms.endOfStream()
    } catch (err) {
      console.error('[jarvis] stream pump error', err)
      try { if (ms.readyState === 'open') ms.endOfStream() } catch { /* ignore */ }
    }
  })()
  return playingPromise
}
