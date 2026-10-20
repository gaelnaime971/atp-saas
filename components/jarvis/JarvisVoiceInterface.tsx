'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { readAiError, networkAiError, type AiErrorInfo } from '@/lib/ai/client-errors'
import { AiErrorBanner } from '@/components/ai/AiErrorBanner'
import { JarvisOrb, type OrbState } from './JarvisOrb'

// ─── Document Picture-in-Picture typing (API encore non standard) ───
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>
      window: Window | null
    }
  }
}

const PIP_SIZE_FULL = { width: 380, height: 640 }
const PIP_SIZE_COMPACT = { width: 260, height: 320 }

/**
 * Clone toutes les feuilles de style du document principal vers la
 * fenêtre PiP cible. Nécessaire pour que styled-jsx (JarvisOrb +
 * JarvisVoiceInterface) et next/font (variables --font-oxanium /
 * --font-manrope + @font-face) soient reproduits dans la fenêtre.
 *
 * - Les sheets inline (styled-jsx, next/font css inline) sont
 *   sérialisées via cssRules puis injectées en <style>.
 *   Les sheets externes (CORS inaccessible) sont clonées en <link>.
 * - Un MutationObserver attaché au head principal clone à la volée
 *   les nouveaux <style>/<link> ajoutés après l'ouverture de la PiP
 *   (ex: styled-jsx qui injecte au mount d'un sous-composant).
 */
function clonePageStyles(target: Window): () => void {
  const copyStyleSheet = (sheet: CSSStyleSheet | StyleSheet) => {
    try {
      const css = sheet as CSSStyleSheet
      if (css.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = css.href
        target.document.head.appendChild(link)
        return
      }
      const rules = Array.from(css.cssRules).map(r => r.cssText).join('\n')
      if (!rules) return
      const style = target.document.createElement('style')
      style.textContent = rules
      target.document.head.appendChild(style)
    } catch {
      const href = (sheet as CSSStyleSheet).href
      if (href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        target.document.head.appendChild(link)
      }
    }
  }
  // Initial clone
  for (const sheet of Array.from(document.styleSheets)) copyStyleSheet(sheet)
  // Et les <style>/<link> bruts (certains frameworks ne passent pas par styleSheets avant insertion)
  for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    target.document.head.appendChild(node.cloneNode(true))
  }
  // Suit les nouvelles injections pendant la vie de la PiP
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof HTMLElement)) continue
        if (n.tagName === 'STYLE' || (n.tagName === 'LINK' && (n as HTMLLinkElement).rel === 'stylesheet')) {
          target.document.head.appendChild(n.cloneNode(true))
        }
      }
    }
  })
  mo.observe(document.head, { childList: true })
  return () => mo.disconnect()
}

/** Casquette serveur → libellé minuscules initiales pour l'UI. */
const CASQUETTE_LABEL: Record<string, string> = {
  'marché-fermé': 'Marché fermé',
  'hors-session': 'Hors session',
  'MANAGER':      'Manager',
  'ANALYSTE':     'Analyste',
  'TRADER':       'Trader',
  'COMPTABLE':    'Comptable',
}
function labelFor(raw: string | undefined): string {
  if (!raw) return '—'
  return CASQUETTE_LABEL[raw] ?? raw
}

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

interface NotedEvent {
  id: string
  type: string
  payload: {
    result_r?: number | null
    result_usd?: number | null
    instrument?: string | null
    side?: 'long' | 'short' | null
    config?: string | null
  }
}
interface TriggeredRule {
  key: string
  message: string
  config?: string
}
type JokerStep = 'inactive' | 'armed' | 'choch_m1' | 'choch_m5' | 'ready'
interface JokerStatus { step: JokerStep; outOfOrder?: boolean }

interface SessionPayload {
  state: { tradesCount: number; rSum: number | null; usdSum: number }
  notedEvent: NotedEvent | null
  triggered: TriggeredRule[]
  detection: 'trade' | 'ambiguous' | 'none'
  joker?: JokerStatus
}

interface BrainInfo { provider: 'openrouter' | 'groq'; model: string }

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
  session?: SessionPayload
  brain?: BrainInfo
}

