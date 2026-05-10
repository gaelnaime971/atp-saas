'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Resource } from '@/lib/types'

function categoryColor(category: string | null): string {
  if (!category) return 'rgba(148,163,184,0.7)'
  const palette = ['#22c55e', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#fb7185', '#facc15']
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

async function resolveSignedUrl(supabase: ReturnType<typeof createClient>, resource: Resource): Promise<string | null> {
  if (!resource.url) return null
  if (/^https?:\/\//i.test(resource.url)) return resource.url
  const { data, error } = await supabase.storage.from('docs').createSignedUrl(resource.url, 3600)
  if (error) {
    console.error('Signed URL error:', error)
    return null
  }
  return data?.signedUrl ?? null
}

function sanitizeFilename(name: string, type: Resource['type']): string {
  const base = name.replace(/[^a-zA-Z0-9-_\s.()]/g, '').trim().replace(/\s+/g, '_') || 'document'
  if (type === 'pdf' && !/\.pdf$/i.test(base)) return `${base}.pdf`
  return base
}

export default function Documents() {
  const supabase = useMemo(() => createClient(), [])
  const [docs, setDocs] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Tous')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { data } = await supabase
          .from('resources')
          .select('*')
          .in('type', ['pdf', 'doc'])
          .order('order_idx', { ascending: true })
          .order('created_at', { ascending: true })
        if (mounted && data) setDocs(data as Resource[])
      } catch (e) {
        console.error('Documents load error:', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [supabase])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const d of docs) if (d.category) set.add(d.category)
    return ['Tous', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [docs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter(d => {
      if (activeCategory !== 'Tous' && d.category !== activeCategory) return false
      if (!q) return true
      return (
        d.title.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [docs, search, activeCategory])

  async function handleOpen(resource: Resource) {
    const url = await resolveSignedUrl(supabase, resource)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload(resource: Resource) {
    setDownloadingId(resource.id)
    try {
      const url = await resolveSignedUrl(supabase, resource)
      if (!url) return
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('fetch failed')
        const blob = await res.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = sanitizeFilename(resource.title, resource.type)
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      } catch {
        // Fallback: open in new tab if blob fetch blocked by CORS
        const a = document.createElement('a')
        a.href = url
        a.download = sanitizeFilename(resource.title, resource.type)
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        Chargement...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un document..."
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <div style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text3)',
          fontSize: 14,
          pointerEvents: 'none',
        }}>
          {'⌕'}
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {categories.map(cat => {
            const active = activeCategory === cat
            const color = cat === 'Tous' ? 'var(--green)' : categoryColor(cat)
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: `1px solid ${active ? color : 'var(--border)'}`,
                  background: active ? `${color}22` : 'var(--bg2)',
                  color: active ? color : 'var(--text2)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          {activeCategory === 'Tous' ? 'Tous les documents' : activeCategory}
        </h3>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{filtered.length} document{filtered.length > 1 ? 's' : ''}</div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--bg2)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          Aucun document trouve
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(d => (
            <DocumentCard
              key={d.id}
              resource={d}
              downloading={downloadingId === d.id}
              onOpen={() => handleOpen(d)}
              onDownload={() => handleDownload(d)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentCard({
  resource,
  downloading,
  onOpen,
  onDownload,
}: {
  resource: Resource
  downloading: boolean
  onOpen: () => void
  onDownload: () => void
}) {
  const [hover, setHover] = useState(false)
  const cat = resource.category
  const catColor = cat ? categoryColor(cat) : '#60a5fa'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${hover ? `${catColor}55` : 'var(--border)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Icon banner */}
      <div style={{
        position: 'relative',
        height: 120,
        background: `linear-gradient(135deg, ${catColor}1a 0%, ${catColor}05 100%)`,
        borderBottom: `1px solid ${catColor}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 56, lineHeight: 1, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}>{'📄'}</div>
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          fontSize: 9,
          fontWeight: 800,
          color: catColor,
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${catColor}55`,
          padding: '3px 7px',
          borderRadius: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {resource.type}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {cat && (
          <div style={{
            display: 'inline-block',
            alignSelf: 'flex-start',
            fontSize: 10,
            fontWeight: 700,
            color: catColor,
            background: `${catColor}1a`,
            border: `1px solid ${catColor}33`,
            padding: '2px 8px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {cat}
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
          {resource.title}
        </div>
        {resource.description && (
          <div style={{
            fontSize: 12,
            color: 'var(--text3)',
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {resource.description}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 10 }}>
          <button
            onClick={onOpen}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg3)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ouvrir
          </button>
          <button
            onClick={onDownload}
            disabled={downloading}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--green)',
              background: 'rgba(34,197,94,0.12)',
              color: 'var(--green)',
              fontSize: 12,
              fontWeight: 700,
              cursor: downloading ? 'wait' : 'pointer',
              opacity: downloading ? 0.6 : 1,
            }}
          >
            {downloading ? '...' : 'Telecharger'}
          </button>
        </div>
      </div>
    </div>
  )
}
