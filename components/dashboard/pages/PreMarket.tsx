'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'

/* ─── Constants ─── */

const BIAS_OPTIONS = [
  { id: 'haussier', label: 'Haussier', color: '#22c55e', icon: '📈' },
  { id: 'baissier', label: 'Baissier', color: '#ef4444', icon: '📉' },
  { id: 'neutre', label: 'Neutre', color: '#f59e0b', icon: '↔️' },
  { id: 'none', label: 'Pas de biais', color: '#5a6a82', icon: '❓' },
]

interface SectionDef {
  id: string
  icon: string
  title: string
  checks: string[]
}

const SECTIONS: SectionDef[] = [
  {
    id: 'mental',
    icon: '🧠',
    title: 'État Mental',
    checks: ['Je suis reposé', 'Pas de stress externe', 'Mindset stable'],
  },
  {
    id: 'macro',
    icon: '📊',
    title: 'Analyse Macro',
    checks: ['Calendrier éco vérifié', 'Pas de news HIGH dans les 30 min', 'Bias weekly/daily identifié'],
  },
  {
    id: 'technique',
    icon: '📈',
    title: 'Analyse Technique',
    checks: ['Niveaux clés identifiés', 'Structure de marché analysée (BOS/CHoCH)', 'OB et FVG marqués'],
  },
  {
    id: 'risk',
    icon: '⚠️',
    title: 'Gestion du Risque',
    checks: ['Daily loss max défini', 'Sizing calculé', 'Plan A et plan B définis', 'Environnement de travail prêt'],
  },
]

const ALL_CHECKS = SECTIONS.flatMap(s => s.checks)
const TOTAL_CHECKABLE = ALL_CHECKS.length // 13 checklist items

/* ─── Data shape ─── */

interface PreMarketData {
  confidence: number
  mentalNote: string
  bias: string
  news: string
  support: string
  resistance: string
  pivot: string
  checks: Record<string, boolean>
}

const emptyData: PreMarketData = {
  confidence: 5,
  mentalNote: '',
  bias: '',
  news: '',
  support: '',
  resistance: '',
  pivot: '',
  checks: Object.fromEntries(ALL_CHECKS.map(c => [c, false])),
}

function todayKey() {
  return `premarket_${new Date().toISOString().split('T')[0]}`
}

/* ─── CSS keyframes injected once ─── */

const KEYFRAMES = `
@keyframes checkPop {
  0% { transform: scale(0.7); opacity: 0; }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.15); }
  50% { box-shadow: 0 0 35px rgba(34,197,94,0.35); }
}
@keyframes progressGlow {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}
`

/* ─── Component ─── */

