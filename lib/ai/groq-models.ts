/**
 * Modèles Groq utilisés par les routes AI du projet — centralisés ici
 * pour éviter de patcher 8 fichiers à chaque dépréciation modèle chez
 * Groq (c'est déjà arrivé 4 fois : llama-4-scout retiré,
 * llama-3.3-70b-versatile retiré, llama-4-maverick retiré le 2026-03-09,
 * puis qwen/qwen3.6-27b retiré le 2026-09-14 — d'où le switch Qwen 3.8).
 *
 * Prochaine migration = 1 ligne à changer ici.
 *
 * Dernière vérification : 2026-10-19.
 *   Liste des modèles actifs    → https://console.groq.com/docs/models
 *   Page des déprécations Groq  → https://console.groq.com/docs/deprecations
 *
 * Candidats text-only de secours si gpt-oss-120b est retiré :
 *   - openai/gpt-oss-20b   (même famille, plus accessible)
 *
 * Candidat vision de secours si qwen3.8-27b est retiré :
 *   - AUCUN secours vision disponible chez Groq aujourd'hui.
 *     En cas de dépréciation, prévoir soit un fallback texte-only
 *     avec OCR, soit un provider alternatif (OpenAI, Anthropic).
 *
 * ⚠ Qwen 3.8 a un mode "thinking" : les routes vision passent
 *   reasoning_format: 'hidden' côté payload Groq et strippent tout
 *   bloc <think>...</think> en filet AVANT parsing JSON.
 */

/** Modèle text-only utilisé par les 6 routes AI non-vision. */
export const GROQ_TEXT_MODEL = 'openai/gpt-oss-120b'

/** Modèle vision/multimodal utilisé par ai-chart et asset-analysis/technical
 *  (routes qui envoient des image_url dans le payload Groq).
 *  Switch 2026-10-19 : qwen/qwen3.6-27b retiré par Groq le 2026-09-14. */
export const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b'
