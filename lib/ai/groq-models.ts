/**
 * Modèles Groq utilisés par les routes AI du projet — centralisés ici
 * pour éviter de patcher 8 fichiers à chaque dépréciation modèle chez
 * Groq (c'est déjà arrivé 3 fois : llama-4-scout retiré,
 * llama-3.3-70b-versatile retiré, puis llama-4-maverick retiré le
 * 9 mars 2026 — d'où le switch sur Qwen 3.6 vision).
 *
 * Prochaine migration = 1 ligne à changer ici.
 *
 * État au 2026-10-19 — vérifier la liste à jour avant tout changement :
 *   https://console.groq.com/docs/models
 *
 * Candidats text-only de secours si gpt-oss-120b est retiré :
 *   - moonshotai/kimi-k2-instruct   (MoE 1T, qualité supérieure)
 *   - qwen/qwen3-32b                 (reasoning, plus léger)
 *   - openai/gpt-oss-20b             (même famille, plus accessible)
 *
 * Candidats vision de secours si qwen3.6-27b est retiré :
 *   - qwen/qwen3.8-27b               (plan B direct, même famille Qwen VL)
 *   - qwen2-vl-72b-instruct          (ancienne génération Qwen VL)
 *
 * ⚠ Qwen 3.6 a un mode "thinking" : les routes vision passent
 *   reasoning_format: 'hidden' côté payload Groq et strippent tout
 *   bloc <think>...</think> en filet AVANT parsing JSON.
 */

/** Modèle text-only utilisé par les 6 routes AI non-vision. */
export const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'

/** Modèle vision/multimodal utilisé par ai-chart et asset-analysis/technical
 *  (routes qui envoient des image_url dans le payload Groq).
 *  Switch 2026-10-19 : llama-4-maverick retiré par Groq le 2026-03-09. */
export const GROQ_VISION_MODEL = 'qwen/qwen3.6-27b'
