/**
 * Lecteur déterministe du message trader (ou de la transcription
 * Whisper) — étape 3F.4.
 *
 * ⚠ Le cerveau ne crée JAMAIS un trade. Seul CE code en crée, à
 * partir de ce que dit le trader. Si le texte est flou, on retourne
 * { kind: 'ambiguous' } et Jarvis demande en langage naturel.
 *
 * PRUDENCE MAXIMALE :
 *   - Une intention, un objectif, une hypothèse, une question, un
 *     paramétrage de risque ne sont PAS des trades → { kind: 'none' }.
 *   - Les constructions au futur ("je vais prendre", "demain",
 *     "si je", "aujourd'hui je vise") n'extraient rien.
 *   - "TP touché" seul = ambigu ; "TP touché à 2R" = trade.
 */

export type Side = 'long' | 'short'

export interface DetectedTrade {
  result_r: number | null
  result_usd: number | null
  instrument?: string
  side?: Side
  config?: string | null
  pending: false
}

export type DetectionResult =
  | { kind: 'trade'; trade: DetectedTrade }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

// ─── Normalisation ──────────────────────────────────────────────────
function normalize(input: string): string {
  // Minuscules, apostrophes typographiques → simples, espaces insécables → espaces.
  return input.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
}

// ─── Instruments ────────────────────────────────────────────────────
const INSTRUMENTS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(nq|nasdaq|nasdac)\b/i,   code: 'NQ' },
  { pattern: /\b(es|s&?p ?500|sp500|s&?p)\b/i, code: 'ES' },
  { pattern: /\b(ym|dow( jones)?)\b/i,     code: 'YM' },
  { pattern: /\b(gc|gold|or)\b/i,          code: 'GC' },
  { pattern: /\b(cl|petrole|pétrole|crude|oil)\b/i, code: 'CL' },
  { pattern: /\b(rty|russell|russel)\b/i,  code: 'RTY' },
  { pattern: /\b(btc|bitcoin)\b/i,         code: 'BTC' },
]
function detectInstrument(t: string): string | undefined {
  for (const { pattern, code } of INSTRUMENTS) if (pattern.test(t)) return code
  return undefined
}

// ─── Sens (long / short) ────────────────────────────────────────────
function detectSide(t: string): Side | undefined {
  if (/\b(short|vendeur|vente|sell|baiss(e|ier))\b/.test(t)) return 'short'
  if (/\b(long|achat|achète|buy|hauss(e|ier))\b/.test(t))   return 'long'
  return undefined
}

// ─── Nombre + mot (R / $ / dollars) ─────────────────────────────────
// Capture : signe, entier, séparateur décimal, décimale.
// Accepte "+1R", "+1 R", "plus 1 r", "-0,5R", "moins 0.5 r", "2R",
// "1,5R", etc.
// Détection d'un signal "négatif" PRÉSENT dans le texte sans qu'il
// soit déjà rattaché à la valeur chiffrée. Si trouvé → on refuse de
// retourner un trade positif par défaut (règle de sécurité).
function hasUnpairedNegativeSignal(t: string): boolean {
  return /(?<![\p{L}])(moins|négatif|negatif|perdu|perte|loss)(?![\p{L}])/iu.test(t)
}

function toNumber(signChar: string | undefined, body: string): number {
  const n = Number(body.replace(',', '.'))
  return signChar === '-' ? -n : n
}

/** Classe de signe : accepte +, -, et − (U+2212 "minus sign"). */
const SIGN_CHAR_CLASS = '[+\\-\\u2212]'

