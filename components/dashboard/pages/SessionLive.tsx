'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TradeEntry {
  id: number
  pnl: number
  note: string
  time: string
}

const DEFAULT_RULES = [
  "Max 3 trades par jour",
  "Stop loss = 1R maximum",
  "Pas de revenge trading",
  "Attendre la confirmation",
  "Respecter le plan ATP",
]

export default function SessionLive({ onExit }: { onExit: () => void }) {
  const [startTime] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [trades, setTrades] = useState<TradeEntry[]>([])
  const [mentalScore, setMentalScore] = useState(8)
  const [tradePnl, setTradePnl] = useState('')
  const [tradeNote, setTradeNote] = useState('')
  const [alert, setAlert] = useState<{ message: string; type: 'info' | 'warning' | 'danger' } | null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [maxLoss, setMaxLoss] = useState(-200)
  const [maxTrades, setMaxTrades] = useState(3)
  const [pauseReminder, setPauseReminder] = useState(30) // minutes
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pre-market data
  const [bias, setBias] = useState('')
  const [support, setSupport] = useState('')
  const [resistance, setResistance] = useState('')
  const [pivot, setPivot] = useState('')

  useEffect(() => {
    try {
      const key = `premarket_${new Date().toISOString().split('T')[0]}`
      const stored = localStorage.getItem(key)
      if (stored) {
        const data = JSON.parse(stored)
        setBias(data.bias ?? '')
        setSupport(data.support ?? '')
        setResistance(data.resistance ?? '')
        setPivot(data.pivot ?? '')
      }
    } catch {}
  }, [])

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(interval)
  }, [startTime])

  // Periodic alerts
  useEffect(() => {
    const interval = setInterval(() => {
      const mins = Math.floor((Date.now() - startTime) / 60000)
      if (mins > 0 && mins % pauseReminder === 0) {
        showAlert('Fais une pause de 5 minutes. Respire.', 'info')
      }
      if (mins > 0 && mins % 15 === 0 && mins % pauseReminder !== 0) {
        showAlert('Respectes-tu ton plan ?', 'info')
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [startTime, pauseReminder])

  const showAlert = useCallback((message: string, type: 'info' | 'warning' | 'danger') => {
    setAlert({ message, type })
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
    alertTimeoutRef.current = setTimeout(() => setAlert(null), 6000)
  }, [])

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)

  // Check limits after trades change
  useEffect(() => {
    if (trades.length > 0 && totalPnl <= maxLoss) {
      showAlert('STOP — Limite de perte atteinte !', 'danger')
    }
    if (trades.length >= maxTrades) {
      showAlert(`Max trades atteint (${maxTrades}). Arrête-toi.`, 'warning')
    }
  }, [trades.length, totalPnl, maxLoss, maxTrades, showAlert])

  function addTrade() {
    if (!tradePnl) return
    const entry: TradeEntry = {
      id: Date.now(),
      pnl: parseFloat(tradePnl) || 0,
      note: tradeNote,
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    }
    setTrades(prev => [...prev, entry])
    setTradePnl('')
    setTradeNote('')
    showAlert('Trade enregistré. Note ton ressenti.', 'info')
  }

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const biasLabel: Record<string, { text: string; color: string }> = {
    haussier: { text: 'HAUSSIER', color: '#22c55e' },
    baissier: { text: 'BAISSIER', color: '#ef4444' },
    neutre: { text: 'NEUTRE', color: '#f59e0b' },
    none: { text: 'PAS DE BIAIS', color: '#5a6a82' },
  }

  const mentalColors = ['#ef4444', '#ef4444', '#f59e0b', '#f59e0b', '#f59e0b', '#eab308', '#22c55e', '#22c55e', '#22c55e', '#22c55e']
  const mentalLabels = ['TILT', 'TILT', 'AGITÉ', 'TENDU', 'TENDU', 'NEUTRE', 'FOCUS', 'CALME', 'CALME', 'ZEN']

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: '#000',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'DM Mono', 'Outfit', monospace",
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)',
      }} />

      {/* Alert banner */}
      {alert && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          padding: '14px 32px', borderRadius: 12,
          background: alert.type === 'danger' ? 'rgba(239,68,68,0.15)' : alert.type === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${alert.type === 'danger' ? 'rgba(239,68,68,0.4)' : alert.type === 'warning' ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.3)'}`,
          color: alert.type === 'danger' ? '#ef4444' : alert.type === 'warning' ? '#f59e0b' : '#22c55e',
          fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
          backdropFilter: 'blur(20px)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          {alert.message}
        </div>
      )}

      {/* Top HUD bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid rgba(34,197,94,0.15)',
        background: 'rgba(0,0,0,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ fontSize: 9, color: '#22c55e', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Session Active</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', fontFamily: "'DM Mono', monospace" }}>{formatTime(elapsed)}</div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(34,197,94,0.2)' }} />
          <div>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Trades</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: trades.length >= maxTrades ? '#ef4444' : '#f0f0f3' }}>{trades.length}<span style={{ fontSize: 14, color: '#5a6a82' }}>/{maxTrades}</span></div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(34,197,94,0.2)' }} />
          <div>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase' }}>P&L Running</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: totalPnl >= 0 ? '#22c55e' : '#ef4444', fontFamily: "'DM Mono', monospace" }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}$
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowEndConfirm(true)}
          style={{
            padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        >
          Fin de session
        </button>
      </div>

      {/* Main grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 1, background: 'rgba(34,197,94,0.05)', overflow: 'hidden' }}>

        {/* Left panel — Context */}
        <div style={{ background: '#0a0a0c', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Bias */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.1)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>Biais du jour</div>
            {bias ? (
              <div style={{ fontSize: 20, fontWeight: 700, color: biasLabel[bias]?.color ?? '#5a6a82' }}>
                {biasLabel[bias]?.text ?? bias.toUpperCase()}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#5a6a82' }}>Non défini — remplis la routine pré-marché</div>
            )}
          </div>

          {/* Key levels */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.1)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Niveaux clés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Résistance', value: resistance, color: '#ef4444' },
                { label: 'Pivot', value: pivot, color: '#f59e0b' },
                { label: 'Support', value: support, color: '#22c55e' },
              ].map(lvl => (
                <div key={lvl.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: lvl.color, fontWeight: 600 }}>{lvl.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: lvl.value ? '#f0f0f3' : '#333', fontFamily: "'DM Mono', monospace" }}>
                    {lvl.value || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mental score */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase' }}>État mental</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: mentalColors[mentalScore - 1] }}>
                {mentalLabels[mentalScore - 1]}
              </div>
            </div>
            <input
              type="range" min={1} max={10} value={mentalScore}
              onChange={e => setMentalScore(Number(e.target.value))}
              style={{ width: '100%', accentColor: mentalColors[mentalScore - 1] }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 9, color: '#ef4444' }}>TILT</span>
              <span style={{ fontSize: 9, color: '#22c55e' }}>ZEN</span>
            </div>
          </div>

          {/* Settings */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Paramètres session</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#a1a1aa' }}>Max trades</span>
                <input type="number" value={maxTrades} onChange={e => setMaxTrades(Number(e.target.value))} style={{ width: 50, padding: '4px 8px', background: '#18181b', border: '1px solid #333', borderRadius: 6, color: '#f0f0f3', fontSize: 12, textAlign: 'center' as const, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#a1a1aa' }}>Perte max ($)</span>
                <input type="number" value={maxLoss} onChange={e => setMaxLoss(Number(e.target.value))} style={{ width: 70, padding: '4px 8px', background: '#18181b', border: '1px solid #333', borderRadius: 6, color: '#f0f0f3', fontSize: 12, textAlign: 'center' as const, outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#a1a1aa' }}>Rappel pause (min)</span>
                <input type="number" value={pauseReminder} onChange={e => setPauseReminder(Number(e.target.value))} style={{ width: 50, padding: '4px 8px', background: '#18181b', border: '1px solid #333', borderRadius: 6, color: '#f0f0f3', fontSize: 12, textAlign: 'center' as const, outline: 'none' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Center panel — Rules + Trade log */}
        <div style={{ background: '#070709', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Rules */}
          <div style={{ padding: 20, borderRadius: 12, background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <div style={{ fontSize: 9, color: '#22c55e', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14 }}>
              Règles de trading
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEFAULT_RULES.map((rule, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#d4d4d8', fontWeight: 500 }}>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Add trade */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Enregistrer un trade</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" value={tradePnl} onChange={e => setTradePnl(e.target.value)}
                placeholder="P&L ($)" style={{ flex: 1, padding: '10px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#f0f0f3', fontSize: 14, outline: 'none', fontFamily: "'DM Mono', monospace" }}
              />
              <input
                type="text" value={tradeNote} onChange={e => setTradeNote(e.target.value)}
                placeholder="Note rapide..." style={{ flex: 1.5, padding: '10px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#f0f0f3', fontSize: 13, outline: 'none' }}
                onKeyDown={e => e.key === 'Enter' && addTrade()}
              />
              <button
                onClick={addTrade}
                style={{
                  padding: '10px 20px', borderRadius: 8, background: '#22c55e', color: '#000',
                  fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', letterSpacing: '0.05em',
                  boxShadow: '0 0 20px rgba(34,197,94,0.3)',
                }}
              >
                ADD
              </button>
            </div>
          </div>

          {/* Trade log */}
          <div style={{ flex: 1, padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', overflowY: 'auto' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Trade Log</div>
            {trades.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#333', fontSize: 12 }}>
                Aucun trade enregistré
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trades.map((t, i) => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8,
                    background: t.pnl >= 0 ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
                    border: `1px solid ${t.pnl >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}`,
                  }}>
                    <span style={{ fontSize: 11, color: '#5a6a82', fontFamily: "'DM Mono', monospace", width: 20 }}>#{i + 1}</span>
                    <span style={{ fontSize: 11, color: '#5a6a82', fontFamily: "'DM Mono', monospace", width: 45 }}>{t.time}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.pnl >= 0 ? '#22c55e' : '#ef4444', fontFamily: "'DM Mono', monospace", width: 70 }}>
                      {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(0)}$
                    </span>
                    <span style={{ fontSize: 11, color: '#71717a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.note || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — Stats live */}
        <div style={{ background: '#0a0a0c', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* P&L display */}
          <div style={{
            padding: 24, borderRadius: 12, textAlign: 'center' as const,
            background: totalPnl >= 0 ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
            border: `1px solid ${totalPnl >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
          }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>P&L Session</div>
            <div style={{
              fontSize: 48, fontWeight: 700, fontFamily: "'DM Mono', monospace",
              color: totalPnl >= 0 ? '#22c55e' : '#ef4444',
              textShadow: totalPnl >= 0 ? '0 0 40px rgba(34,197,94,0.3)' : '0 0 40px rgba(239,68,68,0.3)',
            }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}$
            </div>
          </div>

          {/* Session stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Wins', value: trades.filter(t => t.pnl > 0).length, color: '#22c55e' },
              { label: 'Losses', value: trades.filter(t => t.pnl < 0).length, color: '#ef4444' },
              { label: 'Win Rate', value: trades.length > 0 ? `${Math.round((trades.filter(t => t.pnl > 0).length / trades.length) * 100)}%` : '—', color: '#f0f0f3' },
              { label: 'Avg Trade', value: trades.length > 0 ? `${(totalPnl / trades.length).toFixed(0)}$` : '—', color: totalPnl >= 0 ? '#22c55e' : '#ef4444' },
              { label: 'Best', value: trades.length > 0 ? `+${Math.max(...trades.map(t => t.pnl)).toFixed(0)}$` : '—', color: '#22c55e' },
              { label: 'Worst', value: trades.length > 0 ? `${Math.min(...trades.map(t => t.pnl)).toFixed(0)}$` : '—', color: '#ef4444' },
            ].map(stat => (
              <div key={stat.label} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' as const }}>
                <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: "'DM Mono', monospace" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Limit bars */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>Limites</div>
            {/* Trade limit */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#a1a1aa' }}>Trades</span>
                <span style={{ fontSize: 10, color: trades.length >= maxTrades ? '#ef4444' : '#a1a1aa', fontFamily: "'DM Mono', monospace" }}>{trades.length}/{maxTrades}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: '#18181b', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${Math.min((trades.length / maxTrades) * 100, 100)}%`, background: trades.length >= maxTrades ? '#ef4444' : '#22c55e', transition: 'width 0.3s' }} />
              </div>
            </div>
            {/* Loss limit */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#a1a1aa' }}>Perte max</span>
                <span style={{ fontSize: 10, color: totalPnl <= maxLoss ? '#ef4444' : '#a1a1aa', fontFamily: "'DM Mono', monospace" }}>{totalPnl < 0 ? totalPnl.toFixed(0) : '0'}/{maxLoss}$</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: '#18181b', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${Math.min((Math.abs(Math.min(totalPnl, 0)) / Math.abs(maxLoss)) * 100, 100)}%`, background: totalPnl <= maxLoss ? '#ef4444' : '#f59e0b', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>

          {/* Session duration breakdown */}
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 9, color: '#5a6a82', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>Durée</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e', fontFamily: "'DM Mono', monospace", textAlign: 'center' as const, textShadow: '0 0 30px rgba(34,197,94,0.2)' }}>
              {formatTime(elapsed)}
            </div>
          </div>
        </div>
      </div>

      {/* End session confirm */}
      {showEndConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowEndConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 16, padding: 32, textAlign: 'center' as const, maxWidth: 400 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0f3', marginBottom: 8 }}>Terminer la session ?</div>
            <div style={{ fontSize: 13, color: '#71717a', marginBottom: 4 }}>Durée : {formatTime(elapsed)}</div>
            <div style={{ fontSize: 13, color: '#71717a', marginBottom: 20 }}>{trades.length} trade{trades.length !== 1 ? 's' : ''} · P&L : <span style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}$</span></div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowEndConfirm(false)} style={{ padding: '10px 24px', borderRadius: 8, background: '#222', border: '1px solid #333', color: '#a1a1aa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Continuer
              </button>
              <button onClick={onExit} style={{ padding: '10px 24px', borderRadius: 8, background: '#22c55e', border: 'none', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
