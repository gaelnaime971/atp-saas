'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TradeEntry {
  id: number
  time: string
  instrument: string
  direction: 'long' | 'short'
  pnl: number
  r: number
  targetAlerted?: boolean
}

interface CheckItem {
  label: string
  done: boolean
}

interface Level {
  name: string
  val: number | null
  type: 'RES' | 'SUP' | 'VWAP' | 'POV'
}

const INSTRUMENTS = ['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'DAX', 'GC', 'MGC']

const DEFAULT_RULES = [
  { title: 'SL fixe 25 pts ATP', desc: "Défini avant l'entrée. Jamais élargi en cours de trade." },
  { title: 'Risque 1% max', desc: 'Sizing calculé avant. Aucun trade sans calcul préalable.' },
  { title: '3 pertes = pause', desc: '3 stops consécutifs imposent 30 min de pause obligatoire.' },
  { title: 'Pas de revenge trading', desc: 'Une perte ne se récupère pas dans la même session.' },
  { title: 'News = taille réduite', desc: '30 min avant/après toute news HIGH : sizing divisé par 2 ou pause.' },
]

const DEFAULT_CHECKS: CheckItem[] = [
  { label: 'Calendrier éco vérifié', done: false },
  { label: 'Niveaux clés identifiés', done: false },
  { label: 'Sizing calculé', done: false },
  { label: 'Daily loss max défini', done: false },
  { label: 'Mindset stable — pas de stress', done: false },
  { label: 'Plan de session écrit', done: false },
  { label: 'Environnement de travail prêt', done: false },
]

const levelTagClass: Record<string, string> = {
  RES: 'rgba(239,68,68,0.15)',
  SUP: 'rgba(34,197,94,0.15)',
  VWAP: 'rgba(96,165,250,0.15)',
  POV: 'rgba(167,139,250,0.15)',
}
const levelTagColor: Record<string, string> = {
  RES: '#ef4444',
  SUP: '#22c55e',
  VWAP: '#60a5fa',
  POV: '#a78bfa',
}

export default function SessionLive({ onExit }: { onExit: () => void }) {
  // Setup phase
  const [phase, setPhase] = useState<'setup' | 'live' | 'breathe'>('setup')
  const [setupCapital, setSetupCapital] = useState('100000')
  const [setupDailyLoss, setSetupDailyLoss] = useState('500')
  const [setupTarget, setSetupTarget] = useState('300')
  const [setupInstrument, setSetupInstrument] = useState('YM')
  const [setupContext, setSetupContext] = useState('')

  // Session state
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [dailyLoss, setDailyLoss] = useState(500)
  const [target, setTarget] = useState(300)
  const [lastTradeTime, setLastTradeTime] = useState<number | null>(null)
  const [lastTradeElapsed, setLastTradeElapsed] = useState('--:--')
  const [consecutiveLosses, setConsecutiveLosses] = useState(0)

  // Trade input
  const [tiInst, setTiInst] = useState('YM')
  const [tiDir, setTiDir] = useState<'long' | 'short'>('long')
  const [tiPnl, setTiPnl] = useState('')
  const [tiR, setTiR] = useState('')

  // Levels
  const [levels, setLevels] = useState<Level[]>([
    { name: 'Résistance 1', val: null, type: 'RES' },
    { name: 'VWAP', val: null, type: 'VWAP' },
    { name: 'Support 1', val: null, type: 'SUP' },
    { name: 'POV', val: null, type: 'POV' },
  ])
  const [levelInput, setLevelInput] = useState('')
  const [levelType, setLevelType] = useState<'RES' | 'SUP' | 'VWAP' | 'POV'>('RES')

  // Checklist
  const [checks, setChecks] = useState<CheckItem[]>(DEFAULT_CHECKS)

  // Alerts
  const [alerts, setAlerts] = useState<{ id: number; type: 'info' | 'warning' | 'danger'; title: string; msg: string }[]>([])
  const alertIdRef = useRef(0)
  const alertedRef = useRef({ at75: false, at90: false, at3loss: false, targetReached: false })

  // Clock
  const [clock, setClock] = useState('--:--:--')
  const [dateStr, setDateStr] = useState('')

  // Market status
  const [marketStatus, setMarketStatus] = useState<'open' | 'premarket' | 'closed'>('closed')
  const [mktUS, setMktUS] = useState('--')
  const [mktCME, setMktCME] = useState('--')
  const [mktDAX, setMktDAX] = useState('--')
  const [mktLSE, setMktLSE] = useState('--')

  // Breathe
  const [breatheCount, setBreatheCount] = useState(60)
  const [breathePhaseText, setBreathePhaseText] = useState('Inspire... 4 secondes')
  const breatheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const showAlert = useCallback((type: 'info' | 'warning' | 'danger', title: string, msg: string) => {
    const id = ++alertIdRef.current
    setAlerts(prev => [...prev, { id, type, title, msg }])
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), type === 'danger' ? 8000 : 5000)
  }, [])

  // Computed
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const totalR = trades.reduce((s, t) => s + t.r, 0)
  const wins = trades.filter(t => t.pnl > 0).length
  const losses = trades.filter(t => t.pnl < 0).length
  const lossAmount = trades.filter(t => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0)
  const riskPct = Math.min(100, (lossAmount / dailyLoss) * 100)
  const targetPct = Math.max(0, Math.min(100, (totalPnl / target) * 100))
  const planScore = trades.length > 0 ? Math.round((wins / trades.length) * 10) : 0
  const checkedCount = checks.filter(c => c.done).length

  // Timer tick
  useEffect(() => {
    if (phase !== 'live') return
    const interval = setInterval(() => {
      const now = Date.now()
      setElapsed(now - startTime)
      // Clock
      const d = new Date()
      setClock(d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDateStr(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
      // Last trade
      if (lastTradeTime) {
        const lt = Math.floor((now - lastTradeTime) / 1000)
        setLastTradeElapsed(`${String(Math.floor(lt / 60)).padStart(2, '0')}:${String(lt % 60).padStart(2, '0')}`)
      }
      // Market status
      const h = d.getHours()
      const totalMin = h * 60 + d.getMinutes()
      if (totalMin >= 15 * 60 + 30 && totalMin < 22 * 60) {
        setMarketStatus('open'); setMktUS('OUVERT'); setMktCME('OUVERT')
      } else if (totalMin >= 14 * 60 && totalMin < 15 * 60 + 30) {
        setMarketStatus('premarket'); setMktUS('PRE-MARKET'); setMktCME('OUVERT')
      } else {
        setMarketStatus('closed'); setMktUS('FERMÉ'); setMktCME('OUVERT')
      }
      setMktDAX(totalMin >= 9 * 60 && totalMin < 17 * 60 + 30 ? 'OUVERT' : 'FERMÉ')
      setMktLSE(totalMin >= 9 * 60 && totalMin < 17 * 60 + 30 ? 'OUVERT' : 'FERMÉ')
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, startTime, lastTradeTime])

  // Risk alerts
  useEffect(() => {
    if (phase !== 'live') return
    if (riskPct >= 75 && !alertedRef.current.at75) {
      alertedRef.current.at75 = true
      showAlert('warning', '⚠ 75% du daily loss', `Il te reste ${(dailyLoss - lossAmount).toFixed(0)} € avant la limite.`)
    }
    if (riskPct >= 90 && !alertedRef.current.at90) {
      alertedRef.current.at90 = true
      showAlert('danger', '🔴 90% — ATTENTION', 'Tu approches de ton daily loss max.')
    }
    if (totalPnl >= target && trades.length > 0 && !alertedRef.current.targetReached) {
      alertedRef.current.targetReached = true
      showAlert('info', '🎯 Objectif atteint !', `+${totalPnl.toFixed(0)} € — Excellent travail.`)
    }
  }, [riskPct, totalPnl, phase, dailyLoss, lossAmount, target, trades.length, showAlert])

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function handleStart() {
    setDailyLoss(parseFloat(setupDailyLoss) || 500)
    setTarget(parseFloat(setupTarget) || 300)
    setTiInst(setupInstrument)
    setStartTime(Date.now())
    setPhase('live')
    showAlert('info', '⚡ Session lancée', `Bonne session ${setupInstrument} — Reste dans le plan ATP.`)
  }

  function logTrade() {
    const pnl = parseFloat(tiPnl) || 0
    const r = parseFloat(tiR) || 0
    if (pnl === 0 && r === 0) return
    const now = new Date()
    const entry: TradeEntry = {
      id: Date.now(), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      instrument: tiInst, direction: tiDir, pnl, r,
    }
    setTrades(prev => [...prev, entry])
    setLastTradeTime(Date.now())
    setTiPnl('')
    setTiR('')
    if (pnl < 0) {
      const newConsec = consecutiveLosses + 1
      setConsecutiveLosses(newConsec)
      if (newConsec >= 3 && !alertedRef.current.at3loss) {
        alertedRef.current.at3loss = true
        showAlert('danger', '🔴 3 stops consécutifs', 'Règle ATP — Pause obligatoire de 30 minutes.')
      }
    } else {
      setConsecutiveLosses(0)
      alertedRef.current.at3loss = false
    }
  }

  function addLevel() {
    if (!levelInput) return
    const empty = levels.findIndex(l => l.val === null)
    if (empty >= 0) {
      setLevels(prev => prev.map((l, i) => i === empty ? { name: levelType, val: parseFloat(levelInput), type: levelType } : l))
    } else {
      setLevels(prev => [...prev, { name: levelType, val: parseFloat(levelInput), type: levelType }])
    }
    setLevelInput('')
  }

  function toggleCheck(idx: number) {
    setChecks(prev => prev.map((c, i) => i === idx ? { ...c, done: !c.done } : c))
  }

  function startBreathe() {
    setPhase('breathe')
    setBreatheCount(60)
    setBreathePhaseText('Inspire... 4 secondes')
    breatheIntervalRef.current = setInterval(() => {
      setBreatheCount(prev => {
        if (prev <= 1) { stopBreathe(); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function stopBreathe() {
    if (breatheIntervalRef.current) clearInterval(breatheIntervalRef.current)
    setPhase('live')
    showAlert('info', '✅ Pause terminée', 'Tu peux reprendre avec un esprit clair.')
  }

  const mktStatusColor = marketStatus === 'open' ? '#22c55e' : marketStatus === 'premarket' ? '#f59e0b' : '#ef4444'
  const mktStatusLabel = marketStatus === 'open' ? 'MARCHÉ OUVERT' : marketStatus === 'premarket' ? 'PRE-MARKET' : 'HORS SESSION'
  const mktClass = (s: string) => s === 'OUVERT' ? '#22c55e' : s === 'PRE-MARKET' ? '#f59e0b' : '#52525b'

  // ────────────── SETUP OVERLAY ──────────────
  if (phase === 'setup') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(8,12,16,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani', 'Outfit', sans-serif" }}>
        <div style={{ background: '#0d1219', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 40, maxWidth: 520, width: '90%' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', letterSpacing: '0.06em', marginBottom: 6 }}>DÉBUT DE SESSION</div>
          <div style={{ fontSize: 14, color: '#445566', fontFamily: "'JetBrains Mono', monospace", marginBottom: 28 }}>ATP — Configure ta session avant de trader</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Capital du compte (€)', value: setupCapital, set: setSetupCapital, type: 'number' },
              { label: 'Daily loss max (€)', value: setupDailyLoss, set: setSetupDailyLoss, type: 'number' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#445566', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>{f.label}</label>
                <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} style={{ width: '100%', background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#e2e8f4', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none' }} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#445566', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>Instrument principal</label>
              <select value={setupInstrument} onChange={e => setSetupInstrument(e.target.value)} style={{ width: '100%', background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#e2e8f4', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none' }}>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#445566', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>Objectif de session (€)</label>
              <input type="number" value={setupTarget} onChange={e => setSetupTarget(e.target.value)} style={{ width: '100%', background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#e2e8f4', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none' }} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#445566', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>Contexte du jour (optionnel)</label>
            <input type="text" value={setupContext} onChange={e => setSetupContext(e.target.value)} placeholder="ex: Semaine FOMC, range ATH..." style={{ width: '100%', background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#e2e8f4', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={onExit} style={{ flex: 1, padding: 16, background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#8899aa', fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>ANNULER</button>
            <button onClick={handleStart} style={{ flex: 2, padding: 16, background: '#22c55e', border: 'none', borderRadius: 10, color: '#000', fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase' }}>⚡ LANCER LA SESSION</button>
          </div>
        </div>
      </div>
    )
  }

  // ────────────── BREATHE OVERLAY ──────────────
  if (phase === 'breathe') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,12,16,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Rajdhani', sans-serif" }}>
        <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.2), transparent 70%)', border: '1.5px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1.5px solid rgba(34,197,94,0.5)', animation: 'breathe-anim 14s ease-in-out infinite' }} />
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e', letterSpacing: '0.08em' }}>RESPIRE</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#445566', letterSpacing: '0.1em', marginTop: 4 }}>COHÉRENCE CARDIAQUE</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#8899aa', marginTop: 8 }}>{breathePhaseText}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 700, color: '#e2e8f4', marginTop: 24 }}>{breatheCount}</div>
        <button onClick={stopBreathe} style={{ marginTop: 32, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#445566', borderRadius: 6, padding: '8px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: 'pointer', letterSpacing: '0.08em' }}>Terminer</button>
        <style>{`@keyframes breathe-anim { 0%,100% { transform: scale(1); } 29% { transform: scale(1.8); } 57% { transform: scale(1.8); } 100% { transform: scale(1); } }`}</style>
      </div>
    )
  }

  // ────────────── MAIN COCKPIT ──────────────
  const mono = "'JetBrains Mono', monospace"
  const display = "'Rajdhani', 'Outfit', sans-serif"
  const cardStyle: React.CSSProperties = { background: '#0d1219', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18, position: 'relative', overflow: 'hidden' }
  const cardLabelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#445566', fontFamily: mono, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#080c10', fontFamily: display, overflow: 'hidden' }}>
      {/* Scanline */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)', pointerEvents: 'none', zIndex: 10 }} />
      {/* Corners */}
      {['top:12px;left:12px;border-width:1.5px 0 0 1.5px', 'top:12px;right:12px;border-width:1.5px 1.5px 0 0', 'bottom:12px;left:12px;border-width:0 0 1.5px 1.5px', 'bottom:12px;right:12px;border-width:0 1.5px 1.5px 0'].map((s, i) => (
        <div key={i} style={{ position: 'fixed', width: 20, height: 20, borderColor: '#22c55e', borderStyle: 'solid', opacity: 0.4, zIndex: 100, ...Object.fromEntries(s.split(';').map(p => { const [k, v] = p.split(':'); return [k.trim(), v.trim()] })) } as any} />
      ))}

      {/* Alerts */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, width: 320, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {alerts.map(a => {
          const colors = a.type === 'danger' ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', bar: '#ef4444', icon: '🔴' } : a.type === 'warning' ? { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', bar: '#f59e0b', icon: '⚠️' } : { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', bar: '#22c55e', icon: '🟢' }
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.bg, borderLeft: `3px solid ${colors.bar}`, animation: 'slideIn .3s ease' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{colors.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.bar, marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: '#8899aa', lineHeight: 1.4 }}>{a.msg}</div>
              </div>
              <button onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'none', border: 'none', color: '#445566', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 300px', gridTemplateRows: 'auto 1fr', minHeight: '100vh', padding: 20, gap: 16, maxWidth: 1400, margin: '0 auto' }}>

        {/* ── TOPBAR ── */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...cardStyle, padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontFamily: display, fontSize: 20, fontWeight: 700, letterSpacing: '0.08em', color: '#22c55e' }}>α ATP</div>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 99, fontFamily: mono, fontSize: 11, fontWeight: 700, background: `${mktStatusColor}18`, border: `1px solid ${mktStatusColor}40`, color: mktStatusColor }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: mktStatusColor, boxShadow: `0 0 8px ${mktStatusColor}`, animation: marketStatus !== 'closed' ? 'pulseDot 1.5s infinite' : 'none' }} />
              {mktStatusLabel}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {lossAmount >= dailyLoss && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#ef4444', fontFamily: mono, letterSpacing: '0.04em' }}>⛔ DAILY LOSS ATTEINT — STOP</div>
            )}
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: '#e2e8f4', letterSpacing: '0.08em' }}>{clock}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#445566', letterSpacing: '0.08em' }}>{dateStr}</div>
            </div>
          </div>
        </div>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Markets */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Statut des marchés</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { name: 'NYSE / NASDAQ', status: mktUS, hours: '09:30–16:00 ET' },
                { name: 'CME Futures', status: mktCME, hours: '18:00–17:00 ET' },
                { name: 'XETRA (DAX)', status: mktDAX, hours: '09:00–17:30 CET' },
                { name: 'LSE', status: mktLSE, hours: '08:00–16:30 GMT' },
              ].map(m => (
                <div key={m.name} style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: 10 }}>
                  <div style={{ fontSize: 10, color: '#445566', fontFamily: mono, marginBottom: 4 }}>{m.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: mono, color: mktClass(m.status) }}>{m.status}</div>
                  <div style={{ fontSize: 9, color: '#445566', fontFamily: mono, marginTop: 2 }}>{m.hours}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Key levels */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Niveaux clés du jour</div>
            {levels.filter(l => l.val !== null).map((l, i) => (
              <div key={i} onClick={() => setLevels(prev => prev.filter((_, j) => j !== i))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: mono, cursor: 'pointer' }} title="Cliquer pour supprimer">
                <span style={{ fontSize: 10, color: '#445566' }}>{l.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f4' }}>{l.val!.toFixed(2)}</span>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: levelTagClass[l.type], color: levelTagColor[l.type] }}>{l.type}</span>
              </div>
            ))}
            {levels.filter(l => l.val !== null).length === 0 && <div style={{ fontSize: 11, color: '#445566', fontFamily: mono, padding: '8px 0', textAlign: 'center' as const }}>Aucun niveau défini</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input type="number" value={levelInput} onChange={e => setLevelInput(e.target.value)} placeholder="5420.50" step="0.25" style={{ flex: 1, background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', color: '#e2e8f4', fontFamily: mono, fontSize: 12, outline: 'none' }} />
              <select value={levelType} onChange={e => setLevelType(e.target.value as any)} style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f4', fontFamily: mono, fontSize: 11, width: 80, outline: 'none' }}>
                {['RES', 'SUP', 'VWAP', 'POV'].map(t => <option key={t}>{t}</option>)}
              </select>
              <button onClick={addLevel} style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontFamily: display, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>+ Niveau</button>
            </div>
          </div>

          {/* Context */}
          {setupContext && (
            <div style={cardStyle}>
              <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Contexte</div>
              <div style={{ fontSize: 12, color: '#8899aa', fontFamily: mono }}>{setupContext}</div>
            </div>
          )}
        </div>

        {/* ── CENTER COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Risk + P&L */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Cockpit de risque — Session live</div>
            <div style={{ textAlign: 'center' as const, padding: '16px 0 8px' }}>
              <div style={{ fontFamily: mono, fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: totalPnl > 0 ? '#22c55e' : totalPnl < 0 ? '#ef4444' : '#e2e8f4', textShadow: totalPnl !== 0 ? `0 0 30px ${totalPnl > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none' }}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)} €
              </div>
              <div style={{ fontFamily: mono, fontSize: 12, color: '#445566', marginTop: 6 }}>P&L session — {trades.length} trade{trades.length !== 1 ? 's' : ''} · {totalR >= 0 ? '+' : ''}{totalR.toFixed(1)}R cumulé</div>
            </div>

            {/* Daily loss bar */}
            <div style={{ margin: '12px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, color: '#445566', fontFamily: mono }}>Daily loss utilisé</div>
              <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: riskPct >= 90 ? '#ef4444' : riskPct >= 70 ? '#f59e0b' : '#e2e8f4' }}>{lossAmount.toFixed(0)} / {dailyLoss} €</div>
            </div>
            <div style={{ height: 14, background: '#121820', borderRadius: 99, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${riskPct}%`, background: riskPct >= 90 ? '#ef4444' : riskPct >= 70 ? '#f59e0b' : '#22c55e', transition: 'width 0.5s, background 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontFamily: mono, fontSize: 9, color: '#445566' }}>
              <span>0%</span><span style={{ color: '#f59e0b' }}>75% ⚠</span><span style={{ color: '#ef4444' }}>100% ⛔</span>
            </div>

            {/* Target bar */}
            <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, color: '#445566', fontFamily: mono }}>Objectif session</div>
              <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)} / {target} €</div>
            </div>
            <div style={{ height: 14, background: '#121820', borderRadius: 99, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${targetPct}%`, background: '#60a5fa', transition: 'width 0.5s' }} />
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
              {[
                { label: 'Trades', value: String(trades.length), color: '#e2e8f4' },
                { label: 'Win / Loss', value: `${wins}W / ${losses}L`, color: '#e2e8f4' },
                { label: 'R cumulé', value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(1)}R`, color: totalR >= 0 ? '#22c55e' : '#ef4444' },
                { label: 'Plan ATP', value: `${planScore}/10`, color: planScore >= 7 ? '#22c55e' : planScore >= 5 ? '#f59e0b' : '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '10px 12px', textAlign: 'center' as const }}>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: '#445566', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade log */}
          <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Journal de session</div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 80, maxHeight: 200 }}>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: 20, color: '#445566', fontFamily: mono, fontSize: 11 }}>Aucun trade enregistré</div>
              ) : (
                [...trades].reverse().map((t, i) => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '55px 70px 1fr 80px 60px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: mono, fontSize: 11, gap: 8 }}>
                    <span style={{ color: '#445566' }}>{t.time}</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f4' }}>{t.instrument}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, textAlign: 'center' as const, background: t.direction === 'long' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', color: t.direction === 'long' ? '#22c55e' : '#ef4444', width: 'fit-content' }}>{t.direction.toUpperCase()}</span>
                    <span style={{ fontWeight: 700, textAlign: 'right' as const, color: t.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}{t.pnl} €</span>
                    <span style={{ color: '#445566', textAlign: 'right' as const }}>{t.r >= 0 ? '+' : ''}{t.r}R</span>
                  </div>
                ))
              )}
            </div>
            {/* Input */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px 70px', gap: 8, marginTop: 10 }}>
              <select value={tiInst} onChange={e => setTiInst(e.target.value)} style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#e2e8f4', fontFamily: mono, fontSize: 12, outline: 'none' }}>
                {INSTRUMENTS.map(i => <option key={i}>{i}</option>)}
              </select>
              <select value={tiDir} onChange={e => setTiDir(e.target.value as any)} style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#e2e8f4', fontFamily: mono, fontSize: 12, outline: 'none' }}>
                <option value="long">LONG</option>
                <option value="short">SHORT</option>
              </select>
              <input type="number" value={tiPnl} onChange={e => setTiPnl(e.target.value)} placeholder="P&L (€)" style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#e2e8f4', fontFamily: mono, fontSize: 12, outline: 'none' }} onKeyDown={e => e.key === 'Enter' && document.getElementById('ti-r-input')?.focus()} />
              <input id="ti-r-input" type="number" value={tiR} onChange={e => setTiR(e.target.value)} placeholder="R" step="0.1" style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', color: '#e2e8f4', fontFamily: mono, fontSize: 12, outline: 'none' }} onKeyDown={e => e.key === 'Enter' && logTrade()} />
              <button onClick={logTrade} style={{ background: '#22c55e', border: 'none', borderRadius: 6, color: '#000', fontFamily: display, fontSize: 12, fontWeight: 700, padding: 8, cursor: 'pointer', letterSpacing: '0.04em' }}>LOG</button>
            </div>
          </div>

          {/* Timers */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Timers</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: 12, textAlign: 'center' as const }}>
                <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: '#22c55e', letterSpacing: '0.04em', lineHeight: 1, marginBottom: 4 }}>{formatTime(elapsed)}</div>
                <div style={{ fontSize: 9, color: '#445566', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Durée session</div>
              </div>
              <div style={{ background: '#121820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: 12, textAlign: 'center' as const }}>
                <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: lastTradeTime && (Date.now() - lastTradeTime) > 1800000 ? '#f59e0b' : '#e2e8f4', letterSpacing: '0.04em', lineHeight: 1, marginBottom: 4 }}>{lastTradeElapsed}</div>
                <div style={{ fontSize: 9, color: '#445566', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Depuis dernier trade</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Rules */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Règles ATP — Toujours actives</div>
            {DEFAULT_RULES.map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < DEFAULT_RULES.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ width: 22, height: 22, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 10, fontWeight: 700, color: '#22c55e', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.4 }}><strong style={{ color: '#e2e8f4', fontWeight: 600 }}>{rule.title}</strong> — {rule.desc}</div>
              </div>
            ))}
          </div>

          {/* Checklist */}
          <div style={cardStyle}>
            <div style={cardLabelStyle}><span style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 6px #22c55e' }} />Checklist pré-session</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 4, background: '#121820', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#22c55e', borderRadius: 99, width: `${(checkedCount / checks.length) * 100}%`, transition: 'width 0.3s', boxShadow: '0 0 8px rgba(34,197,94,0.4)' }} />
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#445566', whiteSpace: 'nowrap' as const }}>{checkedCount}/{checks.length}</div>
            </div>
            {checks.map((c, i) => (
              <div key={i} onClick={() => toggleCheck(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < checks.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', cursor: 'pointer', userSelect: 'none' as const }}>
                <div style={{ width: 18, height: 18, border: `1.5px solid ${c.done ? '#22c55e' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.done ? '#22c55e' : 'transparent', boxShadow: c.done ? '0 0 8px rgba(34,197,94,0.3)' : 'none', flexShrink: 0, transition: 'all 0.15s' }}>
                  {c.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 12, color: c.done ? '#445566' : '#8899aa', textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <button onClick={startBreathe} style={{ width: '100%', padding: 14, background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(96,165,250,0.08))', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, color: '#e2e8f4', fontFamily: display, fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            RESPIRE — Pause mentale
          </button>

          <button onClick={onExit} style={{ width: '100%', padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#ef4444', fontFamily: display, fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase' as const }}>
            FIN DE SESSION
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulseDot { 0%,100% { opacity:1;transform:scale(1) } 50% { opacity:0.5;transform:scale(0.85) } }
        @keyframes slideIn { from { transform:translateX(100%);opacity:0 } to { transform:translateX(0);opacity:1 } }
      `}</style>
    </div>
  )
}
