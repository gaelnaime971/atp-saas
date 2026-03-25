'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface AdminNote {
  id: string
  trader_id: string
  content: string
  created_at: string
}

export default function Notes() {
  const [traders, setTraders] = useState<Profile[]>([])
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null)
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hoveredNote, setHoveredNote] = useState<string | null>(null)
  const supabase = createClient()

  async function fetchTraders() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'trader')
      .order('full_name', { ascending: true })

    if (data) setTraders(data)
    setLoading(false)
  }

  async function fetchNotes(traderId: string) {
    const { data } = await supabase
      .from('admin_notes')
      .select('*')
      .eq('trader_id', traderId)
      .order('created_at', { ascending: false })

    if (data) setNotes(data)
  }

  useEffect(() => { fetchTraders() }, [])

  useEffect(() => {
    if (selectedTraderId) {
      fetchNotes(selectedTraderId)
    } else {
      setNotes([])
    }
  }, [selectedTraderId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTraderId || !content.trim()) return

    setSaving(true)
    await supabase.from('admin_notes').insert({
      trader_id: selectedTraderId,
      content: content.trim(),
    })
    setContent('')
    await fetchNotes(selectedTraderId)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!selectedTraderId) return
    await supabase.from('admin_notes').delete().eq('id', id)
    await fetchNotes(selectedTraderId)
  }

  const selectedTrader = traders.find(t => t.id === selectedTraderId) ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#e8edf5]">Notes privées</h1>
        <p className="text-[#5a6a82] text-sm mt-1">
          Notes personnelles par trader &middot; {traders.length} trader{traders.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Selector + Form */}
        <div className="space-y-4">
          <Card>
            <label className="block text-xs text-[#5a6a82] uppercase tracking-wider mb-2 font-medium">
              Sélectionner un trader
            </label>
            <select
              value={selectedTraderId ?? ''}
              onChange={e => setSelectedTraderId(e.target.value || null)}
              className="w-full rounded-lg px-3 py-2 text-sm text-[#e8edf5] border transition-colors focus:outline-none focus:border-green-500/40"
              style={{
                background: '#1c2333',
                borderColor: 'rgba(255,255,255,0.07)',
              }}
            >
              <option value="">-- Choisir un trader --</option>
              {traders.map(t => (
                <option key={t.id} value={t.id}>
                  {t.full_name ?? t.email ?? 'Trader'}{t.plan_type ? ` (${t.plan_type})` : ''}
                </option>
              ))}
            </select>
          </Card>

          {selectedTraderId && (
            <Card>
              <form onSubmit={handleSubmit}>
                <label className="block text-xs text-[#5a6a82] uppercase tracking-wider mb-2 font-medium">
                  Nouvelle note
                </label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Écrire une note privée..."
                  rows={5}
                  className="w-full rounded-lg px-3 py-2 text-sm text-[#e8edf5] border transition-colors focus:outline-none focus:border-green-500/40 resize-none mb-3"
                  style={{
                    background: '#1c2333',
                    borderColor: 'rgba(255,255,255,0.07)',
                  }}
                />
                <Button type="submit" loading={saving} disabled={!content.trim()}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Right: Notes list */}
        <div>
          {!selectedTraderId ? (
            <Card>
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#1c2333] rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[#5a6a82]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <p className="text-[#a0aec0] font-medium">Sélectionnez un trader</p>
                <p className="text-[#5a6a82] text-sm mt-1">Choisissez un trader pour voir et ajouter des notes</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Trader header */}
              <div className="flex items-center gap-3 px-1 mb-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border bg-green-500/10 border-green-500/20"
                >
                  <span className="text-xs font-bold text-green-400">
                    {(selectedTrader?.full_name || 'T')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-[#e8edf5]">
                    {selectedTrader?.full_name ?? 'Trader'}
                  </span>
                  {selectedTrader?.plan_type && (
                    <span className="ml-2 px-2 py-0.5 bg-[#1c2333] rounded text-xs text-[#a0aec0] font-medium">
                      {selectedTrader.plan_type}
                    </span>
                  )}
                </div>
                <span className="ml-auto text-xs text-[#5a6a82]">
                  {notes.length} note{notes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {notes.length === 0 ? (
                <Card>
                  <div className="text-center py-10">
                    <p className="text-[#5a6a82] text-sm">Aucune note pour ce trader</p>
                  </div>
                </Card>
              ) : (
                notes.map(note => (
                  <Card
                    key={note.id}
                    className="group relative hover:border-[rgba(255,255,255,0.12)] transition-colors"
                    onMouseEnter={() => setHoveredNote(note.id)}
                    onMouseLeave={() => setHoveredNote(null)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e8edf5] whitespace-pre-wrap leading-relaxed">
                          {note.content}
                        </p>
                        <p className="text-[10px] text-[#5a6a82] mt-2 font-mono">
                          {new Date(note.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                          {' à '}
                          {new Date(note.created_at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {hoveredNote === note.id && (
                        <button
                          onClick={() => handleDelete(note.id)}
                          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Supprimer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
