'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AvatarUploadProps {
  userId: string
  currentUrl: string | null
  name: string | null
  size?: number
  onUploaded: (url: string) => void
}

export default function AvatarUpload({ userId, currentUrl, name, size = 80, onUploaded }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const initials = (name ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const displayUrl = preview || currentUrl

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    setPreview(URL.createObjectURL(file))

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${userId}.${ext}`

    // Upsert: upload with overwrite
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) {
      console.error('Avatar upload error:', error)
      setPreview(null)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${data.publicUrl}?t=${Date.now()}`

    // Update profile
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    onUploaded(url)
    window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { userId, url } }))
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid rgba(34,197,94,0.3)',
          background: displayUrl ? 'transparent' : 'rgba(34,197,94,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
        }}
        title="Changer la photo de profil"
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={name ?? 'Avatar'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: size * 0.3, fontWeight: 700, color: 'var(--green)', fontFamily: "'DM Mono', monospace" }}>
            {initials}
          </span>
        )}
        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
            transition: 'opacity 0.2s',
            borderRadius: '50%',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
        >
          <svg width={size * 0.25} height={size * 0.25} fill="none" viewBox="0 0 24 24">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="4" stroke="#fff" strokeWidth="1.5" />
          </svg>
        </div>
      </button>
      {uploading && (
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>Upload...</span>
      )}
    </div>
  )
}