// ─── Signaux "futurs/intentions" qui excluent toute extraction ──────
function hasIntentionSignal(t: string): boolean {
  // Futurs, conditionnels, questions, projections, paramètres
  // ("je vise", "objectif", "aujourd'hui je", "demain", "si je",
  // "je vais", "je compte", "je risque", "c'est quoi", "quel est",
  // "? "). On veut filtrer AVANT toute extraction chiffrée.
  return (
    /\bje vise\b/.test(t) ||
    /\bobjectif\b/.test(t) ||
    /\bdemain\b/.test(t) ||
    /\baujourd'?hui je\b/.test(t) && !/\baujourd'?hui je (viens|me suis|ai (pris|perdu|gagné|coupé)|suis sorti)/.test(t) ||
    /\bsi je\b/.test(t) ||
    /\bje vais\b/.test(t) ||
    /\bje compte\b/.test(t) ||
    /\bje risque\b/.test(t) ||
    /\bc'est quoi\b/.test(t) ||
    /\bquel est\b/.test(t) ||
    /\bratio minimum\b/.test(t) ||
    /\?$/.test(t.trim())
  )
}

// ─── Patterns de résultat chiffré ───────────────────────────────────

/** Trade chiffré en R : "+2R", "-0,5R", "−1R" (minus unicode),
 *  "plus 2 r", "moins 1,5 R", "Moins 1 R.", "moins un R" (texte). */
