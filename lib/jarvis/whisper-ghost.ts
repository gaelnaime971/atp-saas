/**
 * Jarvis — Filtre anti-fantômes Whisper.
 *
 * Whisper (y compris whisper-large-v3-turbo) hallucine systématiquement
 * sur le silence : il recrache les génériques de sous-titres sur
 * lesquels il a été entraîné ("Sous-titres réalisés par la communauté
 * d'Amara.org", "Réalisé par Neo035", "Merci d'avoir regardé cette
 * vidéo", "Abonnez-vous"…). Trois signaux concourent au rejet :
 *
 *  1. L'enregistrement est trop court (< 1 s) → ignore.
 *  2. Whisper lui-même doute (`no_speech_prob` élevé via verbose_json).
 *  3. Le texte matche un fantôme connu, SEUL dans la transcription.
 *
 * Les 3 fonctions sont pures (zéro I/O) et testées isolément.
 */

/** Seuil durée. Un "ok" humain dure déjà 400-700 ms selon le micro,
 *  donc on reste prudent (< 1 s, strict). */
export const MIN_SPEECH_SEC = 1.0

/** Seuil no_speech_prob — au-delà, Whisper lui-même dit "sans parole".
 *  Mesuré empiriquement sur les faux positifs prod : 0.6 écarte les
 *  fantômes sans toucher les phrases courtes mais réelles. */
export const NO_SPEECH_PROB_THRESHOLD = 0.6

/**
 * Patterns de fantômes connus. Chacun doit matcher une transcription
 * ENTIÈRE (après normalisation) pour déclencher. Un fantôme NOYÉ dans
 * un vrai message légitime n'est pas filtré — on perdrait du signal.
 */
const GHOST_PATTERNS: ReadonlyArray<RegExp> = [
  // Amara / sous-titres communautaires
  /^sous[- ]titres?\s+(?:réalis[eé]s?\s+)?par\s+.{0,80}$/i,
  /^sous[- ]titres?.{0,10}:?\s+.{0,80}amara(?:\.org)?.*$/i,
  /^amara(?:\.org)?.{0,40}$/i,
  // "Réalisé par Neo035" & variantes
  /^r[eé]alis[eé][es]?\s+par\s+.{0,60}$/i,
  // Appels à l'engagement
  /^merci\s+(?:beaucoup\s+)?(?:d['’]avoir\s+regard[eé]|pour\s+le\s+visionnage|à\s+(?:toi|vous)).{0,60}$/i,
  /^(?:n['’]oublie[zs]?\s+pas\s+(?:de\s+)?|pens[eé]e?z?\s+à\s+)?(?:[mstvl]['’]|vous\s+|à\s+)?abonne[zr]+(?:[- ]vous)?.{0,40}$/i,
  // Fillers purs
  /^merci\s*\.?\s*$/i,
  /^\.{3,}$/,
  /^[\s.…]*$/,
  /^(?:sous[- ]titres?|subtitles?)\s*[:.]?\s*$/i,
  // YouTube end-screens traduits
  /^à\s+(?:la\s+)?prochaine\s*!?\s*$/i,
]

export function normalizeTranscription(input: string): string {
  return (input || '')
    .trim()
    .replace(/[​-‍﻿]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
}

/** Vrai si la transcription est un fantôme Whisper connu, pris SEUL. */
export function isGhostTranscription(text: string): boolean {
  const t = normalizeTranscription(text)
  if (!t) return true
  // Un fantôme est jugé "seul" si la phrase totale ≤ 90 chars (les
  // vrais messages sont généralement plus courts OU plus longs ; les
  // fantômes font 20-80 chars pile).
  if (t.length > 120) return false
  for (const re of GHOST_PATTERNS) {
    if (re.test(t)) return true
  }
  return false
}

/** Vrai si l'audio est manifestement sans parole : trop court OU
 *  Whisper dit "no_speech_prob" élevé. */
export function isLikelyEmptyAudio(input: {
  durationSec?: number | null
  noSpeechProb?: number | null
}): boolean {
  const d = input.durationSec
  if (typeof d === 'number' && Number.isFinite(d) && d > 0 && d < MIN_SPEECH_SEC) return true
  const p = input.noSpeechProb
  if (typeof p === 'number' && Number.isFinite(p) && p >= NO_SPEECH_PROB_THRESHOLD) return true
  return false
}

/** Décision complète. Combine les 3 signaux. Retourne une raison
 *  lisible pour l'observabilité (jamais exposée au trader). */
export function classifyWhisperOutput(input: {
  text: string
  durationSec?: number | null
  noSpeechProb?: number | null
}): { kind: 'speech'; text: string } | { kind: 'empty'; reason: string } {
  const t = normalizeTranscription(input.text)
  if (!t) return { kind: 'empty', reason: 'transcription-vide' }
  if (isLikelyEmptyAudio({ durationSec: input.durationSec, noSpeechProb: input.noSpeechProb })) {
    const reason = (typeof input.durationSec === 'number' && input.durationSec < MIN_SPEECH_SEC)
      ? 'audio-trop-court' : 'no-speech-prob'
    return { kind: 'empty', reason }
  }
  if (isGhostTranscription(t)) return { kind: 'empty', reason: 'fantôme-whisper' }
  return { kind: 'speech', text: t }
}
