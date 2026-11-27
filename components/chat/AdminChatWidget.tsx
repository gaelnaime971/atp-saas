'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUnreadCount } from '@/lib/hooks/useUnreadCount'
import ChatBubble from './ChatBubble'
import ChatPanel from './ChatPanel'
import Avatar from '@/components/ui/Avatar'
import type { Profile } from '@/lib/types'

interface TraderPreview extends Pick<Profile, 'id' | 'full_name' | 'avatar_url'> {
  lastMessageAt?: string
}

export default function AdminChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [traders, setTraders] = useState<TraderPreview[]>([])
  const [selectedTrader, setSelectedTrader] = useState<TraderPreview | null>(null)
  // Client stable entre deux rendus (sans lire une ref pendant le rendu).
  const [supabase] = useState(createClient)
  const { total, byPartner } = useUnreadCount(userId)

  const fetchTraders = useCallback(async (uid: string) => {
    // Fetch all traders
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
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
    // fetchTraders est asynchrone : l'état n'est mis à jour qu'après la
    // réponse de Supabase, pas pendant l'effet (faux positif de la règle).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId && total >= 0) fetchTraders(userId)
  }, [total, userId, fetchTraders])

  if (!userId) return null

  return (
    <>
      <ChatBubble unreadCount={isOpen ? 0 : total} onClick={() => setIsOpen(!isOpen)} />

      {isOpen && (
        <div
          style={{
            // Bureau : inchangé (90 / 24 / 540 / 520). Mobile : au-dessus de la
            // barre d'onglets, sans dépasser l'écran.
            position: 'fixed',
            bottom: 'calc(90px + var(--app-tabbar-offset, 0px) - (1.5rem - var(--app-chat-gap, 1.5rem)))',
            right: 'var(--app-chat-gap, 1.5rem)',
            width: 'min(540px, calc(100vw - 2 * var(--app-chat-gap, 1.5rem)))',
            height: 'min(520px, calc(100dvh - 90px - var(--app-tabbar-offset, 0px) - 4rem))',
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
                  stroke="var(--color-accent)"
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
                width: 170,
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
                        ? '1px solid rgba(var(--color-profit-rgb), 0.25)'
                        : '1px solid transparent',
                      background: isSelected ? 'rgba(var(--color-profit-rgb), 0.1)' : 'transparent',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar url={t.avatar_url} name={t.full_name} size={26} />
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
                            background: 'var(--color-accent)',
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
                  partnerAvatar={selectedTrader.avatar_url}
                  messagesHeight={380}
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