export default function PreMarket() {
  const [data, setData] = useState<PreMarketData>(emptyData)
  const [mounted, setMounted] = useState(false)

  // Load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(todayKey())
      if (stored) {
        const parsed = JSON.parse(stored)
        // Merge with empty to handle schema changes
        setData({ ...emptyData, ...parsed, checks: { ...emptyData.checks, ...(parsed.checks ?? {}) } })
      }
    } catch { /* ignore */ }
    setMounted(true)
  }, [])

  // Persist
  useEffect(() => {
    if (mounted) localStorage.setItem(todayKey(), JSON.stringify(data))
  }, [data, mounted])

  /* ─── Derived state ─── */

  const checkedCount = Object.values(data.checks).filter(Boolean).length
  // Extra trackable items: bias selected, 3 level fields filled
  const bonusCount = (data.bias ? 1 : 0) + (data.support ? 1 : 0) + (data.resistance ? 1 : 0) + (data.pivot ? 1 : 0)
  const totalTrackable = TOTAL_CHECKABLE + 4 // 4 bonus (bias + 3 levels)
  const completedCount = checkedCount + bonusCount
  const progress = Math.round((completedCount / totalTrackable) * 100)
  const isReady = progress === 100

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  function sectionProgress(section: SectionDef): number {
    return section.checks.filter(c => data.checks[c]).length
  }

  function toggleCheck(label: string) {
    setData(d => ({ ...d, checks: { ...d.checks, [label]: !d.checks[label] } }))
  }

  function reset() {
    setData(emptyData)
  }

  /* ─── Shared styles ─── */

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#e8edf5',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
  }

  const sectionHeaderStyle = (complete: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `1px solid ${complete ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
  })

  /* ─── Checkbox row renderer ─── */

  function CheckItem({ label }: { label: string }) {
    const isChecked = data.checks[label]
    return (
      <div
        onClick={() => toggleCheck(label)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '11px 14px',
          borderRadius: 10,
          border: isChecked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
          background: isChecked ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          transition: 'all 0.25s ease',
          userSelect: 'none',
        }}
      >
        {/* Custom checkbox */}
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: isChecked ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.15)',
          background: isChecked ? '#22c55e' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s ease',
          animation: isChecked ? 'checkPop 0.3s ease' : 'none',
        }}>
          {isChecked && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#111113" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: isChecked ? '#22c55e' : '#c8d0dc',
          textDecoration: isChecked ? 'line-through' : 'none',
          transition: 'all 0.2s ease',
        }}>
          {label}
        </span>
      </div>
    )
  }

  /* ─── Section card wrapper ─── */

  function SectionCard({ section, children }: { section: SectionDef; children: React.ReactNode }) {
    const done = sectionProgress(section)
    const total = section.checks.length
    const complete = done === total

    return (
      <Card style={{
        border: complete ? '1px solid rgba(34,197,94,0.25)' : undefined,
        background: complete ? 'rgba(34,197,94,0.03)' : undefined,
        transition: 'all 0.4s ease',
      }}>
        <div style={sectionHeaderStyle(complete)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{section.icon}</span>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e8edf5', margin: 0 }}>{section.title}</h3>
          </div>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'monospace',
            padding: '4px 10px',
            borderRadius: 8,
            background: complete ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
            color: complete ? '#22c55e' : '#8892a4',
            transition: 'all 0.3s ease',
          }}>
            {done}/{total} ✓
          </span>
        </div>
        {children}
      </Card>
    )
  }

  /* ─── Render ─── */

  if (!mounted) return null

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ═══ Header ═══ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e8edf5', margin: 0 }}>
              Routine Pré-Marché
            </h1>
            <p style={{ fontSize: 13, color: '#6b7688', marginTop: 4, textTransform: 'capitalize' }}>{today}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isReady && (
              <span style={{
                padding: '8px 18px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: 'rgba(34,197,94,0.1)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
                animation: 'badgePulse 2s ease-in-out infinite',
              }}>
                🟢 Prêt à trader
              </span>
            )}
            <button
              onClick={reset}
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(239,68,68,0.08)',
                color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Réinitialiser
            </button>
          </div>
        </div>

        {/* ═══ Global progress ═══ */}
        <div style={{
          padding: 18,
          borderRadius: 14,
          border: isReady ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.07)',
          background: isReady ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
          transition: 'all 0.4s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7688' }}>Progression globale</span>
            <span style={{
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'monospace',
              color: isReady ? '#22c55e' : progress >= 50 ? '#f59e0b' : '#8892a4',
            }}>
              {progress}%
            </span>
          </div>
          <div style={{
            height: 10,
            borderRadius: 6,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: 6,
              background: isReady
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : progress >= 50
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #6b7688, #8892a4)',
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), background 0.4s ease',
              animation: isReady ? 'progressGlow 2s ease-in-out infinite' : 'none',
            }} />
          </div>
          <p style={{ fontSize: 12, color: '#6b7688', marginTop: 8, fontStyle: 'italic' }}>
            {isReady
              ? 'Vous êtes prêt à trader. Bonne session !'
              : completedCount < 6
                ? 'Commencez votre préparation point par point.'
                : 'Presque prêt — finalisez les derniers points.'}
          </p>
        </div>

        {/* ═══ Two-column layout ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Section 1: État Mental */}
            <SectionCard section={SECTIONS[0]}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Confidence slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#8892a4' }}>Score de confiance</label>
                    <span style={{
                      fontSize: 18,
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      color: data.confidence >= 7 ? '#22c55e' : data.confidence >= 4 ? '#f59e0b' : '#ef4444',
                    }}>
                      {data.confidence}/10
                    </span>
                  </div>
                  {/* Visual scale */}
                  <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        onClick={() => setData(d => ({ ...d, confidence: i + 1 }))}
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 4,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          background: i < data.confidence
                            ? data.confidence >= 7 ? '#22c55e' : data.confidence >= 4 ? '#f59e0b' : '#ef4444'
                            : 'rgba(255,255,255,0.06)',
                        }}
                      />
                    ))}
                  </div>
                  <input
                    type="range" min={1} max={10} value={data.confidence}
                    onChange={e => setData(d => ({ ...d, confidence: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      accentColor: data.confidence >= 7 ? '#22c55e' : data.confidence >= 4 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>

                {/* Mental note */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#8892a4', display: 'block', marginBottom: 6 }}>Note mentale</label>
                  <textarea
                    value={data.mentalNote}
                    onChange={e => setData(d => ({ ...d, mentalNote: e.target.value }))}
                    placeholder="Aujourd'hui je me concentre sur..."
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Mindset checks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SECTIONS[0].checks.map(c => <CheckItem key={c} label={c} />)}
                </div>
              </div>
            </SectionCard>

            {/* Section 3: Analyse Technique */}
            <SectionCard section={SECTIONS[2]}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Key levels */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', display: 'block', marginBottom: 5 }}>Support</label>
                    <input
                      type="number"
                      value={data.support}
                      onChange={e => setData(d => ({ ...d, support: e.target.value }))}
                      placeholder="5420"
                      style={{ ...inputStyle, textAlign: 'center', borderColor: data.support ? 'rgba(34,197,94,0.3)' : undefined }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', display: 'block', marginBottom: 5 }}>Résistance</label>
                    <input
                      type="number"
                      value={data.resistance}
                      onChange={e => setData(d => ({ ...d, resistance: e.target.value }))}
                      placeholder="5480"
                      style={{ ...inputStyle, textAlign: 'center', borderColor: data.resistance ? 'rgba(239,68,68,0.3)' : undefined }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', display: 'block', marginBottom: 5 }}>Pivot</label>
                    <input
                      type="number"
                      value={data.pivot}
                      onChange={e => setData(d => ({ ...d, pivot: e.target.value }))}
                      placeholder="5450"
                      style={{ ...inputStyle, textAlign: 'center', borderColor: data.pivot ? 'rgba(245,158,11,0.3)' : undefined }}
                    />
                  </div>
                </div>

                {/* Technique checks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SECTIONS[2].checks.map(c => <CheckItem key={c} label={c} />)}
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Section 2: Analyse Macro */}
            <SectionCard section={SECTIONS[1]}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Bias selector */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#8892a4', display: 'block', marginBottom: 8 }}>Biais du jour</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {BIAS_OPTIONS.map(b => {
                      const active = data.bias === b.id
                      return (
                        <button
                          key={b.id}
                          onClick={() => setData(d => ({ ...d, bias: b.id }))}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: active ? `2px solid ${b.color}` : '2px solid rgba(255,255,255,0.06)',
                            background: active ? `${b.color}12` : 'rgba(255,255,255,0.02)',
                            cursor: 'pointer',
                            transition: 'all 0.25s ease',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 18 }}>{b.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: active ? b.color : '#8892a4' }}>{b.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* News textarea */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#8892a4', display: 'block', marginBottom: 6 }}>News éco du jour</label>
                  <textarea
                    value={data.news}
                    onChange={e => setData(d => ({ ...d, news: e.target.value }))}
                    placeholder="CPI 14h30, FOMC minutes 20h..."
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Macro checks */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SECTIONS[1].checks.map(c => <CheckItem key={c} label={c} />)}
                </div>
              </div>
            </SectionCard>

            {/* Section 4: Gestion du Risque */}
            <SectionCard section={SECTIONS[3]}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SECTIONS[3].checks.map(c => <CheckItem key={c} label={c} />)}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  )
}
