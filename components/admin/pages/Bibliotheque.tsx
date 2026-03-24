'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Resource } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function Bibliotheque() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'video' as 'video' | 'pdf' | 'doc', url: '', description: '' })
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<'all' | 'video' | 'pdf' | 'doc'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function fetchResources() {
    const { data } = await supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setResources(data)
    setLoading(false)
  }

  useEffect(() => { fetchResources() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    let fileUrl = form.url

    // Upload file to bucket if present
    if (file) {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error: uploadError } = await supabase.storage
        .from('docs')
        .upload(fileName, file, { contentType: file.type })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        setSubmitting(false)
        return
      }

      // Store the path (not a public URL — we'll generate signed URLs on read)
      fileUrl = fileName
    }

    await supabase.from('resources').insert({
      title: form.title,
      type: form.type,
      url: fileUrl,
      description: form.description,
      created_by: user?.id,
    })

    setShowForm(false)
    setForm({ title: '', type: 'video', url: '', description: '' })
    setFile(null)
    setSubmitting(false)
    fetchResources()
  }

  async function handleDelete(resource: Resource) {
    if (!confirm('Supprimer cette ressource ?')) return

    // Delete file from storage if it's a stored file (not a URL)
    if (resource.url && !resource.url.startsWith('http')) {
      await supabase.storage.from('docs').remove([resource.url])
    }

    await supabase.from('resources').delete().eq('id', resource.id)
    fetchResources()
  }

  async function handleOpen(resource: Resource) {
    if (resource.url?.startsWith('http')) {
      window.open(resource.url, '_blank')
      return
    }

    // Generate signed URL for stored files
    const { data } = await supabase.storage
      .from('docs')
      .createSignedUrl(resource.url!, 3600) // 1h

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  const isFileType = form.type === 'pdf' || form.type === 'doc'

  const typeIcons = {
    video: '🎬',
    pdf: '📄',
    doc: '📝',
  }

  const typeColors = {
    video: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    pdf: 'text-red-400 bg-red-500/10 border-red-500/20',
    doc: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  }

  const filtered = resources.filter(r => filter === 'all' || r.type === filter)

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
          <h1 className="text-xl font-semibold text-[#e8edf5]">Bibliothèque</h1>
          <p className="text-[#5a6a82] text-sm mt-1">Ressources pédagogiques pour vos traders</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter une ressource
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'video', 'pdf', 'doc'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-[#5a6a82] hover:text-[#a0aec0] bg-[#1c2333] border border-[rgba(255,255,255,0.07)]'
            }`}
          >
            {f === 'all' ? 'Tout' : f === 'video' ? '🎬 Vidéos' : f === 'pdf' ? '📄 PDFs' : '📝 Docs'}
          </button>
        ))}
      </div>

      {/* Add Resource Form */}
      {showForm && (
        <Card className="border border-green-500/20">
          <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">Nouvelle ressource</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Titre</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                placeholder="Titre de la ressource"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={e => {
                  setForm(f => ({ ...f, type: e.target.value as any, url: '' }))
                  setFile(null)
                }}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="video">Vidéo</option>
                <option value="pdf">PDF</option>
                <option value="doc">Document</option>
              </select>
            </div>

            <div className="col-span-2">
              {isFileType ? (
                <>
                  <label className="block text-xs text-[#5a6a82] mb-1.5">Fichier</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-[#1c2333] border border-dashed border-[rgba(255,255,255,0.12)] rounded-lg px-4 py-6 text-center cursor-pointer hover:border-green-500/40 transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={form.type === 'pdf' ? '.pdf' : '.doc,.docx,.txt,.md'}
                      className="hidden"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm text-green-400 font-medium">{file.name}</span>
                        <span className="text-xs text-[#5a6a82]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                      </div>
                    ) : (
                      <div>
                        <svg className="w-8 h-8 mx-auto text-[#5a6a82] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-xs text-[#5a6a82]">Cliquez pour sélectionner un fichier</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-xs text-[#5a6a82] mb-1.5">URL de la vidéo</label>
                  <input
                    type="url"
                    required
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                    placeholder="https://youtube.com/..."
                  />
                </>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-[#5a6a82] mb-1.5">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82] resize-none"
                placeholder="Description de la ressource..."
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setFile(null) }}>Annuler</Button>
              <Button type="submit" loading={submitting} disabled={isFileType && !file}>
                {submitting ? 'Upload en cours...' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Resources Grid */}
      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucune ressource trouvée</p>
            <p className="text-[#5a6a82] text-xs mt-1">Ajoutez des vidéos, PDFs et documents pour vos traders</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(resource => (
            <Card key={resource.id} className="hover:border-[rgba(255,255,255,0.15)] transition-all group">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${typeColors[resource.type]}`}>
                  {typeIcons[resource.type]} {resource.type.toUpperCase()}
                </span>
                <button
                  onClick={() => handleDelete(resource)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#5a6a82] hover:text-red-400"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <h3 className="text-sm font-semibold text-[#e8edf5] mb-1 line-clamp-2">{resource.title}</h3>
              {resource.description && (
                <p className="text-xs text-[#5a6a82] line-clamp-2 mb-3">{resource.description}</p>
              )}
              {resource.url && (
                <button
                  onClick={() => handleOpen(resource)}
                  className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                >
                  Ouvrir
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
              <p className="text-xs text-[#5a6a82] mt-3">
                {new Date(resource.created_at).toLocaleDateString('fr-FR')}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
