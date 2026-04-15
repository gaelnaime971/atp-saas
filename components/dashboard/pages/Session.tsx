'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { TraderAccount } from '@/lib/types'

const INSTRUMENTS = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ', 'GC', 'MGC']
const MOODS = ['😴', '😬', '😐', '😌', '🎯', '🔥'] as const

const TOOLTIPS: Record<string, string> = {
  date: 'Date à laquelle tu as effectué ta session de trading.',
  accounts: 'Sélectionne le(s) compte(s) sur lesquels tu as tradé pendant cette session.',
  instrument: 'Le contrat futures que tu as tradé (ES = S&P 500, NQ = Nasdaq, etc.).',
  trades_count: 'Le nombre total de trades (entrées) que tu as pris pendant cette session.',
  pnl: 'Ton profit ou perte net(te) en dollars sur cette session, tous trades confondus.',
  r_value: 'Le résultat exprimé en multiple de ton risque initial (R). Ex: si tu risquais 100$ et gagné 250$, tu as fait +2.5R.',
  win_rate: 'Le pourcentage de trades gagnants sur cette session. Ex: 3 trades gagnants sur 5 = 60%.',
  max_drawdown: 'La perte maximale atteinte en cours de session avant de remonter (en $).',
  plan_score: 'À quel point tu as respecté ton plan de trading ATP (0 = pas du tout, 10 = parfaitement).',
  mood: 'Ton état émotionnel général pendant la session.',
  technical: 'Décris ta lecture du marché, les setups identifiés, les niveaux clés utilisés.',
  psychological: 'Comment tu t\'es senti : stress, confiance, discipline, impulsivité, etc.',
  improvement: 'Un point concret à améliorer pour ta prochaine session.',
  rating: 'Ta note globale pour cette session (qualité d\'exécution, discipline, résultat).',
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-block ml-1 group">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help"
        style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}
      >
        ?
      </span>
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-50 w-56"
        style={{ background: '#18181b', color: 'var(--text)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
      >
        {text}
      </span>
    </span>
  )
}

