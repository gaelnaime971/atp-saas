'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Resource, CourseProgress } from '@/lib/types'

type ProgressMap = Record<string, CourseProgress>

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '--:--'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}

function formatLongDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0min'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${m.toString().padStart(2, '0')}`
}

function isExternalEmbed(url: string | null): { kind: 'youtube' | 'vimeo' | 'iframe' | null; embed: string } {
  if (!url) return { kind: null, embed: '' }
  if (!/^https?:\/\//i.test(url)) return { kind: null, embed: '' }

  // YouTube detection
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)
  if (yt) {
    return { kind: 'youtube', embed: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1` }
  }
  // Vimeo detection
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) {
    return { kind: 'vimeo', embed: `https://player.vimeo.com/video/${vm[1]}` }
  }
  // Other http(s) — treat as direct video URL
  return { kind: null, embed: url }
}

function categoryColor(category: string | null): string {
  if (!category) return 'rgba(148,163,184,0.7)'
  const palette = ['#22c55e', '#60a5fa', '#f59e0b', '#a78bfa', '#f472b6', '#34d399', '#fb7185', '#facc15']
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export default function Formation() {
  const supabase = useMemo(() => createClient(), [])
  const [videos, setVideos] = useState<Resource[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('Tous')
  const [openVideo, setOpenVideo] = useState<Resource | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [signedLoading, setSignedLoading] = useState(false)

  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const lastSavedRef = useRef<number>(0)
  const seekedOnceRef = useRef<boolean>(false)

  // Load videos + progress
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!mounted) return
        setUserId(user?.id ?? null)

        const { data: vids } = await supabase
          .from('resources')
          .select('*')
          .eq('type', 'video')
          .order('order_idx', { ascending: true })
          .order('created_at', { ascending: true })

        if (mounted && vids) setVideos(vids as Resource[])

        if (user) {
          const { data: prog } = await supabase
            .from('course_progress')
            .select('*')
            .eq('trader_id', user.id)
          if (mounted && prog) {
            const map: ProgressMap = {}
            for (const p of prog as CourseProgress[]) map[p.resource_id] = p
            setProgress(map)
          }
        }
      } catch (e) {
        console.error('Formation load error:', e)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [supabase])

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const v of videos) if (v.category) set.add(v.category)
    return ['Tous', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [videos])

  // Filtered videos
  const filteredVideos = useMemo(() => {
    if (activeCategory === 'Tous') return videos
    return videos.filter(v => v.category === activeCategory)
  }, [videos, activeCategory])

  // Continue watching: progress > 0 and not completed
  const continueWatching = useMemo(() => {
    return videos.filter(v => {
      const p = progress[v.id]
      return p && !p.completed && p.last_position_seconds > 5
    }).sort((a, b) => {
      const pa = progress[a.id]?.updated_at ?? ''
      const pb = progress[b.id]?.updated_at ?? ''
      return pb.localeCompare(pa)
    })
  }, [videos, progress])

  // Stats
  const stats = useMemo(() => {
    const total = videos.length
    let totalDuration = 0
    let watchedDuration = 0
    let completedCount = 0
    for (const v of videos) {
      totalDuration += v.duration_seconds ?? 0
      const p = progress[v.id]
      if (p) {
        if (p.completed) {
          completedCount += 1
          watchedDuration += v.duration_seconds ?? p.watched_seconds ?? 0
        } else {
          watchedDuration += Math.min(p.watched_seconds ?? 0, v.duration_seconds ?? p.watched_seconds ?? 0)
        }
      }
    }
    const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0

    // Streak — distinct calendar days with at least 1 progress.updated_at
    const days = new Set<string>()
    for (const p of Object.values(progress)) {
      if (!p.updated_at) continue
      const d = new Date(p.updated_at)
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (days.has(key)) streak += 1
      else if (i > 0) break // allow today gap
      else if (i === 0) continue
    }
    return { total, completedCount, pct, totalDuration, watchedDuration, streak }
  }, [videos, progress])

  // Same-category list for navigation
  const navList = useMemo(() => {
    if (!openVideo) return []
    const cat = openVideo.category
    const list = videos
      .filter(v => v.category === cat)
      .slice()
      .sort((a, b) => {
        if (a.order_idx !== b.order_idx) return a.order_idx - b.order_idx
        return a.created_at.localeCompare(b.created_at)
      })
    return list
  }, [openVideo, videos])

  const navIndex = useMemo(() => {
    if (!openVideo) return -1
    return navList.findIndex(v => v.id === openVideo.id)
  }, [openVideo, navList])

  // Resolve signed URL when modal opens
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (!openVideo) {
        setSignedUrl(null)
        return
      }
      const url = openVideo.url
      if (!url) {
        setSignedUrl(null)
        return
      }
      const ext = isExternalEmbed(url)
      if (ext.kind === 'youtube' || ext.kind === 'vimeo') {
        setSignedUrl(ext.embed)
        return
      }
      if (/^https?:\/\//i.test(url)) {
        setSignedUrl(url)
        return
      }
      // Storage path
      setSignedLoading(true)
      try {
        const { data, error } = await supabase.storage.from('docs').createSignedUrl(url, 3600)
        if (!cancelled) {
          if (error) {
            console.error('Signed URL error:', error)
            setSignedUrl(null)
          } else {
            setSignedUrl(data?.signedUrl ?? null)
          }
        }
      } finally {
        if (!cancelled) setSignedLoading(false)
      }
    }
    resolve()
    seekedOnceRef.current = false
    lastSavedRef.current = 0
    return () => { cancelled = true }
  }, [openVideo, supabase])

  // Seek to last position when video metadata loads
  useEffect(() => {
    if (!openVideo || !signedUrl) return
    const ext = isExternalEmbed(openVideo.url)
    if (ext.kind === 'youtube' || ext.kind === 'vimeo') return
    const el = videoElRef.current
    if (!el) return
    const onLoaded = () => {
      if (seekedOnceRef.current) return
      const last = progress[openVideo.id]?.last_position_seconds ?? 0
      if (last > 5 && el.duration && last < el.duration - 5) {
        try { el.currentTime = last } catch {}
      }
      seekedOnceRef.current = true
    }
    el.addEventListener('loadedmetadata', onLoaded)
    return () => el.removeEventListener('loadedmetadata', onLoaded)
  }, [openVideo, signedUrl, progress])

  // Save progress (debounced 5s)
  const saveProgress = useCallback(async (resourceId: string, currentTime: number, duration: number, forceCompleted?: boolean) => {
    if (!userId) return
    const completed = forceCompleted ?? (duration > 0 && currentTime / duration > 0.9)
    const payload = {
      trader_id: userId,
      resource_id: resourceId,
      last_position_seconds: Math.floor(currentTime),
      watched_seconds: Math.max(Math.floor(currentTime), progress[resourceId]?.watched_seconds ?? 0),
      completed,
      completed_at: completed ? new Date().toISOString() : (progress[resourceId]?.completed_at ?? null),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('course_progress')
      .upsert(payload, { onConflict: 'trader_id,resource_id' })
      .select()
      .single()
    if (error) {
      console.error('Save progress error:', error)
      return
    }
    if (data) {
      setProgress(prev => ({ ...prev, [resourceId]: data as CourseProgress }))
    }
  }, [supabase, userId, progress])

  function onTimeUpdate() {
    const el = videoElRef.current
    if (!el || !openVideo) return
    const now = Date.now()
    if (now - lastSavedRef.current < 5000) return
    lastSavedRef.current = now
    saveProgress(openVideo.id, el.currentTime, el.duration || 0)
  }

  async function toggleCompleted() {
    if (!openVideo) return
    const cur = progress[openVideo.id]
    const newCompleted = !(cur?.completed ?? false)
    const el = videoElRef.current
    const ct = el?.currentTime ?? cur?.last_position_seconds ?? 0
    const dur = el?.duration ?? openVideo.duration_seconds ?? 0
    await saveProgress(openVideo.id, ct, dur, newCompleted)
  }

  function navTo(delta: number) {
    if (navIndex < 0) return
    const next = navList[navIndex + delta]
    if (next) setOpenVideo(next)
  }

  // ESC closes modal
  useEffect(() => {
    if (!openVideo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenVideo(null)
      if (e.key === 'ArrowRight') navTo(1)
      if (e.key === 'ArrowLeft') navTo(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVideo, navIndex, navList])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        Chargement...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top stats bar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)',
        border: '1px solid rgba(34,197,94,0.2)',
        borderRadius: 14,
        padding: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Ma Formation</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
              {stats.completedCount} / {stats.total} videos completees
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--green)', marginLeft: 10 }}>{stats.pct}%</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <StatCell label="Videos" value={String(stats.total)} />
            <StatCell label="Vues" value={`${stats.completedCount} (${stats.pct}%)`} />
            <StatCell label="Visionne" value={`${formatLongDuration(stats.watchedDuration)} / ${formatLongDuration(stats.totalDuration)}`} />
            <StatCell label="Serie" value={`${stats.streak} jour${stats.streak > 1 ? 's' : ''}`} accent />
          </div>
        </div>

        {/* Full-width progress bar */}
        <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${stats.pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)',
            borderRadius: 999,
            transition: 'width 0.4s ease',
            boxShadow: '0 0 12px rgba(34,197,94,0.4)',
          }} />
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

      {/* Continue watching */}
      {continueWatching.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 0' }}>
            Reprendre la lecture
          </h3>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
            {continueWatching.map(v => {
              const p = progress[v.id]
              const pct = v.duration_seconds && v.duration_seconds > 0
                ? Math.min(100, Math.round((p.last_position_seconds / v.duration_seconds) * 100))
                : 0
              return (
                <div
                  key={v.id}
                  onClick={() => setOpenVideo(v)}
                  style={{
                    flex: '0 0 280px',
                    cursor: 'pointer',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                >
                  <Thumbnail resource={v} />
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                      {formatDuration(p.last_position_seconds)} / {formatDuration(v.duration_seconds)}
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px 0' }}>
          {activeCategory === 'Tous' ? 'Toutes les videos' : activeCategory}
          <span style={{ color: 'var(--text3)', fontWeight: 500, marginLeft: 8 }}>({filteredVideos.length})</span>
        </h3>
        {filteredVideos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--bg2)', borderRadius: 12, border: '1px dashed var(--border)' }}>
            Aucune video dans cette categorie
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filteredVideos.map(v => (
              <VideoCard
                key={v.id}
                resource={v}
                progress={progress[v.id]}
                onClick={() => setOpenVideo(v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Video modal */}
      {openVideo && (
        <VideoModal
          resource={openVideo}
          signedUrl={signedUrl}
          signedLoading={signedLoading}
          progress={progress[openVideo.id]}
          videoElRef={videoElRef}
          onTimeUpdate={onTimeUpdate}
          onClose={() => {
            const el = videoElRef.current
            if (el && openVideo) saveProgress(openVideo.id, el.currentTime, el.duration || 0)
            setOpenVideo(null)
          }}
          onToggleCompleted={toggleCompleted}
          onPrev={navIndex > 0 ? () => navTo(-1) : null}
          onNext={navIndex >= 0 && navIndex < navList.length - 1 ? () => navTo(1) : null}
        />
      )}
    </div>
  )
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--green)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}

function Thumbnail({ resource }: { resource: Resource }) {
  const [errored, setErrored] = useState(false)
  const showImg = resource.thumbnail_url && !errored
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #0a0a0c 0%, #1c1c20 100%)', overflow: 'hidden' }}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resource.thumbnail_url ?? ''}
          alt={resource.title}
          onError={() => setErrored(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: 'rgba(255,255,255,0.4)', fontSize: 38 }}>
          {'▶'}
        </div>
      )}
      {resource.duration_seconds ? (
        <div style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 7px',
          borderRadius: 4,
          letterSpacing: '0.02em',
        }}>
          {formatDuration(resource.duration_seconds)}
        </div>
      ) : null}
    </div>
  )
}

function VideoCard({
  resource,
  progress,
  onClick,
}: {
  resource: Resource
  progress: CourseProgress | undefined
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const completed = progress?.completed ?? false
  const pct = resource.duration_seconds && resource.duration_seconds > 0 && progress
    ? Math.min(100, Math.round(((progress.last_position_seconds || progress.watched_seconds || 0) / resource.duration_seconds) * 100))
    : 0
  const cat = resource.category
  const catColor = cat ? categoryColor(cat) : 'var(--text3)'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        background: 'var(--bg2)',
        border: `1px solid ${hover ? 'rgba(34,197,94,0.45)' : 'var(--border)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
        transform: hover ? 'translateY(-3px) scale(1.01)' : 'none',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Thumbnail resource={resource} />
      {completed && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'var(--green)',
          color: '#06160c',
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 999,
        }}>
          {'✓ Vu'}
        </div>
      )}
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
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {resource.description}
          </div>
        )}
        {pct > 0 && !completed && (
          <div style={{ marginTop: 'auto', paddingTop: 6 }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{pct}% vu</div>
          </div>
        )}
      </div>
    </div>
  )
}

function VideoModal({
  resource,
  signedUrl,
  signedLoading,
  progress,
  videoElRef,
  onTimeUpdate,
  onClose,
  onToggleCompleted,
  onPrev,
  onNext,
}: {
  resource: Resource
  signedUrl: string | null
  signedLoading: boolean
  progress: CourseProgress | undefined
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>
  onTimeUpdate: () => void
  onClose: () => void
  onToggleCompleted: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
}) {
  const ext = isExternalEmbed(resource.url)
  const isIframe = ext.kind === 'youtube' || ext.kind === 'vimeo'
  const completed = progress?.completed ?? false

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1200px, 100%)',
          maxHeight: '94vh',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {resource.category && (
              <div style={{ fontSize: 10, fontWeight: 700, color: categoryColor(resource.category), textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {resource.category}
              </div>
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{resource.title}</div>
            {resource.description && (
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{resource.description}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
            aria-label="Fermer"
          >
            {'×'}
          </button>
        </div>

        {/* Player */}
        <div style={{ position: 'relative', background: '#000', width: '100%', aspectRatio: '16 / 9' }}>
          {signedLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)' }}>
              Chargement de la video...
            </div>
          )}
          {!signedLoading && !signedUrl && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)' }}>
              Video indisponible
            </div>
          )}
          {!signedLoading && signedUrl && (
            isIframe ? (
              <iframe
                src={signedUrl}
                title={resource.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              />
            ) : (
              <video
                ref={videoElRef}
                src={signedUrl}
                controls
                autoPlay
                onTimeUpdate={onTimeUpdate}
                style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
              />
            )
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 22px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onPrev ?? undefined}
              disabled={!onPrev}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: onPrev ? 'var(--text)' : 'var(--text3)',
                fontSize: 13,
                fontWeight: 600,
                cursor: onPrev ? 'pointer' : 'not-allowed',
                opacity: onPrev ? 1 : 0.5,
              }}
            >
              {'← Precedent'}
            </button>
            <button
              onClick={onNext ?? undefined}
              disabled={!onNext}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: onNext ? 'var(--text)' : 'var(--text3)',
                fontSize: 13,
                fontWeight: 600,
                cursor: onNext ? 'pointer' : 'not-allowed',
                opacity: onNext ? 1 : 0.5,
              }}
            >
              {'Suivant →'}
            </button>
          </div>
          <button
            onClick={onToggleCompleted}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: `1px solid ${completed ? 'var(--green)' : 'var(--border)'}`,
              background: completed ? 'rgba(34,197,94,0.12)' : 'var(--bg2)',
              color: completed ? 'var(--green)' : 'var(--text)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {completed ? '✓ Vu — Marquer non vu' : 'Marquer comme vu'}
          </button>
        </div>
      </div>
    </div>
  )
}
