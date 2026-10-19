/**
 * Helper ElevenLabs TTS pour Jarvis (étape 2B).
 *
 * - Endpoint streaming (eleven_flash_v2_5) : premier chunk audio
 *   dès que le modèle a généré assez pour le pipeline MP3.
 * - Timeout ferme : 6 s par essai, 1 retry rapide sur 429/5xx.
 * - Alerte email admin si auth refusée ou crédits épuisés — via
 *   la même table anti-spam ai_provider_alerts (24 h par kind+model)
 *   et le même helper notifyAdmin que pour Groq.
 */

import { createClient } from '@supabase/supabase-js'
import { notifyAdmin } from '@/lib/email/notify-admin'

export const ELEVENLABS_MODEL = 'eleven_flash_v2_5'

export type ElevenLabsAlertKind =
  | 'elevenlabs_invalid_api_key'
  | 'elevenlabs_insufficient_quota'

export interface ElevenLabsSuccess {
  ok: true
  stream: ReadableStream<Uint8Array>
  ttfbMs: number        // temps jusqu'au 1er octet du corps HTTP
  ttsChars: number
  attempts: number
}

export interface ElevenLabsFailure {
  ok: false
  status: number
  reason: string        // texte court pour log — jamais exposé au client
}

export async function synthesizeSpeech(text: string): Promise<ElevenLabsSuccess | ElevenLabsFailure> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!apiKey) {
    console.error('[elevenlabs] ELEVENLABS_API_KEY missing')
    return { ok: false, status: 0, reason: 'ELEVENLABS_API_KEY missing' }
  }
  if (!voiceId) {
    console.error('[elevenlabs] ELEVENLABS_VOICE_ID missing')
    return { ok: false, status: 0, reason: 'ELEVENLABS_VOICE_ID missing' }
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`
  const payload = {
    text,
    model_id: ELEVENLABS_MODEL,
    output_format: 'mp3_44100_128',
  }

  const t0 = performance.now()
  const makeAttempt = () => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6000),
  })

  let r: Response
  let attempts = 1
  try {
    r = await makeAttempt()
  } catch (err) {
    attempts = 2
    await new Promise(res => setTimeout(res, 300))
    try { r = await makeAttempt() } catch {
      return { ok: false, status: 0, reason: err instanceof Error ? err.message : 'network/timeout' }
    }
  }

  if (!r.ok) {
    // Alerte durable (fire-and-forget — l'appelant appellera via after)
    const bodyText = await r.text().catch(() => '')
    const kind = classifyElevenLabsFailure(r.status, bodyText)
    if (kind) {
      await maybeAlertElevenLabsFailure(kind, r.status, bodyText)
    } else if (r.status === 429 || r.status >= 500) {
      // Transitoire : 1 retry rapide
      await new Promise(res => setTimeout(res, 300))
      attempts = 2
      try {
        const r2 = await makeAttempt()
        if (r2.ok && r2.body) {
          return { ok: true, stream: r2.body, ttfbMs: Math.round(performance.now() - t0), ttsChars: text.length, attempts }
        }
      } catch { /* fallthrough */ }
    }
    return { ok: false, status: r.status, reason: bodyText.slice(0, 200) || `HTTP ${r.status}` }
  }

  if (!r.body) {
    return { ok: false, status: r.status, reason: 'empty body' }
  }

  return {
    ok: true,
    stream: r.body,
    ttfbMs: Math.round(performance.now() - t0),
    ttsChars: text.length,
    attempts,
  }
}

function classifyElevenLabsFailure(status: number, bodyText: string): ElevenLabsAlertKind | null {
  if (status === 401 || /invalid.*api[-_ ]?key|unauthoriz/i.test(bodyText)) {
    return 'elevenlabs_invalid_api_key'
  }
  if (status === 402 ||
      /quota.*exceeded|credit.*exhausted|out\s+of\s+credit|insufficient\s+credit/i.test(bodyText)) {
    return 'elevenlabs_insufficient_quota'
  }
  return null
}

async function maybeAlertElevenLabsFailure(
  kind: ElevenLabsAlertKind,
  status: number,
  bodyText: string,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase.rpc('maybe_send_ai_alert', {
      p_kind: kind,
      p_model: ELEVENLABS_MODEL,
      p_window_hours: 24,
    })
    if (error || data !== true) return // anti-spam ou RPC KO
  } catch { return }

  const label = kind === 'elevenlabs_invalid_api_key'
    ? 'Clé API ElevenLabs refusée'
    : 'Crédits ElevenLabs épuisés'

  const dateStr = new Date().toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short',
  })
  const subject = `[ATP Jarvis] Panne ElevenLabs — ${label}`

  const html = `
<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:640px;margin:0 auto;padding:16px">
  <h2 style="color:#dc2626;margin:0 0 16px;font-size:18px">⚠ Panne durable ElevenLabs — ${esc(label)}</h2>
  <p>Jarvis continue de répondre en texte (fallback automatique), mais la voix est coupée tant que le problème n'est pas corrigé.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:6px 0;color:#6b7280;width:160px">Modèle</td><td style="padding:6px 0"><code>${ELEVENLABS_MODEL}</code></td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Status HTTP</td><td style="padding:6px 0">${status}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Détail</td><td style="padding:6px 0;font-size:12px">${esc(bodyText.slice(0, 400))}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280">Date (Paris)</td><td style="padding:6px 0">${esc(dateStr)}</td></tr>
  </table>
  <h3 style="font-size:14px;margin:20px 0 8px">Que faire</h3>
  <ol style="margin:0;padding-left:20px">
    <li>Vérifier le dashboard : <a href="https://elevenlabs.io/app/subscription">elevenlabs.io/app/subscription</a></li>
    <li>Si clé refusée : regénérer <code>ELEVENLABS_API_KEY</code> dans Vercel</li>
    <li>Si crédits : passer au plan supérieur ou recharger</li>
  </ol>
  <p style="margin-top:20px;font-size:12px;color:#6b7280">Anti-spam : 1 email max par (type, modèle) sur 24 h.</p>
</div>`.trim()

  const text = `${label}\n\nStatus HTTP: ${status}\nDétail: ${bodyText.slice(0, 400)}\nDate: ${dateStr}\n\nAction: https://elevenlabs.io/app/subscription`

  await notifyAdmin({ subject, html, text })
}

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  }[c] || c))
}