const AMBER_RULES = new Set([
  'three_losses', 'max_trades', 'same_config_hard_stop', 'trade_after_stop',
])
function isAmberRule(key: string): boolean { return AMBER_RULES.has(key) }
function JokerStepper({ step }: { step: JokerStep }) {
  // Les 3 étapes du suivi
  const stages: Array<{ key: JokerStep; label: string }> = [
    { key: 'choch_m1', label: 'CHoCH M1' },
    { key: 'choch_m5', label: 'CHoCH M5' },
    { key: 'ready',    label: 'Retracement et signal' },
  ]

  // Mapping correct :
  //   armed    → M1 awaiting · M5 pending · ready pending
  //   choch_m1 → M1 done ✓   · M5 awaiting · ready pending
  //   choch_m5 → M1 done ✓   · M5 done ✓   · ready awaiting
  //   ready    → M1 done ✓   · M5 done ✓   · ready done ✓
  const statusOf = (stageKey: JokerStep): 'done' | 'awaiting' | 'pending' => {
    if (step === 'armed')    return stageKey === 'choch_m1' ? 'awaiting' : 'pending'
    if (step === 'choch_m1') return stageKey === 'choch_m1' ? 'done' : stageKey === 'choch_m5' ? 'awaiting' : 'pending'
    if (step === 'choch_m5') return stageKey === 'ready' ? 'awaiting' : 'done'
    if (step === 'ready')    return 'done'
    return 'pending'
  }

  const headTitle =
    step === 'armed'    ? 'Mode Joker armé'
  : step === 'choch_m1' ? 'Mode Joker en cours'
  : step === 'choch_m5' ? 'Mode Joker en cours'
  : step === 'ready'    ? 'Mode Joker prêt'
  : 'Mode Joker'

  // Rappel à droite : "En attente du CHoCH M1/M5" ou "Checklist complète"
  const awaitingStage = stages.find(s => statusOf(s.key) === 'awaiting')
  const headRight = awaitingStage
    ? (awaitingStage.key === 'ready' ? 'En attente du retracement' : `En attente du ${awaitingStage.label}`)
    : (step === 'ready' ? 'Checklist complète' : '')

  return (
    <div className="jj-root" role="group" aria-label="Mode Joker en cours">
      <div className="jj-head">
        <span className="jj-title">{headTitle}</span>
        {headRight && <span className="jj-await">{headRight}</span>}
      </div>
      <ol className="jj-steps">
        {stages.map((s, i) => {
          const st = statusOf(s.key)
          const linkDone = st === 'done'
          const linkActive = !linkDone && i + 1 < stages.length && statusOf(stages[i + 1].key) === 'awaiting'
          return (
            <li key={s.key} className={`jj-step is-${st}`}>
              <div className="jj-circle" aria-hidden>
                {st === 'done' && (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#060807" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5L6.5 11.5L12.5 5" />
                  </svg>
                )}
              </div>
              <div className="jj-label">{s.label}</div>
              {i < stages.length - 1 && (
                <span className={`jj-link ${linkDone ? 'is-done' : linkActive ? 'is-active' : ''}`} aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
      <style jsx>{`
        .jj-root {
          max-width: 340px; width: 100%;
          padding: 12px 14px 14px;
          border-radius: 12px;
          background: rgba(42, 58, 49, 0.35);
          border: 1px solid #2A3A31;
          font-family: var(--font-oxanium), system-ui, sans-serif;
        }
        .jj-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 10px; margin-bottom: 14px;
        }
        .jj-title {
          font-size: 12px; font-weight: 600;
          color: #C9A46A;
          text-transform: uppercase; letter-spacing: 0.14em;
        }
        .jj-await {
          font-size: 10px; color: #9FB0A6;
          letter-spacing: 0.04em;
          text-align: right;
        }
        .jj-steps {
          list-style: none; margin: 0; padding: 0;
          display: flex; align-items: flex-start;
        }
        .jj-step {
          flex: 1 1 0;
          display: flex; flex-direction: column; align-items: center;
          position: relative;
          min-width: 0;
        }
        .jj-circle {
          width: 24px; height: 24px; border-radius: 50%;
          background: #2A3A31;
          border: 2px solid #2A3A31;
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 1;
          transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .jj-step.is-done .jj-circle {
          background: #45D486;
          border-color: #45D486;
        }
        .jj-step.is-awaiting .jj-circle {
          background: transparent;
          border-color: #45D486;
          animation: jjPulseCircle 1.4s ease-in-out infinite;
        }
        @keyframes jjPulseCircle {
          0%, 100% { box-shadow: 0 0 0 0 rgba(69, 212, 134, 0.55); }
          50%      { box-shadow: 0 0 0 8px rgba(69, 212, 134, 0); }
        }
        .jj-label {
          margin-top: 8px;
          font-size: 10px;
          color: #9FB0A6;
          text-align: center;
          letter-spacing: 0.02em;
          line-height: 1.3;
          padding: 0 4px;
          white-space: nowrap;
        }
        .jj-step.is-done .jj-label { color: #E9EEEA; }
        .jj-step.is-awaiting .jj-label { color: #45D486; }
        /* Trait entre deux cercles. Positionné au niveau du cercle (12 px du haut),
           part du bord droit de ce cercle et file jusqu'au centre du suivant. */
        .jj-link {
          position: absolute;
          top: 11px;
          left: calc(50% + 12px);
          right: calc(-50% + 12px);
          height: 2px;
          background: #2A3A31;
          z-index: 0;
          overflow: hidden;
        }
        .jj-link.is-done { background: #45D486; }
        .jj-link.is-active {
          background: #2A3A31;
          position: relative;
        }
        .jj-link.is-active::after {
          content: '';
          position: absolute; top: 0; left: 0;
          height: 100%; width: 40%;
          background: linear-gradient(90deg, rgba(69, 212, 134, 0), #45D486);
          animation: jjFlow 1.6s ease-in-out infinite;
        }
        @keyframes jjFlow {
          0%   { transform: translateX(-20%); opacity: 0.0; }
          50%  { opacity: 1; }
          100% { transform: translateX(260%); opacity: 0.0; }
        }
      `}</style>
    </div>
  )
}

/** 3F-CORRECTIF-2 — Format français : virgule décimale, signe + explicite
 *  pour positif. "+3,0 R", "-0,5 R", "+450 $" (entiers sans virgule). */
function fmtR(x: number): string {
  const sign = x > 0 ? '+' : (x < 0 ? '' : '')
  const abs = Math.abs(x)
  const body = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1).replace('.', ',')
  return x < 0 ? `-${body}` : `${sign}${body}`
}
function fmtUsd(x: number): string {
  const sign = x > 0 ? '+' : (x < 0 ? '-' : '')
  const abs = Math.abs(x)
  const body = Number.isInteger(abs) ? `${abs}` : abs.toFixed(2).replace('.', ',')
  return `${sign}${body}`
}

function formatNoted(ev: NotedEvent): string {
  const p = ev.payload
  const parts: string[] = []
  if (typeof p.result_r === 'number') {
    parts.push(`${fmtR(p.result_r)} R`)
  } else if (typeof p.result_usd === 'number') {
    parts.push(`${fmtUsd(p.result_usd)} $`)
  }
  if (p.instrument) parts.push('sur ' + p.instrument)
  if (p.side === 'short') parts.push('short')
  if (p.side === 'long')  parts.push('long')
  return 'Noté : ' + parts.join(' ')
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

  // PiP state
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [compact, setCompact] = useState(false)
  const [pipMessage, setPipMessage] = useState<string | null>(null)
  const pipCleanupRef = useRef<(() => void) | null>(null)

  // 3F.7 : bouton reset réservé aux testeurs
  const [isTester, setIsTester] = useState(false)

  // 3F-CORRECTIF : testeurs peuvent forcer une casquette ("TRADER" à
  // 22h pour tester les règles de session). Vide = casquette calculée.
  const [forcedCasquette, setForcedCasquette] = useState<string>('')

  // 3F-ter : mode comparaison (testeurs, en mode Écrire)
  const [compareMode, setCompareMode] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareResults, setCompareResults] = useState<Array<{ model: string; ok: boolean; reply?: string; error?: string; ms: number; costUsd?: number | null }> | null>(null)
  const [compareRevealed, setCompareRevealed] = useState(false)

  // Lecture ?compact=1 à l'ouverture (fallback popup Safari/Firefox)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('compact') === '1') setCompact(true)
  }, [])

  // Détecte si l'utilisateur est testeur (GET /api/jarvis/reset-session)
  useEffect(() => {
    fetch('/api/jarvis/reset-session', { method: 'GET' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tester) setIsTester(true) })
      .catch(() => { /* silencieux : non-testeur */ })
  }, [])

  const sendCompare = async () => {
    const text = input.trim()
    if (!text || compareLoading) return
    const nextHist = [...exchanges.flatMap<{ role: 'user'|'assistant'; content: string }>(e => [
      { role: 'user', content: e.trader }, { role: 'assistant', content: e.jarvis },
    ]), { role: 'user' as const, content: text }]
    setInput('')
    setCompareLoading(true)
    setCompareResults(null)
    setCompareRevealed(false)
    setError(null)
    try {
      const r = await fetch('/api/jarvis/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHist.slice(-10) }),
      })
      if (!r.ok) { setError(await readAiError(r)); setCompareLoading(false); return }
      const d = await r.json()
      setCompareResults(d.results || [])
      if (typeof d.callsToday === 'number') setCurrentCallsToday(d.callsToday)
      if (typeof d.callsLimit === 'number') setCurrentCallsLimit(d.callsLimit)
    } catch { setError(networkAiError()) } finally { setCompareLoading(false) }
  }

  const resetSession = async () => {
    if (!confirm('Réinitialiser ta session du jour ? Les trades notés et règles annoncées seront supprimés.')) return
    try {
      const r = await fetch('/api/jarvis/reset-session', { method: 'POST' })
      if (r.ok) {
        // Vider les sessions côté UI pour les derniers échanges
        setExchanges(h => h.map(e => e.session ? ({ ...e, session: {
          state: { tradesCount: 0, rSum: 0, usdSum: 0 },
          notedEvent: null, triggered: [], detection: 'none',
        } }) : e))
      }
    } catch { /* silencieux */ }
  }

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
  // Si une règle est déclenchée sur le dernier échange, l'orbe
  // prend la couleur dédiée pendant que Jarvis parle (ambre pour
  // les stops dûrs, doré éclatant pour les objectifs atteints).
  const lastTrig = exchanges[exchanges.length - 1]?.session?.triggered?.[0]
  const ruleOrb: OrbState | null = lastTrig
    ? (isAmberRule(lastTrig.key) ? 'ambre' : 'objectif')
    : null
  const orbState: OrbState =
    recording ? 'ecoute'
    : loading ? 'reflexion'
    : playing ? (ruleOrb ?? 'parle')
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
  // Au mount + toutes les 4 min. Récupère aussi le compteur du jour
  // (lecture sans incrément, cf. peekQuota serveur) → affiché avant
  // même le premier échange.
  useEffect(() => {
    const warm = () => {
      fetch('/api/jarvis/warm', { method: 'POST', keepalive: true })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return
          console.debug('[jarvis-warm]', d)
          if (typeof d.callsToday === 'number') setCurrentCallsToday(d.callsToday)
          if (typeof d.callsLimit === 'number') setCurrentCallsLimit(d.callsLimit)
        })
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
    if (pipCleanupRef.current) pipCleanupRef.current()
    pipWindow?.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Fenêtre flottante (Document Picture-in-Picture) ───
  const openPip = useCallback(async () => {
    setPipMessage(null)
    const dpip = window.documentPictureInPicture
    if (!dpip) {
      // Fallback : popup classique sur /jarvis?compact=1 — session
      // séparée (son propre micro, son propre compteur, mais ça
      // garde Jarvis au-dessus de la plateforme).
      const pop = window.open(
        '/jarvis?compact=1',
        'JarvisFloating',
        `width=${PIP_SIZE_FULL.width},height=${PIP_SIZE_FULL.height},menubar=0,toolbar=0,location=0,status=0`,
      )
      if (!pop) {
        setPipMessage('Les popups sont bloqués par ton navigateur. Autorise-les pour ce site.')
      } else {
        pop.focus()
        setPipMessage('Pour garder Jarvis au premier plan façon Picture-in-Picture, utilise Chrome ou Edge. Une fenêtre classique a été ouverte à la place.')
      }
      return
    }
    try {
      const size = compact ? PIP_SIZE_COMPACT : PIP_SIZE_FULL
      const pw = await dpip.requestWindow(size)
      pw.document.title = 'Jarvis'
      pw.document.documentElement.lang = 'fr'
      pw.document.body.style.margin = '0'
      pw.document.body.style.background = '#060807'
      pipCleanupRef.current = clonePageStyles(pw)
      pw.addEventListener('pagehide', () => {
        pipCleanupRef.current?.()
        pipCleanupRef.current = null
        setPipWindow(null)
      })
      setPipWindow(pw)
    } catch (err) {
      console.error('[jarvis-pip] open failed', err)
      setPipMessage('Impossible d\'ouvrir la fenêtre flottante.')
    }
  }, [compact])

  const closePip = useCallback(() => {
    pipWindow?.close()
  }, [pipWindow])

  const toggleCompact = useCallback(() => {
    setCompact(prev => {
      const next = !prev
      if (pipWindow) {
        const s = next ? PIP_SIZE_COMPACT : PIP_SIZE_FULL
        try { pipWindow.resizeTo(s.width, s.height) } catch { /* resizeTo peut être refusé */ }
      }
      return next
    })
  }, [pipWindow])

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
        body: JSON.stringify({
          messages: nextHist.slice(-10),
          ...(isTester && forcedCasquette ? { forceCasquette: forcedCasquette } : {}),
        }),
      })
      if (!r.ok) { setError(await readAiError(r)); setLoading(false); return }
      const d = await r.json()
      const duration = Math.round(performance.now() - t0)
      setExchanges(h => [...h, {
        trader: text, jarvis: d.reply || '(vide)',
        via: 'text', durationMs: duration,
        callsToday: d.callsToday, callsLimit: d.callsLimit,
        casquette: d.casquette, server: d.timings, cacheHits: d.cacheHits,
        session: d.session as SessionPayload | undefined,
        brain: d.brain as BrainInfo | undefined,
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
    if (isTester && forcedCasquette) {
      form.append('forceCasquette', forcedCasquette)
    }

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
      let session: SessionPayload | undefined
      let brain: BrainInfo | undefined

      if (ct.startsWith('application/json')) {
        const d = await r.json()
        transcription = d.transcription || ''
        reply = d.reply || ''
        server = d.timings; retries = d.retries
        audioFailed = Boolean(d.audioFailed)
        session = d.session as SessionPayload | undefined
        brain = d.brain as BrainInfo | undefined
      } else if (ct.startsWith('audio/')) {
        transcription = decodeB64Url(r.headers.get('X-Jarvis-Transcription') || '')
        reply = decodeB64Url(r.headers.get('X-Jarvis-Reply') || '')
        try { server = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Timings') || '')) } catch {}
        try { retries = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Retries') || '')) } catch {}
        try { session = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Session') || '')) as SessionPayload } catch {}
        try { brain = JSON.parse(decodeB64Url(r.headers.get('X-Jarvis-Brain') || '')) as BrainInfo } catch {}
        voiceTimeToPlayMs = await playAudioStream(r, tStop, audioUrlRef, audioRef, levelRef, rafRef, setPlaying)
      }

      setExchanges(h => [...h, {
        trader: transcription || '(vide)', jarvis: reply || '(vide)',
        via: 'voice', voiceTimeToPlayMs,
        callsToday, callsLimit,
        casquette, server, retries, cacheHits, audioFailed,
        session, brain,
      }])
      setCurrentCallsToday(callsToday)
      setCurrentCallsLimit(callsLimit)
    } catch { setError(networkAiError()) } finally { setLoading(false) }
  }

  // ─── Actions sur un event noté ───
  // La route PATCH/DELETE retourne le nouveau snapshot complet
  // (state + triggered) après avoir reconcilié les rule_triggered
  // caducs côté serveur. On met à jour l'UI SANS recharger.
  const applySessionUpdate = (
    eventId: string,
    nextNoted: NotedEvent | null,
    serverSession?: { state: SessionPayload['state']; triggered: SessionPayload['triggered'] },
  ) => {
    setExchanges(h => h.map(e => {
      if (e.session?.notedEvent?.id !== eventId) return e
      const prev = e.session
      return {
        ...e,
        session: {
          ...prev,
          notedEvent: nextNoted,
          state: serverSession?.state ?? prev.state,
          triggered: serverSession?.triggered ?? [],  // vides si non fournis
        },
      }
    }))
  }
  const deleteEvent = async (id: string) => {
    try {
      const r = await fetch(`/api/jarvis/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) return
      const d = await r.json() as { ok: boolean; session?: { state: SessionPayload['state']; triggered: SessionPayload['triggered'] } }
      applySessionUpdate(id, null, d.session)
    } catch { /* silencieux */ }
  }
  const patchEvent = async (id: string, patch: Partial<NotedEvent['payload']>) => {
    try {
      const r = await fetch(`/api/jarvis/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) return
      const d = await r.json() as {
        ok: boolean
        payload: NotedEvent['payload']
        session?: { state: SessionPayload['state']; triggered: SessionPayload['triggered'] }
      }
      // Reconstruit le noted event avec le payload mergé côté serveur
      setExchanges(h => h.map(e => {
        if (e.session?.notedEvent?.id !== id || !e.session.notedEvent) return e
        return {
          ...e,
          session: {
            ...e.session,
            notedEvent: { ...e.session.notedEvent, payload: d.payload },
            state: d.session?.state ?? e.session.state,
            triggered: d.session?.triggered ?? [],
          },
        }
      }))
    } catch { /* silencieux */ }
  }

  // ─── Compteur échanges restants ───
  const remaining = computeRemaining(currentCallsToday, currentCallsLimit)

  const lastExchange = exchanges[exchanges.length - 1]
  const casquetteRaw = lastExchange?.casquette || casquetteInfo?.casquette
  const casquetteText = labelFor(casquetteRaw)
  const openCue = formatOpenCue(casquetteInfo)

  const ui = (
    <div className="jv-root" data-compact={compact || undefined}>
      <header className="jv-header">
        <div className="jv-brand">
          {/* Symbol seul teinté en doré via mask-image. */}
          <span className="jv-logo" aria-label="ATP" role="img" />
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

        {lastExchange?.session?.triggered && lastExchange.session.triggered.length > 0 && (
          <div className={`jv-rule-banner ${lastExchange.session.triggered.some(t => isAmberRule(t.key)) ? 'is-amber' : 'is-gold'}`}>
            {lastExchange.session.triggered.map(t => t.message).join(' ')}
          </div>
        )}

        {lastExchange?.session?.notedEvent && (
          <div className="jv-noted">
            <span className="jv-noted-label">{formatNoted(lastExchange.session.notedEvent)}</span>
            <button type="button" className="jv-noted-btn" onClick={() => {
              const ev = lastExchange.session!.notedEvent!
              const raw = prompt('Nouveau résultat (ex: "-0.5R", "+200$", "BE") :', '')
              if (!raw) return
              const t = raw.trim().toLowerCase()
              const patch: Partial<NotedEvent['payload']> = {}
              if (/^be|break/.test(t)) { patch.result_r = 0; patch.result_usd = null }
              else {
                const rMatch = t.match(/([+-]?)\s*(\d+(?:[.,]\d+)?)\s*r/)
                const uMatch = t.match(/([+-]?)\s*(\d+(?:[.,]\d+)?)\s*(?:\$|dollars?)/)
                if (rMatch) {
                  patch.result_r = (rMatch[1] === '-' ? -1 : 1) * Number(rMatch[2].replace(',', '.'))
                } else if (uMatch) {
                  patch.result_usd = (uMatch[1] === '-' ? -1 : 1) * Number(uMatch[2].replace(',', '.'))
                }
              }
              if (Object.keys(patch).length > 0) void patchEvent(ev.id, patch)
            }}>Corriger</button>
            <button type="button" className="jv-noted-btn jv-noted-del" onClick={() => {
              const ev = lastExchange.session!.notedEvent!
              if (confirm('Supprimer ce trade de la session ?')) void deleteEvent(ev.id)
            }}>Supprimer</button>
          </div>
        )}

        {lastExchange?.session && lastExchange.session.state.tradesCount > 0 && (
          <div className="jv-session-line">
            Session : {lastExchange.session.state.tradesCount} trade{lastExchange.session.state.tradesCount > 1 ? 's' : ''}
            {lastExchange.session.state.rSum != null && (
              <>, {fmtR(lastExchange.session.state.rSum)} R</>
            )}
            {' · '}
            <a href="/jarvis/regles" className="jv-rules-link">Mes règles</a>
          </div>
        )}
        {(!lastExchange?.session || lastExchange.session.state.tradesCount === 0) && (
          <div className="jv-session-line">
            <a href="/jarvis/regles" className="jv-rules-link">Mes règles</a>
          </div>
        )}
        {/* Si Jarvis a demandé le risque dans sa dernière réponse,
            on fait pointer explicitement vers la page règles. */}
        {lastExchange?.jarvis && /risque\s+par\s+trade/i.test(lastExchange.jarvis) && (
          <div className="jv-ask-rules">
            Tu peux renseigner ton risque par trade dans{' '}
            <a href="/jarvis/regles" className="jv-rules-link">Mes règles</a>.
          </div>
        )}

        {lastExchange?.session?.joker && lastExchange.session.joker.step !== 'inactive' && (
          <JokerStepper step={lastExchange.session.joker.step} />
        )}

        <div className={`jv-counter ${remaining.cls}`}>{remaining.label || '—'}</div>

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
          <>
            {isTester && (
              <div className="jv-compare-toggle">
                <label>
                  <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} />
                  Mode comparaison (3 modèles côte à côte, testeur)
                </label>
              </div>
            )}
            <div className="jv-text-row">
              <input
                type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compareMode ? sendCompare() : send() } }}
                placeholder={compareMode ? 'Question pour les 3 modèles…' : 'Écris à Jarvis…'}
                disabled={loading || recording || compareLoading}
                className="jv-text-input"
              />
              <button type="button" className="jv-btn jv-btn-send"
                onClick={compareMode ? sendCompare : send}
                disabled={loading || recording || compareLoading || !input.trim()}>
                {compareMode ? (compareLoading ? '…' : 'Comparer') : 'Envoyer'}
              </button>
            </div>
            {compareResults && (
              <div className="jv-compare-grid">
                {compareResults.map((r, i) => {
                  const label = String.fromCharCode(65 + i) // A, B, C
                  return (
                    <div key={i} className="jv-compare-card">
                      <div className="jv-compare-head">
                        <span className="jv-compare-label">{label}</span>
                        <span className="jv-compare-meta">
                          {compareRevealed && <code>{r.model}</code>}
                          {compareRevealed && ' · '}{r.ms} ms
                          {r.ok && r.costUsd != null && <> · ${r.costUsd.toFixed(4)}</>}
                        </span>
                      </div>
                      <div className="jv-compare-body">
                        {r.ok ? r.reply : <em>Erreur : {r.error}</em>}
                      </div>
                    </div>
                  )
                })}
                <div className="jv-compare-reveal">
                  <button type="button" className="jv-link"
                    onClick={() => setCompareRevealed(v => !v)}>
                    {compareRevealed ? 'Cacher les noms' : 'Révéler les modèles'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="jv-pip-row">
          {pipWindow ? (
            <>
              <button type="button" className="jv-link" onClick={toggleCompact}>
                {compact ? 'Mode complet' : 'Mode compact'}
              </button>
              <span className="jv-pip-sep" aria-hidden>·</span>
              <button type="button" className="jv-link" onClick={closePip}>
                Ramener dans l&apos;onglet
              </button>
            </>
          ) : (
            <button type="button" className="jv-link" onClick={openPip}>
              Fenêtre flottante
            </button>
          )}
        </div>
        {pipMessage && <div className="jv-pip-msg">{pipMessage}</div>}

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
              {lastExchange.brain && (
                <> · 🧠 {lastExchange.brain.provider === 'openrouter' ? 'OR' : 'Groq'} <code>{lastExchange.brain.model}</code></>
              )}
              {isTester && (
                <div className="jv-tester-row">
                  <label htmlFor="jv-force-casquette">Forcer la casquette&nbsp;:</label>
                  <select
                    id="jv-force-casquette"
                    value={forcedCasquette}
                    onChange={(e) => setForcedCasquette(e.target.value)}
                  >
                    <option value="">auto (calculée)</option>
                    <option value="hors-session">hors-session</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="ANALYSTE">ANALYSTE</option>
                    <option value="TRADER">TRADER</option>
                    <option value="COMPTABLE">COMPTABLE</option>
                    <option value="marché-fermé">marché-fermé</option>
                  </select>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="jv-account">
          Connecté : {email}
          {isTester && (
            <>
              {' · '}
              <button type="button" className="jv-reset-link" onClick={resetSession}>
                Réinitialiser ma session du jour
              </button>
            </>
          )}
        </div>
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
        .jv-logo {
          display: inline-block;
          width: 28px; height: 22px;
          background-color: #C9A46A;
          mask-image: url('/logo-atp-symbol.png');
          mask-size: contain;
          mask-repeat: no-repeat;
          mask-position: center;
          -webkit-mask-image: url('/logo-atp-symbol.png');
          -webkit-mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          -webkit-mask-position: center;
        }
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
          font-size: 13px; font-weight: 500;
          color: #DDB977; letter-spacing: 0.02em;
        }
        .jv-open-cue { font-size: 11px; color: #9FB0A6; }
        .jv-main {
          width: 100%; max-width: 420px;
          display: flex; flex-direction: column; align-items: center;
          padding-top: 24px;
          gap: 14px;
        }
        .jv-orb-wrap { padding: 8px; }
        .jv-status {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 15px; font-weight: 500;
          color: #9FB0A6; letter-spacing: 0.02em;
          min-height: 22px;
        }
        /* Zone fixe — le bouton Parler ne doit JAMAIS bouger quand
           la réponse change de longueur. Hauteur = 4 lignes de reply
           + 1 ligne d'écho + marges. */
        .jv-exchange {
          width: 100%; max-width: 340px;
          height: 140px;
          display: flex; flex-direction: column; gap: 6px; align-items: center;
          overflow-y: auto;
          text-align: center;
          padding: 0 4px;
        }
        .jv-jarvis-reply {
          font-size: 15px; line-height: 1.5; color: #E9EEEA;
          max-width: 100%;
        }
        .jv-trader-echo {
          font-size: 12px; color: #9FB0A6; font-style: italic;
          max-width: 100%;
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
        .jv-rule-banner {
          max-width: 340px; width: 100%;
          padding: 10px 14px; border-radius: 10px;
          font-size: 13px; line-height: 1.4;
          font-family: var(--font-oxanium), system-ui, sans-serif;
          text-align: center;
        }
        .jv-rule-banner.is-amber {
          background: rgba(242, 153, 74, 0.14);
          border: 1px solid rgba(242, 153, 74, 0.45);
          color: #F2994A;
        }
        .jv-rule-banner.is-gold {
          background: rgba(233, 201, 138, 0.14);
          border: 1px solid rgba(233, 201, 138, 0.45);
          color: #E9C98A;
        }
        .jv-noted {
          max-width: 340px; width: 100%;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 6px 10px; border-radius: 8px;
          background: rgba(159, 176, 166, 0.08);
          border: 1px solid rgba(159, 176, 166, 0.2);
          font-size: 12px; color: #E9EEEA;
        }
        .jv-noted-label { flex: 1; min-width: 0; }
        .jv-noted-btn {
          padding: 4px 8px; font-size: 10px;
          background: transparent; color: #9FB0A6;
          border: 1px solid rgba(159, 176, 166, 0.3);
          border-radius: 5px; cursor: pointer;
          font-family: inherit;
        }
        .jv-noted-del { color: #DD5555; border-color: rgba(221, 85, 85, 0.4); }
        .jv-session-line {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 11px; color: #9FB0A6;
          letter-spacing: 0.02em;
        }
        .jv-rules-link {
          color: #DDB977; text-decoration: underline;
          font-family: inherit;
        }
        .jv-ask-rules {
          max-width: 340px; width: 100%;
          padding: 8px 10px; border-radius: 6px;
          background: rgba(221, 185, 119, 0.08);
          border: 1px solid rgba(221, 185, 119, 0.25);
          font-size: 11px; color: #DDB977;
          font-family: var(--font-oxanium), system-ui, sans-serif;
        }
        /* Stepper Joker : styles portés par le composant JokerStepper
           (styled-jsx est scopé par composant). */
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
        /* Mode comparaison */
        .jv-compare-toggle {
          max-width: 340px; width: 100%;
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 11px; color: #9FB0A6;
        }
        .jv-compare-toggle label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
        .jv-compare-grid {
          max-width: 100%; width: 100%; max-width: 980px;
          display: grid; grid-template-columns: 1fr; gap: 10px;
          margin-top: 6px;
        }
        @media (min-width: 720px) {
          .jv-compare-grid { grid-template-columns: 1fr 1fr 1fr; }
          .jv-compare-reveal { grid-column: 1 / -1; }
        }
        .jv-compare-card {
          padding: 10px 12px;
          border: 1px solid rgba(159, 176, 166, 0.2);
          border-radius: 8px;
          background: rgba(159, 176, 166, 0.04);
        }
        .jv-compare-head {
          display: flex; justify-content: space-between; align-items: baseline;
          gap: 8px; margin-bottom: 6px;
        }
        .jv-compare-label {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 13px; font-weight: 700; color: #DDB977;
        }
        .jv-compare-meta { font-size: 10px; color: #6B7A72; }
        .jv-compare-meta code { background: rgba(159, 176, 166, 0.1); padding: 1px 5px; border-radius: 3px; }
        .jv-compare-body {
          font-size: 13px; line-height: 1.5; color: #E9EEEA;
          white-space: pre-wrap;
        }
        .jv-compare-reveal { text-align: center; margin-top: 4px; }
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
        .jv-tester-row {
          margin-top: 8px; display: flex; align-items: center; gap: 8px;
          font-family: var(--font-manrope), system-ui, sans-serif;
          font-size: 11px; color: #DDB977;
        }
        .jv-tester-row select {
          background: rgba(221, 185, 119, 0.08);
          color: #E9EEEA; border: 1px solid rgba(221, 185, 119, 0.35);
          border-radius: 4px; padding: 2px 6px; font-size: 11px;
        }
        .jv-account {
          font-size: 10px; color: #4A5852;
          margin-top: 20px;
          font-family: ui-monospace, monospace;
        }
        .jv-reset-link {
          background: none; border: none;
          color: #F2994A; font-size: 10px;
          text-decoration: underline;
          cursor: pointer; padding: 0;
          font-family: inherit;
        }
        .jv-pip-row {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px;
        }
        .jv-pip-sep { color: #4A5852; }
        .jv-pip-msg {
          max-width: 340px; text-align: center;
          font-size: 11px; color: #9FB0A6;
          padding: 6px 10px;
          border: 1px solid rgba(159, 176, 166, 0.15);
          border-radius: 6px;
          background: rgba(221, 185, 119, 0.05);
        }
        /* ─── Mode compact (PiP small) ─────────────────────── */
        .jv-root[data-compact] { padding: 10px 12px 16px; min-height: 100vh; }
        .jv-root[data-compact] .jv-header { padding: 2px 0 8px; }
        .jv-root[data-compact] .jv-brand-name { font-size: 14px; }
        .jv-root[data-compact] .jv-casquette { font-size: 11px; }
        .jv-root[data-compact] .jv-open-cue { font-size: 10px; }
        .jv-root[data-compact] .jv-main { padding-top: 8px; gap: 8px; }
        .jv-root[data-compact] .jv-orb-wrap { padding: 0; }
        .jv-root[data-compact] .jv-status { font-size: 12px; min-height: 16px; }
        .jv-root[data-compact] .jv-exchange {
          height: 36px;                /* 1 ligne de reply */
          overflow: hidden;
        }
        .jv-root[data-compact] .jv-jarvis-reply {
          font-size: 12px; line-height: 1.3;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 240px;
        }
        .jv-root[data-compact] .jv-trader-echo,
        .jv-root[data-compact] .jv-details,
        .jv-root[data-compact] .jv-account,
        .jv-root[data-compact] .jv-text-row,
        .jv-root[data-compact] .jv-link { display: none; }
        .jv-root[data-compact] .jv-pip-row { display: flex; }
        .jv-root[data-compact] .jv-pip-row .jv-link { display: inline-block; font-size: 11px; }
        .jv-root[data-compact] .jv-counter { font-size: 10px; }
        .jv-root[data-compact] .jv-btn-mic {
          width: 160px; height: 36px; font-size: 11px;
        }
      `}</style>
    </div>
  )

  // ─── Stub affiché dans l'onglet pendant que la PiP est active ───
  const stub = (
    <div className="jv-stub-root">
      <div className="jv-stub-inner">
        <span className="jv-stub-logo" aria-hidden />
        <h2 className="jv-stub-title">Jarvis est dans la fenêtre flottante</h2>
        <p className="jv-stub-tip">
          Garde cet onglet ouvert — <strong>le fermer ferme aussi Jarvis</strong>.
        </p>
        <button type="button" className="jv-stub-btn" onClick={closePip}>
          Le ramener ici
        </button>
      </div>
      <style jsx>{`
        .jv-stub-root {
          min-height: 100vh;
          background: #060807; color: #E9EEEA;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-manrope), system-ui, sans-serif;
          padding: 24px;
        }
        .jv-stub-inner {
          max-width: 420px; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
        }
        .jv-stub-logo {
          width: 56px; height: 44px;
          background-color: #C9A46A;
          -webkit-mask-image: url('/logo-atp-symbol.png');
          mask-image: url('/logo-atp-symbol.png');
          -webkit-mask-size: contain; mask-size: contain;
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
          -webkit-mask-position: center; mask-position: center;
        }
        .jv-stub-title {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 18px; font-weight: 500; margin: 0; color: #E9EEEA;
        }
        .jv-stub-tip { font-size: 13px; color: #9FB0A6; margin: 0; line-height: 1.5; }
        .jv-stub-btn {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          padding: 10px 24px; font-size: 13px; font-weight: 600;
          background: linear-gradient(180deg, #E6C487, #C8A75F);
          color: #0B100E; border: none; border-radius: 999px;
          cursor: pointer; letter-spacing: 0.08em;
        }
      `}</style>
    </div>
  )

  if (pipWindow) {
    return (
      <>
        {stub}
        {createPortal(ui, pipWindow.document.body)}
      </>
    )
  }
  return ui
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
  else if (diffMin > 30) casquette = 'MANAGER'
  else if (diffMin > 0) casquette = 'ANALYSTE'
  else if (diffMin > -90) casquette = 'TRADER'
  else casquette = 'COMPTABLE'
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
