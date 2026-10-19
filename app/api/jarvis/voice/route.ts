import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { prepareContext, runBrain, type ChatMessage } from '@/lib/jarvis/brain'
import { synthesizeSpeech } from '@/lib/jarvis/elevenlabs'

export const runtime = 'nodejs'

/**
 * Vocabulaire métier passé à Whisper — améliore la transcription
 * du jargon ATP qui serait sinon mal transcrit (OB, FVG, CHoCH…).
 */
const WHISPER_PROMPT = 'NQ, YM, Dow, Nasdaq, Order Block, OB, FVG, Fair Value Gap, Breaker, CHoCH, Fibo, Hammer, mode Joker, R, stop, TP, prop firm.'

const WHISPER_MODEL = 'whisper-large-v3-turbo'

interface WhisperResult {
  text: string
  ms: number
}

async function transcribeAudio(file: File, apiKey: string): Promise<WhisperResult | { error: string; status: number }> {
  const form = new FormData()
  form.append('file', file)
  form.append('model', WHISPER_MODEL)
  form.append('language', 'fr')
  form.append('prompt', WHISPER_PROMPT)
  form.append('response_format', 'json')
  form.append('temperature', '0')

  const t0 = performance.now()
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(8000),
  })
  const ms = Math.round(performance.now() - t0)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    return { error: body.slice(0, 200) || `HTTP ${r.status}`, status: r.status }
  }
  const data = await r.json() as { text?: string }
  return { text: (data.text || '').trim(), ms }
}

/** Encode une chaîne en base64url pour la glisser dans un header HTTP
 *  (les headers n'acceptent pas les non-ASCII tels quels). */
function b64url(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(request: Request) {
  const t_start = performance.now()
  const timings: Record<string, number> = {}
  try {
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth
    timings.auth = Math.round(performance.now() - t_start)

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/jarvis/voice', detail: 'GROQ_API_KEY missing' })

    const form = await request.formData()
    const audio = form.get('audio')
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'audio file manquant' }, { status: 400 })
    }
    const durationSec = Math.max(0, Number(form.get('durationSec') || 0))
    const historyRaw = (form.get('history') as string) || '[]'
    let history: ChatMessage[] = []
    try { history = JSON.parse(historyRaw) } catch { history = [] }
    if (!Array.isArray(history)) history = []

    // ─── Phase 1 : contexte + transcription + quota en parallèle ───
    // Le quota a besoin de isAdmin → on démarre ctx d'abord (cache
    // hit = instant), puis quota + transcription en parallèle.
    const t_ctxStart = performance.now()
    const ctx = await prepareContext(userId, email)
    timings.context = Math.round(performance.now() - t_ctxStart)

    const t_sttStart = performance.now()
    const [quota, whisper] = await Promise.all([
      checkAndCount(userId, 'jarvis', ctx.isAdmin),
      transcribeAudio(audio, apiKey),
    ])
    timings.quota = Math.round((performance.now() - t_sttStart))

    // Quota refusé → on jette la transcription (déjà payée) et on
    // renvoie 429. UN échange vocal = UN appel compté.
    if (!quota.allowed) return buildQuotaResponse(quota)

    if ('error' in whisper) {
      return buildProviderErrorResponse({
        route: '/api/jarvis/voice', model: WHISPER_MODEL,
        status: whisper.status, detail: whisper.error,
      })
    }
    timings.stt = whisper.ms
    const transcription = whisper.text
    if (!transcription) {
      return NextResponse.json({ error: 'transcription vide', timings }, { status: 422 })
    }

    // ─── Phase 2 : brain Groq avec contexte + historique + transcription ───
    const t_brainStart = performance.now()
    const messages: ChatMessage[] = [...history, { role: 'user', content: transcription }]
    const brainOutcome = await runBrain(ctx, messages, { format: 'voice', maxChars: 200 })
    if (!brainOutcome.ok) return brainOutcome.response
    timings.brain = Math.round(performance.now() - t_brainStart)

    // ─── Phase 3 : ElevenLabs TTS streaming ───
    const t_ttsStart = performance.now()
    const tts = await synthesizeSpeech(brainOutcome.reply)
    timings.tts = Math.round(performance.now() - t_ttsStart)

    // recordUsage via after() — jamais sur le chemin critique
    const usage = brainOutcome.usage
    const ttsChars = tts.ok ? tts.ttsChars : 0
    after(async () => {
      await recordUsage(userId, 'jarvis', {
        tokensIn: usage?.prompt_tokens ?? 0,
        tokensOut: usage?.completion_tokens ?? 0,
        model: GROQ_TEXT_MODEL,
        audioSeconds: durationSec,
        ttsChars,
      })
    })

    timings.total = Math.round(performance.now() - t_start)

    const metaHeaders: Record<string, string> = {
      'X-Jarvis-Transcription': b64url(transcription),
      'X-Jarvis-Reply': b64url(brainOutcome.reply),
      'X-Jarvis-Casquette': brainOutcome.casquette,
      'X-Jarvis-Timings': b64url(JSON.stringify(timings)),
      'X-Jarvis-CallsToday': String(quota.callsToday),
      'X-Jarvis-CallsLimit': String(quota.callsLimit),
      'X-Jarvis-CacheHits': ctx.cacheHits.join(',') || '',
      // CORS pour que la page puisse lire les headers X-Jarvis-*
      'Access-Control-Expose-Headers': 'X-Jarvis-Transcription, X-Jarvis-Reply, X-Jarvis-Casquette, X-Jarvis-Timings, X-Jarvis-CallsToday, X-Jarvis-CallsLimit, X-Jarvis-CacheHits, X-Jarvis-AudioFailed',
    }

    // Fallback : si TTS KO, on retourne quand même la réponse texte
    // en JSON — Jarvis ne reste jamais muet ET vide.
    if (!tts.ok) {
      console.error('[jarvis] TTS failed, returning text-only', { status: tts.status, reason: tts.reason })
      return NextResponse.json({
        reply: brainOutcome.reply,
        transcription,
        casquette: brainOutcome.casquette,
        callsToday: quota.callsToday,
        callsLimit: quota.callsLimit,
        timings,
        cacheHits: ctx.cacheHits,
        audioFailed: true,
      }, { status: 200 })
    }

    return new Response(tts.stream, {
      headers: {
        ...metaHeaders,
        'Content-Type': 'audio/mpeg',
        'X-Jarvis-AudioFailed': 'false',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/jarvis/voice', detail: err })
  }
}
