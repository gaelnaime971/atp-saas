'use client'

/**
 * useBilan — hook Supabase pour la persistance du "Bilan Trader 2027".
 *
 * Responsabilités :
 * - Charger le bilan en cours (completed_at IS NULL) pour l'utilisateur
 *   connecté. Si aucun : créer automatiquement un bilan vide en base.
 * - Sauvegarder avec debounce 1500 ms à chaque modification (saveBilan).
 * - Marquer complété (completeBilan) avec flush immédiat.
 * - Réinitialiser (resetBilan) : supprime le brouillon non complété,
 *   garde en historique le bilan complété, crée un nouveau bilan vide.
 *
 * Politique d'erreurs : SILENCIEUX. Aucune exception ne remonte à l'UI.
 * Si Supabase est injoignable, le HTML garde son propre localStorage en
 * fallback (comportement existant), et le hook réessaiera au prochain
 * saveBilan.
 *
 * Mapping S ↔ colonnes : décidé à l'étape audit et appliqué à l'étape 3
 * (BilanPage). Ce hook ne connaît QUE le format Supabase (BilanState) —
 * la conversion depuis S.ans/S.hz/S.res côté iframe se fait dans le
 * composant BilanPage.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ═════════════════════════════════════════════════════════════════════
// Types (exportés)
// ═════════════════════════════════════════════════════════════════════

export interface BilanProfile {
  name: string
  capital: number
  target: number
  wr: number
  r: number
  trades: number
  exp: string
  risk: number
  instrument: string
  pfirm: string
  phase: string
  dd: number
  dl: number
  cons: number
}

export interface BilanState {
  id?: string
  profile: Partial<BilanProfile>
  /** answers[themeIndex][questionIndex] = valeur 1-5 (miroir de S.ans du HTML). */
  answers: Record<number, Record<number, number>>
  /** Scores agrégés par thème, produits par calcResults() côté HTML. */
  scores: Record<string, number>
  alpha_score: number | null
  archetype: string | null
  horizon_weeks: 4 | 8 | 12
  /** checks[`${pi}-${wi}-${ai}`] = true/false pour les cases du plan. */
  checks: Record<string, boolean>
  completed_at: string | null
}

// ═════════════════════════════════════════════════════════════════════
// Internes
// ═════════════════════════════════════════════════════════════════════

const DEBOUNCE_MS = 1500

/** Représentation ligne DB — interne, non exportée. */
interface BilanRow {
  id: string
  user_id: string
  profile: Partial<BilanProfile> | null
  answers: Record<string, Record<string, number>> | null
  scores: Record<string, number> | null
  alpha_score: number | null
  archetype: string | null
  horizon_weeks: number | null
  checks: Record<string, boolean> | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** Convertit une ligne DB en BilanState (tolère les JSONB null). */
function rowToState(row: BilanRow): BilanState {
  return {
    id: row.id,
    profile: row.profile ?? {},
    answers: (row.answers ?? {}) as Record<number, Record<number, number>>,
    scores: row.scores ?? {},
    alpha_score: row.alpha_score,
    archetype: row.archetype,
    horizon_weeks: ((row.horizon_weeks ?? 8) as 4 | 8 | 12),
    checks: row.checks ?? {},
    completed_at: row.completed_at,
  }
}

/** Champs à écrire en UPDATE (on ne touche jamais id / user_id / created_at). */
function stateToUpdate(s: BilanState) {
  return {
    profile: s.profile,
    answers: s.answers,
    scores: s.scores,
    alpha_score: s.alpha_score,
    archetype: s.archetype,
    horizon_weeks: s.horizon_weeks,
    checks: s.checks,
    completed_at: s.completed_at,
  }
}

// ═════════════════════════════════════════════════════════════════════
// Hook
// ═════════════════════════════════════════════════════════════════════

export function useBilan() {
  const [bilan, setBilan] = useState<BilanState | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Dernier snapshot en attente d'écriture — permet au flush de toujours écrire l'état courant. */
  const pendingRef = useRef<BilanState | null>(null)
  const mountedRef = useRef(true)

  // ─── Flush write (utilisé par debounce + completeBilan) ──────────────
  const flush = useCallback(async () => {
    const s = pendingRef.current
    if (!s?.id) return
    try {
      await supabase
        .from('bilans')
        .update(stateToUpdate(s))
        .eq('id', s.id)
    } catch {
      /* silent — le HTML garde son localStorage en fallback */
    }
  }, [supabase])

  // ─── Load initial : bilan en cours OU création automatique ───────────
  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mountedRef.current) {
          if (mountedRef.current) setIsLoading(false)
          return
        }

        // Bilan en cours = plus récent avec completed_at IS NULL.
        const { data: existing } = await supabase
          .from('bilans')
          .select('*')
          .eq('user_id', user.id)
          .is('completed_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!mountedRef.current) return

        if (existing) {
          setBilan(rowToState(existing as unknown as BilanRow))
        } else {
          // Aucun bilan en cours → création automatique d'un vide.
          const { data: created } = await supabase
            .from('bilans')
            .insert({ user_id: user.id })
            .select('*')
            .single()
          if (mountedRef.current && created) {
            setBilan(rowToState(created as unknown as BilanRow))
          }
        }
      } catch {
        /* silent */
      } finally {
        if (mountedRef.current) setIsLoading(false)
      }
    })()

    return () => {
      mountedRef.current = false
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [supabase])

  // ─── saveBilan : patch + debounce 1500 ms ────────────────────────────
  const saveBilan = useCallback((patch: Partial<BilanState>) => {
    setBilan(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      pendingRef.current = next
      return next
    })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      flush()
    }, DEBOUNCE_MS)
  }, [flush])

  // ─── completeBilan : timestamp + flush immédiat (bypass debounce) ────
  const completeBilan = useCallback(async () => {
    const now = new Date().toISOString()
    setBilan(prev => {
      if (!prev) return prev
      const next = { ...prev, completed_at: now }
      pendingRef.current = next
      return next
    })
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    await flush()
  }, [flush])

  // ─── resetBilan : brouillon non complété = supprimé ; complété = archivé ─
  const resetBilan = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Si l'utilisateur reset SANS avoir complété, on supprime son brouillon
      // pour éviter la pollution DB (bilans vides orphelins). Si complété,
      // on le laisse pour l'historique.
      if (bilan?.id && !bilan.completed_at) {
        await supabase.from('bilans').delete().eq('id', bilan.id)
      }

      const { data: created } = await supabase
        .from('bilans')
        .insert({ user_id: user.id })
        .select('*')
        .single()

      if (mountedRef.current && created) {
        setBilan(rowToState(created as unknown as BilanRow))
      }
    } catch {
      /* silent */
    }
  }, [supabase, bilan])

  return { bilan, isLoading, saveBilan, completeBilan, resetBilan }
}
