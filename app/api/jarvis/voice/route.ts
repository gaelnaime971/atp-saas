import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import {
  checkAndCount,
  recordUsage,
  buildQuotaResponse,
  buildProviderErrorResponse,
} from '@/lib/ai/quota'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import {
  prepareContext, runBrain, detectDetailRequested,
  snapshotSession, buildSessionDirective,
  type ChatMessage, type SessionEventRow,
} from '@/lib/jarvis/brain'
import { detectTradeEvent } from '@/lib/jarvis/event-detection'
import { insertTrade, insertRuleTriggered } from '@/lib/jarvis/session-write'
import { synthesizeSpeech } from '@/lib/jarvis/elevenlabs'
import { pronounceForVoice } from '@/lib/jarvis/pronunciation'
import { numbersToWords } from '@/lib/jarvis/voice-numbers'

export const runtime = 'nodejs'

/**
 * Prompt Whisper — phrase naturelle contenant le jargon ATP.
 * Whisper se sert mieux d'un contexte phrastique que d'une liste
 * sèche de mots pour disambiguer "order block" vs "ender bloc" ou
 * "CHoCH" vs "cho-cho". Doit tenir en 244 tokens max côté Whisper.
 */
const WHISPER_PROMPT = `Sur le NQ, le flux est baissier, j'attends mon CHoCH M1 puis M5, retracement sur l'order block ou le FVG, avec un hammer. Mode Joker si le flux est contre moi. Ratio minimum 2 R sur le TP pessimiste, stop financé en hybride.`

const WHISPER_MODEL = 'whisper-large-v3-turbo'

interface WhisperResult {
  text: string
  ms: number
  attempts: number
}