function parseRResult(t: string): { value: number } | null {
  // 1) Mots de signe + chiffre : "moins 1 R", "plus 0,5 R", "MOINS 2 R"
  //    Insensible à la casse. Capture AVANT les patterns suivants pour
  //    éviter que "1 R" sans signe gagne quand "moins" est devant.
  const mWordDigit = t.match(/(?<![\p{L}])(plus|moins)\s+(\d+(?:[,.]\d+)?)\s*r(?![\p{L}])/iu)
  if (mWordDigit) {
    const sign = mWordDigit[1].toLowerCase() === 'moins' ? '-' : '+'
    return { value: toNumber(sign, mWordDigit[2]) }
  }

  // 2) Forme numérique "+/-/−N R" ou "N R" (signe optionnel, espace OK)
  const mNum = t.match(new RegExp(
    `(?<![\\p{L}0-9])(${SIGN_CHAR_CLASS})?\\s*(\\d+(?:[,.]\\d+)?)\\s*r(?![\\p{L}])`, 'iu'))
  if (mNum) {
    const rawSign = mNum[1]
    const body = mNum[2]
    const before = t.slice(0, mNum.index ?? 0)
    // Exclure si précédé immédiatement de "ratio" / "risque" / "stop-loss"
    //  → "ratio 2 R" n'est pas un trade.
    if (/(?<![\p{L}])(ratio|ratios|r\.r|risk reward|risque|stop[- ]?loss|sl|tp)(?![\p{L}])[^.?!]{0,15}$/iu.test(before) && !rawSign) {
      return null
    }
    // Normalise le signe (- ou − → "-")
    const sign = rawSign && (rawSign === '-' || rawSign === '−') ? '-' : (rawSign === '+' ? '+' : undefined)
    // RÈGLE DE SÉCURITÉ : si pas de signe trouvé MAIS le texte contient
    // un signal négatif ailleurs ("moins", "perdu"…), on NE RETOURNE PAS
    // un trade positif par défaut — c'est l'appelant qui classera "flou".
    if (!sign && hasUnpairedNegativeSignal(t)) return null
    return { value: toNumber(sign, body) }
  }

  // 3) Forme texte "plus/moins <nombre texte> r"
  const wordNum: Record<string, number> = {
    'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5,
    'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
  }
  const mWord = t.match(/(?<![\p{L}])(plus|moins)\s+(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*r(?![\p{L}])/iu)
  if (mWord) {
    const sign = mWord[1].toLowerCase() === 'moins' ? '-' : '+'
    const value = wordNum[mWord[2].toLowerCase()]
    return { value: toNumber(sign, String(value)) }
  }
  return null
}

/** Montant en dollars signé : "900 $", "+450 dollars", "-120 $",
 *  "moins 120 dollars", "−120 $", "perdu 120 $", "pris 450 dollars". */
function parseUsdResult(t: string): { value: number } | null {
  // 1) Mots de signe + chiffre + unité
  const mWordDigit = t.match(/(?<![\p{L}])(plus|moins)\s+(\d+(?:[,.]\d+)?)\s*(?:\$|dollars?|usd)(?![\p{L}])/iu)
  if (mWordDigit) {
    const sign = mWordDigit[1].toLowerCase() === 'moins' ? '-' : '+'
    return { value: toNumber(sign, mWordDigit[2]) }
  }
  // 2) Pattern explicite signe (+, -, −) + nombre + $
  const mSigned = t.match(new RegExp(
    `(${SIGN_CHAR_CLASS})\\s*(\\d+(?:[,.]\\d+)?)\\s*(?:\\$|dollars?|usd)(?![\\p{L}])`, 'iu'))
  if (mSigned) {
    const sign = mSigned[1] === '+' ? '+' : '-'
    return { value: toNumber(sign, mSigned[2]) }
  }
  // 3) "perdu N $"
  const mLost = t.match(/(?<![\p{L}])(perdu|perte de)\s+(\d+(?:[,.]\d+)?)\s*(?:\$|dollars?|usd)?(?![\p{L}])/iu)
  if (mLost) return { value: -Number(mLost[2].replace(',', '.')) }
  // 4) "gagné / pris / fait N $"
  const mWin = t.match(/(?<![\p{L}])(gagné|pris|fait|j'ai pris|j'ai gagné)\s+(\d+(?:[,.]\d+)?)\s*(?:\$|dollars?|usd)(?![\p{L}])/iu)
  if (mWin) {
    // Garde-fou : si "moins/perdu/négatif" quelque part dans le texte,
    // ne pas retourner un positif par défaut.
    if (hasUnpairedNegativeSignal(t)) return null
    return { value: Number(mWin[2].replace(',', '.')) }
  }
  return null
}

/** Détection "stoppé" / "stop touché" / "SL touché" / "stopper".
 *  Retourne -1R SAUF si le texte mentionne explicitement BE/financé → 0R.
 *  N.B. : on utilise des boundaries Unicode-aware (JS \b ne considère
 *  pas les accents comme word chars → \bfinancé\b échoue). */
function parseStopHit(t: string): { value: number } | null {
  const be = /(?<![\p{L}])(be|break[- ]?even|financée?)(?![\p{L}])/iu.test(t)
  if (/(?<![\p{L}])(stopp(?:er|é|ée|és|ées|e)|stop touch(?:é|e)|sl touch(?:é|e)|sortie au stop)(?![\p{L}])/iu.test(t)) {
    return { value: be ? 0 : -1 }
  }
  return null
}

/** "sorti à BE", "sortie BE", "sortie breakeven", "stop financé". */
function parseBreakEven(t: string): { value: number } | null {
  if (/(?<![\p{L}])(sorti|sortie|sorti au)\s+(à\s+)?(be|break[- ]?even|breakeven)(?![\p{L}])/iu.test(t)) return { value: 0 }
  if (/(?<![\p{L}])(stop|sl)\s+financée?(?![\p{L}])/iu.test(t)) return { value: 0 }
  return null
}

/** "TP touché à XR" / "TP touché à X R" → +X R.
 *  "TP touché" seul (sans valeur) → null (laissera "ambiguous"). */
function parseTpHit(t: string): { value: number; unit: 'r' | 'usd' } | null {
  const m = t.match(/\btp\s+(?:touché|pris|atteint)\s+(?:à|a)\s+([+-]?\s*\d+(?:[,.]\d+)?)\s*(r|dollars?|\$|usd)?\b/i)
  if (!m) return null
  const value = Number(m[1].replace(/\s/g, '').replace(',', '.'))
  const unit = m[2] && /^(dollars?|\$|usd)$/i.test(m[2]) ? 'usd' : 'r'
  return { value, unit }
}

/** "sorti à +1.5R" / "sorti à -0,5 r" / "sortie à +2R" */
function parseExitAtR(t: string): { value: number } | null {
  const m = t.match(/\b(sorti|sortie|coupé|coupe|sorti au)\s+(à|au)?\s*([+-]?\s*\d+(?:[,.]\d+)?)\s*r\b/i)
  if (!m) return null
  return { value: Number(m[3].replace(/\s/g, '').replace(',', '.')) }
}

/** "TP touché" ou "trade fini" ou "j'ai gagné" (sans chiffre) → ambigu.
 *  Unicode-aware (accents = non word chars pour JS \b, cf. parseStopHit). */
function hasAmbiguousResultSignal(t: string): boolean {
  if (/(?<![\p{L}])tp[\s-]+(touché|touche|pris|atteint)(?![\p{L}])/iu.test(t)) return true
  if (/(?<![\p{L}])trade\s+(fini|terminée?|closed|clôturée?)(?![\p{L}])/iu.test(t)) return true
  if (/(?<![\p{L}])j'ai\s+(gagné|perdu|pris|coupé|fermé)(?![\p{L}])/iu.test(t) &&
      !/\d/.test(t)) return true
  if (/(?<![\p{L}])(sorti|sortie)(?![\p{L}])/iu.test(t) && !/\d/.test(t)) return true
  return false
}

// ─── Détection "config" éventuelle ──────────────────────────────────
const CONFIGS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\border[- ]?block( m\d+| h\d+| d\d+)?\b/i, label: 'order block' },
  { pattern: /\bob( m\d+| h\d+| d\d+)?\b/i,              label: 'ob' },
  { pattern: /\bfvg( m\d+| h\d+| d\d+)?\b/i,             label: 'fvg' },
  { pattern: /\bbreaker( m\d+| h\d+| d\d+)?\b/i,         label: 'breaker' },
  { pattern: /\bchoch( m\d+| h\d+| d\d+)?\b/i,           label: 'choch' },
  { pattern: /\bfibo(nacci)?\b/i,                        label: 'fibo' },
  { pattern: /\bhammer\b/i,                              label: 'hammer' },
]
function detectConfig(t: string): string | null {
  for (const { pattern, label } of CONFIGS) {
    const m = t.match(pattern)
    if (m) {
      const full = m[0].trim().toLowerCase()
      return full
    }
  }
  return null
}

