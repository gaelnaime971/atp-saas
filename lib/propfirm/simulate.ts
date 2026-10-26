/**
 * Trading perso — simulateur PURE "capital + objectif en X jours".
 *
 * Entrées :
 *   - startingCapital   : solde de départ
 *   - targetCapital     : objectif à atteindre
 *   - horizonDays       : nombre de JOURS DE TRADING jusqu'à l'objectif
 *   - tradingDaysPerWeek : combien de jours tradés par semaine (défaut 5)
 *   - lossDaysPerWeek   : nombre de jours ROUGES attendus par semaine
 *   - avgLossPerRedDay  : perte moyenne par jour rouge (en €, POSITIVE)
 *
 * Sorties :
 *   - totalProfitNeeded      : différence capital → objectif
 *   - requiredDailyAvg       : perf moyenne tous jours tradés confondus
 *   - requiredWeeklyAvg      : perf moyenne par semaine
 *   - requiredPerGreenDay    : perf à faire chaque jour VERT pour tenir
 *                              la trajectoire malgré les rouges
 *   - weeklyProjection[]     : balance de fin de chaque semaine attendue
 *   - feasible               : indicateur simple si le besoin par jour
 *                              vert reste raisonnable (ratio profit /
 *                              capital par jour vert).
 */

export interface SimulateInput {
  startingCapital: number
  targetCapital: number
  horizonDays: number
  tradingDaysPerWeek: number
  lossDaysPerWeek: number
  avgLossPerRedDay: number
}

export interface WeeklyRow {
  week: number              // 1-indexé
  tradingDays: number       // jours tradés dans la semaine (jamais > tradingDaysPerWeek)
  redDays: number
  greenDays: number
  weeklyNet: number         // profit net de la semaine
  balance: number           // balance fin de semaine
}

