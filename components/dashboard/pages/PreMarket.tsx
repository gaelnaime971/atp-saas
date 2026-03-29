'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'

const BIAS_OPTIONS = [
  { id: 'haussier', label: 'Haussier', color: '#22c55e', icon: '📈' },
  { id: 'baissier', label: 'Baissier', color: '#ef4444', icon: '📉' },
  { id: 'neutre', label: 'Neutre', color: '#f59e0b', icon: '↔️' },
  { id: 'none', label: 'Pas de biais', color: '#5a6a82', icon: '❓' },
]

const CHECKLIST_ITEMS = [
  "J'ai analysé le daily et le weekly",
  "J'ai identifié mes niveaux clés",
  "J'ai vérifié le calendrier éco",
  "J'ai défini mon risque max pour la journée",
  "Je suis dans un bon état psychologique",
  "J'ai un plan clair pour chaque scénario",
]

interface PreMarketData {
  bias: string
  support: string
  resistance: string
  pivot: string
  news: string
  checklist: boolean[]
  mentalNote: string
  confidence: number
}

const emptyData: PreMarketData = {
  bias: '',
  support: '',
  resistance: '',
  pivot: '',
  news: '',
  checklist: CHECKLIST_ITEMS.map(() => false),
  mentalNote: '',
  confidence: 5,
}

function todayKey() {
  return `premarket_${new Date().toISOString().split('T')[0]}`
}

export default function PreMarket() {
  const [data, setData] = useState<PreMarketData>(emptyData)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(todayKey())
      if (stored) setData({ ...emptyData, ...JSON.parse(stored) })
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(todayKey(), JSON.stringify(data))
  }, [data])

  const checkedCount = data.checklist.filter(Boolean).length
  const totalItems = CHECKLIST_ITEMS.length + (data.bias ? 1 : 0) + (data.support ? 1 : 0) + (data.resistance ? 1 : 0)
  const completedItems = checkedCount + (data.bias ? 1 : 0) + (data.support ? 1 : 0) + (data.resistance ? 1 : 0)
  const maxItems = CHECKLIST_ITEMS.length + 3
  const progress = Math.round((completedItems / maxItems) * 100)
  const isReady = checkedCount === CHECKLIST_ITEMS.length && data.bias !== ''

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: 'var(--bg3)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Routine Pré-Marché</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)', textTransform: 'capitalize' }}>{today}</p>
        </div>
        <div className="flex items-center gap-4">
          {isReady && (
            <span
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                boxShadow: '0 0 20px rgba(34,197,94,0.15)',
              }}
            >
              Prêt à trader
            </span>
          )}
          <button
            onClick={() => setData(emptyData)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl p-4 border" style={{ background: 'var(--bg2)', borderColor: isReady ? 'rgba(34,197,94,0.3)' : 'var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Progression</span>
          <span className="text-sm font-bold font-mono" style={{ color: isReady ? '#22c55e' : progress >= 50 ? '#f59e0b' : 'var(--text3)' }}>{progress}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg3)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: isReady ? '#22c55e' : progress >= 50 ? '#f59e0b' : 'var(--text3)' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Bias */}
          <Card>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Biais du jour</h3>
            <div className="grid grid-cols-2 gap-3">
              {BIAS_OPTIONS.map(b => {
                const active = data.bias === b.id
                return (
                  <button
                    key={b.id}
                    onClick={() => setData(d => ({ ...d, bias: b.id }))}
                    className="rounded-xl px-4 py-3 text-left transition-all"
                    style={{
                      background: active ? `${b.color}10` : 'var(--bg3)',
                      border: active ? `2px solid ${b.color}` : '2px solid var(--border)',
                    }}
                  >
                    <span className="text-lg mr-2">{b.icon}</span>
                    <span className="text-sm font-medium" style={{ color: active ? b.color : 'var(--text2)' }}>{b.label}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Key levels */}
          <Card>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Niveaux clés</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Support clé</label>
                <input type="number" value={data.support} onChange={e => setData(d => ({ ...d, support: e.target.value }))} placeholder="ex: 5420" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Résistance clé</label>
                <input type="number" value={data.resistance} onChange={e => setData(d => ({ ...d, resistance: e.target.value }))} placeholder="ex: 5480" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Pivot du jour</label>
                <input type="number" value={data.pivot} onChange={e => setData(d => ({ ...d, pivot: e.target.value }))} placeholder="ex: 5450" style={inputStyle} />
              </div>
            </div>
          </Card>

          {/* Confidence */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Score de confiance</h3>
              <span className="text-lg font-bold font-mono" style={{ color: data.confidence >= 7 ? '#22c55e' : data.confidence >= 4 ? '#f59e0b' : '#ef4444' }}>
                {data.confidence}/10
              </span>
            </div>
            <input
              type="range" min={1} max={10} value={data.confidence}
              onChange={e => setData(d => ({ ...d, confidence: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: data.confidence >= 7 ? '#22c55e' : data.confidence >= 4 ? '#f59e0b' : '#ef4444' }}
            />
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Checklist */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Checklist pré-session</h3>
              <span className="text-xs font-mono" style={{ color: checkedCount === CHECKLIST_ITEMS.length ? '#22c55e' : 'var(--text3)' }}>
                {checkedCount}/{CHECKLIST_ITEMS.length}
              </span>
            </div>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: data.checklist[i] ? 'rgba(34,197,94,0.05)' : 'var(--bg3)',
                    border: `1px solid ${data.checklist[i] ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={data.checklist[i]}
                    onChange={() => setData(d => {
                      const cl = [...d.checklist]
                      cl[i] = !cl[i]
                      return { ...d, checklist: cl }
                    })}
                    style={{ accentColor: '#22c55e', width: 16, height: 16 }}
                  />
                  <span className="text-xs" style={{
                    color: data.checklist[i] ? '#22c55e' : 'var(--text2)',
                    textDecorationLine: data.checklist[i] ? 'line-through' : 'none',
                  }}>
                    {item}
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* News éco */}
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>News éco du jour</h3>
            <textarea
              value={data.news}
              onChange={e => setData(d => ({ ...d, news: e.target.value }))}
              placeholder="CPI 14h30, FOMC minutes 20h..."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Card>

          {/* Mental note */}
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Note mentale du jour</h3>
            <textarea
              value={data.mentalNote}
              onChange={e => setData(d => ({ ...d, mentalNote: e.target.value }))}
              placeholder="Aujourd'hui je me concentre sur..."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