function getPlanTag(value: number): { label: string; color: string } {
  if (value < 5) return { label: 'Hors plan', color: '#ef4444' }
  if (value < 8) return { label: 'Partiel', color: '#f59e0b' }
  return { label: 'Dans le plan', color: '#22c55e' }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function Session() {
  const [accounts, setAccounts] = useState<TraderAccount[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [date, setDate] = useState(todayISO())
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

  const supabase = createClient()

  useEffect(() => {
    async function loadAccounts() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('trader_accounts').select('*').eq('trader_id', user.id).order('created_at', { ascending: true })
      if (data) {
        setAccounts(data as TraderAccount[])
        setSelectedAccountIds(data.map((a: any) => a.id))
      }
    }
    loadAccounts()
  }, [])

  const toggleAccount = (id: string) => {
    setSelectedAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const planTag = getPlanTag(planScore)

  async function handleSubmit() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const result: 'win' | 'loss' | 'breakeven' = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven'

      const extraData = {
        account_ids: selectedAccountIds,
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
    background: 'var(--bg3, #18181b)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e8edf5',
    fontSize: '14px',
    outline: 'none',
    colorScheme: 'dark',
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: 500,
    color: '#a0aec0',
    marginBottom: '6px',
  }

  return (
    <div>
      {/* Explanatory banner */}
      <div
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid #22c55e',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          fontSize: '13px',
          lineHeight: '1.6',
          color: '#a0aec0',
        }}
      >
        📝 Enregistre ici le bilan de ta session de trading — pas trade par trade, mais le résultat global de ta session. Remplis les données clés (P&L, nombre de trades, R) et détaille ton analyse dans les notes.
      </div>

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

      {/* LIVE PREVIEW BANNER */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 10,
        marginBottom: 18,
      }}>
        {[
          { lbl: 'P&L', val: pnl !== 0 ? `${pnl > 0 ? '+' : ''}${pnl.toLocaleString('fr-FR')} $` : '—', color: pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#a0aec0' },
          { lbl: 'Trades', val: tradesCount || '—', color: '#e8edf5' },
          { lbl: 'R total', val: rValue !== 0 ? `${rValue > 0 ? '+' : ''}${rValue.toFixed(1)}R` : '—', color: rValue >= 0 ? '#22c55e' : '#ef4444' },
          { lbl: 'Win Rate', val: winRate > 0 ? `${winRate}%` : '—', color: winRate >= 50 ? '#22c55e' : winRate > 0 ? '#f59e0b' : '#a0aec0' },
          { lbl: 'Plan', val: `${planScore}/10`, color: planTag.color },
        ].map(kpi => (
          <div
            key={kpi.lbl}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>{kpi.lbl}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{kpi.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* LEFT: Session data */}
        <Card>
          {/* Date + Instrument compact row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 11 }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, fontSize: 11 }}>Instrument</label>
              <select value={instrument} onChange={e => setInstrument(e.target.value)} style={{ ...inputStyle, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          {/* Accounts — compact chips */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ ...labelStyle, fontSize: 11 }}>Comptes tradés <Tooltip text={TOOLTIPS.accounts} /></label>
            {accounts.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>
                Aucun compte configuré — va sur la page Prop Firm.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {accounts.map(acc => {
                  const selected = selectedAccountIds.includes(acc.id)
                  const typeColor = acc.account_type === 'funded' ? '#22c55e' : acc.account_type === 'challenge' ? '#60a5fa' : '#f59e0b'
                  return (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: selected ? `${typeColor}15` : 'var(--bg3)',
                        border: `1.5px solid ${selected ? typeColor : 'transparent'}`,
                        color: selected ? typeColor : '#a0aec0',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected ? '✓ ' : ''}{acc.label || `${acc.propfirm_name} ${Number(acc.capital).toLocaleString()}$`}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Numeric inputs — stepper cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {/* Nb trades */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>Nb trades</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setTradesCount(Math.max(0, tradesCount - 1))} style={stepBtn}>−</button>
                <input
                  type="number"
                  value={tradesCount || ''}
                  onChange={e => setTradesCount(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8edf5', fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none' }}
                />
                <button onClick={() => setTradesCount(tradesCount + 1)} style={stepBtn}>+</button>
              </div>
            </div>

            {/* Win Rate */}
            <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>Win Rate %</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={winRate || ''}
                  onChange={e => setWinRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8edf5', fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600 }}>%</span>
              </div>
            </div>
          </div>

          {/* P&L + R */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {/* P&L */}
            <div style={{
              background: pnl > 0 ? 'rgba(34,197,94,0.08)' : pnl < 0 ? 'rgba(239,68,68,0.08)' : 'var(--bg3)',
              border: `1px solid ${pnl > 0 ? 'rgba(34,197,94,0.25)' : pnl < 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>P&L ($)</div>
              <input
                type="number"
                value={pnl || ''}
                onChange={e => setPnl(e.target.value === '' ? 0 : Number(e.target.value))}
                onFocus={e => e.target.select()}
                placeholder="0"
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  color: pnl > 0 ? '#22c55e' : pnl < 0 ? '#ef4444' : '#e8edf5',
                  fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none',
                }}
              />
            </div>

            {/* R */}
            <div style={{
              background: rValue > 0 ? 'rgba(34,197,94,0.08)' : rValue < 0 ? 'rgba(239,68,68,0.08)' : 'var(--bg3)',
              border: `1px solid ${rValue > 0 ? 'rgba(34,197,94,0.25)' : rValue < 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>R obtenu</div>
              <input
                type="number"
                step={0.1}
                value={rValue || ''}
                onChange={e => setRValue(e.target.value === '' ? 0 : Number(e.target.value))}
                onFocus={e => e.target.select()}
                placeholder="0"
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  color: rValue > 0 ? '#22c55e' : rValue < 0 ? '#ef4444' : '#e8edf5',
                  fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Plan score slider */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0, fontSize: 11 }}>Respect plan ATP <Tooltip text={TOOLTIPS.plan_score} /></label>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                background: `${planTag.color}20`, color: planTag.color,
              }}>
                {planScore}/10 · {planTag.label}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={planScore}
              onChange={e => setPlanScore(Number(e.target.value))}
              style={{ width: '100%', accentColor: planTag.color, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#4b5563' }}>
              <span>0</span><span>5</span><span>10</span>
            </div>
          </div>

          {/* Mood */}
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Humeur du jour</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {MOODS.map(m => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10,
                    border: mood === m ? '2px solid #22c55e' : '1.5px solid transparent',
                    background: mood === m ? 'rgba(34,197,94,0.1)' : 'var(--bg3)',
                    fontSize: 22, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* RIGHT: Notes with tabs */}
        <Card>
          <NotesTabs
            technical={technicalAnalysis} setTechnical={setTechnicalAnalysis}
            psycho={psychologicalAnalysis} setPsycho={setPsychologicalAnalysis}
            improvement={improvement} setImprovement={setImprovement}
          />

          {/* Star rating */}
          <div style={{ marginTop: 18, marginBottom: 18, padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ ...labelStyle, marginBottom: 0, fontSize: 11 }}>Note globale session</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setGlobalRating(star)}
                    style={{
                      fontSize: 22, background: 'none', border: 'none', cursor: 'pointer',
                      color: star <= globalRating ? '#f59e0b' : '#374151',
                      transition: 'all 0.15s',
                      padding: 0, lineHeight: 1,
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
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
            ▸ Enregistrer la session
          </Button>
        </Card>
      </div>
    </div>
  )
}

const stepBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  background: 'var(--bg2)', border: '1px solid var(--border)',
  color: '#a0aec0', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.12s',
}

function NotesTabs({
  technical, setTechnical,
  psycho, setPsycho,
  improvement, setImprovement,
}: {
  technical: string; setTechnical: (v: string) => void
  psycho: string; setPsycho: (v: string) => void
  improvement: string; setImprovement: (v: string) => void
}) {
  const [active, setActive] = useState<'tech' | 'psycho' | 'improv'>('tech')
  const tabs = [
    { id: 'tech' as const, icon: '📈', label: 'Technique', val: technical, set: setTechnical, placeholder: 'Lecture du marché, setups, niveaux clés...' },
    { id: 'psycho' as const, icon: '🧠', label: 'Psycho', val: psycho, set: setPsycho, placeholder: 'Stress, confiance, discipline, impulsivité...' },
    { id: 'improv' as const, icon: '🎯', label: 'À améliorer', val: improvement, set: setImprovement, placeholder: 'Un point concret à améliorer pour la prochaine session...' },
  ]
  const current = tabs.find(t => t.id === active)!

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'var(--bg3)', padding: 4, borderRadius: 10 }}>
        {tabs.map(t => {
          const hasContent = t.val.trim().length > 0
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7,
                background: active === t.id ? 'var(--bg)' : 'transparent',
                border: 'none',
                color: active === t.id ? '#e8edf5' : '#6b7280',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>{t.icon}</span>
              {t.label}
              {hasContent && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', marginLeft: 2 }} />}
            </button>
          )
        })}
      </div>
      <textarea
        key={active}
        value={current.val}
        onChange={e => current.set(e.target.value)}
        placeholder={current.placeholder}
        style={{
          width: '100%', minHeight: 220, padding: 14,
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 10, color: '#e8edf5', fontSize: 13,
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65,
        }}
      />
    </div>
  )
}
