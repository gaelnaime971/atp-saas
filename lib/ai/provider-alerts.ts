/**
 * Alerte email "IA en panne durable" (étape 1E).
 *
 * Branché sur buildProviderErrorResponse() dans lib/ai/quota.ts — point
 * de passage UNIQUE des erreurs fournisseur sur les 8 routes IA. Rend
 * donc la détection automatique sans toucher aux routes.
 *
 * Déclencheurs — uniquement les pannes qui ne se règlent pas seules :
 *   - model_not_found       : le modèle n'existe plus / mal typé
 *   - model_decommissioned  : Groq a retiré le modèle (déjà vécu 2 fois)
 *   - invalid_api_key       : GROQ_API_KEY refusée ou manquante
 *   - insufficient_quota    : compte Groq à sec
 *   - billing_hard_limit    : plafond de facturation Groq atteint
 *
 * NON-déclencheurs (erreurs passagères) : timeout, 5xx isolé, rate limit
 * ponctuel 429, JSON parse invalide, erreur réseau, bug route.
 *
 * Anti-spam : 1 email max par (kind, model) sur 24 h via la RPC atomique
 * maybe_send_ai_alert() — rotation sans race condition même si plusieurs
 * routes tombent en même temps.
 */

import { createClient } from '@supabase/supabase-js'
import { notifyAdmin } from '@/lib/email/notify-admin'

export type AiAlertKind =
  | 'model_not_found'
  | 'model_decommissioned'
  | 'invalid_api_key'
  | 'insufficient_quota'
  | 'billing_hard_limit'

export interface ProviderErrorContext {
  route: string
  model?: string
  status?: number
  detail?: unknown
}

interface ClassifiedFailure {
  kind: AiAlertKind
  groqCode: string | null
  groqMessage: string | null
}

const ANTI_SPAM_WINDOW_HOURS = 24

const KIND_LABELS: Record<AiAlertKind, string> = {
  model_not_found:      'Modèle introuvable',
  model_decommissioned: 'Modèle retiré par Groq',
  invalid_api_key:      'Clé API Groq refusée',
  insufficient_quota:   'Quota Groq épuisé',
  billing_hard_limit:   'Plafond de facturation Groq atteint',
}

const ROUTE_TO_FEATURES: Record<string, { feature: string }> = {
  '/api/ai-chart':                 { feature: 'Session Live — analyse de graphe (vision)' },
  '/api/ai-news':                  { feature: 'Session Live — analyse de news (text)' },
  '/api/ai-coach-chat':            { feature: 'Analyse IA — chat coach (text)' },
  '/api/ai-coach-analysis':        { feature: 'Analyse IA — bilan complet (text)' },
  '/api/asset-analysis/synthesis': { feature: 'Analyse graphique — synthèse multi-piliers (text)' },
  '/api/asset-analysis/technical': { feature: 'Analyse graphique — analyse technique SMC (vision)' },
  '/api/stock/ai-verdict':         { feature: 'Analyse d\'action — verdict IA (text)' },
  '/api/stock/ai-scores':          { feature: 'Analyse d\'action — scores IA 6 axes (text)' },
}

/** Détecte si le détail de Groq correspond à une panne DURABLE. Retourne
 *  null pour toutes les erreurs passagères (pas d'alerte). */
