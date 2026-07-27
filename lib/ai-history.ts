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

// Bloc mental produit par le prompt /api/ai-coach-analysis (facteur
// différenciant ATP — le LLM reçoit mood_stats + notes_psycho +
// plan_correlation, aucun outil concurrent ne donne ces données à son
// IA). Alimente la carte Dashboard Insight IA #3 "Psychologie & Mental".
export type AiTiltSignal = 'AUCUN' | 'FAIBLE' | 'MODERE' | 'FORT'
export interface AiMentalAnalysis {
  verdict: string
  tilt_signal: AiTiltSignal
  tilt_explication: string
  regularite_emotionnelle_note_sur_10: number
  conseil_mental: string
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

  // Bloc mental — carte Dashboard Insight IA #3. Optionnel : les
  // analyses générées avant l'enrichissement du prompt n'en ont pas,
  // la carte affiche alors un fallback "génère ton analyse".
  analyse_mentale?: AiMentalAnalysis

  // Périmètre de l'analyse — permet aux cartes Dashboard d'afficher
  // "N derniers jours · tous comptes" en sous-titre et d'éviter les
  // contradictions apparentes avec l'ATP Score (qui, lui, calcule sur
  // toute l'historique). Ajouté après le paquet 1 ATP Score en réaction
  // au bug de confiance "89 Excellent" vs "IA -1322 $ 7 jours".
  period_label?: string   // ex "7 derniers jours", "60 derniers jours"
  period_from?: string    // YYYY-MM-DD
  period_to?: string      // YYYY-MM-DD
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

/**
 * Sous-titre de périmètre pour les cartes Dashboard Insight IA.
 *
 * Renvoie "N derniers jours · tous comptes" quand la période est
 * connue, ou juste "tous comptes" pour les vieilles entrées d'avant
 * l'ajout de period_label (fallback gracieux, pas de "période inconnue"
 * qui inquiéterait le user).
 *
 * Le suffixe "· tous comptes" est HARDCODÉ intentionnellement : l'API
 * /api/ai-coach-analysis reçoit bien un `accountId` dans MetricsOptions
 * mais ne l'applique JAMAIS à la query Supabase (bug documenté dans
 * REFONTE.md § "Router accountId à l'API d'analyse IA"). Tant que ce
 * bug n'est pas corrigé, l'analyse porte réellement sur tous les
 * comptes du trader, quel que soit le filtre affiché dans le header
 * Dashboard. Le sous-titre dit la vérité, pas la promesse.
 */
export function formatAnalysisScope(entry: AiHistoryEntry): string {
  const period = entry.period_label
  if (!period) return 'tous comptes'
  return `${period} · tous comptes`
}
