'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────

interface Prospect {
  id: string
  created_at: string
  prenom: string
  nom: string
  email: string
  whatsapp: string
  experience: string
  objectif: string
  source: string
  status: string
  action: string
  notes: string
  score: number
  score_updated_at: string
  reactivity: string
  // Pipeline fields
  call_date: string | null
  next_call_date: string | null
  temperature: 'chaud' | 'tiede' | 'froid' | null
  trading_level: string | null
  needs: string | null
  availability: string | null
  agreed_price: number | null
  program_type: string | null
  is_beginner: boolean | null
  in_pipeline: boolean | null
}

interface CallNote {
  id: string
  prospect_id: string
  created_at: string
  call_date: string | null
  note: string
  outcome: string | null
}

// ── Constants ─────────────────────────────────────────────────────

const STATUS_COLUMNS = [
  { value: 'nouveau', label: 'Nouveau', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', emoji: '🆕' },
  { value: 'contacte', label: 'Contacté', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', emoji: '📞' },
  { value: 'call_booke', label: 'Call booké', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', emoji: '📅' },
  { value: 'close', label: 'Closé', color: '#a855f7', bg: 'rgba(168,85,247,0.1)', emoji: '🏆' },
  { value: 'disqualifie', label: 'Disqualifié', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', emoji: '🚫' },
] as const

const TEMPERATURE_OPTIONS = [
  { value: 'chaud', label: 'Chaud', emoji: '🔥', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'tiede', label: 'Tiède', emoji: '🌤', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { value: 'froid', label: 'Froid', emoji: '❄️', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
] as const

const PROGRAM_TYPES = [
  { value: 'ATP ULTRA', label: 'ATP ULTRA', color: '#22c55e' },
  { value: 'Coaching personnalisé', label: 'Coaching personnalisé', color: '#3b82f6' },
  { value: 'Séminaire', label: 'Séminaire', color: '#a855f7' },
  { value: 'Autre', label: 'Autre', color: '#6b7280' },
] as const

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'methode-atp': { label: 'Méthode ATP', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  'landing-capture': { label: 'Méthode ATP', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  'trading-night': { label: 'Trading Night', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  'preinscription-event': { label: 'Pré-inscr.', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'video-methode': { label: 'Vidéo Méthode', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  'whop-1000': { label: 'Whop <1K', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  'whop-1000-2000': { label: 'Whop 1K-2K', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  'whop-2000': { label: 'Whop +2K', color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
  'organique-instagram': { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.1)' },
  'organique-x': { label: 'X/Twitter', color: '#aaa', bg: 'rgba(170,170,170,0.1)' },
  'reference-client': { label: 'Référence', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'manual': { label: 'Manuel', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  'csv-import': { label: 'CSV', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
}

const SOURCE_SELECT = [
  { value: 'reference-client', label: 'Référence client' },
  { value: 'whop-2000', label: 'Whop +2000€' },
  { value: 'whop-1000-2000', label: 'Whop 1K-2K€' },
  { value: 'whop-1000', label: 'Whop <1000€' },
  { value: 'video-methode', label: 'Vidéo Méthode' },
  { value: 'methode-atp', label: 'Méthode ATP' },
  { value: 'trading-night', label: 'Trading Night' },
  { value: 'organique-instagram', label: 'Instagram' },
  { value: 'organique-x', label: 'X/Twitter' },
  { value: 'manual', label: 'Manuel' },
]

const OUTCOME_OPTIONS = [
  { value: 'pas_repondu', label: 'Pas répondu', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  { value: 'rappel', label: 'À rappeler', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { value: 'interesse', label: 'Intéressé', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  { value: 'tres_interesse', label: 'Très intéressé', color: '#22c55e', bg: 'rgba(34,197,94,0.18)' },
  { value: 'objection', label: 'Objection', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  { value: 'pas_interesse', label: 'Pas intéressé', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'closé', label: 'Closé', color: '#22c55e', bg: 'rgba(34,197,94,0.2)' },
]

// ── Helpers ───────────────────────────────────────────────────────

function scoreLabel(s: number): { label: string; emoji: string; color: string; bg: string } {
  if (s >= 75) return { label: 'CHAUD', emoji: '🔥', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (s >= 50) return { label: 'TIÈDE', emoji: '📞', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
  if (s >= 25) return { label: 'FROID', emoji: '❄️', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' }
  return { label: 'NON QUAL.', emoji: '⏸️', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const tz = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tz).toISOString().slice(0, 16)
  } catch { return '' }
}

function fromLocalInput(v: string): string | null {
  if (!v) return null
  try { return new Date(v).toISOString() } catch { return null }
}

function whatsappLink(phone: string): string {
  const cleaned = (phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  return `https://wa.me/${cleaned}`
}

// ── Component ─────────────────────────────────────────────────────

export default function Pipeline() {
  const supabase = createClient()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTemp, setFilterTemp] = useState<'all' | 'chaud' | 'tiede' | 'froid'>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────

  const fetchProspects = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('prospects').select('*').order('created_at', { ascending: false })
    if (!showAll) query = query.eq('in_pipeline', true)
    const { data } = await query
    setProspects((data || []) as Prospect[])
    setLoading(false)
  }, [showAll, supabase])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  // ── Filtered ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = prospects
    if (filterTemp !== 'all') list = list.filter(p => p.temperature === filterTemp)
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(p =>
        (p.prenom || '').toLowerCase().includes(s) ||
        (p.nom || '').toLowerCase().includes(s) ||
        (p.email || '').toLowerCase().includes(s) ||
        (p.whatsapp || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [prospects, filterTemp, filterStatus, search])

  const byStatus = useMemo(() => {
    const m: Record<string, Prospect[]> = {}
    STATUS_COLUMNS.forEach(c => { m[c.value] = [] })
    filtered.forEach(p => {
      const s = p.status && m[p.status] ? p.status : 'nouveau'
      m[s].push(p)
    })
    return m
  }, [filtered])

  // ── Stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = prospects.length
    const counts: Record<string, number> = {}
    STATUS_COLUMNS.forEach(c => { counts[c.value] = 0 })
    let agreedTotal = 0
    let closedCount = 0
    prospects.forEach(p => {
      const s = p.status && counts[p.status] !== undefined ? p.status : 'nouveau'
      counts[s] = (counts[s] || 0) + 1
      if (p.status === 'close') {
        closedCount++
        if (p.agreed_price) agreedTotal += Number(p.agreed_price) || 0
      }
    })
    const closingRate = total > 0 ? (closedCount / total) * 100 : 0
    return { total, counts, agreedTotal, closedCount, closingRate }
  }, [prospects])

  // ── Mutations ────────────────────────────────────────────────────

  const updateProspect = async (id: string, patch: Partial<Prospect>) => {
    await supabase.from('prospects').update(patch).eq('id', id)
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...patch } as Prospect : p))
    setSelected(prev => prev && prev.id === id ? { ...prev, ...patch } as Prospect : prev)
  }

  const moveToStatus = async (id: string, status: string) => {
    await updateProspect(id, { status })
  }

  const removeFromPipeline = async (id: string) => {
    if (!confirm('Retirer ce prospect du pipeline ?')) return
    await supabase.from('prospects').update({ in_pipeline: false }).eq('id', id)
    setProspects(prev => prev.filter(p => p.id !== id))
    setSelected(null)
  }

  // ── Drag & Drop ──────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onDragEnd = () => { setDraggingId(null); setDragOverCol(null) }
  const onDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCol !== col) setDragOverCol(col)
  }
  const onDragLeave = (col: string) => {
    if (dragOverCol === col) setDragOverCol(null)
  }
  const onDrop = (e: React.DragEvent, col: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggingId
    if (id) {
      const p = prospects.find(x => x.id === id)
      if (p && p.status !== col) moveToStatus(id, col)
    }
    setDraggingId(null)
    setDragOverCol(null)
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="p-6" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Pipeline commercial</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Gestion des appels et closing</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/admin_call.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7', cursor: 'pointer', textDecoration: 'none' }}
            title="Ouvrir la trame de call (vue admin)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Trame du call (admin)
          </a>
          <a
            href="/sales_page_client.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
            style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', cursor: 'pointer', textDecoration: 'none' }}
            title="Ouvrir la page de vente à partager avec le client"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            Page client
          </a>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#09090b', cursor: 'pointer' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Ajouter au pipeline
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-7 gap-3 mb-5">
        <button
          onClick={() => setFilterStatus('all')}
          className="rounded-xl p-3 text-left transition-all hover:opacity-90"
          style={{
            background: filterStatus === 'all' ? 'var(--bg3)' : 'var(--bg2)',
            border: `1px solid ${filterStatus === 'all' ? 'var(--green)' : 'var(--border)'}`,
            cursor: 'pointer',
          }}
        >
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>Total</div>
          <div className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{stats.total}</div>
        </button>
        {STATUS_COLUMNS.map(col => (
          <button
            key={col.value}
            onClick={() => setFilterStatus(filterStatus === col.value ? 'all' : col.value)}
            className="rounded-xl p-3 text-left transition-all hover:opacity-90"
            style={{
              background: filterStatus === col.value ? col.bg : 'var(--bg2)',
              border: `1px solid ${filterStatus === col.value ? col.color : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1" style={{ color: col.color }}>
              <span>{col.emoji}</span>{col.label}
            </div>
            <div className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{stats.counts[col.value] || 0}</div>
          </button>
        ))}
        <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--green)' }}>Closing</div>
          <div className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>{stats.closingRate.toFixed(0)}%</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {stats.agreedTotal.toLocaleString('fr-FR')}€
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text3)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (nom, email, whatsapp)…"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setFilterTemp('all')}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={{
              background: filterTemp === 'all' ? 'var(--bg4)' : 'transparent',
              color: filterTemp === 'all' ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
            }}
          >Tous</button>
          {TEMPERATURE_OPTIONS.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterTemp(t.value)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1"
              style={{
                background: filterTemp === t.value ? t.bg : 'transparent',
                color: filterTemp === t.value ? t.color : 'var(--text3)',
                cursor: 'pointer',
              }}
            >
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
          style={{ background: showAll ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${showAll ? 'var(--green)' : 'var(--border)'}`, color: showAll ? 'var(--green)' : 'var(--text3)' }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="cursor-pointer"
          />
          Voir tous les prospects
        </label>

        <div className="ml-auto text-xs" style={{ color: 'var(--text3)' }}>
          {filtered.length} prospect{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="text-center py-12 text-xs" style={{ color: 'var(--text3)' }}>Chargement…</div>
      ) : (
        <div className="grid grid-cols-5 gap-3" style={{ minHeight: '60vh' }}>
          {STATUS_COLUMNS.map(col => {
            const items = byStatus[col.value] || []
            const isOver = dragOverCol === col.value
            return (
              <div
                key={col.value}
                onDragOver={e => onDragOver(e, col.value)}
                onDragLeave={() => onDragLeave(col.value)}
                onDrop={e => onDrop(e, col.value)}
                className="rounded-xl p-3 transition-all"
                style={{
                  background: isOver ? col.bg : 'var(--bg2)',
                  border: `1px solid ${isOver ? col.color : 'var(--border)'}`,
                  outline: isOver ? `2px dashed ${col.color}` : 'none',
                  outlineOffset: -2,
                }}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14 }}>{col.emoji}</span>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: col.bg, color: col.color }}>
                    {items.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2" style={{ minHeight: 80 }}>
                  {items.length === 0 && (
                    <div className="text-center py-6 text-[10px] italic" style={{ color: 'var(--text3)' }}>
                      Glissez une carte ici
                    </div>
                  )}
                  {items.map(p => (
                    <PipelineCard
                      key={p.id}
                      prospect={p}
                      column={col}
                      onClick={() => setSelected(p)}
                      onDragStart={(e) => onDragStart(e, p.id)}
                      onDragEnd={onDragEnd}
                      isDragging={draggingId === p.id}
                      onMove={(s) => moveToStatus(p.id, s)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <ProspectDetailModal
          prospect={selected}
          onClose={() => setSelected(null)}
          onUpdate={(patch) => updateProspect(selected.id, patch)}
          onRemove={() => removeFromPipeline(selected.id)}
          supabase={supabase}
        />
      )}

      {/* Add to pipeline modal */}
      {showAdd && (
        <AddToPipelineModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); fetchProspects() }}
          supabase={supabase}
        />
      )}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────

function PipelineCard({
  prospect: p,
  column,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  onMove,
}: {
  prospect: Prospect
  column: typeof STATUS_COLUMNS[number]
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  isDragging: boolean
  onMove: (status: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const score = scoreLabel(p.score || 0)
  const temp = TEMPERATURE_OPTIONS.find(t => t.value === p.temperature)
  const src = SOURCE_LABELS[p.source]
  const programColor = PROGRAM_TYPES.find(pt => pt.value === p.program_type)?.color || '#6b7280'

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-card-click]')) return
    onClick()
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={handleCardClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMoveOpen(false) }}
      className="rounded-lg p-3 transition-all"
      style={{
        background: 'var(--bg3)',
        border: `1px solid ${hover ? column.color : 'var(--border)'}`,
        boxShadow: hover ? `0 4px 16px -4px ${column.color}55` : 'none',
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Top row: name + temperature */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-xs font-bold leading-tight flex-1" style={{ color: 'var(--text)' }}>
          {(p.prenom || '') + (p.nom ? ' ' + p.nom : '') || <span style={{ color: 'var(--text3)' }}>Sans nom</span>}
        </div>
        {temp && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: temp.bg, color: temp.color }}
            title={`Température : ${temp.label}`}
          >
            {temp.emoji}
          </span>
        )}
      </div>

      {/* Score + source row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ background: score.bg, color: score.color }}
        >
          {p.score || 0} {score.emoji} {score.label}
        </span>
        {src && (
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: src.bg, color: src.color }}
          >
            {src.label}
          </span>
        )}
      </div>

      {/* Program chip */}
      {p.program_type && (
        <div className="mb-2">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: `${programColor}20`, color: programColor, border: `1px solid ${programColor}40` }}
          >
            {p.program_type}
          </span>
        </div>
      )}

      {/* Agreed price */}
      {p.agreed_price && Number(p.agreed_price) > 0 && (
        <div className="mb-2 text-base font-extrabold" style={{ color: 'var(--green)' }}>
          {Number(p.agreed_price).toLocaleString('fr-FR')}€
        </div>
      )}

      {/* Date row */}
      <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--text3)' }}>
        {p.next_call_date ? (
          <span className="flex items-center gap-1" style={{ color: '#22c55e' }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {fmtDate(p.next_call_date)}
          </span>
        ) : p.call_date ? (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.49a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.49 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
            </svg>
            {fmtDate(p.call_date)}
          </span>
        ) : (
          <span style={{ color: 'var(--text3)' }}>—</span>
        )}

        {/* Move buttons (visible on hover) */}
        <div className="relative" data-no-card-click>
          <button
            onClick={(e) => { e.stopPropagation(); setMoveOpen(v => !v) }}
            className="px-1.5 py-0.5 rounded text-[10px] font-bold transition-all"
            style={{
              background: moveOpen ? column.bg : 'transparent',
              color: 'var(--text3)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              opacity: hover || moveOpen ? 1 : 0,
            }}
            title="Déplacer"
          >
            ⇆
          </button>
          {moveOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 rounded-lg p-1 z-10"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 130 }}
            >
              {STATUS_COLUMNS.filter(c => c.value !== column.value).map(c => (
                <button
                  key={c.value}
                  onClick={(e) => { e.stopPropagation(); onMove(c.value); setMoveOpen(false) }}
                  className="w-full text-left px-2 py-1.5 rounded text-[10px] font-semibold transition-all hover:opacity-80 flex items-center gap-1.5"
                  style={{ color: c.color, background: 'transparent', cursor: 'pointer' }}
                >
                  <span>{c.emoji}</span>{c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Detail modal ──────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>

function ProspectDetailModal({
  prospect,
  onClose,
  onUpdate,
  onRemove,
  supabase,
}: {
  prospect: Prospect
  onClose: () => void
  onUpdate: (patch: Partial<Prospect>) => Promise<void> | void
  onRemove: () => void
  supabase: SupabaseClient
}) {
  const [draft, setDraft] = useState<Prospect>(prospect)
  const [notes, setNotes] = useState<CallNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [newOutcome, setNewOutcome] = useState<string>('rappel')
  const [newCallDate, setNewCallDate] = useState<string>(toLocalInput(new Date().toISOString()))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Reset draft when prospect identity changes
  const lastId = useRef(prospect.id)
  useEffect(() => {
    if (lastId.current !== prospect.id) {
      setDraft(prospect)
      lastId.current = prospect.id
    }
  }, [prospect])

  // Sync incoming updates
  useEffect(() => {
    setDraft(d => ({ ...d, ...prospect }))
  }, [prospect])

  const loadNotes = useCallback(async () => {
    setNotesLoading(true)
    const { data } = await supabase
      .from('prospect_call_notes')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('call_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    setNotes((data || []) as CallNote[])
    setNotesLoading(false)
  }, [prospect.id, supabase])

  useEffect(() => { loadNotes() }, [loadNotes])

  const saveAll = async () => {
    setSaving(true)
    const patch: Partial<Prospect> = {
      status: draft.status,
      temperature: draft.temperature,
      call_date: draft.call_date,
      next_call_date: draft.next_call_date,
      trading_level: draft.trading_level,
      needs: draft.needs,
      availability: draft.availability,
      is_beginner: draft.is_beginner,
      agreed_price: draft.agreed_price,
      program_type: draft.program_type,
      notes: draft.notes,
    }
    await onUpdate(patch)
    setSaving(false)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 2000)
  }

  const addNote = async () => {
    if (!newNote.trim()) return
    const payload = {
      prospect_id: prospect.id,
      note: newNote.trim(),
      outcome: newOutcome || null,
      call_date: fromLocalInput(newCallDate),
    }
    const { data } = await supabase.from('prospect_call_notes').insert(payload).select().single()
    if (data) {
      setNotes(prev => [data as CallNote, ...prev])
      setNewNote('')
      setNewOutcome('rappel')
      setNewCallDate(toLocalInput(new Date().toISOString()))
    }
  }

  const deleteNote = async (id: string) => {
    if (!confirm('Supprimer cette note ?')) return
    await supabase.from('prospect_call_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const score = scoreLabel(prospect.score || 0)
  const src = SOURCE_LABELS[prospect.source]

  const fullName = (draft.prenom || '') + (draft.nom ? ' ' + draft.nom : '') || 'Sans nom'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl flex flex-col"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{fullName}</h2>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: score.bg, color: score.color }}
                >
                  {prospect.score || 0} {score.emoji} {score.label}
                </span>
                {src && (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded"
                    style={{ background: src.bg, color: src.color }}
                  >
                    {src.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs flex-wrap" style={{ color: 'var(--text2)' }}>
                {prospect.email && (
                  <a href={`mailto:${prospect.email}`} className="flex items-center gap-1.5 hover:opacity-80" style={{ color: 'var(--text2)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {prospect.email}
                  </a>
                )}
                {prospect.whatsapp && (
                  <a href={whatsappLink(prospect.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:opacity-80" style={{ color: '#25D366' }}>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                    {prospect.whatsapp}
                  </a>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-xl px-2" style={{ color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              {/* Status selector */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-2 block" style={{ color: 'var(--text3)' }}>Statut</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_COLUMNS.map(s => {
                    const active = draft.status === s.value
                    return (
                      <button
                        key={s.value}
                        onClick={() => setDraft(d => ({ ...d, status: s.value }))}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                        style={{
                          background: active ? s.bg : 'var(--bg3)',
                          border: `1px solid ${active ? s.color : 'var(--border)'}`,
                          color: active ? s.color : 'var(--text3)',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{s.emoji}</span>{s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Temperature selector */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-2 block" style={{ color: 'var(--text3)' }}>Température</label>
                <div className="flex gap-1.5">
                  {TEMPERATURE_OPTIONS.map(t => {
                    const active = draft.temperature === t.value
                    return (
                      <button
                        key={t.value}
                        onClick={() => setDraft(d => ({ ...d, temperature: t.value }))}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        style={{
                          background: active ? t.bg : 'var(--bg3)',
                          border: `1px solid ${active ? t.color : 'var(--border)'}`,
                          color: active ? t.color : 'var(--text3)',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{t.emoji}</span>{t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Dernier call</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draft.call_date)}
                    onChange={e => setDraft(d => ({ ...d, call_date: fromLocalInput(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Prochain call</label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draft.next_call_date)}
                    onChange={e => setDraft(d => ({ ...d, next_call_date: fromLocalInput(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              {/* Niveau trading */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Niveau trading</label>
                <input
                  type="text"
                  value={draft.trading_level || ''}
                  onChange={e => setDraft(d => ({ ...d, trading_level: e.target.value }))}
                  placeholder="ex. Débutant, 1 an XAU, prop firm…"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Disponibilités */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Disponibilités</label>
                <input
                  type="text"
                  value={draft.availability || ''}
                  onChange={e => setDraft(d => ({ ...d, availability: e.target.value }))}
                  placeholder="ex. Soirs en semaine, weekends…"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Débutant */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.is_beginner}
                  onChange={e => setDraft(d => ({ ...d, is_beginner: e.target.checked }))}
                  className="cursor-pointer"
                />
                <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Débutant complet</span>
              </label>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Besoin */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Besoin</label>
                <textarea
                  value={draft.needs || ''}
                  onChange={e => setDraft(d => ({ ...d, needs: e.target.value }))}
                  rows={3}
                  placeholder="Ce que le prospect cherche…"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Programme + prix */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Programme</label>
                  <select
                    value={draft.program_type || ''}
                    onChange={e => setDraft(d => ({ ...d, program_type: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">—</option>
                    {PROGRAM_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--green)' }}>Prix accordé (€)</label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={draft.agreed_price ?? ''}
                    onChange={e => setDraft(d => ({ ...d, agreed_price: e.target.value === '' ? null : Number(e.target.value) }))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none font-bold"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--green)', color: 'var(--green)' }}
                  />
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Observations (notes admin)</label>
                <textarea
                  value={draft.notes || ''}
                  onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                  rows={5}
                  placeholder="Notes internes sur ce prospect…"
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            </div>
          </div>

          {/* Historique */}
          <div className="mt-6 rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text)' }}>Historique des observations / calls</h3>
              <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{notes.length} note{notes.length > 1 ? 's' : ''}</span>
            </div>

            {/* Add note form */}
            <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="datetime-local"
                  value={newCallDate}
                  onChange={e => setNewCallDate(e.target.value)}
                  className="px-3 py-2 rounded-md text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <select
                  value={newOutcome}
                  onChange={e => setNewOutcome(e.target.value)}
                  className="px-3 py-2 rounded-md text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {OUTCOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                rows={2}
                placeholder="Note du call / observation…"
                className="w-full px-3 py-2 rounded-md text-xs outline-none resize-none mb-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-bold transition-all"
                style={{
                  background: newNote.trim() ? 'var(--green)' : 'var(--bg3)',
                  color: newNote.trim() ? '#09090b' : 'var(--text3)',
                  cursor: newNote.trim() ? 'pointer' : 'not-allowed',
                  border: '1px solid var(--border)',
                }}
              >
                + Ajouter une note
              </button>
            </div>

            {/* Notes list */}
            {notesLoading ? (
              <div className="text-center py-4 text-xs" style={{ color: 'var(--text3)' }}>Chargement…</div>
            ) : notes.length === 0 ? (
              <div className="text-center py-4 text-xs italic" style={{ color: 'var(--text3)' }}>Aucune note pour le moment</div>
            ) : (
              <div className="space-y-2">
                {notes.map(n => {
                  const outcome = OUTCOME_OPTIONS.find(o => o.value === n.outcome)
                  return (
                    <div
                      key={n.id}
                      className="rounded-lg p-3"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold" style={{ color: 'var(--text2)' }}>
                            {fmtDate(n.call_date) || fmtDate(n.created_at)}
                          </span>
                          {outcome && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: outcome.bg, color: outcome.color }}
                            >
                              {outcome.label}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => deleteNote(n.id)}
                          className="text-[10px] opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: '#ef4444', cursor: 'pointer' }}
                        >
                          Supprimer
                        </button>
                      </div>
                      <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{n.note}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onRemove}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer' }}
          >
            Retirer du pipeline
          </button>
          {prospect.whatsapp && (
            <a
              href={whatsappLink(prospect.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366' }}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
              WhatsApp
            </a>
          )}
          {prospect.email && (
            <a
              href={`mailto:${prospect.email}`}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Email
            </a>
          )}
          <div className="flex-1" />
          {savedAt && (
            <span className="text-[10px] font-semibold" style={{ color: 'var(--green)' }}>✓ Enregistré</span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}
          >
            Fermer
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#09090b', cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add to pipeline modal ─────────────────────────────────────────

function AddToPipelineModal({
  onClose,
  onAdded,
  supabase,
}: {
  onClose: () => void
  onAdded: () => void
  supabase: SupabaseClient
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing')

  // Existing prospect search
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Prospect[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (tab !== 'existing') return
    const q = search.trim()
    if (!q) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const s = q.replace(/[%_]/g, '')
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .or(`prenom.ilike.%${s}%,nom.ilike.%${s}%,email.ilike.%${s}%,whatsapp.ilike.%${s}%`)
        .limit(20)
      setResults((data || []) as Prospect[])
      setSearching(false)
    }, 200)
    return () => clearTimeout(t)
  }, [search, tab, supabase])

  const addExisting = async (id: string) => {
    await supabase.from('prospects').update({ in_pipeline: true, status: 'nouveau' }).eq('id', id).eq('in_pipeline', false)
    // If already in pipeline, just close anyway
    await supabase.from('prospects').update({ in_pipeline: true }).eq('id', id)
    onAdded()
  }

  // New prospect form
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', whatsapp: '',
    source: 'manual', experience: '', objectif: '',
    temperature: 'tiede' as 'chaud' | 'tiede' | 'froid',
    notes: '',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const createNew = async () => {
    if (!form.prenom.trim() && !form.nom.trim() && !form.email.trim()) {
      setCreateError('Renseigne au minimum un prénom, nom ou email')
      return
    }
    setCreating(true)
    setCreateError(null)
    const payload = {
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      email: form.email.trim(),
      whatsapp: form.whatsapp.trim(),
      source: form.source,
      experience: form.experience,
      objectif: form.objectif,
      temperature: form.temperature,
      notes: form.notes,
      status: 'nouveau',
      action: 'rien_fait',
      in_pipeline: true,
    }
    const { error } = await supabase.from('prospects').insert(payload)
    setCreating(false)
    if (error) {
      setCreateError(error.message || 'Erreur lors de la création')
      return
    }
    onAdded()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col"
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Ajouter au pipeline</h2>
          <button onClick={onClose} className="text-xl px-2" style={{ color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 m-4 rounded-lg" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('existing')}
            className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all"
            style={{
              background: tab === 'existing' ? 'var(--bg)' : 'transparent',
              color: tab === 'existing' ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            Prospect existant
          </button>
          <button
            onClick={() => setTab('new')}
            className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all"
            style={{
              background: tab === 'new' ? 'var(--bg)' : 'transparent',
              color: tab === 'new' ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            Nouveau prospect
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {tab === 'existing' ? (
            <div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                placeholder="Recherche par nom, email, whatsapp…"
                className="w-full px-3 py-2.5 rounded-lg text-xs outline-none mb-3"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <div className="space-y-1.5" style={{ maxHeight: 400, overflowY: 'auto' }}>
                {searching && <div className="text-center py-4 text-xs" style={{ color: 'var(--text3)' }}>Recherche…</div>}
                {!searching && search.trim() && results.length === 0 && (
                  <div className="text-center py-4 text-xs italic" style={{ color: 'var(--text3)' }}>Aucun résultat</div>
                )}
                {!searching && !search.trim() && (
                  <div className="text-center py-4 text-xs italic" style={{ color: 'var(--text3)' }}>Tape pour rechercher un prospect</div>
                )}
                {results.map(p => {
                  const score = scoreLabel(p.score || 0)
                  const src = SOURCE_LABELS[p.source]
                  return (
                    <button
                      key={p.id}
                      onClick={() => addExisting(p.id)}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-lg transition-all hover:opacity-90 text-left"
                      style={{
                        background: p.in_pipeline ? 'rgba(34,197,94,0.05)' : 'var(--bg3)',
                        border: `1px solid ${p.in_pipeline ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div className="flex-1">
                        <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>
                          {(p.prenom || '') + (p.nom ? ' ' + p.nom : '') || p.email || 'Sans nom'}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                          {p.email || p.whatsapp || '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: score.bg, color: score.color }}
                        >
                          {p.score || 0} {score.emoji}
                        </span>
                        {src && (
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: src.bg, color: src.color }}
                          >
                            {src.label}
                          </span>
                        )}
                        {p.in_pipeline && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                            Déjà dans pipeline
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Prénom</label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Nom</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>WhatsApp</label>
                  <input
                    type="tel"
                    value={form.whatsapp}
                    onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                    placeholder="+33…"
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Source</label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {SOURCE_SELECT.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Température</label>
                  <div className="flex gap-1">
                    {TEMPERATURE_OPTIONS.map(t => {
                      const active = form.temperature === t.value
                      return (
                        <button
                          key={t.value}
                          onClick={() => setForm(f => ({ ...f, temperature: t.value }))}
                          className="flex-1 px-2 py-2 rounded-md text-[10px] font-bold transition-all flex items-center justify-center gap-1"
                          style={{
                            background: active ? t.bg : 'var(--bg3)',
                            border: `1px solid ${active ? t.color : 'var(--border)'}`,
                            color: active ? t.color : 'var(--text3)',
                            cursor: 'pointer',
                          }}
                        >
                          <span>{t.emoji}</span>{t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Expérience</label>
                  <select
                    value={form.experience}
                    onChange={e => setForm(f => ({ ...f, experience: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">—</option>
                    <option value="debutant">Débutant (&lt; 6 mois)</option>
                    <option value="intermediaire">6 mois à 2 ans</option>
                    <option value="confirme">+ de 2 ans</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Objectif</label>
                  <select
                    value={form.objectif}
                    onChange={e => setForm(f => ({ ...f, objectif: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">—</option>
                    <option value="methode">Méthode structurée</option>
                    <option value="propfirm">Prop firm</option>
                    <option value="consistance">Consistance</option>
                    <option value="vivre">Vivre du trading</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold mb-1.5 block" style={{ color: 'var(--text3)' }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              {createError && (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {createError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'new' && (
          <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              onClick={createNew}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-xs font-bold"
              style={{ background: 'var(--green)', color: '#09090b', cursor: creating ? 'wait' : 'pointer' }}
            >
              {creating ? 'Création…' : 'Créer & ajouter au pipeline'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