export function classifyProviderFailure(ctx: ProviderErrorContext): ClassifiedFailure | null {
  // GROQ_API_KEY absent côté serveur — sentinelle levée par les 8 routes
  if (ctx.detail === 'GROQ_API_KEY missing') {
    return { kind: 'invalid_api_key', groqCode: null, groqMessage: 'GROQ_API_KEY env var missing' }
  }

  const groq = extractGroqError(ctx.detail)
  const code = groq?.code ?? null
  const type = groq?.type ?? null
  const message = groq?.message ?? null

  // Codes officiels Groq pour les 2 cas "modèle retiré"
  if (code === 'model_not_found') {
    return { kind: 'model_not_found', groqCode: code, groqMessage: message }
  }
  if (code === 'model_decommissioned') {
    return { kind: 'model_decommissioned', groqCode: code, groqMessage: message }
  }

  // Fallback texte si Groq envoie l'info seulement dans le message
  if (message && /\b(decommissioned|deprecated|retired|no longer available)\b/i.test(message)) {
    return { kind: 'model_decommissioned', groqCode: code, groqMessage: message }
  }
  if (message && /does not exist|not found/i.test(message) && (ctx.status === 400 || ctx.status === 404)) {
    return { kind: 'model_not_found', groqCode: code, groqMessage: message }
  }

  // Auth refusée
  if (code === 'invalid_api_key' || type === 'authentication_error' || ctx.status === 401) {
    return { kind: 'invalid_api_key', groqCode: code, groqMessage: message }
  }

  // Billing / quota Groq épuisé
  if (code === 'insufficient_quota') {
    return { kind: 'insufficient_quota', groqCode: code, groqMessage: message }
  }
  if (code === 'billing_hard_limit_reached' || code === 'billing_hard_limit') {
    return { kind: 'billing_hard_limit', groqCode: code, groqMessage: message }
  }
  if (message && /insufficient.*(quota|credit|balance)/i.test(message)) {
    return { kind: 'insufficient_quota', groqCode: code, groqMessage: message }
  }
  if (message && /billing.*(hard\s*limit|exceeded|spending)/i.test(message)) {
    return { kind: 'billing_hard_limit', groqCode: code, groqMessage: message }
  }

  return null
}

interface GroqError {
  code?: string
  message?: string
  type?: string
}

function extractGroqError(detail: unknown): GroqError | null {
  if (!detail || typeof detail !== 'object') return null
  const d = detail as Record<string, unknown>
  // Groq retourne généralement { error: { code, message, type } }, mais
  // notre buildProviderErrorResponse passe directement data.error → cf
  // app/api/*/route.ts (le "detail" est déjà l'objet error, pas la racine).
  const code = typeof d.code === 'string' ? d.code : undefined
  const message = typeof d.message === 'string' ? d.message : undefined
  const type = typeof d.type === 'string' ? d.type : undefined
  if (!code && !message && !type) return null
  return { code, message, type }
}

/**
 * Point d'entrée : classifie, consulte la RPC anti-spam, et envoie
 * l'email si autorisé. À appeler via next/server after() pour ne pas
 * rallonger la réponse. Toute erreur est loggée et avalée.
 */
export async function maybeAlertProviderFailure(ctx: ProviderErrorContext): Promise<void> {
  const failure = classifyProviderFailure(ctx)
  if (!failure) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ai-alert] Supabase env missing — alert skipped', { kind: failure.kind, route: ctx.route })
    return
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase.rpc('maybe_send_ai_alert', {
      p_kind: failure.kind,
      p_model: ctx.model ?? '',
      p_window_hours: ANTI_SPAM_WINDOW_HOURS,
    })
    if (error) {
      console.error('[ai-alert] RPC failed', { kind: failure.kind, error })
      return
    }
    if (data !== true) return // anti-spam : alerte déjà envoyée dans la fenêtre
  } catch (err) {
    console.error('[ai-alert] unexpected error', { kind: failure.kind, err })
    return
  }

  await sendProviderFailureEmail(ctx, failure, { testMode: false })
}

/**
 * Variante test — appelable depuis la route admin de test. Bypass
 * l'anti-spam, préfixe le sujet avec [TEST], envoie un email formaté
 * comme la vraie alerte. N'écrit PAS dans la table anti-spam.
 */
export async function sendProviderFailureEmailForTest(
  ctx: ProviderErrorContext,
  failureKind: AiAlertKind,
): Promise<void> {
  await sendProviderFailureEmail(ctx, {
    kind: failureKind,
    groqCode: 'test_code',
    groqMessage: 'Simulation déclenchée depuis /api/admin/ai-alert-test — aucun vrai incident Groq.',
  }, { testMode: true })
}

