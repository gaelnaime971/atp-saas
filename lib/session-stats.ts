import type { TradingSession } from '@/lib/types'

/**
 * Agrégats des trading_sessions côté client.
 *
 * Toutes les fonctions consomment une liste de sessions déjà filtrée
 * par l'appelant (accounts, période, instrument, etc.) — elles ne
 * connaissent aucun filtre métier. Retours en Map keyed par la
 * dimension d'agrégation (jour, semaine, instrument, jour-de-semaine…).
 */

export interface DayStats {
  pnl: number
  count: number   // somme des trades_count sur les sessions du jour
}

/**
 * Convertit une Date en clé "YYYY-MM-DD" en heure locale.
 * NE PAS utiliser toISOString().split('T')[0] car ça décale d'un jour
 * pour les timezones à l'est (le 23h59 local passe au lendemain UTC).
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Groupe les sessions par jour ("YYYY-MM-DD").
 * Somme les pnl + trades_count des sessions du même jour.
 */
export function groupByDay(sessions: TradingSession[]): Map<string, DayStats> {
  const map = new Map<string, DayStats>()
  for (const s of sessions) {
    const key = s.session_date  // déjà au format 'YYYY-MM-DD' en base
    const prev = map.get(key) ?? { pnl: 0, count: 0 }
    map.set(key, {
      pnl: prev.pnl + Number(s.pnl),
      count: prev.count + (Number(s.trades_count) || 0),
    })
  }
  return map
}

// ═══════════════════════════════════════════════════════════════
// ATP Score — 6 axes normalisés 0-100 + score global
// ═══════════════════════════════════════════════════════════════

export type AtpAxisKey = 'winrate' | 'pf' | 'plan' | 'consistency' | 'rr' | 'risk'

export interface AtpAxis {
  key: AtpAxisKey
  label: string
  score: number | null   // 0-100 arrondi, null si data insuffisante
  explain: string        // pour tooltip riche
}

export type AtpTone = 'warn' | 'profit' | 'accent' | 'neutral'

export interface AtpScore {
  score: number | null    // moyenne arrondie des axes valides, null si <3 valides
  label: string           // "À travailler" / "Correct" / "Solide" / "Excellent" / "Insuffisant"
  tone: AtpTone
  axes: AtpAxis[]         // toujours 6, ordre stable
  validCount: number      // combien d'axes ont un score non-null
}

/**
 * Parse safely le champ setup (JSON string ou null) d'une session.
 * Renvoie un objet vide si absent ou malformé.
 */
