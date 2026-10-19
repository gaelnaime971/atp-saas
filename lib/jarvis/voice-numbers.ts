/**
 * Convertit les chiffres et symboles en mots français — étape 3D-bis.
 *
 * Appliqué UNIQUEMENT au texte envoyé à ElevenLabs. Le texte affiché
 * à l'écran garde chiffres et symboles ("0,2 à 0,4 %", "+2 R",
 * "900 $"). Même principe que lib/jarvis/pronunciation.ts.
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * COMPORTEMENT ATTENDU (testé) :
 *   "0,2 à 0,4 %"      → "zéro virgule deux à zéro virgule quatre pour cent"
 *   "+2 R"             → "plus deux R"
 *   "900 $"            → "neuf cents dollars"
 *
 * COMMENT ÉTENDRE :
 *   Ajouter un regex au tableau TRANSFORMS, dans l'ordre
 *   d'application. Les patterns composés ($, %, R) doivent passer
 *   AVANT les patterns généraux (virgule, entier isolé).
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ─── Convertisseur FR nombres (0 à 9999) ────────────────────────────
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
const TEENS = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function tensToWordsFr(n: number): string {
  // 0..99
  if (n < 10) return UNITS[n]
  if (n < 20) return TEENS[n - 10]
  if (n < 70) {
    const t = TENS[Math.floor(n / 10)]
    const u = n % 10
    if (u === 0) return t
    if (u === 1) return `${t} et un`
    return `${t}-${UNITS[u]}`
  }
  if (n < 80) {
    // 70-79 : soixante-dix…
    const u = n - 60
    if (u === 11) return 'soixante et onze'
    return `soixante-${TEENS[u - 10] || UNITS[u]}`
  }
  // 80-99 : quatre-vingt…
  const u = n - 80
  if (u === 0) return 'quatre-vingts'
  if (u < 10) return `quatre-vingt-${UNITS[u]}`
  return `quatre-vingt-${TEENS[u - 10]}`
}

export function toWordsFr(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n < 0) return `moins ${toWordsFr(-n)}`
  n = Math.round(n)
  if (n === 0) return 'zéro'
  if (n < 100) return tensToWordsFr(n)
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const r = n % 100
    const hundredsWord = h === 1 ? 'cent' : `${UNITS[h]} cents`
    // "cent" prend un "s" uniquement si pluriel ET pas suivi d'un autre nombre
    const hw = (h > 1 && r === 0) ? `${UNITS[h]} cents` : (h === 1 ? 'cent' : `${UNITS[h]} cent`)
    return r === 0 ? hundredsWord : `${hw} ${tensToWordsFr(r)}`
  }
  if (n < 10000) {
    const th = Math.floor(n / 1000)
    const r = n % 1000
    const thWord = th === 1 ? 'mille' : `${toWordsFr(th)} mille`
    return r === 0 ? thWord : `${thWord} ${toWordsFr(r)}`
  }
  return String(n) // fallback nombres > 9999, pas de cas trading courant
}

// ─── Transformations texte → voix ───────────────────────────────────
/**
 * Convertit chiffres & symboles d'un texte "visuel" en mots pour
 * la synthèse vocale. L'ordre est important : les patterns composés
 * (unités monétaires, pourcentages, R) sont traités en premier pour
 * ne pas être cassés par le pattern "entier isolé".
 */
export function numbersToWords(input: string): string {
  let s = input

  // 1. Montants en dollars : "900 $" | "$900" | "1 234 $" (sans séparateurs par simplicité)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*\$/g, (_, n) => `${numToWordsOrDecimal(n)} dollars`)
  s = s.replace(/\$\s*(\d+(?:[.,]\d+)?)/g, (_, n) => `${numToWordsOrDecimal(n)} dollars`)

  // 2. Pourcentages : "0,2 %" | "4%"
  s = s.replace(/(\d+)[,.](\d+)\s*%/g, (_, a, b) => `${toWordsFr(+a)} virgule ${digitsToWords(b)} pour cent`)
  s = s.replace(/(\d+)\s*%/g, (_, n) => `${toWordsFr(+n)} pour cent`)

  // 3. Risque / Ratio en R : "+2 R" | "-2 R" | "2 R" | "2R"
  s = s.replace(/\+\s*(\d+(?:[.,]\d+)?)\s*R\b/g, (_, n) => `plus ${numToWordsOrDecimal(n)} R`)
  s = s.replace(/-\s*(\d+(?:[.,]\d+)?)\s*R\b/g, (_, n) => `moins ${numToWordsOrDecimal(n)} R`)
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*R\b/g, (_, n) => `${numToWordsOrDecimal(n)} R`)

  // 4. Signes +/- devant un nombre : "+5" → "plus cinq"
  s = s.replace(/\+\s*(\d+(?:[.,]\d+)?)/g, (_, n) => `plus ${numToWordsOrDecimal(n)}`)
  s = s.replace(/(?<![\d\p{L}])-\s*(\d+(?:[.,]\d+)?)/gu, (_, n) => `moins ${numToWordsOrDecimal(n)}`)

  // 5. Nombres décimaux restants : "0,5" → "zéro virgule cinq"
  s = s.replace(/\b(\d+)[,.](\d+)\b/g, (_, a, b) => `${toWordsFr(+a)} virgule ${digitsToWords(b)}`)

  // 6. Entiers isolés restants : "2 trades" → "deux trades"
  s = s.replace(/\b(\d+)\b/g, (_, n) => toWordsFr(+n))

  return s
}

/** Convertit "900" ou "0,5" en mots (entier ou décimal). */
function numToWordsOrDecimal(raw: string): string {
  if (/[.,]/.test(raw)) {
    const [a, b] = raw.split(/[.,]/)
    return `${toWordsFr(+a)} virgule ${digitsToWords(b)}`
  }
  return toWordsFr(+raw)
}

/**
 * Convertit une suite de chiffres décimaux "25" en "deux cinq"
 * (lecture chiffre par chiffre), standard pour la partie après la
 * virgule en français parlé courant. Un seul chiffre = juste le mot.
 */
function digitsToWords(raw: string): string {
  if (raw.length === 1) return UNITS[+raw]
  // "25" → "vingt-cinq" plutôt que "deux cinq" ? Pour les décimaux
  // en finance ("0,25%" lu "zéro virgule vingt-cinq pour cent"),
  // la lecture positionnelle sonne mieux. On garde toWordsFr.
  return toWordsFr(+raw)
}
