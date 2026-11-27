'use client'

import { useSyncExternalStore } from 'react'

/**
 * Instant courant arrondi à la minute, rendu côté client uniquement.
 *
 * Au SSR le serveur (UTC chez Vercel) et le navigateur n'ont pas la même
 * heure → HTML différent → React hydration mismatch #418. Ici via
 * useSyncExternalStore : le snapshot serveur vaut null, React hydrate
 * avec des cases vides puis passe à l'heure client. Le tic est calé sur
 * le changement de minute.
 */
function subscribeMinute(onChange: () => void) {
  let interval: ReturnType<typeof setInterval> | undefined
  const timeout = setTimeout(() => {
    onChange()
    interval = setInterval(onChange, 60_000)
  }, 60_000 - (Date.now() % 60_000) + 50)
  return () => {
    clearTimeout(timeout)
    if (interval) clearInterval(interval)
  }
}
const getMinute = () => Math.floor(Date.now() / 60_000)
const getServerMinute = () => null

/** Epoch ms de la minute courante, ou null au rendu serveur / à l'hydratation. */
export function useMinuteNow(): number | null {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute)
  return minute === null ? null : minute * 60_000
}