function parseSetup(setup: string | null | undefined): Record<string, unknown> {
  if (!setup) return {}
  try {
    const v = JSON.parse(setup)
    return typeof v === 'object' && v !== null ? v as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/**
 * Calcule l'ATP Score à partir des sessions brutes. Aucune dépendance
 * à une analyse IA — le score est toujours disponible dès que le
 * trader a suffisamment de sessions (minimum 3 axes valides).
 *
 * Formules détaillées dans les commentaires de chaque axe. Chaque axe
 * qui n'a pas assez de data renvoie null (exclu de la moyenne globale
 * mais rendu comme "N/A" dans le radar).
 */
export function atpScore(sessions: TradingSession[]): AtpScore {
  // ─── Axe 1 : Win Rate (linéaire direct 0-100) ───
  const wins = sessions.filter(s => s.result === 'win').length
  const wrScore = sessions.length > 0 ? (wins / sessions.length) * 100 : null

  // ─── Axe 2 : Profit Factor ───
  // pf < 1 → pf*50 ; pf ≥ 1 → 50 + (pf-1)*25 capé 100
  const grossProfit = sessions.filter(s => Number(s.pnl) > 0).reduce((a, s) => a + Number(s.pnl), 0)
  const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((a, s) => a + Number(s.pnl), 0))
  let pfScore: number | null = null
  if (grossLoss > 0) {
    const pf = grossProfit / grossLoss
    pfScore = pf < 1 ? pf * 50 : Math.min(100, 50 + (pf - 1) * 25)
  } else if (grossProfit > 0) {
    pfScore = 100  // aucune perte = perfect
  }

  // ─── Axe 3 : Respect du plan (moyenne plan_score 0-10 × 10) ───
  const plans = sessions
    .map(s => num(parseSetup(s.setup)['plan_score']))
    .filter((v): v is number => v !== null)
  const planScore = plans.length >= 3
    ? (plans.reduce((a, b) => a + b, 0) / plans.length) * 10
    : null

  // ─── Axe 4 : Régularité (consistency propfirm : bestDay / total) ───
  const byDay = groupByDay(sessions)
  const dailyPnls = Array.from(byDay.values()).map(d => d.pnl)
  const totalProfit = dailyPnls.reduce((a, b) => a + b, 0)
  let consistencyScore: number | null = null
  if (dailyPnls.length >= 3) {
    if (totalProfit <= 0) {
      consistencyScore = 0  // perdant global → régularité 0
    } else {
      const bestDay = Math.max(...dailyPnls)
      const share = bestDay / totalProfit
      // share=0.3 → 100 · share=0.5 → 50 · share=0.7 → 0
      consistencyScore = Math.max(0, 100 - (share - 0.3) * 250)
    }
  }

  // ─── Axe 5 : Ratio R:R (moyenne r_value) ───
  const rVals = sessions
    .map(s => num(parseSetup(s.setup)['r_value']))
    .filter((v): v is number => v !== null)
  let rrScore: number | null = null
  if (rVals.length >= 3) {
    const avgR = rVals.reduce((a, b) => a + b, 0) / rVals.length
    rrScore = avgR < 1 ? avgR * 50 : Math.min(100, 50 + (avgR - 1) * 25)
  }

  // ─── Axe 6 : Gestion du risque (max_loss / avg_loss) ───
  const losses = sessions.filter(s => Number(s.pnl) < 0).map(s => Math.abs(Number(s.pnl)))
  let riskScore: number | null = null
  if (losses.length >= 3) {
    const maxL = Math.max(...losses)
    const avgL = losses.reduce((a, b) => a + b, 0) / losses.length
    if (avgL > 0) {
      const ratio = maxL / avgL
      // ratio=1 → 100 · ratio=2 → 85 · ratio=3 → 55 · ratio≥5 → 0
      riskScore = Math.max(0, 100 - (ratio - 1.5) * 30)
    }
  }

  const axes: AtpAxis[] = [
    { key: 'winrate',     label: 'Win Rate',        score: wrScore != null ? Math.round(wrScore) : null,
      explain: 'Pourcentage de sessions gagnantes. Direct : 55% WR → 55/100.' },
    { key: 'pf',          label: 'Profit Factor',   score: pfScore != null ? Math.round(pfScore) : null,
      explain: 'Somme des gains ÷ somme des pertes. PF=1 → 50, PF=2 → 75, PF≥3 → 100.' },
    { key: 'plan',        label: 'Respect plan',    score: planScore != null ? Math.round(planScore) : null,
      explain: 'Moyenne de tes plan_score (0-10) × 10. Minimum 3 sessions avec plan_score renseigné.' },
    { key: 'consistency', label: 'Régularité',      score: consistencyScore != null ? Math.round(consistencyScore) : null,
      explain: 'Consistency propfirm : meilleur jour ÷ total. ≤30% du total → 100, plus élevé fait baisser la note.' },
    { key: 'rr',          label: 'Ratio R:R',       score: rrScore != null ? Math.round(rrScore) : null,
      explain: 'Moyenne de tes r_value. R=1 → 50, R=2 → 75, R≥3 → 100. Minimum 3 sessions avec r_value renseigné.' },
    { key: 'risk',        label: 'Gestion risque',  score: riskScore != null ? Math.round(riskScore) : null,
      explain: 'Cohérence de la taille de tes pertes : plus grosse perte ÷ perte moyenne. Ratio proche de 1 → 100. Minimum 3 pertes.' },
  ]

  const valid = axes.filter(a => a.score !== null)
  if (valid.length < 3) {
    return { score: null, label: 'Insuffisant', tone: 'neutral', axes, validCount: valid.length }
  }

  const globalScore = Math.round(valid.reduce((s, a) => s + (a.score as number), 0) / valid.length)
  let label: string
  let tone: AtpTone
  if (globalScore < 40)      { label = 'À travailler'; tone = 'warn'   }
  else if (globalScore < 60) { label = 'Correct';      tone = 'warn'   }
  else if (globalScore < 80) { label = 'Solide';       tone = 'profit' }
  else                       { label = 'Excellent';    tone = 'accent' }

  return { score: globalScore, label, tone, axes, validCount: valid.length }
}
