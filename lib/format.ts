/**
 * Format helpers — source unique de vérité pour les affichages numériques.
 *
 * Toutes les valeurs affichées dans une KpiCard, une DataTable ou un chart
 * tooltip doivent passer par ces helpers. Zéro `toLocaleString` en dur dans
 * les pages, zéro concaténation `+ '$'` ou `+ ' €'` ad hoc.
 *
 * Convention : locale française par défaut (séparateur de milliers = espace
 * insécable, décimale = virgule). `sign: true` préfixe les positifs d'un `+`
 * (utile pour un P&L). `null` / `undefined` / NaN → em-dash `—`.
 */

const FR_LOCALE = 'fr-FR'
const EM_DASH = '—'

// ═══════════════════════════════════════════════════════════════
// Nombres bruts
// ═══════════════════════════════════════════════════════════════

/**
 * Nombre entier ou décimal, séparateur français.
 * fmtNumber(1234)       → "1 234"
 * fmtNumber(1234.5, 2)  → "1 234,50"
 * fmtNumber(-42, 0, { sign: true }) → "-42"
 * fmtNumber(42, 0, { sign: true })  → "+42"
 */
export function fmtNumber(
  n: number | null | undefined,
  decimals = 0,
  opts?: { sign?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return EM_DASH
  const prefix = opts?.sign && n > 0 ? '+' : ''
  return prefix + n.toLocaleString(FR_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ═══════════════════════════════════════════════════════════════
// Devises
// ═══════════════════════════════════════════════════════════════

/** fmtEur(1234)   → "1 234 €"     · fmtEur(1234, 2, {sign:true}) → "+1 234,00 €" */
export function fmtEur(
  n: number | null | undefined,
  decimals = 0,
  opts?: { sign?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return EM_DASH
  return `${fmtNumber(n, decimals, opts)} €`
}

/** fmtUsd(1234)   → "1 234 $"     · fmtUsd(-95, 2, {sign:true})  → "-95,00 $" */
export function fmtUsd(
  n: number | null | undefined,
  decimals = 0,
  opts?: { sign?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return EM_DASH
  return `${fmtNumber(n, decimals, opts)} $`
}

/**
 * Format compact pour KPI cards où l'espace est limité.
 * fmtCompact(1_500_000, '€')  → "1,5 M€"
 * fmtCompact(12_345, '$')     → "12,3 k$"
 * fmtCompact(842, '€')        → "842 €"
 */
export function fmtCompact(
  n: number | null | undefined,
  currency: '€' | '$' = '€',
  opts?: { sign?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return EM_DASH
  const abs = Math.abs(n)
  const prefix = opts?.sign && n > 0 ? '+' : ''
  if (abs >= 1_000_000) return `${prefix}${(n / 1_000_000).toLocaleString(FR_LOCALE, { maximumFractionDigits: 1 })} M${currency}`
  if (abs >= 1_000)     return `${prefix}${(n / 1_000).toLocaleString(FR_LOCALE, { maximumFractionDigits: 1 })} k${currency}`
  return `${prefix}${Math.round(n).toLocaleString(FR_LOCALE)} ${currency}`
}

// ═══════════════════════════════════════════════════════════════
// Pourcentages
// ═══════════════════════════════════════════════════════════════

/** fmtPct(42.7, 1)   → "42,7 %"     · fmtPct(null) → "—" */
export function fmtPct(
  n: number | null | undefined,
  decimals = 1,
  opts?: { sign?: boolean },
): string {
  if (n == null || Number.isNaN(n)) return EM_DASH
  return `${fmtNumber(n, decimals, opts)} %`
}

// ═══════════════════════════════════════════════════════════════
// Dates
// ═══════════════════════════════════════════════════════════════

/** fmtDate('2026-03-15') → "15 mars 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  try {
    return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(FR_LOCALE, {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return EM_DASH }
}

/** fmtDateShort('2026-03-15') → "15 mars" */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return EM_DASH
  try {
    return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(FR_LOCALE, {
      day: 'numeric', month: 'short',
    })
  } catch { return EM_DASH }
}

// ═══════════════════════════════════════════════════════════════
// Tone helper — dérive un tone P&L en RESPECTANT la règle zéro = neutral.
// À utiliser à chaque endroit où l'on affiche un P&L via KpiCard :
//
//   <KpiCard value={fmtUsd(pnl, 2, {sign:true})} tone={toneForPnl(pnl)} />
//
// La règle est stricte : un P&L de 0 signifie "pas de gain", pas "perte".
// Cela évite le bug historique de Stats & Performance qui affichait 0 $ en
// rouge (traité comme loss par un `n >= 0 ? profit : loss`).
// ═══════════════════════════════════════════════════════════════

export type PnlTone = 'profit' | 'loss' | 'neutral'

/**
 * toneForPnl(42)   → 'profit'
 * toneForPnl(-3)   → 'loss'
 * toneForPnl(0)    → 'neutral'      ← jamais 'loss'
 * toneForPnl(null) → 'neutral'      ← absence de donnée = neutral
 */
export function toneForPnl(n: number | null | undefined): PnlTone {
  if (n == null || Number.isNaN(n)) return 'neutral'
  if (n > 0) return 'profit'
  if (n < 0) return 'loss'
  return 'neutral'
}
