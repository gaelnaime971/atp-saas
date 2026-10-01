/**
 * Modèles Groq utilisés par les routes AI du projet — centralisés ici
 * pour éviter de patcher 8 fichiers à chaque dépréciation modèle chez
 * Groq (c'est arrivé 2 fois en moins d'un mois : llama-4-scout retiré,
 * puis llama-3.3-70b-versatile aussi).
 *
 * Prochaine migration = 1 ligne à changer ici.
 *
 * État au 2 octobre 2026 — vérifier la liste à jour avant tout changement :
 *   https://console.groq.com/docs/models
 *
 * Candidats text-only de secours si gpt-oss-120b est retiré :
 *   - moonshotai/kimi-k2-instruct   (MoE 1T, qualité supérieure)
 *   - qwen/qwen3-32b                 (reasoning, plus léger)
 *   - openai/gpt-oss-20b             (même famille, plus accessible)
 *
 * Candidats vision de secours si llama-4-maverick est retiré :
 *   - llama-3.2-90b-vision-preview   (ancien standard vision Groq)
 *   - qwen2-vl-72b-instruct          (alternative Alibaba)
 */

/** Modèle text-only utilisé par les 6 routes AI non-vision. */
export const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'

/** Modèle vision/multimodal utilisé par ai-chart et asset-analysis/technical
 *  (routes qui envoient des image_url dans le payload Groq). */
export const GROQ_VISION_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct'
