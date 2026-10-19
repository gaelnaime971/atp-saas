/**
 * Helper serveur pour la couche quota IA — s'intercale dans chaque route
 * Groq AVANT le fetch au fournisseur.
 *
 * Pattern d'intégration dans une route (phase 2, cette lib est le socle) :
 *
 *     import { checkAndCount, recordUsage, buildQuotaResponse } from '@/lib/ai/quota'
 *     import { after } from 'next/server'
 *
 *     export async function POST(request) {
 *       // ... auth + check cache en amont
 *       const quota = await checkAndCount(user.id, 'coach-chat', isAdmin)
 *       if (!quota.allowed) return buildQuotaResponse(quota)
 *
 *       const r = await fetch('https://api.groq.com/...')
 *       const data = await r.json()
 *
 *       // Record tokens APRÈS la réponse envoyée au client — ne rallonge pas
 *       // la latence perçue. Nécessite Node runtime (après() ne marche pas
 *       // sur Edge en Next.js 16 — voir doc).
 *       if (data.usage) {
 *         after(async () => {
 *           await recordUsage(user.id, 'coach-chat', {
 *             tokensIn: data.usage.prompt_tokens,
 *             tokensOut: data.usage.completion_tokens,
 *             model: 'openai/gpt-oss-120b',
 *           })
 *         })
 *       }
 *
 *       return NextResponse.json({ reply: data.choices[0].message.content })
 *     }
 */

import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import {
  AI_LIMITS,
  getQuotaMode,
  GROQ_PRICING_USD_PER_MTOK,
  GROQ_WHISPER_USD_PER_HOUR,
  type AiFeature,
} from './quota-limits'
import { maybeAlertProviderFailure } from './provider-alerts'

// ─── requireUser : auth + role en 1 helper ──────────────────────────────

export interface AuthedUser {
  user: { id: string }
  isAdmin: boolean
}

/**
 * À appeler en TÊTE de toute route AI qui doit être protégée.
 * Retourne { user, isAdmin } si authentifié, ou une Response 401 prête
 * à retourner directement par le caller.
 *
 * Pattern dans une route :
 *     const auth = await requireUser()
 *     if (auth instanceof Response) return auth
 *     const { user, isAdmin } = auth
 *     // ...
 *
 * Fait 1 fetch Supabase auth (getUser) + 1 SELECT profiles(role). Dans les
 * routes qui ont déjà un Promise.all avec sessions/backtests, le coût est
 * négligeable (SELECT role tourne en parallèle sur la connexion dédiée).
 */
export async function requireUser(): Promise<AuthedUser | Response> {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin'
  return { user: { id: user.id }, isAdmin }
}

export interface QuotaResult {
  allowed: boolean
  callsToday: number
  callsLimit: number        // -1 = illimité (admin)
  message: string | null    // user-facing si refusé, null sinon
  feature: AiFeature
}

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[ai-quota] Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * À appeler AVANT le fetch fournisseur, APRÈS la vérif de cache (un cache hit
 * ne doit JAMAIS incrémenter le quota).
 *
 * Comportement par mode (env AI_QUOTA_MODE) :
 *   - off     → bypass total, retourne allowed=true sans toucher la DB
 *   - observe → increment INCONDITIONNEL, log "aurait bloqué" au-delà,
 *               retourne toujours allowed=true
 *   - enforce → vrai quota, retourne allowed=false quand limite atteinte
 *
 * Fail-open ou fail-closed sur erreur Supabase selon AI_LIMITS[feature].failMode.
 * Dans tous les cas, l'erreur est LOGGÉE avec préfixe [ai-quota] — jamais
 * silencieuse.
 */
export async function checkAndCount(
  userId: string,
  feature: AiFeature,
  isAdmin: boolean,
): Promise<QuotaResult> {
  const mode = getQuotaMode()
  const config = AI_LIMITS[feature]
  const limit = config.daily

  // CAS 1 : mode off → bypass total (comportement d'avant ce chantier)
  if (mode === 'off') {
    return {
      allowed: true,
      callsToday: 0,
      callsLimit: limit,
      message: null,
      feature,
    }
  }

  // CAS 2 : mode observe → increment INCONDITIONNEL (p_enforce=false)
  //         mode enforce → increment CONDITIONNEL (p_enforce=true)
  const enforce = mode === 'enforce'

  try {
    const supabase = serviceRoleClient()
    const { data, error } = await supabase.rpc('check_and_count_ai_usage', {
      p_user_id: userId,
      p_feature: feature,
      p_limit: limit,
      p_is_admin: isAdmin,
      p_enforce: enforce,
    })

    if (error) {
      console.error('[ai-quota] RPC error', { feature, userId, error })
      return handleFail(feature, config.failMode, limit)
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row.allowed !== 'boolean') {
      console.error('[ai-quota] RPC returned invalid shape', { feature, data })
      return handleFail(feature, config.failMode, limit)
    }

    const callsToday = Number(row.calls_today ?? 0)
    const callsLimit = Number(row.calls_limit ?? limit)

    // Mode observe : log si on aurait bloqué, mais laisse passer
    if (mode === 'observe' && !isAdmin && callsToday > limit) {
      console.error('[ai-quota] OBSERVE — aurait bloqué', {
        feature, userId, callsToday, limit,
      })
    }

    const allowed = mode === 'observe' ? true : row.allowed
    const message = allowed ? null : buildQuotaMessage(feature, callsLimit)

    return { allowed, callsToday, callsLimit, message, feature }
  } catch (err) {
    console.error('[ai-quota] unexpected error', { feature, userId, err })
    return handleFail(feature, config.failMode, limit)
  }
}

