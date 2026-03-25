'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types'

export function useChat(userId: string | null, partnerId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = useRef(createClient()).current

  // Fetch messages for the conversation
  const fetchMessages = useCallback(async () => {
    if (!userId || !partnerId) return
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data ?? [])
    setLoading(false)
  }, [userId, partnerId, supabase])

  // Mark messages from partner as read
  const markAsRead = useCallback(async () => {
    if (!userId || !partnerId) return
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', userId)
      .eq('sender_id', partnerId)
      .eq('is_read', false)
  }, [userId, partnerId, supabase])

  // Send a message
  const sendMessage = useCallback(
    async (content: string | null, imageUrl: string | null) => {
      if (!userId || !partnerId) return
      if (!content?.trim() && !imageUrl) return

      const newMsg: Message = {
        id: crypto.randomUUID(),
        sender_id: userId,
        receiver_id: partnerId,
        content: content?.trim() || null,
        image_url: imageUrl,
        is_read: false,
        created_at: new Date().toISOString(),
      }

      // Optimistic append
      setMessages((prev) => [...prev, newMsg])

      await supabase.from('messages').insert({
        sender_id: userId,
        receiver_id: partnerId,
        content: content?.trim() || null,
        image_url: imageUrl,
      })
    },
    [userId, partnerId, supabase]
  )

  // Fetch on mount / partner change
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Realtime subscription for incoming messages
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('chat-incoming')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          // Only add if from the current partner (avoid duplicates from other convos)
          if (msg.sender_id === partnerId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, partnerId, supabase])

  return { messages, loading, sendMessage, markAsRead, refetch: fetchMessages }
}
