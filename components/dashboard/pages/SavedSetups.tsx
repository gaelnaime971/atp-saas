'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const INSTRUMENTS = ['ES', 'NQ', 'DAX', 'YM', 'MYM', 'MNQ', 'GC', 'MGC']

interface SavedSetup {
  id: string
  title: string
  instrument: string | null
  description: string | null
  image_url: string | null
  tags: string[]
  created_at: string
}

export default function SavedSetups() {
  const [setups, setSetups] = useState<SavedSetup[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewSetup, setViewSetup] = useState<SavedSetup | null>(null)

  const [formTitle, setFormTitle] = useState('')
  const [formInstrument, setFormInstrument] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTags, setFormTags] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  async function fetchSetups(uid: string) {
    const { data } = await supabase.from('saved_setups').select('*').eq('trader_id', uid).order('created_at', { ascending: false })
    if (data) setSetups(data as SavedSetup[])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      await fetchSetups(user.id)
      setLoading(false)
    }
    init()
  }, [])

  async function uploadImage(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `setups/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('chat-images').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      setImagePreview(URL.createObjectURL(file))
    }
    setUploading(false)
  }

  function resetForm() {
    setFormTitle('')
    setFormInstrument('')
    setFormDescription('')
    setFormTags('')
    setImagePreview(null)
    setImageUrl(null)
    setShowForm(false)
  }

  async function handleSave() {
    if (!userId || !formTitle.trim()) return
    setSaving(true)
    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean)
    await supabase.from('saved_setups').insert({
      trader_id: userId,
      title: formTitle.trim(),
      instrument: formInstrument || null,
      description: formDescription.trim() || null,
      image_url: imageUrl,
      tags,
    })
    setSaving(false)
    resetForm()
    await fetchSetups(userId)
  }

  async function deleteSetup(id: string) {
    if (!userId || !confirm('Supprimer ce setup ?')) return
    await supabase.from('saved_setups').delete().eq('id', id)
    setViewSetup(null)
    await fetchSetups(userId)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', background: 'var(--bg3)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Bibliothèque de Setups</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>{setups.length} setup{setups.length !== 1 ? 's' : ''} sauvegardé{setups.length !== 1 ? 's' : ''}</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau setup
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Nouveau setup</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Titre *</label>
              <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="ex: Break & Retest ES 5min" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Instrument</label>
              <select value={formInstrument} onChange={e => setFormInstrument(e.target.value)} style={inputStyle}>
                <option value="">Tous</option>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Description</label>
              <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Décrivez le setup, les conditions d'entrée..." style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Tags (séparés par des virgules)</label>
              <input type="text" value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="break, retest, 5min" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>Screenshot</label>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
              <div className="flex items-center gap-3">
                <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  {uploading ? 'Upload...' : imagePreview ? 'Changer' : 'Ajouter une image'}
                </button>
                {imagePreview && <img src={imagePreview} alt="preview" style={{ height: 36, borderRadius: 6, border: '1px solid var(--border)' }} />}
              </div>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <Button variant="secondary" onClick={resetForm}>Annuler</Button>
              <Button onClick={handleSave} loading={saving} disabled={!formTitle.trim()}>Sauvegarder</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Grid */}
      {setups.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bg3)' }}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Aucun setup sauvegardé</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Sauvegardez vos meilleurs trades pour référence future</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {setups.map(s => (
            <div
              key={s.id}
              onClick={() => setViewSetup(s)}
              className="rounded-xl border cursor-pointer transition-all hover:border-green-500/30"
              style={{ background: 'var(--bg2)', borderColor: 'var(--border)', overflow: 'hidden' }}
            >
              {s.image_url && (
                <img src={s.image_url} alt={s.title} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{s.title}</p>
                  {s.instrument && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono shrink-0" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>{s.instrument}</span>
                  )}
                </div>
                {s.description && (
                  <p className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text3)' }}>{s.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {s.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>{tag}</span>
                  ))}
                </div>
                <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text3)' }}>
                  {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {viewSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && setViewSetup(null)}>
          <div className="w-full max-w-2xl rounded-xl border overflow-hidden" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', maxHeight: '90vh' }}>
            {viewSetup.image_url && (
              <img src={viewSetup.image_url} alt={viewSetup.title} style={{ width: '100%', maxHeight: 350, objectFit: 'contain', background: '#000' }} />
            )}
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{viewSetup.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {viewSetup.instrument && <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>{viewSetup.instrument}</span>}
                    <span className="text-xs font-mono" style={{ color: 'var(--text3)' }}>{new Date(viewSetup.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => deleteSetup(viewSetup.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>Supprimer</button>
                  <button onClick={() => setViewSetup(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}>Fermer</button>
                </div>
              </div>
              {viewSetup.description && (
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text2)' }}>{viewSetup.description}</p>
              )}
              {viewSetup.tags.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {viewSetup.tags.map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