function handleFail(
  feature: AiFeature,
  failMode: 'open' | 'closed',
  limit: number,
): QuotaResult {
  if (failMode === 'open') {
    return {
      allowed: true,
      callsToday: 0,
      callsLimit: limit,
      message: null,
      feature,
    }
  }
  return {
    allowed: false,
    callsToday: 0,
    callsLimit: limit,
    message: `Impossible de vérifier ton quota pour « ${AI_LIMITS[feature].label} » — réessaie dans quelques instants.`,
    feature,
  }
}

function buildQuotaMessage(feature: AiFeature, limit: number): string {
  return `Tu as atteint ta limite quotidienne pour « ${AI_LIMITS[feature].label} » (${limit}/jour). Elle se réinitialise à minuit (heure de Paris). Si tu as un besoin exceptionnel, contacte le support.`
}

/**
 * Construit la Response 429 à retourner depuis une route API quand
 * checkAndCount renvoie allowed=false. Centralisé ici pour cohérence.
 */
export function buildQuotaResponse(quota: QuotaResult): Response {
  return NextResponse.json(
    {
      error: 'quota_exceeded',
      message: quota.message,
      feature: quota.feature,
      callsToday: quota.callsToday,
      callsLimit: quota.callsLimit,
    },
    { status: 429 },
  )
}

/**
 * Réponse unifiée pour TOUTE erreur hors 401/429 dans les routes IA :
 * Groq KO, modèle retiré, timeout, bug route, body JSON parse… Le détail
 * (route, modèle, statut HTTP, payload d'erreur Groq) est loggé côté
 * serveur sous le tag [ai-provider] mais JAMAIS exposé au client.
 * Le client reçoit uniquement { error: 'ai_unavailable' } en 502.
 */
export function buildProviderErrorResponse(ctx: {
  route: string
  model?: string
  status?: number
  detail?: unknown
}): Response {
  console.error('[ai-provider]', {
    route: ctx.route,
    model: ctx.model,
    status: ctx.status,
    detail: ctx.detail,
  })
  // Fire-and-forget : alerte email aux admins si panne durable
  // (model_not_found, decommissioned, auth, billing). Anti-spam 24 h
  // côté RPC. Après() → zéro impact sur la latence perçue par le trader.
  after(() => maybeAlertProviderFailure(ctx))
  return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 })
}

// ─── Record usage réel après retour fournisseur ─────────────────────────────

export interface RecordUsageInput {
  /** tokens prompt (input) renvoyés par data.usage.prompt_tokens Groq */
  tokensIn?: number
  /** tokens completion (output) renvoyés par data.usage.completion_tokens Groq */
  tokensOut?: number
  /** modèle utilisé (clé de GROQ_PRICING_USD_PER_MTOK). Facultatif, fallback générique sinon. */
  model?: string
  /** secondes d'audio transcrites (Jarvis STT) */
  audioSeconds?: number
  /** caractères envoyés en TTS (Jarvis synthèse voix) */
  ttsChars?: number
  /** coût explicite si on connaît mieux que l'estimation (ex: provider non-Groq) */
  explicitCostUsd?: number
}

/** Estime le coût USD à partir des tokens + model + audio. */
function estimateCost(input: RecordUsageInput): number {
  if (typeof input.explicitCostUsd === 'number') return input.explicitCostUsd

  const tokIn = input.tokensIn ?? 0
  const tokOut = input.tokensOut ?? 0
  const pricing =
    (input.model && GROQ_PRICING_USD_PER_MTOK[input.model]) ||
    GROQ_PRICING_USD_PER_MTOK.__fallback__

  const tokenCost =
    (tokIn / 1_000_000) * pricing.input +
    (tokOut / 1_000_000) * pricing.output

  const audioCost =
    ((input.audioSeconds ?? 0) / 3600) * GROQ_WHISPER_USD_PER_HOUR

  return Number((tokenCost + audioCost).toFixed(6))
}

/**
 * À appeler APRÈS le retour fournisseur, idéalement via next/server after()
 * pour ne pas rallonger la réponse. Met à jour tokens_in/out, cost_usd,
 * audio_seconds, tts_chars sur la row (user, feature, today).
 *
 * Si mode=off → noop (zéro écriture, aucune pollution du suivi).
 */
export async function recordUsage(
  userId: string,
  feature: AiFeature,
  input: RecordUsageInput,
): Promise<void> {
  if (getQuotaMode() === 'off') return

  const cost = estimateCost(input)
  try {
    const supabase = serviceRoleClient()
    const { error } = await supabase.rpc('record_ai_tokens', {
      p_user_id: userId,
      p_feature: feature,
      p_tokens_in: input.tokensIn ?? 0,
      p_tokens_out: input.tokensOut ?? 0,
      p_cost_usd: cost,
      p_audio_seconds: input.audioSeconds ?? 0,
      p_tts_chars: input.ttsChars ?? 0,
    })
    if (error) {
      console.error('[ai-quota] recordUsage RPC error', { feature, userId, error })
    }
  } catch (err) {
    console.error('[ai-quota] recordUsage unexpected error', { feature, userId, err })
  }
}
