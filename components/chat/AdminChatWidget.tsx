'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnreadCount } from '@/lib/hooks/useUnreadCount'
import ChatBubble from './ChatBubble'
import ChatPanel from './ChatPanel'
import type { Profile } from '@/lib/types'

interface TraderPreview extends Pick<Profile, 'id' | 'full_name'> {
  lastMessageAt?: string
}

export default function AdminChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [traders, setTraders] = useState<TraderPreview[]>([])
  const [selectedTrader, setSelectedTrader] = useState<TraderPreview | null>(null)
  const supabase = useRef(createClient()).current
  const { total, byPartner } = useUnreadCount(userId)

  const fetchTraders = useCallback(async (uid: string) => {
    // Fetch all traders
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'trader')
      .order('full_name')

    if (!profiles) return

    // Fetch latest message per trader for sorting
    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, created_at')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(200)

    const lastMsgMap: Record<string, string> = {}
    for (const msg of recentMsgs ?? []) {
      const partnerId = msg.sender_id === uid ? msg.receiver_id : msg.sender_id
      if (!lastMsgMap[partnerId]) lastMsgMap[partnerId] = msg.created_at
    }

    const tradersWithTime: TraderPreview[] = profiles.map((p) => ({
      ...p,
      lastMessageAt: lastMsgMap[p.id],
    }))

    // Sort: traders with messages first (most recent), then alphabetically
    tradersWithTime.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt)
      if (a.lastMessageAt) return -1
      if (b.lastMessageAt) return 1
      return (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })

    setTraders(tradersWithTime)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      fetchTraders(user.id)
    }
    init()
  }, [supabase, fetchTraders])

  // Refresh trader list when receiving new messages
  useEffect(() => {
    if (userId && total >= 0) fetchTraders(userId)
  }, [total, userId, fetchTraders])

  if (!userId) return null

  const getInitials = (name: string | null) =>
    (name ?? '?')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()

  return (
    <>
      <ChatBubble unreadCount={isOpen ? 0 : total} onClick={() => setIsOpen(!isOpen)} />

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            width: 460,
            height: 420,
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
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                <path
                  d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                  stroke="var(--green)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                Messagerie
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

          {/* Body: 2 columns */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Trader list */}
            <div
              style={{
                width: 140,
                borderRight: '1px solid var(--border)',
                overflowY: 'auto',
                padding: '8px 6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontFamily: "'DM Mono', monospace",
                  color: 'var(--text3)',
                  letterSpacing: '0.08em',
                  padding: '0 6px 4px',
                }}
              >
                TRADERS
              </div>

              {traders.length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text3)', padding: '8px 6px' }}>
                  Aucun trader
                </div>
              )}

              {traders.map((t) => {
                const isSelected = selectedTrader?.id === t.id
                const unread = byPartner[t.id] || 0
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTrader(t)}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: isSelected
                        ? '1px solid rgba(34,197,94,0.25)'
                        : '1px solid transparent',
                      background: isSelected ? 'rgba(34,197,94,0.1)' : 'transparent',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: 'rgba(34,197,94,0.1)',
                          border: '1px solid rgba(34,197,94,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 7,
                          fontWeight: 700,
                          color: 'var(--green)',
                          fontFamily: "'DM Mono', monospace",
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(t.full_name)}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.full_name}
                      </span>
                      {unread > 0 && (
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--green)',
                            marginLeft: 'auto',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Chat area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {selectedTrader ? (
                <ChatPanel
                  currentUserId={userId}
                  partnerId={selectedTrader.id}
                  partnerName={selectedTrader.full_name ?? 'Trader'}
                  messagesHeight={280}
                />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text3)',
                    fontSize: 11,
                  }}
                >
                  Sélectionnez un trader
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