export interface SimulateOutput {
  totalProfitNeeded: number
  requiredDailyAvg: number
  requiredWeeklyAvg: number
  requiredPerGreenDay: number | null  // null si zéro jour vert prévu
  totalWeeks: number
  weeklyProjection: WeeklyRow[]
  feasible: 'ok' | 'ambitious' | 'unrealistic'
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface SimErrors {
  starting_capital?: string
  target_capital?: string
  horizon_days?: string
  trading_days_per_week?: string
  loss_days_per_week?: string
  avg_loss?: string
}

export function validateSimInput(x: Partial<SimulateInput>): SimErrors {
  const e: SimErrors = {}
  if (!Number.isFinite(x.startingCapital) || (x.startingCapital as number) <= 0) {
    e.starting_capital = 'Capital de départ requis (> 0).'
  }
  if (!Number.isFinite(x.targetCapital) || (x.targetCapital as number) <= 0) {
    e.target_capital = 'Objectif requis (> 0).'
  }
  if (x.startingCapital != null && x.targetCapital != null && x.targetCapital <= x.startingCapital) {
    e.target_capital = 'L\'objectif doit être supérieur au capital.'
  }
  if (!Number.isFinite(x.horizonDays) || (x.horizonDays as number) < 1) {
    e.horizon_days = 'Horizon en jours tradés (≥ 1).'
  }
  if (x.tradingDaysPerWeek != null && (x.tradingDaysPerWeek < 1 || x.tradingDaysPerWeek > 7)) {
    e.trading_days_per_week = 'Entre 1 et 7.'
  }
  if (x.lossDaysPerWeek != null && x.tradingDaysPerWeek != null && x.lossDaysPerWeek > x.tradingDaysPerWeek) {
    e.loss_days_per_week = 'Pas plus que le nombre de jours tradés.'
  }
  if (x.lossDaysPerWeek != null && x.lossDaysPerWeek < 0) {
    e.loss_days_per_week = 'Zéro ou plus.'
  }
  if (x.avgLossPerRedDay != null && x.avgLossPerRedDay < 0) {
    e.avg_loss = 'Montant positif (ex. 150 € par jour rouge).'
  }
  return e
}

export function isSimValid(e: SimErrors): boolean {
  return !e.starting_capital && !e.target_capital && !e.horizon_days
    && !e.trading_days_per_week && !e.loss_days_per_week && !e.avg_loss
}

// ─── Simulation ─────────────────────────────────────────────────────────────

export function simulate(input: SimulateInput): SimulateOutput {
  const S = Number(input.startingCapital)
  const T = Number(input.targetCapital)
  const H = Math.max(1, Math.floor(Number(input.horizonDays)))
  const tdw = Math.max(1, Math.min(7, Math.floor(Number(input.tradingDaysPerWeek))))
  const ldw = Math.max(0, Math.min(tdw, Math.floor(Number(input.lossDaysPerWeek))))
  const avgLoss = Math.max(0, Number(input.avgLossPerRedDay) || 0)

  const totalProfitNeeded = T - S
  const requiredDailyAvg = totalProfitNeeded / H

  // Ratio rouges / verts par semaine (constant), appliqué pro-rata
  // aux semaines partielles.
  const greenRatioPerWeek = tdw > 0 ? (tdw - ldw) / tdw : 0
  const redRatioPerWeek   = tdw > 0 ? ldw / tdw : 0

  const totalRedDays   = H * redRatioPerWeek
  const totalGreenDays = H * greenRatioPerWeek
  const totalLossesExpected = totalRedDays * avgLoss

  // Gain requis sur TOUS les jours verts pour tenir la trajectoire.
  const requiredPerGreenDay = totalGreenDays > 0
    ? (totalProfitNeeded + totalLossesExpected) / totalGreenDays
    : null

  // Horizon en semaines (dernière semaine éventuellement partielle)
  const totalWeeks = Math.ceil(H / tdw)
  const requiredWeeklyAvg = (requiredDailyAvg * tdw)

  // Projection semaine par semaine
  const weeklyProjection: WeeklyRow[] = []
  let balance = S
  let daysLeft = H
  for (let w = 1; w <= totalWeeks; w++) {
    const tradingDays = Math.min(tdw, daysLeft)
    const redDays = tradingDays * redRatioPerWeek
    const greenDays = tradingDays - redDays
    const grossLoss = redDays * avgLoss
    const grossGain = requiredPerGreenDay != null
      ? greenDays * requiredPerGreenDay
      : tradingDays * requiredDailyAvg
    const weeklyNet = grossGain - grossLoss
    balance = balance + weeklyNet
    weeklyProjection.push({
      week: w,
      tradingDays,
      redDays: Number(redDays.toFixed(2)),
      greenDays: Number(greenDays.toFixed(2)),
      weeklyNet: Number(weeklyNet.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    })
    daysLeft -= tradingDays
    if (daysLeft <= 0) break
  }

  // Faisabilité : ratio "gain par jour vert / capital" (très rough)
  // Au-delà de 3 % du capital par jour vert, c'est très ambitieux.
  // Au-delà de 5 %, irréaliste. Si pas de jours verts, c'est injouable.
  let feasible: SimulateOutput['feasible'] = 'ok'
  if (requiredPerGreenDay == null) feasible = 'unrealistic'
  else {
    const dailyPctOfCapital = (requiredPerGreenDay / S) * 100
    if (dailyPctOfCapital > 5) feasible = 'unrealistic'
    else if (dailyPctOfCapital > 3) feasible = 'ambitious'
  }

  return {
    totalProfitNeeded: Number(totalProfitNeeded.toFixed(2)),
    requiredDailyAvg: Number(requiredDailyAvg.toFixed(2)),
    requiredWeeklyAvg: Number(requiredWeeklyAvg.toFixed(2)),
    requiredPerGreenDay: requiredPerGreenDay != null ? Number(requiredPerGreenDay.toFixed(2)) : null,
    totalWeeks,
    weeklyProjection,
    feasible,
  }
}

// ─── Format FR ──────────────────────────────────────────────────────────────

export function formatSimEur(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.round(n))
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${abs.toLocaleString('fr-FR')} €`
}

export const FEASIBILITY_LABEL: Readonly<Record<SimulateOutput['feasible'], string>> = {
  ok:            'Objectif atteignable',
  ambitious:     'Ambitieux',
  unrealistic:   'Irréaliste (recalibre)',
}

export const FEASIBILITY_COLOR: Readonly<Record<SimulateOutput['feasible'], string>> = {
  ok:            '#22c55e',
  ambitious:     '#f59e0b',
  unrealistic:   '#ef4444',
}
