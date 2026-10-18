/**
 * Configuration centrale des limites quotidiennes IA par feature.
 *
 * Chaque route Groq s'identifie par un AiFeature stable (slug kebab-case).
 * La limite "daily" est calibrée pour être généreuse pour un humain actif
 * et bloquante pour un script en boucle. À ajuster après 1 semaine
 * d'observation en mode AI_QUOTA_MODE=observe (voir lib/ai/quota.ts).
 *
 * Prix Groq : à vérifier sur https://groq.com/pricing avant chaque update.
 * Dernière vérif : 2026-10-19. Les cents comptent peu, la rotation modèle
 * (gpt-oss-120b déprécié demain, maverick aussi) impactera davantage.
 */

export type AiFeature =
  | 'coach-chat'
  | 'coach-analysis'
  | 'coach-metrics'
  | 'chart'
  | 'news'
  | 'asset-synthesis'
  | 'asset-technical'
  | 'asset-sentiment'
  | 'asset-macro'
  | 'asset-correlations'
  | 'asset-news'
  | 'stock-verdict'
  | 'stock-ai-scores'
  | 'jarvis'

export interface AiFeatureConfig {
  /** Limite quotidienne (appels/jour, reset à minuit heure de Paris). */
  daily: number
  /** Label user-facing — utilisé dans le message 429. */
  label: string
  /** Qui déclenche la route — purement informatif pour l'admin. */
  triggeredBy: 'trader' | 'trader (cache partagé)' | 'cron'
  /** Chemin de la route Next.js — informatif pour l'audit admin. */
  route: string
  /**
   * Politique en cas d'erreur Supabase sur le check quota :
   * - 'open'   = laisser passer (ne pas pénaliser un payant pour un bug infra)
   * - 'closed' = refuser (pour les features coûteuses en voix où un fail
   *              non-tracké coûterait vraiment cher)
   */
  failMode: 'open' | 'closed'
}

export const AI_LIMITS: Record<AiFeature, AiFeatureConfig> = {
  'coach-chat':         { daily: 60,  label: 'Assistant chat',          triggeredBy: 'trader', route: '/api/ai-coach-chat',           failMode: 'open' },
  'coach-analysis':     { daily: 10,  label: 'Analyse IA complète',     triggeredBy: 'trader', route: '/api/ai-coach-analysis',       failMode: 'open' },
  'coach-metrics':      { daily: 100, label: 'Métriques IA',            triggeredBy: 'trader', route: '/api/ai-coach-metrics',        failMode: 'open' },
  'chart':              { daily: 30,  label: 'Analyse graphique',       triggeredBy: 'trader', route: '/api/ai-chart',                failMode: 'open' },
  'news':               { daily: 30,  label: 'Résumé news',             triggeredBy: 'trader', route: '/api/ai-news',                 failMode: 'open' },
  'asset-synthesis':    { daily: 20,  label: 'Synthèse actif',          triggeredBy: 'trader', route: '/api/asset-analysis/synthesis',   failMode: 'open' },
  'asset-technical':    { daily: 20,  label: 'Analyse technique actif', triggeredBy: 'trader', route: '/api/asset-analysis/technical',   failMode: 'open' },
  'asset-sentiment':    { daily: 20,  label: 'Sentiment actif',         triggeredBy: 'trader', route: '/api/asset-analysis/sentiment',   failMode: 'open' },
  'asset-macro':        { daily: 20,  label: 'Macro actif',             triggeredBy: 'trader', route: '/api/asset-analysis/macro',       failMode: 'open' },
  'asset-correlations': { daily: 20,  label: 'Corrélations actif',      triggeredBy: 'trader', route: '/api/asset-analysis/correlations', failMode: 'open' },
  'asset-news':         { daily: 30,  label: 'News actif',              triggeredBy: 'trader', route: '/api/asset-analysis/news',        failMode: 'open' },
  'stock-verdict':      { daily: 50,  label: 'Verdict stock',           triggeredBy: 'trader', route: '/api/stock/ai-verdict',           failMode: 'open' },
  'stock-ai-scores':    { daily: 200, label: 'Scores stocks',           triggeredBy: 'trader (cache partagé)', route: '/api/stock/ai-scores', failMode: 'open' },
  'jarvis':             { daily: 20,  label: 'Jarvis vocal',            triggeredBy: 'trader', route: '/api/jarvis/chat',              failMode: 'closed' },
}

/**
 * Tarifs Groq par million de tokens (USD) — vérifier sur https://groq.com/pricing
 * avant chaque mise à jour. Utilisé par estimateCost() dans lib/ai/quota.ts.
 */
export const GROQ_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Modèles text actuellement utilisés (lib/ai/groq-models.ts)
  'openai/gpt-oss-120b':                                { input: 0.15,  output: 0.75 },
  'meta-llama/llama-4-maverick-17b-128e-instruct':      { input: 0.20,  output: 0.60 },
  // Fallback générique si modèle inconnu — légèrement surestimé pour sécurité budget
  '__fallback__':                                        { input: 0.20,  output: 0.80 },
}

/**
 * Tarif Whisper Turbo (Groq) pour l'STT Jarvis — $/heure d'audio.
 * À confirmer sur https://groq.com/pricing — valeur de ref 2026-10.
 */
export const GROQ_WHISPER_USD_PER_HOUR = 0.04

/**
 * Mode global de la couche quota — contrôlé par env var AI_QUOTA_MODE.
 *   - 'off'     : skip total, aucun check, aucun increment. Comportement
 *                 d'avant ce chantier. Défaut (sécurité : rollout progressif).
 *   - 'observe' : increment INCONDITIONNEL (table se remplit avec le vrai
 *                 usage). Au-delà de la limite, log console.error "aurait
 *                 bloqué" mais laisse passer. Permet de calibrer les limites.
 *   - 'enforce' : vrai quota, 429 au-delà de la limite.
 */
export type QuotaMode = 'off' | 'observe' | 'enforce'

export function getQuotaMode(): QuotaMode {
  const raw = process.env.AI_QUOTA_MODE
  if (raw === 'observe' || raw === 'enforce') return raw
  return 'off'
}
