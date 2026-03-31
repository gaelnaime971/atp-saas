'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SkillItem, SkillProgress } from '@/lib/types'

export default function BilanCompetences() {
  const [items, setItems] = useState<SkillItem[]>([])
  const [progress, setProgress] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: skillItems }, { data: skillProgress }] = await Promise.all([
        supabase.from('skill_items').select('*').order('sort_order', { ascending: true }),
        supabase.from('skill_progress').select('*').eq('trader_id', user.id),
      ])

      if (skillItems) setItems(skillItems)
      if (skillProgress) {
        const map: Record<string, boolean> = {}
        skillProgress.forEach((sp: SkillProgress) => {
          map[sp.skill_item_id] = sp.completed
        })
        setProgress(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  const toggleSkill = async (skillItemId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setToggling(skillItemId)

    const isCompleted = !progress[skillItemId]

    // Upsert progress
    const { error } = await supabase
      .from('skill_progress')
      .upsert(
        {
          trader_id: user.id,
          skill_item_id: skillItemId,
          completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        },
        { onConflict: 'trader_id,skill_item_id' }
      )

    if (!error) {
      setProgress(prev => ({ ...prev, [skillItemId]: isCompleted }))
    }
    setToggling(null)
  }

  const completedCount = items.filter(i => progress[i.id]).length
  const totalCount = items.length
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const getProgressColor = (pct: number) => {
    if (pct >= 75) return '#4ade80' // green
    if (pct >= 50) return '#facc15' // yellow
    if (pct >= 25) return '#fb923c' // orange
    return '#f87171' // red
  }

  const progressColor = getProgressColor(percentage)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl p-6 animate-pulse" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="h-4 w-32 rounded" style={{ background: 'var(--bg3)' }} />
          <div className="h-3 w-full mt-4 rounded-full" style={{ background: 'var(--bg3)' }} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl p-5 animate-pulse" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="h-4 w-48 rounded" style={{ background: 'var(--bg3)' }} />
            <div className="h-3 w-full mt-3 rounded" style={{ background: 'var(--bg3)' }} />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <svg className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm" style={{ color: 'var(--text3)' }}>
          Le bilan de compétences n&apos;a pas encore été configuré par l&apos;administrateur.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      {/* Progress header */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Bilan de compétences
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: progressColor }}>
              {percentage}%
            </span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              {completedCount}/{totalCount}
            </span>
          </div>
        </div>
        <div
          className="w-full h-2.5 rounded-full overflow-hidden"
          style={{ background: 'var(--bg3)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${percentage}%`,
              background: progressColor,
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
          {percentage === 100
            ? 'Toutes les compétences sont validées !'
            : percentage >= 75
              ? 'Excellent ! Tu es presque au bout.'
              : percentage >= 50
                ? 'Bon travail, continue comme ça !'
                : percentage >= 25
                  ? 'Tu avances bien, continue tes efforts.'
                  : 'Commence à cocher les compétences que tu maîtrises.'}
        </p>
      </div>

      {/* Skill items */}
      <div className="space-y-2.5">
        {items.map((item, index) => {
          const isCompleted = progress[item.id] || false
          const isToggling = toggling === item.id
          return (
            <button
              key={item.id}
              onClick={() => toggleSkill(item.id)}
              disabled={isToggling}
              className="w-full text-left rounded-xl p-4 transition-all duration-200"
              style={{
                background: isCompleted ? 'rgba(74, 222, 128, 0.05)' : 'var(--bg2)',
                border: `1px solid ${isCompleted ? 'rgba(74, 222, 128, 0.2)' : 'var(--border)'}`,
                opacity: isToggling ? 0.7 : 1,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center transition-all duration-200"
                  style={{
                    background: isCompleted ? 'var(--green)' : 'transparent',
                    border: isCompleted ? 'none' : '2px solid var(--text3)',
                  }}
                >
                  {isCompleted && (
                    <svg className="w-3 h-3" fill="none" stroke="#09090b" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: isCompleted ? 'rgba(74, 222, 128, 0.1)' : 'var(--bg3)',
                        color: isCompleted ? 'var(--green)' : 'var(--text3)',
                      }}
                    >
                      {index + 1}
                    </span>
                    <h3
                      className="text-sm font-semibold"
                      style={{
                        color: isCompleted ? 'var(--green)' : 'var(--text)',
                        textDecorationLine: isCompleted ? 'line-through' : 'none',
                        textDecorationColor: isCompleted ? 'rgba(74, 222, 128, 0.4)' : undefined,
                        textDecorationStyle: 'solid' as const,
                      }}
                    >
                      {item.title}
                    </h3>
                  </div>
                  {item.description && (
                    <p
                      className="text-xs mt-1.5 leading-relaxed"
                      style={{ color: isCompleted ? 'var(--text3)' : 'var(--text2)' }}
                    >
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
