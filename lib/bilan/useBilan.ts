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

export type BilanSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const SAVED_FADE_MS = 2000

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
  const [saveStatus, setSaveStatus] = useState<BilanSaveStatus>('idle')

  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Dernier snapshot en attente d'écriture — permet au flush de toujours écrire l'état courant. */
  const pendingRef = useRef<BilanState | null>(null)
  const mountedRef = useRef(true)

  // ─── Flush write (utilisé par debounce + completeBilan) ──────────────
  // Erreurs plus silencieuses : destructurées + loggées + remontées via
  // saveStatus pour l'indicateur UI. Un trader ne doit JAMAIS croire que
  // ses réponses sont sauvegardées alors qu'elles ne le sont pas.
  const flush = useCallback(async () => {
    const s = pendingRef.current
    if (!s?.id) return
    setSaveStatus('saving')
    if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
    const { error } = await supabase
      .from('bilans')
      .update(stateToUpdate(s))
      .eq('id', s.id)
    if (error) {
      console.warn('[useBilan] flush error:', error)
      setSaveStatus('error')
      return
    }
    setSaveStatus('saved')
    savedFadeRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_FADE_MS)
  }, [supabase])

  // ─── Load initial : bilan le plus récent OU création automatique ─────
  //
  // Fix du bug "plan 12 semaines disparait au reload" : on charge le bilan
  // le plus récent du user, COMPLÉTÉ OU NON. L'iframe HTML distingue les
  // 2 modes via S.completedAt (ligne 2592-2596 de bilan_trader_2027.html) :
  //   - completedAt null → mode questionnaire (71 questions)
  //   - completedAt posé → mode results (plan 12 semaines + checklists)
  //
  // Reset explicite reste disponible via resetBilan (bouton "Recommencer").
  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.warn('[useBilan] auth error:', authError)
        if (mountedRef.current) {
          setSaveStatus('error')
          setIsLoading(false)
        }
        return
      }
      if (!user || !mountedRef.current) {
        if (mountedRef.current) setIsLoading(false)
        return
      }

      // Bilan le plus récent (completé OU non) — le filtre completed_at IS NULL
      // précédent cachait le plan 12 semaines au reload d'un bilan complété.
      const { data: existing, error: selectError } = await supabase
        .from('bilans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!mountedRef.current) return

      if (selectError) {
        console.warn('[useBilan] load select error:', selectError)
        setSaveStatus('error')
        setIsLoading(false)
        return
      }

      if (existing) {
        setBilan(rowToState(existing as unknown as BilanRow))
        setIsLoading(false)
        return
      }

      // Aucun bilan → création automatique d'un vide
      const { data: created, error: insertError } = await supabase
        .from('bilans')
        .insert({ user_id: user.id })
        .select('*')
        .single()
      if (insertError) {
        console.warn('[useBilan] load insert error:', insertError)
        setSaveStatus('error')
      } else if (mountedRef.current && created) {
        setBilan(rowToState(created as unknown as BilanRow))
      }
      if (mountedRef.current) setIsLoading(false)
    })()

    return () => {
      mountedRef.current = false
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      if (savedFadeRef.current) {
        clearTimeout(savedFadeRef.current)
        savedFadeRef.current = null
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
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.warn('[useBilan] reset auth error:', authError)
      setSaveStatus('error')
      return
    }

    // Brouillon non complété = supprimé (évite pollution DB), complété = archivé
    if (bilan?.id && !bilan.completed_at) {
      const { error: delError } = await supabase.from('bilans').delete().eq('id', bilan.id)
      if (delError) {
        console.warn('[useBilan] reset delete error:', delError)
        setSaveStatus('error')
        return
      }
    }

    const { data: created, error: insertError } = await supabase
      .from('bilans')
      .insert({ user_id: user.id })
      .select('*')
      .single()
    if (insertError) {
      console.warn('[useBilan] reset insert error:', insertError)
      setSaveStatus('error')
      return
    }

    if (mountedRef.current && created) {
      setBilan(rowToState(created as unknown as BilanRow))
      setSaveStatus('idle')
    }
  }, [supabase, bilan])

  return { bilan, isLoading, saveStatus, saveBilan, completeBilan, resetBilan }
}
