'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DEFAULT_TIME_ZONE, browserTimeZone, isEmptyTimeZone, isValidTimeZone, resolveTimeZone,
  type TimeZoneSource,
} from '@/lib/time'

/**
 * Fuseau du membre côté navigateur, pour tout /dashboard (Mon trading et
 * Marchés). Règle dans lib/time.ts : profil, sinon navigateur, sinon Paris.
 *
 * Première visite : si profiles.timezone est vide et que le navigateur
 * donne un fuseau valide, il est enregistré (une fois, sans écraser une
 * valeur posée entre-temps). Un fuseau invalide
 * en base n'est jamais réécrit ici : l'affichage retombe sur Paris.
 */

export interface MemberTimeZoneValue {
  /** Fuseau à utiliser pour tout affichage. */
  timeZone: string
  source: TimeZoneSource
  /** Faux tant que le profil n'est pas lu (rendu serveur compris). */
  ready: boolean
  /** Enregistre un nouveau fuseau dans le profil. Lève si invalide ou refusé. */
  saveTimeZone: (tz: string) => Promise<void>
}

const MemberTimeZoneContext = createContext<MemberTimeZoneValue>({
  timeZone: DEFAULT_TIME_ZONE,
  source: 'default',
  ready: false,
  saveTimeZone: async () => { throw new Error('MemberTimeZoneProvider absent') },
})

export function MemberTimeZoneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ profileTz: string | null; browserTz: string | null; ready: boolean }>({
    profileTz: null, browserTz: null, ready: false,
  })
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const browserTz = browserTimeZone()
    ;(async () => {
      let profileTz: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          if (!cancelled) setUserId(user.id)
          const { data } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
          profileTz = (data as { timezone?: string | null } | null)?.timezone ?? null
          if (isEmptyTimeZone(profileTz) && browserTz && isValidTimeZone(browserTz)) {
            // Condition sur la valeur lue : ne pas écraser un réglage fait
            // entre-temps (autre onglet).
            const base = supabase.from('profiles').update({ timezone: browserTz }).eq('id', user.id)
            const { error } = await (profileTz === null ? base.is('timezone', null) : base.eq('timezone', profileTz))
            if (!error) profileTz = browserTz
          }
        }
      } catch {
        // profil illisible : navigateur, sinon Paris
      }
      if (!cancelled) setState({ profileTz, browserTz, ready: true })
    })()
    return () => { cancelled = true }
  }, [])

  const saveTimeZone = useCallback(async (tz: string) => {
    const value = tz.trim()
    if (!isValidTimeZone(value)) throw new Error('Fuseau invalide')
    if (!userId) throw new Error('Session absente')
    const { error } = await createClient().from('profiles').update({ timezone: value }).eq('id', userId)
    if (error) throw error
    setState(s => ({ ...s, profileTz: value }))
  }, [userId])

  const value = useMemo<MemberTimeZoneValue>(() => {
    const { timeZone, source } = resolveTimeZone(state.profileTz, state.browserTz)
    return { timeZone, source, ready: state.ready, saveTimeZone }
  }, [state, saveTimeZone])

  return <MemberTimeZoneContext.Provider value={value}>{children}</MemberTimeZoneContext.Provider>
}

export function useMemberTimeZone(): MemberTimeZoneValue {
  return useContext(MemberTimeZoneContext)
}
