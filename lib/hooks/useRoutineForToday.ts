'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook de persistance de la routine pré-marché du jour en base.
 *
 * Remplace l'ancien localStorage par un vrai upsert Supabase :
 *   - Load au mount via SELECT (user_id, routine_date = today)
 *   - Migration auto one-shot : si une routine localStorage existe
 *     et pas de row en base → UPSERT puis cleanup du localStorage
 *   - Save auto debounced (800ms) à chaque modif via UPSERT
 *     onConflict: 'user_id,routine_date' (UNIQUE contrainte étape 1)
 *   - Flag dirty : zéro UPSERT tant qu'aucune interaction user
 *     (évite les rows fantômes à l'ouverture de la page)
 *   - saveStatus pour l'indicateur UX "Enregistré" discret
 *
 * confidence reste `null` tant que le trader n'a pas touché le slider :
 * l'UI affiche "5/10" par défaut visuellement, mais en base on garde
 * la vraie absence pour éviter de polluer les moyennes IA Mental.
 */

export interface PreMarketRoutineData {
  confidence: number | null
  mentalNote: string
  bias: string
  news: string
  support: string
  resistance: string
  checks: Record<string, boolean>
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 800
const SAVED_FADE_MS = 2000

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptyData(allChecks: readonly string[]): PreMarketRoutineData {
  return {
    confidence: null,
    mentalNote: '',
    bias: '',
    news: '',
    support: '',
    resistance: '',
    checks: Object.fromEntries(allChecks.map((c) => [c, false])),
  }
}

function legacyLocalStorageKey(): string {
  return `premarket_${todayISO()}`
}

interface Row {
  confidence: number | null
  mental_note: string | null
  bias: string | null
  news: string | null
  support: string | null
  resistance: string | null
  checks: Record<string, boolean> | null
}

function rowToData(
  row: Row,
  allChecks: readonly string[],
): PreMarketRoutineData {
  return {
    confidence: row.confidence,
    mentalNote: row.mental_note ?? '',
    bias: row.bias ?? '',
    news: row.news ?? '',
    support: row.support ?? '',
    resistance: row.resistance ?? '',
    checks: {
      ...Object.fromEntries(allChecks.map((c) => [c, false])),
      ...(row.checks ?? {}),
    },
  }
}

function dataToRow(data: PreMarketRoutineData) {
  return {
    confidence: data.confidence,
    mental_note: data.mentalNote,
    bias: data.bias,
    news: data.news,
    support: data.support,
    resistance: data.resistance,
    checks: data.checks,
  }
}

export function useRoutineForToday(allChecks: readonly string[]): {
  data: PreMarketRoutineData
  update: (partial: Partial<PreMarketRoutineData>) => void
  reset: () => Promise<void>
  saveStatus: SaveStatus
  loading: boolean
} {
  const [data, setData] = useState<PreMarketRoutineData>(() =>
    emptyData(allChecks),
  )
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const upsertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef<string | null>(null)
  const dateRef = useRef<string>(todayISO())
  const supabase = createClient()

  // ─── Load initial + migration one-shot localStorage ──────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setLoading(false)
        return
      }
      userIdRef.current = user.id
      const date = dateRef.current

      const { data: row, error } = await supabase
        .from('pre_market_routines')
        .select(
          'confidence, mental_note, bias, news, support, resistance, checks',
        )
        .eq('user_id', user.id)
        .eq('routine_date', date)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.warn('[useRoutineForToday] load error', error)
        setLoading(false)
        return
      }

      if (row) {
        setData(rowToData(row as Row, allChecks))
        setLoading(false)
        return
      }

      // Pas de row en base → tente la migration localStorage one-shot
      try {
        const legacy = localStorage.getItem(legacyLocalStorageKey())
        if (!legacy) {
          setLoading(false)
          return
        }
        const parsed = JSON.parse(legacy) as Partial<PreMarketRoutineData>
        const merged: PreMarketRoutineData = {
          // L'ancien localStorage posait confidence=5 par défaut même sans
          // interaction → on ne migre QUE si !== 5 (sinon on considère non-renseigné)
          confidence:
            typeof parsed.confidence === 'number' && parsed.confidence !== 5
              ? parsed.confidence
              : null,
          mentalNote: parsed.mentalNote ?? '',
          bias: parsed.bias ?? '',
          news: parsed.news ?? '',
          support: parsed.support ?? '',
          resistance: parsed.resistance ?? '',
          checks: {
            ...Object.fromEntries(allChecks.map((c) => [c, false])),
            ...(parsed.checks ?? {}),
          },
        }
        const hasData =
          merged.confidence !== null ||
          merged.mentalNote.length > 0 ||
          merged.bias.length > 0 ||
          merged.news.length > 0 ||
          merged.support.length > 0 ||
          merged.resistance.length > 0 ||
          Object.values(merged.checks).some(Boolean)

        if (!hasData) {
          localStorage.removeItem(legacyLocalStorageKey())
          setLoading(false)
          return
        }

        setData(merged)
        const { error: upsertErr } = await supabase
          .from('pre_market_routines')
          .upsert(
            {
              user_id: user.id,
              routine_date: date,
              ...dataToRow(merged),
            },
            { onConflict: 'user_id,routine_date' },
          )
        if (!upsertErr) {
          localStorage.removeItem(legacyLocalStorageKey())
        }
      } catch {
        // localStorage inaccessible, bloqué, ou JSON invalide — ignore silencieux
      }

      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // allChecks est une constante stable (SECTIONS.flatMap côté PreMarket),
    // le load ne doit pas être relancé en cours de session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── UPSERT debounced ────────────────────────────────────────────
  const scheduleUpsert = useCallback(
    (newData: PreMarketRoutineData) => {
      if (!userIdRef.current) return
      if (upsertTimerRef.current) clearTimeout(upsertTimerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      setSaveStatus('saving')
      upsertTimerRef.current = setTimeout(async () => {
        const userId = userIdRef.current
        if (!userId) return
        const { error } = await supabase
          .from('pre_market_routines')
          .upsert(
            {
              user_id: userId,
              routine_date: dateRef.current,
              ...dataToRow(newData),
            },
            { onConflict: 'user_id,routine_date' },
          )
        if (error) {
          console.warn('[useRoutineForToday] upsert error', error)
          setSaveStatus('error')
          return
        }
        setSaveStatus('saved')
        savedTimerRef.current = setTimeout(
          () => setSaveStatus('idle'),
          SAVED_FADE_MS,
        )
      }, DEBOUNCE_MS)
    },
    [supabase],
  )

  // ─── API publique ────────────────────────────────────────────────
  const update = useCallback(
    (partial: Partial<PreMarketRoutineData>) => {
      setData((prev) => {
        const merged: PreMarketRoutineData = {
          ...prev,
          ...partial,
          checks:
            partial.checks !== undefined
              ? { ...prev.checks, ...partial.checks }
              : prev.checks,
        }
        scheduleUpsert(merged)
        return merged
      })
    },
    [scheduleUpsert],
  )

  const reset = useCallback(async () => {
    const empty = emptyData(allChecks)
    setData(empty)
    const userId = userIdRef.current
    if (!userId) return
    if (upsertTimerRef.current) clearTimeout(upsertTimerRef.current)
    setSaveStatus('saving')
    const { error } = await supabase
      .from('pre_market_routines')
      .upsert(
        {
          user_id: userId,
          routine_date: dateRef.current,
          ...dataToRow(empty),
        },
        { onConflict: 'user_id,routine_date' },
      )
    if (error) {
      setSaveStatus('error')
      return
    }
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(
      () => setSaveStatus('idle'),
      SAVED_FADE_MS,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  // Cleanup au unmount — évite les setState tardifs sur composant démonté
  useEffect(() => {
    return () => {
      if (upsertTimerRef.current) clearTimeout(upsertTimerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  return { data, update, reset, saveStatus, loading }
}
