/**
 * Dictionnaire de prononciation Jarvis (étape 2C).
 *
 * Appliqué UNIQUEMENT au texte envoyé à ElevenLabs. Le texte affiché
 * à l'écran et sauvegardé dans l'historique garde l'orthographe
 * correcte — c'est seulement la façon dont la voix prononce les
 * mots qui change.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * COMMENT AJOUTER UN MOT
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   1. Teste la bonne orthographe phonétique directement dans
 *      elevenlabs.io avec la voix de Jarvis (ELEVENLABS_VOICE_ID)
 *      jusqu'à trouver l'écriture qui sonne juste.
 *   2. Ajoute une ligne au tableau PRONUNCIATION_DICT :
 *          ['motVisuel', 'prononciation'],
 *      - motVisuel     : ce qui est écrit dans la réponse du cerveau.
 *      - prononciation : ce qui est envoyé à ElevenLabs à la place.
 *   3. La règle est appliquée sur le MOT ENTIER, INSENSIBLE à la
 *      casse. "flux", "Flux", "FLUX" matchent tous. La ponctuation
 *      autour est conservée.
 *      "flu" ne matchera PAS dans "fluctuation" ni dans "influx"
 *      (pas de match partiel).
 *   4. Pas besoin de redéployer le code : juste commit + push.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const PRONUNCIATION_DICT: Array<readonly [string, string]> = [
  // [motVisuel, prononciation phonétique]
  ['flux',  'flu'],      // "fluxe" → "flu"
  ['CHoCH', 'choche'],   // épelé lettre par lettre → "choche"
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Transforme le texte "visuel" en texte "parlé" en appliquant le
 * dictionnaire. Mots entiers uniquement (frontière Unicode : pas
 * de match au milieu d'un autre mot, même avec accents).
 */
export function pronounceForVoice(text: string): string {
  let out = text
  for (const [visual, spoken] of PRONUNCIATION_DICT) {
    // (?<![\p{L}\p{N}_]) : pas précédé par une lettre, un chiffre
    //                      ou un underscore (frontière de mot
    //                      Unicode-aware, contrairement à \b).
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegex(visual)}(?![\\p{L}\\p{N}_])`,
      'giu',
    )
    out = out.replace(pattern, spoken)
  }
  return out
}
