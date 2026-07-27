/**
 * Persistance des analyses IA — localStorage.
 *
 * Partagé entre AnalyseIA.tsx (génération + sauvegarde) et le Dashboard
 * (lecture pour Insight IA #1 & #2).
 *
 * Contexte : les analyses sont générées via /api/ai-coach-analysis mais
 * PAS persistées en base (chantier ai_analyses table documenté dans
 * REFONTE.md § "Persister les analyses IA en base"). Ce module est la
 * source de vérité localStorage en attendant.
 *
 * Retrocompat : les vieilles entrées HistoryEntry (avant enrichissement
 * pour les cartes Dashboard) n'ont pas les champs `faiblesse_principale`,
 * `stop_doing_top`, `top_instrument`, `top_pattern`. Les consommateurs
 * doivent gérer `undefined`.
 */

export type AiTrend = 'PROGRESSION' | 'STAGNATION' | 'DEGRADATION'

export interface AiScores {
  discipline: number
  psycho: number
  methode: number
  risk: number
  consistance: number
  force_mentale: number
}

export interface AiInstrumentInsight {
  instrument: string
  verdict: string
  conseil: string
}

export interface AiHistoryEntry {
  date: string  // ISO
  scores: AiScores
  verdict_general: string
  trend: AiTrend

  // Champs ajoutés pour les cartes Dashboard Insight IA. Optionnels
  // pour rester rétrocompat avec les entrées d'avant l'enrichissement.
  faiblesse_principale?: string
  stop_doing_top?: string
  top_instrument?: AiInstrumentInsight
  top_pattern?: string
}

export const AI_HISTORY_KEY = 'atp_analyses_history'

export function loadAiHistory(): AiHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AI_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as AiHistoryEntry[] : []
  } catch {
    return []
  }
}

export function saveAiHistory(entries: AiHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(entries))
  } catch { /* quota — ignore */ }
}

/**
 * Renvoie l'entrée la plus récente si elle date de moins de `maxAgeDays`,
 * sinon `null`. Utilisé par le Dashboard pour afficher un fallback
 * "génère ton analyse" quand l'insight devient périmé.
 *
 * Défaut 3 jours : le user trade quotidiennement, une analyse > 3j
 * ignore déjà plusieurs sessions et son conseil devient obsolète.
 */
export function latestFreshAnalysis(maxAgeDays: number = 3): AiHistoryEntry | null {
  const entries = loadAiHistory()
  if (entries.length === 0) return null
  // Historique trié par ordre d'insertion (ancien → récent). Prend le dernier.
  const latest = entries[entries.length - 1]
  const ageMs = Date.now() - new Date(latest.date).getTime()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  return ageMs <= maxAgeMs ? latest : null
}
