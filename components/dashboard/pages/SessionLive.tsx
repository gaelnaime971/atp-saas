'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TradeEntry {
  id: number
  time: string
  instrument: string
  direction: 'long' | 'short'
  pnl: number
  r: number
}

interface CheckItem { label: string; done: boolean }

interface Level { name: string; val: number | null; type: 'RES' | 'SUP' | 'VWAP' | 'POV' }


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

const levelTagBg: Record<string, string> = { RES: 'rgba(239,68,68,0.15)', SUP: 'rgba(34,197,94,0.15)', VWAP: 'rgba(96,165,250,0.15)', POV: 'rgba(167,139,250,0.15)' }
const levelTagColor: Record<string, string> = { RES: '#ef4444', SUP: '#22c55e', VWAP: '#60a5fa', POV: '#a78bfa' }

// Colors
const BG = '#09090b'
const BG2 = '#111113'
const BG3 = '#18181b'
const BORDER = 'rgba(255,255,255,0.07)'
const TEXT = '#f0f0f3'
const TEXT2 = '#a1a1aa'
const TEXT3 = '#52525b'
const GREEN = '#22c55e'

export default function SessionLive({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<'setup' | 'live' | 'breathe'>('setup')
  const [setupCapital, setSetupCapital] = useState('100000')
  const [setupDailyLoss, setSetupDailyLoss] = useState(500)
  const [setupTarget, setSetupTarget] = useState(300)
  const [setupInstrument, setSetupInstrument] = useState('YM')
  const [setupContext, setSetupContext] = useState('')

  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [dailyLoss, setDailyLoss] = useState(500)
  const [target, setTarget] = useState(300)
  const [lastTradeTime, setLastTradeTime] = useState<number | null>(null)
  const [lastTradeElapsed, setLastTradeElapsed] = useState('--:--')
  const [consecutiveLosses, setConsecutiveLosses] = useState(0)

  const [tiInst, setTiInst] = useState('YM')
  const [tiDir, setTiDir] = useState<'long' | 'short'>('long')
  const [tiPnl, setTiPnl] = useState('')
  const [tiR, setTiR] = useState('')

  // Mental & notes
  const [mentalScore, setMentalScore] = useState(7)
  const [sessionNote, setSessionNote] = useState('')

  const [levels, setLevels] = useState<Level[]>([])
  const [levelInput, setLevelInput] = useState('')
  const [levelType, setLevelType] = useState<'RES' | 'SUP' | 'VWAP' | 'POV'>('RES')

  const [checks, setChecks] = useState<CheckItem[]>(DEFAULT_CHECKS)

  const [alerts, setAlerts] = useState<{ id: number; type: 'info' | 'warning' | 'danger'; title: string; msg: string }[]>([])
  const alertIdRef = useRef(0)
  const alertedRef = useRef({ at75: false, at90: false, at3loss: false, targetReached: false })

  const [clock, setClock] = useState('--:--:--')
  const [dateStr, setDateStr] = useState('')
  const [marketStatus, setMarketStatus] = useState<'open' | 'premarket' | 'closed'>('closed')
  const [mktUS, setMktUS] = useState('--')
  const [mktCME, setMktCME] = useState('--')
  const [mktDAX, setMktDAX] = useState('--')
  const [mktLSE, setMktLSE] = useState('--')

  // Breathe
  const [breatheCount, setBreatheCount] = useState(60)
  const [breathePhase, setBreathePhase] = useState('Inspire...')
  const breatheTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const breathePhaseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showAlert = useCallback((type: 'info' | 'warning' | 'danger', title: string, msg: string) => {
    const id = ++alertIdRef.current
    setAlerts(prev => [...prev, { id, type, title, msg }])
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), type === 'danger' ? 8000 : 5000)
  }, [])

  // Eco calendar widget ref
  const ecoWidgetRef = useRef<HTMLDivElement>(null)
  const ecoWidgetLoaded = useRef(false)

  useEffect(() => {
    if (phase !== 'live' || ecoWidgetLoaded.current || !ecoWidgetRef.current) return
    ecoWidgetLoaded.current = true
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: 'fr',
      importanceFilter: '-1,0,1',
      countryFilter: 'us,eu,fr,de,gb',
    })
    ecoWidgetRef.current.appendChild(script)
  }, [phase])

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const totalR = trades.reduce((s, t) => s + t.r, 0)
  const wins = trades.filter(t => t.pnl > 0).length
  const losses = trades.filter(t => t.pnl < 0).length
  const lossAmount = trades.filter(t => t.pnl < 0).reduce((s, t) => s + Math.abs(t.pnl), 0)
  const riskPct = dailyLoss > 0 ? Math.min(100, (lossAmount / dailyLoss) * 100) : 0
  const targetPct = target > 0 ? Math.max(0, Math.min(100, (totalPnl / target) * 100)) : 0
  const planScore = trades.length > 0 ? Math.round((wins / trades.length) * 10) : 0
  const checkedCount = checks.filter(c => c.done).length

  // Timer
  useEffect(() => {
    if (phase !== 'live') return
    const interval = setInterval(() => {
      const now = Date.now()
      setElapsed(now - startTime)
      const d = new Date()
      setClock(d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDateStr(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))
      if (lastTradeTime) {
        const lt = Math.floor((now - lastTradeTime) / 1000)
        setLastTradeElapsed(`${String(Math.floor(lt / 60)).padStart(2, '0')}:${String(lt % 60).padStart(2, '0')}`)
      }
      const totalMin = d.getHours() * 60 + d.getMinutes()
      if (totalMin >= 15 * 60 + 30 && totalMin < 22 * 60) { setMarketStatus('open'); setMktUS('OUVERT'); setMktCME('OUVERT') }
      else if (totalMin >= 14 * 60 && totalMin < 15 * 60 + 30) { setMarketStatus('premarket'); setMktUS('PRE-MARKET'); setMktCME('OUVERT') }
      else { setMarketStatus('closed'); setMktUS('FERMÉ'); setMktCME('OUVERT') }
      setMktDAX(totalMin >= 9 * 60 && totalMin < 17 * 60 + 30 ? 'OUVERT' : 'FERMÉ')
      setMktLSE(totalMin >= 9 * 60 && totalMin < 17 * 60 + 30 ? 'OUVERT' : 'FERMÉ')
    }, 1000)
    return () => clearInterval(interval)
  }, [phase, startTime, lastTradeTime])

  useEffect(() => {
    if (phase !== 'live') return
    if (riskPct >= 75 && !alertedRef.current.at75) { alertedRef.current.at75 = true; showAlert('warning', '75% du daily loss', `Il te reste ${(dailyLoss - lossAmount).toFixed(0)} € avant la limite.`) }
    if (riskPct >= 90 && !alertedRef.current.at90) { alertedRef.current.at90 = true; showAlert('danger', '90% — ATTENTION', 'Tu approches de ton daily loss max.') }
    if (totalPnl >= target && trades.length > 0 && !alertedRef.current.targetReached) { alertedRef.current.targetReached = true; showAlert('info', 'Objectif atteint !', `+${totalPnl.toFixed(0)} € — Excellent travail.`) }
  }, [riskPct, totalPnl, phase])

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  function handleStart() {
    setDailyLoss(setupDailyLoss)
    setTarget(setupTarget)
    setTiInst(setupInstrument)
    setStartTime(Date.now())
    setPhase('live')
    showAlert('info', 'Session lancée', `Bonne session ${setupInstrument} — Reste dans le plan ATP.`)
  }

  function logTrade() {
    const pnl = parseFloat(tiPnl) || 0
    const r = parseFloat(tiR) || 0
    if (pnl === 0 && r === 0) return
    const now = new Date()
    setTrades(prev => [...prev, { id: Date.now(), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, instrument: tiInst, direction: tiDir, pnl, r }])
    setLastTradeTime(Date.now())
    setTiPnl(''); setTiR('')
    if (pnl < 0) {
      const c = consecutiveLosses + 1; setConsecutiveLosses(c)
      if (c >= 3 && !alertedRef.current.at3loss) { alertedRef.current.at3loss = true; showAlert('danger', '3 stops consécutifs', 'Pause obligatoire de 30 minutes.') }
    } else { setConsecutiveLosses(0); alertedRef.current.at3loss = false }
  }

  function addLevel() {
    if (!levelInput) return
    setLevels(prev => [...prev, { name: levelType, val: parseFloat(levelInput), type: levelType }])
    setLevelInput('')
  }

  function startBreathe() {
    setPhase('breathe')
    setBreatheCount(60)
    setBreathePhase('Inspire... 4s')
    breatheTimerRef.current = setInterval(() => {
      setBreatheCount(prev => { if (prev <= 1) { stopBreathe(); return 0 }; return prev - 1 })
    }, 1000)
    runBreathePhase()
  }

  function runBreathePhase() {
    setBreathePhase('Inspire... 4s')
    breathePhaseRef.current = setTimeout(() => {
      setBreathePhase('Retiens... 4s')
      breathePhaseRef.current = setTimeout(() => {
        setBreathePhase('Expire... 6s')
        breathePhaseRef.current = setTimeout(() => runBreathePhase(), 6000)
      }, 4000)
    }, 4000)
  }

  function stopBreathe() {
    if (breatheTimerRef.current) clearInterval(breatheTimerRef.current)
    if (breathePhaseRef.current) clearTimeout(breathePhaseRef.current)
    setPhase('live')
    showAlert('info', 'Pause terminée', 'Tu peux reprendre avec un esprit clair.')
  }

  const mktStatusColor = marketStatus === 'open' ? GREEN : marketStatus === 'premarket' ? '#f59e0b' : '#ef4444'
  const mktStatusLabel = marketStatus === 'open' ? 'MARCHÉ OUVERT' : marketStatus === 'premarket' ? 'PRE-MARKET' : 'HORS SESSION'
  const mktColor = (s: string) => s === 'OUVERT' ? GREEN : s === 'PRE-MARKET' ? '#f59e0b' : TEXT3

  const mono = "'JetBrains Mono', monospace"
  const disp = "'Rajdhani', 'Outfit', sans-serif"
  const cardS: React.CSSProperties = { background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18, position: 'relative' }
  const cardLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: TEXT3, fontFamily: mono, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }
  const dot = <span style={{ width: 4, height: 4, background: GREEN, borderRadius: '50%', boxShadow: `0 0 6px ${GREEN}` }} />
  const inputS: React.CSSProperties = { width: '100%', background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', color: TEXT, fontFamily: mono, fontSize: 13, outline: 'none' }

  // ── SETUP ──
  if (phase === 'setup') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.98)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: disp }}>
        <div style={{ background: BG2, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 16, padding: 40, maxWidth: 540, width: '90%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <img src="/logo-atp.png" alt="ATP" style={{ height: 28 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontSize: 28, fontWeight: 700, color: GREEN, letterSpacing: '0.06em' }}>SESSION LIVE</span>
          </div>
          <div style={{ fontSize: 14, color: TEXT3, fontFamily: mono, marginBottom: 28 }}>Configure ta session avant de trader</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT3, fontFamily: mono, marginBottom: 6 }}>Capital (€)</label>
              <input type="number" value={setupCapital} onChange={e => setSetupCapital(e.target.value)} style={inputS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT3, fontFamily: mono, marginBottom: 6 }}>Instrument</label>
              <select value={setupInstrument} onChange={e => setSetupInstrument(e.target.value)} style={inputS}>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          {/* Sliders */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT3, fontFamily: mono }}>Perte max du jour</label>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{setupDailyLoss} €</span>
            </div>
            <input type="range" min={0} max={1000} step={25} value={setupDailyLoss} onChange={e => setSetupDailyLoss(Number(e.target.value))} style={{ width: '100%', accentColor: '#ef4444' }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT3, fontFamily: mono }}>Objectif du jour</label>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: GREEN }}>{setupTarget} €</span>
            </div>
            <input type="range" min={0} max={1000} step={25} value={setupTarget} onChange={e => setSetupTarget(Number(e.target.value))} style={{ width: '100%', accentColor: GREEN }} />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT3, fontFamily: mono, marginBottom: 6 }}>Contexte du jour (optionnel)</label>
            <input type="text" value={setupContext} onChange={e => setSetupContext(e.target.value)} placeholder="ex: Semaine FOMC, range ATH..." style={inputS} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button onClick={onExit} style={{ flex: 1, padding: 16, background: BG3, border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT2, fontFamily: disp, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>ANNULER</button>
            <button onClick={handleStart} style={{ flex: 2, padding: 16, background: GREEN, border: 'none', borderRadius: 10, color: '#000', fontFamily: disp, fontSize: 18, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase' }}>LANCER LA SESSION</button>
          </div>
        </div>
      </div>
    )
  }

  // ── BREATHE ──
  if (phase === 'breathe') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: disp }}>
        <div style={{ width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, rgba(34,197,94,0.2), transparent 70%)`, border: `1.5px solid rgba(34,197,94,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1.5px solid rgba(34,197,94,0.5)', animation: 'breatheAnim 14s ease-in-out infinite' }} />
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, letterSpacing: '0.08em' }}>RESPIRE</div>
        <div style={{ fontFamily: mono, fontSize: 12, color: TEXT3, letterSpacing: '0.1em', marginTop: 4 }}>COHÉRENCE CARDIAQUE</div>
        <div style={{ fontFamily: mono, fontSize: 14, color: TEXT2, marginTop: 8 }}>{breathePhase}</div>
        <div style={{ fontFamily: mono, fontSize: 48, fontWeight: 700, color: TEXT, marginTop: 24 }}>{breatheCount}</div>
        <button onClick={stopBreathe} style={{ marginTop: 32, background: 'none', border: `1px solid ${BORDER}`, color: TEXT3, borderRadius: 6, padding: '8px 20px', fontFamily: mono, fontSize: 11, cursor: 'pointer' }}>Terminer</button>
        <style>{`@keyframes breatheAnim { 0%,100% { transform:scale(1) } 29% { transform:scale(1.8) } 57% { transform:scale(1.8) } }`}</style>
      </div>
    )
  }

  // ── MAIN COCKPIT ──
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: BG, fontFamily: disp, overflow: 'hidden' }}>
      {/* Scanline */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)', pointerEvents: 'none', zIndex: 10 }} />

      {/* Alerts */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, width: 320, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {alerts.map(a => {
          const c = a.type === 'danger' ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', bar: '#ef4444', icon: '🔴' } : a.type === 'warning' ? { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', bar: '#f59e0b', icon: '⚠️' } : { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', bar: GREEN, icon: '🟢' }
          return (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg, borderLeft: `3px solid ${c.bar}`, animation: 'slideIn .3s ease' }}>
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.bar, marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: TEXT2, lineHeight: 1.4 }}>{a.msg}</div>
              </div>
              <button onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))} style={{ background: 'none', border: 'none', color: TEXT3, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 300px', gridTemplateRows: 'auto 1fr', height: '100vh', padding: 16, gap: 12, maxWidth: 1600, margin: '0 auto' }}>

        {/* ── TOPBAR ── */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...cardS, padding: '10px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo-atp.png" alt="ATP" style={{ height: 24 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div style={{ width: 1, height: 24, background: BORDER }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 99, fontFamily: mono, fontSize: 10, fontWeight: 700, background: `${mktStatusColor}15`, border: `1px solid ${mktStatusColor}35`, color: mktStatusColor }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: mktStatusColor, boxShadow: `0 0 8px ${mktStatusColor}`, animation: marketStatus !== 'closed' ? 'pulseDot 1.5s infinite' : 'none' }} />
              {mktStatusLabel}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lossAmount >= dailyLoss && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#ef4444', fontFamily: mono }}>DAILY LOSS ATTEINT — STOP</div>}
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '0.08em' }}>{clock}</div>
              <div style={{ fontFamily: mono, fontSize: 9, color: TEXT3 }}>{dateStr}</div>
            </div>
          </div>
        </div>

        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Markets */}
          <div style={cardS}>
            <div style={cardLabel}>{dot}Marchés</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[{ name: 'NYSE', status: mktUS, h: '09:30–16:00' }, { name: 'CME', status: mktCME, h: '18:00–17:00' }, { name: 'DAX', status: mktDAX, h: '09:00–17:30' }, { name: 'LSE', status: mktLSE, h: '08:00–16:30' }].map(m => (
                <div key={m.name} style={{ background: BG3, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 8 }}>
                  <div style={{ fontSize: 9, color: TEXT3, fontFamily: mono }}>{m.name}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, fontFamily: mono, color: mktColor(m.status) }}>{m.status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Eco calendar - TradingView widget */}
          <div style={{ ...cardS, flex: 1, minHeight: 300, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={cardLabel}>{dot}Calendrier éco</div>
            <div ref={ecoWidgetRef} className="tradingview-widget-container" style={{ flex: 1, overflow: 'hidden', borderRadius: 6 }}>
              <div className="tradingview-widget-container__widget" style={{ height: '100%' }} />
            </div>
          </div>

          {/* Levels */}
          <div style={cardS}>
            <div style={cardLabel}>{dot}Niveaux clés</div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {levels.length === 0 && <div style={{ fontSize: 10, color: TEXT3, fontFamily: mono, textAlign: 'center' as const, padding: 8 }}>Aucun niveau</div>}
              {levels.map((l, i) => (
                <div key={i} onClick={() => setLevels(prev => prev.filter((_, j) => j !== i))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, fontFamily: mono, cursor: 'pointer' }}>
                  <span style={{ fontSize: 9, color: TEXT3 }}>{l.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{l.val?.toFixed(2)}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: levelTagBg[l.type], color: levelTagColor[l.type] }}>{l.type}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <input type="number" value={levelInput} onChange={e => setLevelInput(e.target.value)} placeholder="5420" step="0.25" style={{ flex: 1, background: BG3, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '5px 8px', color: TEXT, fontFamily: mono, fontSize: 11, outline: 'none', minWidth: 0 }} />
              <select value={levelType} onChange={e => setLevelType(e.target.value as any)} style={{ background: BG3, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '5px 4px', color: TEXT, fontFamily: mono, fontSize: 10, outline: 'none', width: 58 }}>
                {['RES', 'SUP', 'VWAP', 'POV'].map(t => <option key={t}>{t}</option>)}
              </select>
              <button onClick={addLevel} style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}35`, color: GREEN, borderRadius: 5, padding: '5px 8px', fontSize: 10, fontFamily: disp, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>+</button>
            </div>
          </div>

          {setupContext && <div style={cardS}><div style={cardLabel}>{dot}Contexte</div><div style={{ fontSize: 11, color: TEXT2, fontFamily: mono }}>{setupContext}</div></div>}
        </div>

        {/* ── CENTER ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {/* P&L + Bars */}
          <div style={cardS}>
            <div style={cardLabel}>{dot}Cockpit de risque</div>
            <div style={{ textAlign: 'center' as const, padding: '8px 0 4px' }}>
              <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 700, lineHeight: 1, color: totalPnl > 0 ? GREEN : totalPnl < 0 ? '#ef4444' : TEXT, textShadow: totalPnl !== 0 ? `0 0 30px ${totalPnl > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none' }}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)} €
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: TEXT3, marginTop: 3 }}>{trades.length} trades · {totalR >= 0 ? '+' : ''}{totalR.toFixed(1)}R cumulé</div>
            </div>
            {/* Daily loss */}
            <div style={{ margin: '8px 0 3px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: TEXT3, fontFamily: mono }}>Daily loss</span>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: riskPct >= 90 ? '#ef4444' : TEXT }}>{lossAmount.toFixed(0)} / {dailyLoss} €</span>
            </div>
            <div style={{ height: 8, background: BG3, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${riskPct}%`, background: riskPct >= 90 ? '#ef4444' : riskPct >= 70 ? '#f59e0b' : GREEN, transition: 'width 0.5s' }} />
            </div>
            {/* Target */}
            <div style={{ margin: '6px 0 3px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: TEXT3, fontFamily: mono }}>Objectif</span>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: GREEN }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)} / {target} €</span>
            </div>
            <div style={{ height: 8, background: BG3, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${targetPct}%`, background: '#60a5fa', transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Stats grid — 2 rows */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { l: 'Trades', v: String(trades.length), c: TEXT },
              { l: 'W / L', v: `${wins}W/${losses}L`, c: TEXT },
              { l: 'R cumulé', v: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(1)}R`, c: totalR >= 0 ? GREEN : '#ef4444' },
              { l: 'Plan', v: `${planScore}/10`, c: planScore >= 7 ? GREEN : planScore >= 5 ? '#f59e0b' : '#ef4444' },
              { l: 'Best', v: trades.length > 0 ? `+${Math.max(...trades.map(t => t.pnl)).toFixed(0)}€` : '—', c: GREEN },
              { l: 'Worst', v: trades.length > 0 ? `${Math.min(...trades.map(t => t.pnl)).toFixed(0)}€` : '—', c: '#ef4444' },
              { l: 'Avg', v: trades.length > 0 ? `${(totalPnl / trades.length).toFixed(0)}€` : '—', c: totalPnl >= 0 ? GREEN : '#ef4444' },
              { l: 'Win%', v: trades.length > 0 ? `${Math.round((wins / trades.length) * 100)}%` : '—', c: wins > losses ? GREEN : '#ef4444' },
            ].map(s => (
              <div key={s.l} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 6px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 9, color: TEXT3, fontFamily: mono, textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.06em' }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* P&L curve */}
          {trades.length > 1 && (
            <div style={{ ...cardS, padding: '12px 18px' }}>
              <div style={cardLabel}>{dot}Courbe P&L session</div>
              <svg viewBox="0 0 400 100" style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
                {(() => {
                  const cum: number[] = [0]; let acc = 0
                  trades.forEach(t => { acc += t.pnl; cum.push(acc) })
                  const minV = Math.min(...cum)
                  const maxV = Math.max(...cum)
                  const range = Math.max(maxV - minV, 1)
                  const points = cum.map((v, i) => {
                    const x = (i / (cum.length - 1)) * 400
                    const y = 95 - ((v - minV) / range) * 90
                    return `${x},${y}`
                  })
                  const line = points.join(' ')
                  const lastVal = cum[cum.length - 1]
                  const color = lastVal >= 0 ? GREEN : '#ef4444'
                  const areaPath = `M0,95 L${points.map((p, i) => i === 0 ? p.split(',')[0] + ',' + p.split(',')[1] : p).join(' L')} L400,95 Z`
                  return (
                    <>
                      {/* Zero line */}
                      <line x1="0" y1={95 - ((0 - minV) / range) * 90} x2="400" y2={95 - ((0 - minV) / range) * 90} stroke={TEXT3} strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3" />
                      {/* Area fill */}
                      <path d={areaPath} fill={`${color}15`} />
                      {/* Line */}
                      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      {/* Dots */}
                      {points.map((p, i) => {
                        const [x, y] = p.split(',')
                        return <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 4 : 2.5} fill={cum[i] >= 0 ? GREEN : '#ef4444'} stroke={BG2} strokeWidth="1" />
                      })}
                    </>
                  )
                })()}
              </svg>
            </div>
          )}

          {/* Mental score */}
          <div style={{ ...cardS, padding: '10px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={cardLabel}>{dot}État mental</div>
              <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: mentalScore >= 7 ? GREEN : mentalScore >= 4 ? '#f59e0b' : '#ef4444' }}>
                {mentalScore >= 8 ? 'ZEN' : mentalScore >= 6 ? 'FOCUS' : mentalScore >= 4 ? 'TENDU' : 'TILT'}
              </span>
            </div>
            <input type="range" min={1} max={10} value={mentalScore} onChange={e => setMentalScore(Number(e.target.value))} style={{ width: '100%', accentColor: mentalScore >= 7 ? GREEN : mentalScore >= 4 ? '#f59e0b' : '#ef4444' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontFamily: mono, color: TEXT3, marginTop: 2 }}><span>TILT</span><span>ZEN</span></div>
          </div>

          {/* Trade log + input */}
          <div style={{ ...cardS, display: 'flex', flexDirection: 'column' }}>
            <div style={cardLabel}>{dot}Journal de session</div>
            <div style={{ overflowY: 'auto', maxHeight: 120, minHeight: 30 }}>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: 10, color: TEXT3, fontFamily: mono, fontSize: 10 }}>Aucun trade</div>
              ) : [...trades].reverse().map(t => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '42px 45px auto 65px 45px', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${BORDER}`, fontFamily: mono, fontSize: 10, gap: 4 }}>
                  <span style={{ color: TEXT3 }}>{t.time}</span>
                  <span style={{ fontWeight: 700, color: TEXT }}>{t.instrument}</span>
                  <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: t.direction === 'long' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', color: t.direction === 'long' ? GREEN : '#ef4444', width: 'fit-content' }}>{t.direction.toUpperCase()}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' as const, color: t.pnl >= 0 ? GREEN : '#ef4444' }}>{t.pnl >= 0 ? '+' : ''}{t.pnl}€</span>
                  <span style={{ color: TEXT3, textAlign: 'right' as const }}>{t.r >= 0 ? '+' : ''}{t.r}R</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px 50px', gap: 5, marginTop: 6 }}>
              <select value={tiInst} onChange={e => setTiInst(e.target.value)} style={{ ...inputS, padding: '6px 6px', fontSize: 10 }}>{INSTRUMENTS.map(i => <option key={i}>{i}</option>)}</select>
              <select value={tiDir} onChange={e => setTiDir(e.target.value as any)} style={{ ...inputS, padding: '6px 6px', fontSize: 10 }}><option value="long">LONG</option><option value="short">SHORT</option></select>
              <input type="number" value={tiPnl} onChange={e => setTiPnl(e.target.value)} placeholder="P&L €" style={{ ...inputS, padding: '6px 6px', fontSize: 10 }} onKeyDown={e => e.key === 'Enter' && document.getElementById('slr')?.focus()} />
              <input id="slr" type="number" value={tiR} onChange={e => setTiR(e.target.value)} placeholder="R" step="0.1" style={{ ...inputS, padding: '6px 6px', fontSize: 10 }} onKeyDown={e => e.key === 'Enter' && logTrade()} />
              <button onClick={logTrade} style={{ background: GREEN, border: 'none', borderRadius: 6, color: '#000', fontFamily: disp, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>LOG</button>
            </div>
          </div>

          {/* Timers + Note */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
            <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, textAlign: 'center' as const }}>
              <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: GREEN, letterSpacing: '0.04em' }}>{formatTime(elapsed)}</div>
              <div style={{ fontSize: 9, color: TEXT3, fontFamily: mono, textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.08em' }}>Session</div>
            </div>
            <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, textAlign: 'center' as const }}>
              <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: lastTradeTime && (Date.now() - lastTradeTime) > 1800000 ? '#f59e0b' : TEXT, letterSpacing: '0.04em' }}>{lastTradeElapsed}</div>
              <div style={{ fontSize: 9, color: TEXT3, fontFamily: mono, textTransform: 'uppercase', marginTop: 4, letterSpacing: '0.08em' }}>Dernier trade</div>
            </div>
            <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 9, color: TEXT3, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Note de session</div>
              <textarea value={sessionNote} onChange={e => setSessionNote(e.target.value)} placeholder="Observations, erreurs, ajustements..." style={{ flex: 1, background: 'transparent', border: 'none', color: TEXT2, fontFamily: mono, fontSize: 12, outline: 'none', resize: 'none', lineHeight: 1.5, minHeight: 40 }} />
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={startBreathe} style={{ padding: 14, background: `linear-gradient(135deg, ${GREEN}15, rgba(96,165,250,0.08))`, border: `1px solid ${GREEN}35`, borderRadius: 10, color: TEXT, fontFamily: disp, fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              RESPIRE
            </button>
            <button onClick={onExit} style={{ padding: 14, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#ef4444', fontFamily: disp, fontSize: 14, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' as const }}>
              FIN DE SESSION
            </button>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Rules */}
          <div style={{ ...cardS, flex: 1 }}>
            <div style={{ ...cardLabel, fontSize: 10, marginBottom: 16 }}>{dot}Règles ATP — Toujours actives</div>
            {DEFAULT_RULES.map((rule, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < DEFAULT_RULES.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ width: 26, height: 26, background: `${GREEN}12`, border: `1px solid ${GREEN}35`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 11, fontWeight: 700, color: GREEN, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: TEXT2, lineHeight: 1.5 }}><strong style={{ color: TEXT, fontWeight: 600 }}>{rule.title}</strong> — {rule.desc}</div>
              </div>
            ))}
          </div>

          {/* Checklist */}
          <div style={{ ...cardS, flex: 1 }}>
            <div style={{ ...cardLabel, fontSize: 10, marginBottom: 12 }}>{dot}Checklist pré-session</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 5, background: BG3, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: GREEN, borderRadius: 99, width: `${(checkedCount / checks.length) * 100}%`, transition: 'width 0.3s', boxShadow: checkedCount === checks.length ? `0 0 10px ${GREEN}60` : 'none' }} />
              </div>
              <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: checkedCount === checks.length ? GREEN : TEXT3 }}>{checkedCount}/{checks.length}</span>
            </div>
            {checks.map((c, i) => (
              <div key={i} onClick={() => setChecks(prev => prev.map((x, j) => j === i ? { ...x, done: !x.done } : x))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < checks.length - 1 ? `1px solid ${BORDER}` : 'none', cursor: 'pointer', userSelect: 'none' as const }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${c.done ? GREEN : 'rgba(255,255,255,0.12)'}`, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.done ? GREEN : 'transparent', flexShrink: 0, transition: 'all 0.15s', boxShadow: c.done ? `0 0 8px ${GREEN}40` : 'none' }}>
                  {c.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 13, color: c.done ? TEXT3 : TEXT, textDecoration: c.done ? 'line-through' : 'none', fontWeight: c.done ? 400 : 500 }}>{c.label}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulseDot { 0%,100% { opacity:1;transform:scale(1) } 50% { opacity:0.5;transform:scale(0.85) } }
        @keyframes slideIn { from { transform:translateX(100%);opacity:0 } to { transform:translateX(0);opacity:1 } }
      `}</style>
    </div>
  )
}
