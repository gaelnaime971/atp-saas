'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Resource } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

// ── Types ─────────────────────────────────────────────────────────

type TabKey = 'video' | 'pdf'
type VideoMode = 'external' | 'upload'

interface FormState {
  id: string | null
  title: string
  description: string
  category: string
  order_idx: number
  // video
  videoMode: VideoMode
  externalUrl: string
  thumbnailUrl: string
  durationInput: string // accepts "MM:SS" or seconds as string
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  description: '',
  category: '',
  order_idx: 0,
  videoMode: 'external',
  externalUrl: '',
  thumbnailUrl: '',
  durationInput: '',
}

// ── Helpers ───────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_')
}

function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseDurationInput(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => parseInt(p, 10))
    if (parts.some(p => isNaN(p))) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
  }
  const n = parseInt(trimmed, 10)
  return isNaN(n) ? null : n
}

function detectVideoProvider(url: string): 'youtube' | 'vimeo' | 'other' | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) return 'youtube'
    if (u.hostname.includes('vimeo.com')) return 'vimeo'
    return 'other'
  } catch {
    return null
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function isHttpUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url)
}

// ── Component ─────────────────────────────────────────────────────

export default function Bibliotheque() {
  const supabase = createClient()

  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('video')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // form / modal
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draggedId = useRef<string | null>(null)

  const fetchResources = useCallback(async () => {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .order('order_idx', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Failed to fetch resources:', error)
    }
    if (data) setResources(data as Resource[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchResources()
  }, [fetchResources])

  // ── Derived data ────────────────────────────────────────────────

  const videos = useMemo(
    () => resources.filter(r => r.type === 'video').sort((a, b) => (a.order_idx - b.order_idx) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())),
    [resources],
  )
  const pdfs = useMemo(
    () => resources.filter(r => r.type === 'pdf' || r.type === 'doc').sort((a, b) => (a.order_idx - b.order_idx) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())),
    [resources],
  )

  const currentList = tab === 'video' ? videos : pdfs
  const filteredList = useMemo(
    () => (activeCategory ? currentList.filter(r => (r.category ?? '') === activeCategory) : currentList),
    [currentList, activeCategory],
  )

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of currentList) {
      const cat = r.category ?? 'Sans catégorie'
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [currentList])

  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of resources) {
      if (r.category && r.category.trim()) set.add(r.category.trim())
    }
    return Array.from(set).sort()
  }, [resources])

  const stats = useMemo(() => {
    const totalVideos = videos.length
    const totalPdfs = pdfs.length
    const totalDuration = videos.reduce((acc, v) => acc + (v.duration_seconds ?? 0), 0)
    const distinctCategories = new Set<string>()
    for (const r of resources) {
      if (r.category && r.category.trim()) distinctCategories.add(r.category.trim())
    }
    return {
      totalVideos,
      totalPdfs,
      totalDuration,
      distinctCategories: distinctCategories.size,
    }
  }, [videos, pdfs, resources])

  // Reset category filter when changing tab
  useEffect(() => {
    setActiveCategory(null)
  }, [tab])

  // ── Form handlers ───────────────────────────────────────────────

  function openCreate() {
    setErrorMsg(null)
    const nextOrder =
      currentList.length > 0
        ? Math.max(...currentList.map(r => r.order_idx)) + 1
        : 1
    setForm({ ...EMPTY_FORM, order_idx: nextOrder })
    setFile(null)
    setShowForm(true)
  }

  function openEdit(r: Resource) {
    setErrorMsg(null)
    const isVideo = r.type === 'video'
    const externalLink = isHttpUrl(r.url) ? (r.url ?? '') : ''
    setForm({
      id: r.id,
      title: r.title,
      description: r.description ?? '',
      category: r.category ?? '',
      order_idx: r.order_idx,
      videoMode: isVideo && !externalLink ? 'upload' : 'external',
      externalUrl: externalLink,
      thumbnailUrl: r.thumbnail_url ?? '',
      durationInput: r.duration_seconds ? formatDuration(r.duration_seconds) : '',
    })
    setFile(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setFile(null)
    setErrorMsg(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const isEdit = form.id !== null
      const isVideo = tab === 'video'

      let urlToStore: string | null = null

      if (isVideo) {
        if (form.videoMode === 'external') {
          if (!form.externalUrl.trim()) {
            setErrorMsg('Veuillez saisir une URL vidéo.')
            setSubmitting(false)
            return
          }
          urlToStore = form.externalUrl.trim()
        } else {
          // upload mode
          if (file) {
            const sizeMB = file.size / 1024 / 1024
            if (sizeMB > 50) {
              setErrorMsg(`Fichier trop volumineux (${sizeMB.toFixed(1)} MB). Limite Supabase : 50 MB. Utilise plutôt une URL YouTube/Vimeo pour les vidéos lourdes.`)
              setSubmitting(false)
              return
            }
            const fileName = `${Date.now()}-${sanitizeFilename(file.name)}`
            try {
              const { error: upErr } = await supabase.storage
                .from('docs')
                .upload(fileName, file, { contentType: file.type, upsert: false })
              if (upErr) {
                console.error('Upload error:', upErr)
                setErrorMsg(`Échec upload : ${upErr.message}`)
                setSubmitting(false)
                return
              }
              urlToStore = fileName
            } catch (uploadErr) {
              console.error('Upload exception:', uploadErr)
              setErrorMsg(`Erreur upload : ${uploadErr instanceof Error ? uploadErr.message : 'inconnue'}. Réessaie ou utilise une URL externe.`)
              setSubmitting(false)
              return
            }
          } else if (isEdit) {
            // keep existing url
            const existing = resources.find(r => r.id === form.id)
            urlToStore = existing?.url ?? null
          } else {
            setErrorMsg('Veuillez sélectionner un fichier vidéo.')
            setSubmitting(false)
            return
          }
        }
      } else {
        // PDF tab
        if (file) {
          const sizeMB = file.size / 1024 / 1024
          if (sizeMB > 50) {
            setErrorMsg(`Fichier trop volumineux (${sizeMB.toFixed(1)} MB). Limite : 50 MB.`)
            setSubmitting(false)
            return
          }
          const fileName = `${Date.now()}-${sanitizeFilename(file.name)}`
          try {
            const { error: upErr } = await supabase.storage
              .from('docs')
              .upload(fileName, file, { contentType: file.type, upsert: false })
            if (upErr) {
              console.error('Upload error:', upErr)
              setErrorMsg(`Échec upload : ${upErr.message}`)
              setSubmitting(false)
              return
            }
            urlToStore = fileName
          } catch (uploadErr) {
            console.error('Upload exception:', uploadErr)
            setErrorMsg(`Erreur upload : ${uploadErr instanceof Error ? uploadErr.message : 'inconnue'}.`)
            setSubmitting(false)
            return
          }
        } else if (isEdit) {
          const existing = resources.find(r => r.id === form.id)
          urlToStore = existing?.url ?? null
        } else {
          setErrorMsg('Veuillez sélectionner un fichier PDF.')
          setSubmitting(false)
          return
        }
      }

      const durationSeconds = isVideo ? parseDurationInput(form.durationInput) : null

      const payload = {
        title: form.title.trim(),
        type: isVideo ? 'video' : 'pdf',
        url: urlToStore,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        order_idx: Number.isFinite(form.order_idx) ? form.order_idx : 0,
        thumbnail_url: isVideo ? (form.thumbnailUrl.trim() || null) : null,
        duration_seconds: durationSeconds,
      }

      if (isEdit && form.id) {
        const { error } = await supabase
          .from('resources')
          .update(payload)
          .eq('id', form.id)
        if (error) {
          setErrorMsg(error.message)
          setSubmitting(false)
          return
        }
      } else {
        const { error } = await supabase
          .from('resources')
          .insert({ ...payload, created_by: user?.id })
        if (error) {
          setErrorMsg(error.message)
          setSubmitting(false)
          return
        }
      }

      closeForm()
      await fetchResources()
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err?.message ?? 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(r: Resource) {
    if (!confirm(`Supprimer "${r.title}" ?`)) return

    if (r.url && !isHttpUrl(r.url)) {
      await supabase.storage.from('docs').remove([r.url])
    }
    await supabase.from('resources').delete().eq('id', r.id)
    fetchResources()
  }

  async function handlePreview(r: Resource) {
    if (!r.url) return
    if (isHttpUrl(r.url)) {
      window.open(r.url, '_blank')
      return
    }
    const { data, error } = await supabase.storage
      .from('docs')
      .createSignedUrl(r.url, 3600)
    if (error) {
      console.error('Signed URL error:', error)
      alert('Impossible de générer le lien signé.')
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function reorderList(newList: Resource[]) {
    // Renumber sequentially 0, 10, 20, 30... and persist
    // Spacing of 10 lets us insert later without renumbering everything
    const updates = newList.map((r, i) => ({ id: r.id, order_idx: i + 1 }))

    // Optimistic UI update
    setResources(prev => {
      const map = new Map(updates.map(u => [u.id, u.order_idx]))
      return prev.map(r => map.has(r.id) ? { ...r, order_idx: map.get(r.id)! } : r)
    })

    // Persist in parallel
    await Promise.all(
      updates.map(u => supabase.from('resources').update({ order_idx: u.order_idx }).eq('id', u.id))
    )
  }

  function moveUp(r: Resource) {
    const list = [...currentList]
    const idx = list.findIndex(x => x.id === r.id)
    if (idx <= 0) return
    ;[list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]
    reorderList(list)
  }

  function moveDown(r: Resource) {
    const list = [...currentList]
    const idx = list.findIndex(x => x.id === r.id)
    if (idx === -1 || idx >= list.length - 1) return
    ;[list[idx], list[idx + 1]] = [list[idx + 1], list[idx]]
    reorderList(list)
  }

  // ── Loading ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-6 h-6 rounded-full animate-spin"
          style={{ border: '2px solid var(--green)', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Bibliothèque</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            Gérer le contenu pédagogique e-learning (vidéos &amp; documents)
          </p>
        </div>
        <Button onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {tab === 'video' ? 'Nouvelle vidéo' : 'Nouveau document'}
        </Button>
      </div>

      {/* Stats card */}
      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Vidéos" value={stats.totalVideos.toString()} accent="var(--green)" />
        <StatTile label="Durée totale" value={formatDuration(stats.totalDuration)} accent="#a855f7" />
        <StatTile label="Documents PDF" value={stats.totalPdfs.toString()} accent="#3b82f6" />
        <StatTile label="Catégories" value={stats.distinctCategories.toString()} accent="#f59e0b" />
      </div>

      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        <TabButton
          active={tab === 'video'}
          label="Vidéos de formation"
          count={videos.length}
          onClick={() => setTab('video')}
        />
        <TabButton
          active={tab === 'pdf'}
          label="Documents PDF"
          count={pdfs.length}
          onClick={() => setTab('pdf')}
        />
      </div>

      {/* Categories chips */}
      {categoryStats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <CategoryChip
            label="Toutes"
            count={currentList.length}
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categoryStats.map(([cat, count]) => (
            <CategoryChip
              key={cat}
              label={cat}
              count={count}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            />
          ))}
        </div>
      )}

      {/* List */}
      {filteredList.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text2)' }}>
              {tab === 'video' ? 'Aucune vidéo' : 'Aucun document'}
              {activeCategory ? ` dans la catégorie "${activeCategory}"` : ''}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
              Cliquez sur «{tab === 'video' ? ' Nouvelle vidéo' : ' Nouveau document'}» pour commencer
            </p>
          </div>
        </Card>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
        >
          {/* Table header */}
          <div
            className="grid items-center gap-3 px-4 py-3 text-[10px] uppercase tracking-wider font-bold"
            style={{
              gridTemplateColumns: tab === 'video'
                ? '36px 80px 56px 140px minmax(0,1fr) 80px minmax(0,1fr) 180px'
                : '36px 56px 140px minmax(0,1fr) minmax(0,1fr) 180px',
              color: 'var(--text3)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg3)',
            }}
          >
            <div></div>
            {tab === 'video' && <div>Aperçu</div>}
            <div>#</div>
            <div>Catégorie</div>
            <div>Titre</div>
            {tab === 'video' && <div>Durée</div>}
            <div>Description</div>
            <div className="text-right">Actions</div>
          </div>

          {filteredList.map((r, idx) => (
            <ResourceRow
              key={r.id}
              resource={r}
              tab={tab}
              isFirst={idx === 0}
              isLast={idx === filteredList.length - 1}
              onMoveUp={() => moveUp(r)}
              onMoveDown={() => moveDown(r)}
              onPreview={() => handlePreview(r)}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r)}
              onDragStartId={() => { draggedId.current = r.id }}
              onDropTarget={() => {
                const fromId = draggedId.current
                draggedId.current = null
                if (!fromId || fromId === r.id) return
                const list = [...currentList]
                const fromIdx = list.findIndex(x => x.id === fromId)
                const toIdx = list.findIndex(x => x.id === r.id)
                if (fromIdx < 0 || toIdx < 0) return
                const [moved] = list.splice(fromIdx, 1)
                list.splice(toIdx, 0, moved)
                reorderList(list)
              }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <Modal onClose={closeForm}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {form.id
                  ? `Modifier ${tab === 'video' ? 'la vidéo' : 'le document'}`
                  : `Nouvelle ${tab === 'video' ? 'vidéo' : 'ressource PDF'}`}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--text3)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {errorMsg && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
              >
                {errorMsg}
              </div>
            )}

            {/* Common fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Titre" required>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Titre de la ressource"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </Field>

              <Field label="Catégorie">
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: form.category ? 'var(--text)' : 'var(--text3)', cursor: 'pointer' }}
                >
                  <option value="">— Sélectionner —</option>
                  <option value="Atelier technique">Atelier technique</option>
                  <option value="Atelier psycho (Vanille)">Atelier psycho (Vanille)</option>
                  <option value="Psycho (Gaël)">Psycho (Gaël)</option>
                  <option value="Coaching live">Coaching live</option>
                </select>
              </Field>

              <Field label="Ordre (#)">
                <input
                  type="number"
                  min={0}
                  value={form.order_idx}
                  onChange={e => setForm(f => ({ ...f, order_idx: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </Field>

              {tab === 'video' && (() => {
                const total = parseDurationInput(form.durationInput) ?? 0
                const h = Math.floor(total / 3600)
                const m = Math.floor((total % 3600) / 60)
                const s = total % 60
                const updateParts = (nh: number, nm: number, ns: number) => {
                  const totalSec = Math.max(0, nh * 3600 + nm * 60 + ns)
                  setForm(f => ({ ...f, durationInput: totalSec > 0 ? String(totalSec) : '' }))
                }
                return (
                  <Field label="Durée">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={h || ''}
                        onChange={e => updateParts(parseInt(e.target.value) || 0, m, s)}
                        placeholder="0"
                        className="rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ width: 60, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>h</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={m || ''}
                        onChange={e => updateParts(h, parseInt(e.target.value) || 0, s)}
                        placeholder="0"
                        className="rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ width: 60, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>min</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={s || ''}
                        onChange={e => updateParts(h, m, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="rounded-lg px-2 py-2 text-sm text-center focus:outline-none"
                        style={{ width: 60, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      />
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>sec</span>
                    </div>
                  </Field>
                )
              })()}
            </div>

            {/* Type-specific fields */}
            {tab === 'video' ? (
              <div className="space-y-3">
                {/* Mode toggle */}
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-lg"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, videoMode: 'external' }))}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: form.videoMode === 'external' ? 'var(--bg4)' : 'transparent',
                      color: form.videoMode === 'external' ? 'var(--text)' : 'var(--text3)',
                    }}
                  >
                    URL externe (YouTube/Vimeo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, videoMode: 'upload' }))}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: form.videoMode === 'upload' ? 'var(--bg4)' : 'transparent',
                      color: form.videoMode === 'upload' ? 'var(--text)' : 'var(--text3)',
                    }}
                  >
                    Upload fichier
                  </button>
                </div>

                {form.videoMode === 'external' ? (
                  <Field label="URL vidéo" required>
                    <input
                      type="url"
                      value={form.externalUrl}
                      onChange={e => setForm(f => ({ ...f, externalUrl: e.target.value }))}
                      placeholder="https://youtube.com/watch?v=… ou https://vimeo.com/…"
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                    {form.externalUrl && (
                      <ProviderHint url={form.externalUrl} />
                    )}
                  </Field>
                ) : (
                  <Field label="Fichier vidéo (mp4)">
                    <FileDrop
                      file={file}
                      accept="video/mp4,video/*"
                      onPick={() => fileInputRef.current?.click()}
                      placeholder="Cliquez pour choisir un fichier vidéo"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/*"
                      className="hidden"
                      onChange={e => setFile(e.target.files?.[0] ?? null)}
                    />
                  </Field>
                )}

                <Field label="Miniature (URL, optionnel)">
                  <input
                    type="url"
                    value={form.thumbnailUrl}
                    onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))}
                    placeholder="https://… (image)"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  {form.thumbnailUrl && (
                    <div className="mt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.thumbnailUrl}
                        alt="aperçu"
                        className="rounded-lg"
                        style={{ maxWidth: 200, maxHeight: 120, objectFit: 'cover', border: '1px solid var(--border)' }}
                        onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  )}
                </Field>
              </div>
            ) : (
              <Field label="Fichier PDF">
                <FileDrop
                  file={file}
                  accept=".pdf,application/pdf"
                  onPick={() => fileInputRef.current?.click()}
                  placeholder="Cliquez pour choisir un fichier PDF"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
                {form.id && !file && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                    Laissez vide pour conserver le fichier actuel
                  </p>
                )}
              </Field>
            )}

            <Field label="Description">
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Décrivez brièvement le contenu…"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeForm}>
                Annuler
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting ? 'Enregistrement…' : (form.id ? 'Mettre à jour' : 'Créer')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      style={{
        background: active ? 'var(--bg4)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
      }}
    >
      <span>{label}</span>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-md font-bold"
        style={{
          background: active ? 'var(--green)' : 'var(--bg3)',
          color: active ? '#09090b' : 'var(--text2)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--green-dim)' : 'var(--bg2)',
        border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
        color: active ? 'var(--green)' : 'var(--text2)',
      }}
    >
      {label} <span style={{ color: active ? 'var(--green)' : 'var(--text3)' }}>· {count}</span>
    </button>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] mb-1.5 font-medium" style={{ color: 'var(--text3)' }}>
        {label} {required && <span style={{ color: 'var(--green)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

function ProviderHint({ url }: { url: string }) {
  const provider = detectVideoProvider(url)
  if (!provider) return null
  const label = provider === 'youtube' ? 'YouTube détecté' : provider === 'vimeo' ? 'Vimeo détecté' : 'URL externe'
  const color = provider === 'youtube' ? '#ef4444' : provider === 'vimeo' ? '#3b82f6' : 'var(--text3)'
  return (
    <p className="text-[11px] mt-1.5" style={{ color }}>
      ✓ {label}
    </p>
  )
}

function FileDrop({
  file,
  accept,
  onPick,
  placeholder,
}: {
  file: File | null
  accept: string
  onPick: () => void
  placeholder: string
}) {
  return (
    <div
      onClick={onPick}
      className="rounded-lg px-4 py-6 text-center cursor-pointer transition-colors"
      style={{
        background: 'var(--bg3)',
        border: `1px dashed ${file ? 'var(--green)' : 'var(--border)'}`,
      }}
    >
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--green)' }}>
            {file.name}
          </span>
          <span className="text-xs" style={{ color: 'var(--text3)' }}>
            ({formatBytes(file.size)})
          </span>
        </div>
      ) : (
        <div>
          <svg
            className="w-8 h-8 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: 'var(--text3)' }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-xs" style={{ color: 'var(--text3)' }}>{placeholder}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Formats acceptés : {accept.replace(/,/g, ', ')}
          </p>
        </div>
      )}
    </div>
  )
}

function ResourceRow({
  resource,
  tab,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onPreview,
  onEdit,
  onDelete,
  onDragStartId,
  onDropTarget,
}: {
  resource: Resource
  tab: TabKey
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
  onDragStartId: () => void
  onDropTarget: () => void
}) {
  const [hover, setHover] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const externalLink = isHttpUrl(resource.url)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDropTarget() }}
      className="grid items-center gap-3 px-4 py-3 transition-colors"
      style={{
        gridTemplateColumns: tab === 'video'
          ? '36px 80px 56px 140px minmax(0,1fr) 80px minmax(0,1fr) 180px'
          : '36px 56px 140px minmax(0,1fr) minmax(0,1fr) 180px',
        background: dragOver ? 'rgba(34,197,94,0.08)' : hover ? 'var(--bg3)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        borderTop: dragOver ? '2px solid var(--green)' : 'none',
      }}
    >
      {/* Drag handle (real drag-and-drop) */}
      <div
        draggable
        onDragStart={() => onDragStartId()}
        className="flex flex-col items-center justify-center"
        style={{ color: hover ? 'var(--text2)' : 'var(--text3)', opacity: hover ? 1 : 0.5, cursor: 'grab' }}
        title="Glisser pour réordonner"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>

      {/* Thumbnail (videos only) */}
      {tab === 'video' && (
        <div
          className="rounded-md overflow-hidden flex items-center justify-center"
          style={{
            width: 72,
            height: 42,
            background: 'var(--bg4)',
            border: '1px solid var(--border)',
          }}
        >
          {resource.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resource.thumbnail_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <span style={{ fontSize: 18 }}>🎬</span>
          )}
        </div>
      )}

      {/* Order */}
      <div className="text-sm font-mono" style={{ color: 'var(--text2)' }}>
        #{resource.order_idx}
      </div>

      {/* Category */}
      <div className="text-xs truncate">
        {resource.category ? (
          <span
            className="px-2 py-0.5 rounded-md"
            style={{
              background: 'var(--bg4)',
              color: 'var(--text2)',
              border: '1px solid var(--border)',
            }}
          >
            {resource.category}
          </span>
        ) : (
          <span style={{ color: 'var(--text3)' }}>—</span>
        )}
      </div>

      {/* Title */}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
          {resource.title}
        </div>
        {tab === 'video' && externalLink && (
          <div className="text-[10px] truncate" style={{ color: 'var(--text3)' }}>
            {resource.url}
          </div>
        )}
      </div>

      {/* Duration (video) */}
      {tab === 'video' && (
        <div className="text-xs font-mono" style={{ color: 'var(--text2)' }}>
          {formatDuration(resource.duration_seconds)}
        </div>
      )}

      {/* Description */}
      <div className="text-xs truncate" style={{ color: 'var(--text2)' }}>
        {resource.description ?? <span style={{ color: 'var(--text3)' }}>—</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <IconBtn
          title="Monter"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </IconBtn>
        <IconBtn
          title="Descendre"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </IconBtn>
        {(tab === 'pdf' || (tab === 'video' && resource.url)) && (
          <IconBtn title="Aperçu" onClick={onPreview}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </IconBtn>
        )}
        <IconBtn title="Modifier" onClick={onEdit}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </IconBtn>
        <IconBtn title="Supprimer" onClick={onDelete} danger>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </IconBtn>
      </div>
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        color: danger ? '#ef4444' : 'var(--text2)',
        background: 'transparent',
      }}
      onMouseEnter={(ev) => {
        if (disabled) return
        ev.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'var(--bg4)'
      }}
      onMouseLeave={(ev) => {
        ev.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  // close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </div>
  )
}
