'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnreadCount } from '@/lib/hooks/useUnreadCount'
import ChatBubble from './ChatBubble'
import ChatPanel from './ChatPanel'

export default function TraderChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [admin, setAdmin] = useState<{ id: string; full_name: string; avatar_url: string | null } | null>(null)
  const supabase = useRef(createClient()).current
  const { total } = useUnreadCount(userId)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('role', 'admin')
        .limit(1)
        .single()
      if (data) setAdmin(data)
    }
    init()
  }, [supabase])

  if (!userId || !admin) return null

  return (
    <>
      <ChatBubble unreadCount={isOpen ? 0 : total} onClick={() => setIsOpen(!isOpen)} />

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            width: 380,
            height: 520,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            zIndex: 801,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--green)',
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {admin.full_name ?? 'Coach ATP'}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>

          <ChatPanel
            currentUserId={userId}
            partnerId={admin.id}
            partnerName={admin.full_name ?? 'Coach'}
            partnerAvatar={admin.avatar_url}
            messagesHeight={380}
          />
        </div>
      )}
    </>
  )
}
