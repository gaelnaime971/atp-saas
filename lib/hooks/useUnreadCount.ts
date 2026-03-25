'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useUnreadCount(userId: string | null) {
  const [total, setTotal] = useState(0)
  const [byPartner, setByPartner] = useState<Record<string, number>>({})
  const supabase = useRef(createClient()).current

  const fetchUnread = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (!data) { setTotal(0); setByPartner({}); return }

    const map: Record<string, number> = {}
    for (const row of data) {
      map[row.sender_id] = (map[row.sender_id] || 0) + 1
    }
    setByPartner(map)
    setTotal(data.length)
  }, [userId, supabase])

  useEffect(() => {
    fetchUnread()
  }, [fetchUnread])

  // Realtime: update on new messages or reads
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('unread-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        () => { fetchUnread() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, fetchUnread])

  return { total, byPartner, refetch: fetchUnread }
}
