'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SkillItem } from '@/lib/types'

export default function BilanCompetences() {
  const [items, setItems] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  const fetchItems = async () => {
    const { data } = await supabase
      .from('skill_items')
      .select('*')
      .order('sort_order', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)

    if (editingId) {
      const { error } = await supabase
        .from('skill_items')
        .update({ title: title.trim(), description: description.trim() })
        .eq('id', editingId)
      if (error) { console.error('Update error:', error); alert('Erreur: ' + error.message) }
    } else {
      const nextOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) + 1 : 0
      const { error } = await supabase
        .from('skill_items')
        .insert({ title: title.trim(), description: description.trim(), sort_order: nextOrder })
      if (error) { console.error('Insert error:', error); alert('Erreur: ' + error.message) }
    }

    setSaving(false)
    resetForm()
    fetchItems()
  }

  const handleEdit = (item: SkillItem) => {
    setEditingId(item.id)
    setTitle(item.title)
    setDescription(item.description)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce point du bilan ?')) return
    await supabase.from('skill_items').delete().eq('id', id)
    fetchItems()
  }

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const updated = [...items]
    const prevOrder = updated[index - 1].sort_order
    const currOrder = updated[index].sort_order
    await Promise.all([
      supabase.from('skill_items').update({ sort_order: currOrder }).eq('id', updated[index - 1].id),
      supabase.from('skill_items').update({ sort_order: prevOrder }).eq('id', updated[index].id),
    ])
    fetchItems()
  }

  const handleMoveDown = async (index: number) => {
    if (index === items.length - 1) return
    const updated = [...items]
    const nextOrder = updated[index + 1].sort_order
    const currOrder = updated[index].sort_order
    await Promise.all([
      supabase.from('skill_items').update({ sort_order: currOrder }).eq('id', updated[index + 1].id),
      supabase.from('skill_items').update({ sort_order: nextOrder }).eq('id', updated[index].id),
    ])
    fetchItems()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl p-6 animate-pulse" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="h-5 w-48 rounded" style={{ background: 'var(--bg3)' }} />
            <div className="h-3 w-full mt-3 rounded" style={{ background: 'var(--bg3)' }} />
            <div className="h-3 w-3/4 mt-2 rounded" style={{ background: 'var(--bg3)' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Bilan de compétences
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            {items.length} point{items.length !== 1 ? 's' : ''} — visible par tous les traders
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#09090b' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un point
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
            {editingId ? 'Modifier le point' : 'Nouveau point'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text2)' }}>
                Titre
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder='ex: Comprendre les Fibonacci'
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text2)' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Détaillez ce point en quelques lignes..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--green)', color: '#09090b' }}
              >
                {saving ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Ajouter'}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ color: 'var(--text3)', border: '1px solid var(--border)' }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 && !showForm ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Aucun point ajouté. Cliquez sur "Ajouter un point" pour commencer.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rounded-xl p-5 group"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <span
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: 'rgba(74, 222, 128, 0.1)', color: 'var(--green)' }}
                  >
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text2)' }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-20"
                    title="Monter"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-20"
                    title="Descendre"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)]"
                    title="Modifier"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(239,68,68,0.1)]"
                    title="Supprimer"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
