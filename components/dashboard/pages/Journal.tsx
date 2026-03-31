'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { JournalEntry } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

type Category = 'Technique' | 'Psychologie' | 'Macro' | 'Risk' | 'Autre'

const CATEGORIES: Category[] = ['Technique', 'Psychologie', 'Macro', 'Risk', 'Autre']

const CATEGORY_TO_MOOD: Record<Category, JournalEntry['mood']> = {
  Technique: 'neutral',
  Psychologie: 'good',
  Macro: 'neutral',
  Risk: 'neutral',
  Autre: 'neutral',
}

const CATEGORY_COLORS: Record<Category, string> = {
  Technique: '#60a5fa',
  Psychologie: '#a78bfa',
  Macro: '#34d399',
  Risk: '#fbbf24',
  Autre: '#94a3b8',
}

function parseCategory(content: string | null): { category: string; text: string } {
  if (!content) return { category: 'Autre', text: '' }
  const match = content.match(/^\[(\w+)\]\s*([\s\S]*)$/)
  if (match) return { category: match[1], text: match[2] }
  return { category: 'Autre', text: content }
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState<Category>('Technique')
  const [content, setContent] = useState('')

  const fetchEntries = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('trader_id', user.id)
      .order('entry_date', { ascending: false })

    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return

    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSubmitting(false)
      return
    }

    const storedContent = `[${category}] ${content.trim()}`

    await supabase.from('journal_entries').insert({
      trader_id: user.id,
      entry_date: date,
      content: storedContent,
      mood: CATEGORY_TO_MOOD[category],
    })

    setContent('')
    setDate(todayISO())
    setCategory('Technique')
    setSubmitting(false)
    await fetchEntries()
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          Journal
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>
          Notez vos observations et réflexions de trading
        </p>
      </div>

      {/* Grid-2 layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Left card - New entry form */}
        <Card>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>
            Nouvelle entrée
          </p>
          <form onSubmit={handleSubmit}>
            {/* Date */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-sm rounded-lg"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg3, #18181b)',
                  border: '1px solid var(--border, rgba(255,255,255,0.07))',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Category */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
                Catégorie
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
                className="text-sm rounded-lg"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg3, #18181b)',
                  border: '1px solid var(--border, rgba(255,255,255,0.07))',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Content */}
            <div style={{ marginBottom: 18 }}>
              <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
                Contenu
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Écrivez votre entrée de journal..."
                className="text-sm rounded-lg"
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: '10px 12px',
                  background: 'var(--bg3, #18181b)',
                  border: '1px solid var(--border, rgba(255,255,255,0.07))',
                  color: 'var(--text)',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              className="w-full"
            >
              Ajouter l&apos;entrée
            </Button>
          </form>
        </Card>

        {/* Right side - Recent entries */}
        <div>
          <Card>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)', marginBottom: 16 }}>
              Entrées récentes
            </p>

            {loading ? (
              <p className="text-sm" style={{ color: 'var(--text3)' }}>Chargement...</p>
            ) : entries.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text3)' }}>
                Aucune entrée pour le moment
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {entries.map(entry => {
                  const { category: cat, text } = parseCategory(entry.content)
                  const catColor = CATEGORY_COLORS[cat as Category] ?? CATEGORY_COLORS.Autre
                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${catColor}`,
                      }}
                    >
                      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                        <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>
                          {entry.entry_date}
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: catColor,
                            background: `${catColor}15`,
                            padding: '1px 8px',
                            borderRadius: 4,
                          }}
                        >
                          {cat}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text2)', lineHeight: 1.5 }}>
                        {text}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