// ─── API principale ─────────────────────────────────────────────────
export function detectTradeEvent(input: string): DetectionResult {
  if (!input || typeof input !== 'string') return { kind: 'none' }
  const t = normalize(input)
  if (!t) return { kind: 'none' }

  // 1) Garde-fou : signaux d'intention/question → NONE
  if (hasIntentionSignal(t)) return { kind: 'none' }

  // 2) Essayer tous les parsers chiffrés, dans l'ordre de spécificité
  const r_exit  = parseExitAtR(t)
  const r_tp    = parseTpHit(t)
  const r_r     = parseRResult(t)
  const r_be    = parseBreakEven(t)
  const r_stop  = parseStopHit(t)
  const r_usd   = parseUsdResult(t)

  // Priorité : "sorti à +XR" > "tp à XR" > BE > stop > "+XR" nu > USD
  let value_r:   number | null = null
  let value_usd: number | null = null

  if (r_exit)      value_r = r_exit.value
  else if (r_tp && r_tp.unit === 'r')   value_r = r_tp.value > 0 ? r_tp.value : r_tp.value  // TP = positif par défaut
  else if (r_tp && r_tp.unit === 'usd') value_usd = r_tp.value > 0 ? r_tp.value : r_tp.value
  else if (r_be)   value_r = r_be.value
  else if (r_stop) value_r = r_stop.value
  else if (r_r)    value_r = r_r.value
  else if (r_usd)  value_usd = r_usd.value

  if (value_r != null || value_usd != null) {
    return {
      kind: 'trade',
      trade: {
        result_r:   value_r,
        result_usd: value_usd,
        instrument: detectInstrument(t),
        side:       detectSide(t),
        config:     detectConfig(t),
        pending:    false,
      },
    }
  }

  // 3) Signaux de résultat SANS chiffre → ambigu
  if (hasAmbiguousResultSignal(t)) return { kind: 'ambiguous' }

  // 4) Rien
  return { kind: 'none' }
}