async function sendProviderFailureEmail(
  ctx: ProviderErrorContext,
  failure: ClassifiedFailure,
  opts: { testMode: boolean },
): Promise<void> {
  const kindLabel = KIND_LABELS[failure.kind]
  const feature = ROUTE_TO_FEATURES[ctx.route]?.feature ?? ctx.route
  const now = new Date()
  const dateStr = now.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'full',
    timeStyle: 'short',
  })

  const prefix = opts.testMode ? '[TEST] ' : ''
  const subject = `${prefix}[ATP IA] Panne durable Groq — ${kindLabel}${ctx.model ? ` (${ctx.model})` : ''}`

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:640px;margin:0 auto;padding:16px">
  ${opts.testMode ? '<div style="padding:8px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;margin-bottom:16px;color:#92400e;font-weight:600">⚠ Email de test — aucun incident réel.</div>' : ''}
  <h2 style="color:#dc2626;margin:0 0 16px;font-size:18px">⚠ Panne durable détectée sur les routes IA</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:6px 0;color:#6b7280;width:160px">Type de panne</td><td style="padding:6px 0"><strong>${esc(kindLabel)}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Modèle concerné</td><td style="padding:6px 0"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${esc(ctx.model || '(aucun)')}</code></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Route impactée</td><td style="padding:6px 0"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${esc(ctx.route)}</code></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Fonctionnalité</td><td style="padding:6px 0">${esc(feature)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Code Groq</td><td style="padding:6px 0"><code>${esc(failure.groqCode || '(aucun)')}</code></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Message Groq</td><td style="padding:6px 0;font-size:13px">${esc(failure.groqMessage || '(aucun)')}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Status HTTP</td><td style="padding:6px 0">${ctx.status ?? '(aucun)'}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Date (Paris)</td><td style="padding:6px 0">${esc(dateStr)}</td></tr>
  </table>
  <h3 style="font-size:14px;margin:20px 0 8px">Que faire</h3>
  <ol style="margin:0;padding-left:20px">
    <li style="margin-bottom:6px">Vérifier la liste officielle : <a href="https://console.groq.com/docs/models" style="color:#2563eb">console.groq.com/docs/models</a></li>
    <li style="margin-bottom:6px">Page des dépréciations : <a href="https://console.groq.com/docs/deprecations" style="color:#2563eb">console.groq.com/docs/deprecations</a></li>
    <li style="margin-bottom:6px">Mettre à jour <code>lib/ai/groq-models.ts</code> (1 ligne) + vérifier <code>lib/ai/quota-limits.ts</code> pour le pricing du nouveau modèle</li>
    <li style="margin-bottom:6px">Si auth/billing : vérifier <code>GROQ_API_KEY</code> dans les env vars Vercel + le compte Groq</li>
  </ol>
  <p style="margin-top:20px;font-size:12px;color:#6b7280">
    Anti-spam : 1 email max par (type de panne, modèle) sur 24 h.
    Les autres pannes du même type dans cette fenêtre ne généreront pas d'email supplémentaire mais sont loggées côté serveur sous <code>[ai-provider]</code>.
  </p>
</div>`.trim()

  const text = [
    opts.testMode ? '⚠ EMAIL DE TEST — aucun incident réel.\n' : '',
    `Panne durable détectée sur les routes IA`,
    ``,
    `Type de panne   : ${kindLabel}`,
    `Modèle          : ${ctx.model || '(aucun)'}`,
    `Route impactée  : ${ctx.route}`,
    `Fonctionnalité  : ${feature}`,
    `Code Groq       : ${failure.groqCode || '(aucun)'}`,
    `Message Groq    : ${failure.groqMessage || '(aucun)'}`,
    `Status HTTP     : ${ctx.status ?? '(aucun)'}`,
    `Date (Paris)    : ${dateStr}`,
    ``,
    `Que faire :`,
    `  1. Vérifier https://console.groq.com/docs/models`,
    `  2. Vérifier les dépréciations : https://console.groq.com/docs/deprecations`,
    `  3. Mettre à jour lib/ai/groq-models.ts (1 ligne) + pricing dans lib/ai/quota-limits.ts`,
    `  4. Si auth/billing : vérifier GROQ_API_KEY et le compte Groq`,
    ``,
    `Anti-spam : 1 email max par (type, modèle) sur 24 h.`,
  ].filter(Boolean).join('\n')

  await notifyAdmin({ subject, html, text })
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  }[c] || c))
}
