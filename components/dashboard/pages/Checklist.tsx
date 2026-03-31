'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface ChecklistSection {
  emoji: string
  title: string
  items: [string, string][]
}

const SECTIONS: ChecklistSection[] = [
  {
    emoji: '🧠',
    title: 'Mindset',
    items: [
      ['Je suis reposé et dans un bon état mental', 'Min. 7h de sommeil'],
      ["Je n'ai pas de distraction majeure aujourd'hui", ''],
      ['Mon plan de trading est défini et écrit', 'Setups, niveaux, conditions'],
      ["Je connais mes limites pour aujourd'hui", 'Daily loss max, nb trades max'],
    ],
  },
  {
    emoji: '📊',
    title: 'Macro & Contexte',
    items: [
      ["J'ai vérifié le calendrier économique", 'News FOMC, NFP, CPI...'],
      ['Je connais le contexte de marché dominant', 'Trend, range, breakout...'],
      ["J'ai identifié les niveaux clés du jour", 'Support, résistance, VWAP'],
      ["J'ai noté les horaires à risque", 'Ouvertures, fermetures, news'],
    ],
  },
  {
    emoji: '📈',
    title: 'Technique',
    items: [
      ['Mon setup technique est identifié', 'Confluences validées'],
      ["J'ai défini mes zones d'entrée et de sortie", 'TP, SL, BE'],
      ["J'ai analysé le pré-marché", 'Futures, gap, overnight'],
      ['Ma plateforme est prête et vérifiée', 'Connexion, data, charts'],
    ],
  },
  {
    emoji: '⚠️',
    title: 'Risk Management',
    items: [
      ['Mon SL de référence est fixé à 25 pts ATP', 'Sizing calculé en conséquence'],
      ['Mon risque par trade est calculé', 'Max 1-2% du capital'],
      ['Mon daily loss max est défini', 'Arrêt automatique si atteint'],
      ["Je n'essaierai pas de récupérer des pertes", 'Pas de revenge trading'],
    ],
  },
]

const TOTAL_ITEMS = 16

function getSubtitle(checked: number): string {
  if (checked === 0) return 'Commencez par vérifier chaque point avant de trader.'
  if (checked < 8) return 'Continuez à valider les points restants.'
  if (checked < TOTAL_ITEMS) return 'Presque prêt ! Finalisez votre préparation.'
  return 'Vous êtes prêt à trader. Bonne session !'
}

export default function Checklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const checkedCount = checked.size
  const progress = (checkedCount / TOTAL_ITEMS) * 100

  function toggleItem(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function reset() {
    setChecked(new Set())
  }

  return (
    <Card>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#e8edf5', margin: 0 }}>
          Checklist Pré-Open ATP
        </h3>
        <Button variant="ghost" size="sm" onClick={reset}>
          Réinitialiser
        </Button>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px', color: '#a0aec0' }}>
          <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '16px' }}>{checkedCount}</span> / {TOTAL_ITEMS} items complétés
        </span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: checkedCount === TOTAL_ITEMS ? '#22c55e' : '#a0aec0' }}>
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '8px',
        background: 'rgba(255,255,255,0.07)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '12px',
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: checkedCount === TOTAL_ITEMS
            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
            : 'linear-gradient(90deg, #22c55e, #4ade80)',
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Subtitle */}
      <p style={{ fontSize: '13px', color: '#a0aec0', marginBottom: '24px', fontStyle: 'italic' }}>
        {getSubtitle(checkedCount)}
      </p>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h4 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#e8edf5',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>{section.emoji}</span> {section.title}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {section.items.map(([text, sub], idx) => {
                const key = `${section.title}-${idx}`
                const isChecked = checked.has(key)
                return (
                  <div
                    key={key}
                    onClick={() => toggleItem(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isChecked
                        ? '1px solid rgba(34,197,94,0.3)'
                        : '1px solid rgba(255,255,255,0.07)',
                      background: isChecked
                        ? 'rgba(34,197,94,0.08)'
                        : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      userSelect: 'none',
                    }}
                  >
                    {/* Checkbox indicator */}
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      border: isChecked ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.15)',
                      background: isChecked ? '#22c55e' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}>
                      {isChecked && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#111113" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: isChecked ? '#22c55e' : '#e8edf5',
                        textDecoration: isChecked ? 'line-through' : 'none',
                        transition: 'all 0.2s',
                      }}>
                        {text}
                      </div>
                      {sub && (
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '2px',
                        }}>
                          {sub}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
