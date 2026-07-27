'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface SidebarProfile {
  name: string
  avatarUrl: string | null
  logout: () => Promise<void>
}

/**
 * Factorise le fetch profile Supabase + listener `avatar-updated` + logout
 * qui étaient dupliqués strictement identiques entre AdminSidebar et
 * DashboardSidebar. Renvoyé au shell qui l'injecte dans le footer.
 */
export function useSidebarProfile(): SidebarProfile {
  const router = useRouter()
  const [name, setName] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let userId: string | null = null

    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single()
      if (profile?.full_name) setName(profile.full_name)
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
    }
    fetchProfile()

    const handleAvatarUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.userId === userId) setAvatarUrl(detail.url)
    }
    window.addEventListener('avatar-updated', handleAvatarUpdate)
    return () => window.removeEventListener('avatar-updated', handleAvatarUpdate)
  }, [])

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  return { name, avatarUrl, logout }
}