async function transcribeAudio(file: File, apiKey: string): Promise<WhisperResult | { error: string; status: number }> {
  const makeAttempt = async (): Promise<Response> => {
    const form = new FormData()
    form.append('file', file)
    form.append('model', WHISPER_MODEL)
    form.append('language', 'fr')
    form.append('prompt', WHISPER_PROMPT)
    form.append('response_format', 'json')
    form.append('temperature', '0')
    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(5000),
    })
  }

  const t0 = performance.now()
  let r: Response
  let attempts = 1
  try {
    r = await makeAttempt()
  } catch (err) {
    attempts = 2
    await new Promise(res => setTimeout(res, 300))
    try { r = await makeAttempt() } catch {
      return { error: err instanceof Error ? err.message : 'network/timeout', status: 0 }
    }
  }
  if (!r.ok && (r.status === 429 || r.status >= 500)) {
    attempts = 2
    await new Promise(res => setTimeout(res, 300))
    try { r = await makeAttempt() } catch { /* fallthrough */ }
  }

  const ms = Math.round(performance.now() - t0)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    return { error: body.slice(0, 200) || `HTTP ${r.status}`, status: r.status }
  }
  const data = await r.json() as { text?: string }
  return { text: (data.text || '').trim(), ms, attempts }
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
  const retries: Record<string, number> = {}
  try {
    const t_authStart = performance.now()
    const auth = await requireJarvisAccessFast()
    if (auth instanceof Response) return auth
    const { userId, email } = auth
    timings.auth = Math.round(performance.now() - t_authStart)

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/jarvis/voice', detail: 'GROQ_API_KEY missing' })

    const t_formStart = performance.now()
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
    timings.form = Math.round(performance.now() - t_formStart)

    // ─── Phase 1 : contexte (cache 5 min) ───
    const t_ctxStart = performance.now()
    const ctx = await prepareContext(userId, email)
    timings.context = Math.round(performance.now() - t_ctxStart)

    // ─── Phase 2 : quota lancé en parallèle de TOUT le chemin critique ───
    // On n'attend sa réponse qu'avant la synthèse vocale (étape coûteuse).
    // Si refus : on jette transcription + brain (déjà payés) et on
    // renvoie 429 avant d'appeler ElevenLabs. En contrepartie d'une
    // latence très inférieure quand le quota passe.
    const quotaStart = performance.now()
    const quotaPromise = checkAndCount(userId, 'jarvis', ctx.isAdmin)
      .then(q => { timings.quota = Math.round(performance.now() - quotaStart); return q })

    // ─── Phase 3 : transcription Whisper ───
    const t_sttStart = performance.now()
    const whisper = await transcribeAudio(audio, apiKey)
    timings.stt = Math.round(performance.now() - t_sttStart)
    if ('attempts' in whisper) retries.whisper = whisper.attempts

    if ('error' in whisper) {
      // on a quand même déclenché le quota — laisser filer en background
      quotaPromise.catch(() => {})
      console.error('[jarvis-voice-perf]', { userId, event: 'whisper_error', status: whisper.status, timings, retries })
      return buildProviderErrorResponse({
        route: '/api/jarvis/voice', model: WHISPER_MODEL,
        status: whisper.status, detail: whisper.error,
      })
    }
    const transcription = whisper.text
    if (!transcription) {
      quotaPromise.catch(() => {})
      console.warn('[jarvis-voice-perf]', { userId, event: 'empty_transcription', timings, retries })
      return NextResponse.json({ error: 'transcription vide', timings }, { status: 422 })
    }

    // ─── Phase 3.5 : détection event déterministe (AVANT cerveau) ───
    //
    // Le cerveau NE crée JAMAIS un trade. Si on détecte un trade, on
    // l'insère tout de suite → le snapshot inclut le nouveau trade →
    // les règles sont évaluées sur l'état POST-trade → le prompt
    // force l'annonce mot-pour-mot.
    const detection = detectTradeEvent(transcription)
    let notedEvent: SessionEventRow | null = null
    if (detection.kind === 'trade') {
      try {
        notedEvent = await insertTrade(userId, detection.trade)
        ctx.events.push(notedEvent)
      } catch (err) {
        console.error('[jarvis-voice] insertTrade failed, continuing without noting', err)
      }
    }

    const snapshot = snapshotSession(ctx.events, ctx.rules)

    // Risque demandé déjà aujourd'hui ? (approximation : l'historique
    // contient-il une question "risque par trade" posée par Jarvis ?)
    const riskAlreadyAsked = history.some(m =>
      m.role === 'assistant' && /risque\s+par\s+trade/i.test(m.content))
    const tradeUsdOnly = detection.kind === 'trade'
      && detection.trade.result_r == null
      && detection.trade.result_usd != null

    const directive = buildSessionDirective(
      detection.kind, snapshot, ctx.rules, tradeUsdOnly, riskAlreadyAsked,
    )

    // Enregistre les rule_triggered via after() (anti-répétition)
    if (directive.triggered.length > 0) {
      after(async () => {
        for (const t of directive.triggered) {
          try { await insertRuleTriggered(userId, t.key, t.config) } catch (err) {
            console.error('[jarvis-voice] insertRuleTriggered failed', { key: t.key, err })
          }
        }
      })
    }

    // ─── Phase 4 : cerveau Groq ───
    const t_brainStart = performance.now()
    const messages: ChatMessage[] = [...history, { role: 'user', content: transcription }]
    const detailRequested = detectDetailRequested(transcription)
    const brainOutcome = await runBrain(ctx, messages, {
      format: 'voice',
      casquette: ctx.casquette.casquette,
      detailRequested,
      extraSystem: directive.systemAddendum || undefined,
    })
    timings.brain = Math.round(performance.now() - t_brainStart)
    if (!brainOutcome.ok) {
      quotaPromise.catch(() => {})
      console.error('[jarvis-voice-perf]', { userId, event: 'brain_error', timings, retries })
      return brainOutcome.response
    }
    retries.brain = brainOutcome.attempts

    // ─── Barrière quota AVANT TTS (étape coûteuse). Si refus → jeté. ───
    const quota = await quotaPromise
    if (!quota.allowed) {
      console.warn('[jarvis-voice-perf]', { userId, event: 'quota_refused_pre_tts', timings, retries })
      return buildQuotaResponse(quota)
    }

    // ─── Phase 5 : ElevenLabs TTS streaming ───
    // Pipeline texte visuel → texte parlé :
    //   1. numbersToWords : "0,2 à 0,4 %" → "zéro virgule deux à
    //      zéro virgule quatre pour cent", "+2 R" → "plus deux R",
    //      "900 $" → "neuf cents dollars".
    //   2. pronounceForVoice : "flux" → "flu", "CHoCH" → "choche".
    // Les headers X-Jarvis-Reply et l'affichage conservent le texte
    // original avec chiffres et symboles.
    const spokenText = pronounceForVoice(numbersToWords(brainOutcome.reply))
    const t_ttsStart = performance.now()
    const tts = await synthesizeSpeech(spokenText)
    timings.tts = Math.round(performance.now() - t_ttsStart)
    if (tts.ok) retries.tts = tts.attempts

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
    console.log('[jarvis-voice-perf]', {
      userId, event: tts.ok ? 'ok' : 'tts_failed',
      durationSec, callsToday: quota.callsToday,
      replyLen: brainOutcome.reply.length,
      ttfbMs: tts.ok ? tts.ttfbMs : null,
      timings, retries,
    })

    const sessionPayload = {
      state: {
        tradesCount: snapshot.state.tradesCount,
        rSum: snapshot.state.rSum,
        usdSum: snapshot.state.usdSum,
      },
      notedEvent,
      triggered: directive.triggered.map(t => ({ key: t.key, message: t.message, config: t.config })),
      detection: detection.kind,
    }
    const metaHeaders: Record<string, string> = {
      'X-Jarvis-Transcription': b64url(transcription),
      'X-Jarvis-Reply': b64url(brainOutcome.reply),
      'X-Jarvis-Casquette': brainOutcome.casquette,
      'X-Jarvis-Timings': b64url(JSON.stringify(timings)),
      'X-Jarvis-Retries': b64url(JSON.stringify(retries)),
      'X-Jarvis-Session': b64url(JSON.stringify(sessionPayload)),
      'X-Jarvis-CallsToday': String(quota.callsToday),
      'X-Jarvis-CallsLimit': String(quota.callsLimit),
      'X-Jarvis-CacheHits': ctx.cacheHits.join(',') || '',
      'Access-Control-Expose-Headers': 'X-Jarvis-Transcription, X-Jarvis-Reply, X-Jarvis-Casquette, X-Jarvis-Timings, X-Jarvis-Retries, X-Jarvis-Session, X-Jarvis-CallsToday, X-Jarvis-CallsLimit, X-Jarvis-CacheHits, X-Jarvis-AudioFailed',
    }

    if (!tts.ok) {
      console.error('[jarvis] TTS failed, returning text-only', { status: tts.status, reason: tts.reason })
      return NextResponse.json({
        reply: brainOutcome.reply,
        transcription,
        casquette: brainOutcome.casquette,
        callsToday: quota.callsToday,
        callsLimit: quota.callsLimit,
        timings,
        retries,
        cacheHits: ctx.cacheHits,
        session: sessionPayload,
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
    console.error('[jarvis-voice-perf]', { event: 'fatal', timings, retries, err })
    return buildProviderErrorResponse({ route: '/api/jarvis/voice', detail: err })
  }
}
