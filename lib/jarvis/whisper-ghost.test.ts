import { describe, it, expect } from 'vitest'
import {
  isGhostTranscription,
  isLikelyEmptyAudio,
  classifyWhisperOutput,
  normalizeTranscription,
  MIN_SPEECH_SEC,
  NO_SPEECH_PROB_THRESHOLD,
} from './whisper-ghost'

describe('isGhostTranscription — fantômes Whisper connus (rejetés)', () => {
  it('"Sous-titres réalisés par la communauté d\'Amara.org"', () => {
    expect(isGhostTranscription('Sous-titres réalisés par la communauté d\'Amara.org')).toBe(true)
  })
  it('"Sous-titres réalisés par Amara.org"', () => {
    expect(isGhostTranscription('Sous-titres réalisés par Amara.org')).toBe(true)
  })
  it('"Réalisé par Neo035" (cas prod)', () => {
    expect(isGhostTranscription('Réalisé par Neo035')).toBe(true)
  })
  it('"Realise par Neo035" (sans accents)', () => {
    expect(isGhostTranscription('Realise par Neo035')).toBe(true)
  })
  it('"Merci d\'avoir regardé cette vidéo"', () => {
    expect(isGhostTranscription("Merci d'avoir regardé cette vidéo")).toBe(true)
  })
  it('"Merci à vous"', () => {
    expect(isGhostTranscription('Merci à vous')).toBe(true)
  })
  it('"Abonnez-vous"', () => {
    expect(isGhostTranscription('Abonnez-vous')).toBe(true)
  })
  it('"N\'oublie pas de t\'abonner"', () => {
    expect(isGhostTranscription("N'oublie pas de t'abonner")).toBe(true)
  })
  it('"Merci."', () => {
    expect(isGhostTranscription('Merci.')).toBe(true)
  })
  it('"Merci"', () => {
    expect(isGhostTranscription('Merci')).toBe(true)
  })
  it('"..." / "…"', () => {
    expect(isGhostTranscription('...')).toBe(true)
    expect(isGhostTranscription('…')).toBe(true)
  })
  it('"Amara.org"', () => {
    expect(isGhostTranscription('Amara.org')).toBe(true)
  })
  it('"À la prochaine !"', () => {
    expect(isGhostTranscription('À la prochaine !')).toBe(true)
  })
})

describe('isGhostTranscription — vraies phrases courtes (PASSENT)', () => {
  it('"ok" → pas un fantôme', () => {
    expect(isGhostTranscription('ok')).toBe(false)
  })
  it('"+1R" / "plus 1 R" → pas un fantôme', () => {
    expect(isGhostTranscription('+1R')).toBe(false)
    expect(isGhostTranscription('plus 1 R')).toBe(false)
  })
  it('"stop" → pas un fantôme', () => {
    expect(isGhostTranscription('stop')).toBe(false)
  })
  it('"stoppé" → pas un fantôme', () => {
    expect(isGhostTranscription('stoppé')).toBe(false)
  })
  it('"CHoCH M1 validé" → pas un fantôme', () => {
    expect(isGhostTranscription('CHoCH M1 validé')).toBe(false)
  })
  it('"on arrive sur mon support" → pas un fantôme', () => {
    expect(isGhostTranscription('on arrive sur mon support')).toBe(false)
  })
  it('phrase longue qui contient par hasard "merci" → PASSE', () => {
    expect(isGhostTranscription("Merci de me rappeler mon ratio pour aujourd'hui, j'ai perdu 1R.")).toBe(false)
  })
  it('"je viens de me faire stopper, merci" → PASSE', () => {
    expect(isGhostTranscription('Je viens de me faire stopper, merci')).toBe(false)
  })
})

describe('isLikelyEmptyAudio — signal durée + no_speech_prob', () => {
  it(`durée < ${MIN_SPEECH_SEC}s → vide`, () => {
    expect(isLikelyEmptyAudio({ durationSec: 0.3 })).toBe(true)
    expect(isLikelyEmptyAudio({ durationSec: 0.99 })).toBe(true)
  })
  it(`durée ≥ ${MIN_SPEECH_SEC}s → pas vide (sans autre signal)`, () => {
    expect(isLikelyEmptyAudio({ durationSec: 1.0 })).toBe(false)
    expect(isLikelyEmptyAudio({ durationSec: 2.5 })).toBe(false)
  })
  it(`no_speech_prob ≥ ${NO_SPEECH_PROB_THRESHOLD} → vide`, () => {
    expect(isLikelyEmptyAudio({ noSpeechProb: 0.7 })).toBe(true)
    expect(isLikelyEmptyAudio({ noSpeechProb: 0.95 })).toBe(true)
  })
  it(`no_speech_prob < ${NO_SPEECH_PROB_THRESHOLD} → pas vide`, () => {
    expect(isLikelyEmptyAudio({ noSpeechProb: 0.2 })).toBe(false)
    expect(isLikelyEmptyAudio({ noSpeechProb: 0.59 })).toBe(false)
  })
  it('aucune donnée → pas vide (on ne peut pas affirmer)', () => {
    expect(isLikelyEmptyAudio({})).toBe(false)
  })
  it('valeurs NaN / infinies → ignorées', () => {
    expect(isLikelyEmptyAudio({ durationSec: NaN, noSpeechProb: NaN })).toBe(false)
    expect(isLikelyEmptyAudio({ noSpeechProb: Infinity })).toBe(false)
  })
})

describe('classifyWhisperOutput — décision complète', () => {
  it('texte vrai + bons signaux → speech', () => {
    const r = classifyWhisperOutput({ text: 'je prends un trade sur le NQ', durationSec: 3, noSpeechProb: 0.05 })
    expect(r.kind).toBe('speech')
    if (r.kind === 'speech') expect(r.text).toBe('je prends un trade sur le NQ')
  })
  it('fantôme sur silence → empty, raison fantôme', () => {
    const r = classifyWhisperOutput({ text: 'Réalisé par Neo035', durationSec: 3, noSpeechProb: 0.9 })
    expect(r.kind).toBe('empty')
  })
  it('durée courte prioritaire sur texte valide', () => {
    const r = classifyWhisperOutput({ text: 'ok', durationSec: 0.4, noSpeechProb: 0.05 })
    expect(r.kind).toBe('empty')
    if (r.kind === 'empty') expect(r.reason).toBe('audio-trop-court')
  })
  it('"ok" vraie 1,2 s avec no_speech_prob bas → speech', () => {
    const r = classifyWhisperOutput({ text: 'ok', durationSec: 1.2, noSpeechProb: 0.1 })
    expect(r.kind).toBe('speech')
  })
  it('transcription vide → empty', () => {
    const r = classifyWhisperOutput({ text: '', durationSec: 2, noSpeechProb: 0 })
    expect(r.kind).toBe('empty')
  })
})

describe('normalizeTranscription — nettoyage', () => {
  it('trim + collapse espaces + apostrophes typo', () => {
    expect(normalizeTranscription('  bonjour   test  ')).toBe('bonjour test')
    expect(normalizeTranscription("c’est ça")).toBe("c'est ça")
  })
  it('zero-width chars retirés', () => {
    expect(normalizeTranscription('ok​')).toBe('ok')
  })
})
