'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import type { Resource } from '@/lib/types'

export default function Ressources() {
  const [videos, setVideos] = useState<Resource[]>([])
  const [documents, setDocuments] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch video resources
        const { data: videoData } = await supabase
          .from('resources')
          .select('*')
          .eq('type', 'video')
          .order('created_at', { ascending: false })

        if (videoData) setVideos(videoData as Resource[])

        // Fetch document resources (pdf + doc)
        const { data: docData } = await supabase
          .from('resources')
          .select('*')
          .in('type', ['pdf', 'doc'])
          .order('created_at', { ascending: false })

        if (docData) setDocuments(docData as Resource[])
      } catch (err) {
        console.error('Ressources fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  async function handleResourceClick(resource: Resource) {
    if (resource.url) {
      // Direct URL — open in new tab
      window.open(resource.url, '_blank')
      return
    }

    // Stored file — generate signed URL from 'docs' bucket
    try {
      const { data, error } = await supabase.storage
        .from('docs')
        .createSignedUrl(resource.id, 3600) // 1 hour expiry

      if (error) {
        console.error('Signed URL error:', error)
        return
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (err) {
      console.error('Error generating signed URL:', err)
    }
  }

  function getIcon(type: Resource['type']) {
    if (type === 'video') return { icon: '\u25B6', bg: 'rgba(34,197,94,0.1)', color: 'var(--green, #22c55e)' }
    if (type === 'pdf') return { icon: '\uD83D\uDCC4', bg: 'rgba(96,165,250,0.1)', color: '#60a5fa' }
    return { icon: '\uD83D\uDD17', bg: 'rgba(245,158,11,0.1)', color: 'var(--amber, #f59e0b)' }
  }

  function ResourceItem({ resource }: { resource: Resource }) {
    const { icon, bg, color } = getIcon(resource.type)

    return (
      <div
        onClick={() => handleResourceClick(resource)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '12px 14px',
          background: 'var(--bg2, #18181b)',
          border: '1px solid var(--border, rgba(255,255,255,0.07))',
          borderRadius: 10,
          cursor: 'pointer',
          transition: 'all 0.15s',
          marginBottom: 8,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          e.currentTarget.style.background = 'var(--bg3, #222225)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border, rgba(255,255,255,0.07))'
          e.currentTarget.style.background = 'var(--bg2, #18181b)'
        }}
      >
        <div style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
          color: color,
          borderRadius: 8,
          fontSize: 16,
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resource.title}
          </div>
          {resource.description && (
            <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {resource.description}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Chargement...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
      {/* Videos */}
      <Card>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
          Replays &amp; Videos
        </h2>
        {videos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Aucune video disponible
          </div>
        ) : (
          videos.map(v => <ResourceItem key={v.id} resource={v} />)
        )}
      </Card>

      {/* Documents */}
      <Card>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
          Documents &amp; PDF
        </h2>
        {documents.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Aucun document disponible
          </div>
        ) : (
          documents.map(d => <ResourceItem key={d.id} resource={d} />)
        )}
      </Card>
    </div>
  )
}
