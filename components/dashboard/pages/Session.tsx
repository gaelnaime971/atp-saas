'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

const INSTRUMENTS = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ']
const SESSION_TYPES = ['Live', 'Paper', 'Backtest'] as const
const ACCOUNT_MODES = ['Tous comptes', 'Sélection', 'Un seul'] as const
const MOODS = ['😴', '😬', '😐', '😌', '🎯', '🔥'] as const

function getPlanTag(value: number): { label: string; color: string } {
  if (value < 5) return { label: 'Hors plan', color: '#ef4444' }
  if (value < 8) return { label: 'Partiel', color: '#f59e0b' }
  return { label: 'Dans le plan', color: '#22c55e' }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function Session() {
  const [date, setDate] = useState(todayISO())
  const [sessionType, setSessionType] = useState<typeof SESSION_TYPES[number]>('Live')
  const [accountMode, setAccountMode] = useState<typeof ACCOUNT_MODES[number]>('Tous comptes')
  const [instrument, setInstrument] = useState('ES')
  const [tradesCount, setTradesCount] = useState<number>(0)
  const [pnl, setPnl] = useState<number>(0)
  const [rValue, setRValue] = useState<number>(0)
  const [winRate, setWinRate] = useState<number>(0)
  const [maxDrawdown, setMaxDrawdown] = useState<number>(0)
  const [planScore, setPlanScore] = useState<number>(5)
  const [mood, setMood] = useState<string>('')
  const [technicalAnalysis, setTechnicalAnalysis] = useState('')
  const [psychologicalAnalysis, setPsychologicalAnalysis] = useState('')
  const [improvement, setImprovement] = useState('')
  const [globalRating, setGlobalRating] = useState(0)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const planTag = getPlanTag(planScore)

  async function handleSubmit() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const result: 'win' | 'loss' | 'breakeven' = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven'

      const extraData = {
        session_type: sessionType,
        account_mode: accountMode,
        r_value: rValue,
        win_rate: winRate,
        max_drawdown: maxDrawdown,
        plan_score: planScore,
        mood,
        technical_analysis: technicalAnalysis,
        psychological_analysis: psychologicalAnalysis,
        improvement,
        global_rating: globalRating,
      }

      const { error } = await supabase.from('trading_sessions').insert({
        trader_id: user.id,
        session_date: date,
        pnl,
        result,
        trades_count: tradesCount,
        instrument,
        setup: JSON.stringify(extraData),
        notes: technicalAnalysis || null,
      })

      if (error) throw error

      setToast('Session enregistrée avec succès !')
      setTimeout(() => setToast(null), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setToast(`Erreur : ${message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e8edf5',
    fontSize: '14px',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#a0aec0',
    marginBottom: '6px',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '100px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 9999,
          padding: '14px 24px',
          borderRadius: '10px',
          background: toast.startsWith('Erreur') ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)',
          color: '#fff',
          fontSize: '14px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left card */}
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#e8edf5', marginBottom: '20px' }}>
            Données de session
          </h3>

          {/* Date */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>

          {/* Session Type */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSessionType(t)}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: sessionType === t ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.1)',
                    background: sessionType === t ? 'rgba(34,197,94,0.15)' : '#0d1117',
                    color: sessionType === t ? '#22c55e' : '#a0aec0',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Account Mode */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Compte</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {ACCOUNT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setAccountMode(m)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: accountMode === m ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.1)',
                    background: accountMode === m ? 'rgba(34,197,94,0.15)' : '#0d1117',
                    color: accountMode === m ? '#22c55e' : '#a0aec0',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Instrument + Trades count */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Instrument</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nombre de trades</label>
              <input
                type="number"
                min={0}
                value={tradesCount}
                onChange={(e) => setTradesCount(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* P&L + R */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>P&L (€)</label>
              <input
                type="number"
                value={pnl}
                onChange={(e) => setPnl(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>R obtenu</label>
              <input
                type="number"
                step={0.1}
                value={rValue}
                onChange={(e) => setRValue(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Win Rate + Max DD */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Win Rate (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={winRate}
                onChange={(e) => setWinRate(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Max Drawdown (€)</label>
              <input
                type="number"
                value={maxDrawdown}
                onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Plan Score Slider */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Respect du plan ATP</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#e8edf5' }}>{planScore}</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: `${planTag.color}20`,
                  color: planTag.color,
                }}>
                  {planTag.label}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={planScore}
              onChange={(e) => setPlanScore(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: planTag.color,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Mood */}
          <div>
            <label style={labelStyle}>Humeur du jour</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: '10px',
                    border: mood === m ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.1)',
                    background: mood === m ? 'rgba(34,197,94,0.1)' : '#0d1117',
                    fontSize: '22px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    transform: mood === m ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Right card */}
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#e8edf5', marginBottom: '20px' }}>
            Notes & Analyse
          </h3>

          {/* Technical Analysis */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Analyse technique</label>
            <textarea
              value={technicalAnalysis}
              onChange={(e) => setTechnicalAnalysis(e.target.value)}
              placeholder="Décrivez votre analyse technique..."
              style={textareaStyle}
            />
          </div>

          {/* Psychological Analysis */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Analyse psychologique</label>
            <textarea
              value={psychologicalAnalysis}
              onChange={(e) => setPsychologicalAnalysis(e.target.value)}
              placeholder="Comment vous êtes-vous senti pendant la session ?"
              style={textareaStyle}
            />
          </div>

          {/* Improvement */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Point d&apos;amélioration</label>
            <textarea
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              placeholder="Qu'allez-vous améliorer ?"
              style={{ ...textareaStyle, minHeight: '70px' }}
            />
          </div>

          {/* Star Rating */}
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Note globale</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setGlobalRating(star)}
                  style={{
                    fontSize: '28px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: star <= globalRating ? '#f59e0b' : '#374151',
                    transition: 'all 0.15s',
                    transform: star <= globalRating ? 'scale(1.15)' : 'scale(1)',
                    padding: '2px',
                  }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            variant="primary"
            size="lg"
            loading={loading}
            onClick={handleSubmit}
            className="w-full"
          >
            Enregistrer la session
          </Button>
        </Card>
      </div>
    </div>
  )
}
