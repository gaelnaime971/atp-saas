/**
 * Trader metrics computation — pure functions used by the analysis route,
 * the chat route, and the instant-stats route.
 *
 * No Supabase dependency here: callers fetch the raw rows and pass them in.
 */

// ─── Raw row shapes ──────────────────────────────────────────────────────

export interface SessionRow {
  session_date: string
  pnl: number
  result: string // 'win' | 'loss' | 'breakeven'
  trades_count: number
  instrument: string | null
  setup: string | null // JSON blob of SessionMeta
  notes: string | null
}

export interface BacktestRow {
  date: string
  instrument: string
  direction: string
  setup_types: string[] | null
  signals: string[] | null
  has_confluence: boolean
  r_result: number
  result: string
  notes: string | null
}

export interface SessionMeta {
  plan_score?: number
  mood?: string
  technical_analysis?: string
  psychological_analysis?: string
  improvement?: string
  account_ids?: string[]
  r_result?: number
  avg_r?: number
}

// ─── Derived stats shapes ────────────────────────────────────────────────

export interface InstrumentStat { instrument: string; count: number; pnl: number; win_rate: number; avg_r: number | null }
export interface DayStat { day: string; count: number; pnl: number; avg_pnl: number; win_rate: number }
export interface PeriodStats { count: number; pnl: number; win_rate: number; avg_r: number | null }
export interface RDistribution {
  lt_minus2: number; m2_to_m1: number; m1_to_0: number;
  z0_to_1: number; p1_to_2: number; gt_2: number;
}
export interface MoodStat { mood: string; count: number; avg_pnl: number; win_rate: number }
export interface AccountStat { account_id: string; count: number; pnl: number }
export interface BtSetupStat { name: string; wr: number; n: number; avg_r: number }
export interface BtSignalStat { name: string; wr: number; n: number }
export interface ConfluenceSide { count: number; win_rate: number; avg_r: number | null }

export interface EquityPoint { date: string; pnl: number; cumulative: number; drawdown: number }
export interface DailyPnLPoint { date: string; pnl: number; win: boolean; trades: number }
export interface WinRatePoint { date: string; win_rate: number; n: number }

export interface Stats {
  period_label: string
  period_from: string
  period_to: string
  period_days: number
  sessions_count: number
  backtests_count: number
  total_pnl: number
  win_rate: number
  wins: number
  losses: number
  breakevens: number
  profit_factor: number | null
  expectancy: number | null
  avg_winner_eur: number | null
  avg_loser_eur: number | null
  risk_reward: number | null
  avg_plan_score: number | null
  avg_sessions_per_week: number | null
  trades_count_total: number
  max_drawdown: number
  max_drawdown_pct: number | null
  max_run_up: number
  max_win_streak: number
  max_loss_streak: number
  current_streak: { type: 'win' | 'loss' | 'none'; length: number }
  best_day_value: number
  worst_day_value: number
  r_distribution: RDistribution
  trades_distribution: { light_1_3: number; medium_4_6: number; heavy_7_plus: number }
  day_of_week: DayStat[]
  best_day: DayStat | null
  worst_day: DayStat | null
  recent_vs_older: { recent: PeriodStats; older: PeriodStats }
  instruments: InstrumentStat[]
  mood_stats: MoodStat[]
  best_mood: MoodStat | null
  plan_score_correlation: {
    count_high_plan: number
    count_low_plan: number
    avg_pnl_high_plan: number | null
    avg_pnl_low_plan: number | null
    avg_plan_score: number | null
  }
  top_accounts: AccountStat[]
  top_setups_backtest: BtSetupStat[]
  top_signals_backtest: BtSignalStat[]
  best_timeframe: { name: string; wr: number; n: number } | null
  timeframe_stats: { name: string; wr: number; n: number }[]
  confluence_comparison: { with_confluence: ConfluenceSide; without_confluence: ConfluenceSide }
  // Chart-ready series
  equity_curve: EquityPoint[]
  daily_pnl: DailyPnLPoint[]
  win_rate_rolling: WinRatePoint[]
  // Notes for AI
  recent_tech_notes: string[]
  recent_psycho_notes: string[]
  recent_improvements: string[]
}

// ─── Filter & options ────────────────────────────────────────────────────

export interface MetricsOptions {
  from: string // ISO YYYY-MM-DD
  to: string // ISO YYYY-MM-DD
  periodLabel?: string
  instrument?: string | null
  accountId?: string | null
  direction?: string | null // for backtests
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function safeParse(setup: string | null): SessionMeta | null {
  if (!setup) return null
  try { return JSON.parse(setup) as SessionMeta } catch { return null }
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function round(v: number | null | undefined, d = 2): number | null {
  if (v == null || !isFinite(v)) return null
  const m = Math.pow(10, d)
  return Math.round(v * m) / m
}

export function periodPresetToDates(preset: '7d' | '30d' | '90d' | '6mo' | '1y' | 'all', today = new Date()):
  { from: string; to: string; label: string; days: number } {
  const to = today.toISOString().slice(0, 10)
  const days = preset === '7d' ? 7
    : preset === '30d' ? 30
    : preset === '90d' ? 90
    : preset === '6mo' ? 180
    : preset === '1y' ? 365
    : 3650
  const fromDate = new Date(today)
  fromDate.setDate(fromDate.getDate() - days + 1)
  const from = fromDate.toISOString().slice(0, 10)
  const label = preset === '7d' ? '7 derniers jours'
    : preset === '30d' ? '30 derniers jours'
    : preset === '90d' ? '90 derniers jours'
    : preset === '6mo' ? '6 derniers mois'
    : preset === '1y' ? '12 derniers mois'
    : 'Tout l\'historique'
  return { from, to, label, days }
}

// ─── Main computation ────────────────────────────────────────────────────

export function computeStats(
  rawSessions: SessionRow[],
  rawBacktests: BacktestRow[],
  opts: MetricsOptions,
): Stats {
  // Apply instrument / account filters
  const sessions = rawSessions.filter(s => {
    if (opts.instrument && (s.instrument || '').toUpperCase() !== opts.instrument.toUpperCase()) return false
    if (opts.accountId) {
      const meta = safeParse(s.setup)
      if (!meta?.account_ids?.includes(opts.accountId)) return false
    }
    return true
  })
  const backtests = rawBacktests.filter(b => {
    if (opts.instrument && (b.instrument || '').toUpperCase() !== opts.instrument.toUpperCase()) return false
    if (opts.direction && b.direction !== opts.direction) return false
    return true
  })

  // ─ Global metrics ─
  const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
  const wins = sessions.filter(s => s.result === 'win').length
  const losses = sessions.filter(s => s.result === 'loss').length
  const breakevens = sessions.filter(s => s.result === 'breakeven').length
  const decisive = wins + losses
  const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0
  const grossWin = sessions.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
  const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
  const profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null

  const winnerPnls = sessions.filter(s => Number(s.pnl) > 0).map(s => Number(s.pnl))
  const loserPnls = sessions.filter(s => Number(s.pnl) < 0).map(s => Math.abs(Number(s.pnl)))
  const avgWinner = avg(winnerPnls)
  const avgLoser = avg(loserPnls)
  const riskReward = avgWinner != null && avgLoser != null && avgLoser > 0 ? avgWinner / avgLoser : null

  // Expectancy = (WR × avgWinner) − (LR × avgLoser)
  const lossRate = decisive > 0 ? losses / decisive : 0
  const wr = decisive > 0 ? wins / decisive : 0
  const expectancy = avgWinner != null && avgLoser != null
    ? (wr * avgWinner) - (lossRate * avgLoser)
    : null

  const tradesCountTotal = sessions.reduce((s, x) => s + (Number(x.trades_count) || 0), 0)
  const bestDayValue = sessions.length ? Math.max(...sessions.map(s => Number(s.pnl))) : 0
  const worstDayValue = sessions.length ? Math.min(...sessions.map(s => Number(s.pnl))) : 0

  // ─ Equity curve + drawdown + run-up ─
  const sortedAsc = sessions.slice().sort((a, b) => a.session_date.localeCompare(b.session_date))
  let cumulative = 0
  let peak = 0
  let trough = 0
  let maxDrawdown = 0
  let maxRunUp = 0
  const equityCurve: EquityPoint[] = []
  const dailyPnL: DailyPnLPoint[] = []
  for (const s of sortedAsc) {
    cumulative += Number(s.pnl)
    if (cumulative > peak) { peak = cumulative; trough = cumulative }
    if (cumulative < trough) trough = cumulative
    const dd = cumulative - peak
    if (dd < maxDrawdown) maxDrawdown = dd
    const runUp = cumulative - trough
    if (runUp > maxRunUp) maxRunUp = runUp
    equityCurve.push({
      date: s.session_date,
      pnl: Number(s.pnl),
      cumulative: Math.round(cumulative),
      drawdown: Math.round(dd),
    })
    dailyPnL.push({
      date: s.session_date,
      pnl: Math.round(Number(s.pnl)),
      win: Number(s.pnl) > 0,
      trades: Number(s.trades_count) || 0,
    })
  }
  const maxDdPct = peak > 0 ? Math.round((maxDrawdown / peak) * 100) : null

  // ─ Rolling win rate (window = 10 sessions) ─
  const winRateRolling: WinRatePoint[] = []
  const WINDOW = 10
  for (let i = 0; i < sortedAsc.length; i++) {
    const start = Math.max(0, i - WINDOW + 1)
    const slice = sortedAsc.slice(start, i + 1)
    const w = slice.filter(s => s.result === 'win').length
    const l = slice.filter(s => s.result === 'loss').length
    const tot = w + l
    if (tot < 3) continue
    winRateRolling.push({
      date: sortedAsc[i].session_date,
      win_rate: Math.round((w / tot) * 100),
      n: tot,
    })
  }

  // ─ Per-instrument ─
  const instrumentMap: Record<string, { pnl: number; wins: number; losses: number; breakevens: number; rs: number[] }> = {}
  sessions.forEach(s => {
    const inst = (s.instrument || 'INCONNU').toUpperCase()
    if (!instrumentMap[inst]) instrumentMap[inst] = { pnl: 0, wins: 0, losses: 0, breakevens: 0, rs: [] }
    instrumentMap[inst].pnl += Number(s.pnl)
    if (s.result === 'win') instrumentMap[inst].wins++
    else if (s.result === 'loss') instrumentMap[inst].losses++
    else if (s.result === 'breakeven') instrumentMap[inst].breakevens++
    const meta = safeParse(s.setup)
    const r = meta?.r_result ?? meta?.avg_r
    if (typeof r === 'number' && isFinite(r)) instrumentMap[inst].rs.push(r)
  })
  const instrumentStats: InstrumentStat[] = Object.entries(instrumentMap)
    .map(([instrument, d]) => {
      const decisiveI = d.wins + d.losses
      return {
        instrument,
        count: d.wins + d.losses + d.breakevens,
        pnl: round(d.pnl) ?? 0,
        win_rate: decisiveI > 0 ? Math.round((d.wins / decisiveI) * 100) : 0,
        avg_r: round(avg(d.rs)),
      }
    })
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 8)

  // ─ Day of week ─
  const dayMap: Record<number, { count: number; pnl: number; wins: number; losses: number }> = {}
  sessions.forEach(s => {
    const dow = new Date(s.session_date).getDay()
    if (!dayMap[dow]) dayMap[dow] = { count: 0, pnl: 0, wins: 0, losses: 0 }
    dayMap[dow].count++
    dayMap[dow].pnl += Number(s.pnl)
    if (s.result === 'win') dayMap[dow].wins++
    if (s.result === 'loss') dayMap[dow].losses++
  })
  const dayStats: DayStat[] = Object.entries(dayMap).map(([dow, v]) => {
    const total = v.wins + v.losses
    return {
      day: DAY_LABELS[Number(dow)],
      count: v.count,
      pnl: round(v.pnl) ?? 0,
      avg_pnl: round(v.count > 0 ? v.pnl / v.count : 0) ?? 0,
      win_rate: total > 0 ? Math.round((v.wins / total) * 100) : 0,
    }
  }).sort((a, b) => DAY_LABELS.indexOf(a.day) - DAY_LABELS.indexOf(b.day))

  let bestDay: DayStat | null = null
  let worstDay: DayStat | null = null
  dayStats.forEach(d => {
    if (!bestDay || d.avg_pnl > bestDay.avg_pnl) bestDay = d
    if (!worstDay || d.avg_pnl < worstDay.avg_pnl) worstDay = d
  })

  // ─ Recent vs older (split window in half) ─
  const halfPoint = Math.floor(sortedAsc.length / 2)
  const olderHalf = sortedAsc.slice(0, halfPoint)
  const recentHalf = sortedAsc.slice(halfPoint)
  const periodOf = (rows: SessionRow[]): PeriodStats => {
    const w = rows.filter(s => s.result === 'win').length
    const l = rows.filter(s => s.result === 'loss').length
    const dec = w + l
    const rs = rows.map(s => safeParse(s.setup)?.r_result ?? safeParse(s.setup)?.avg_r).filter((v): v is number => typeof v === 'number')
    return {
      count: rows.length,
      pnl: round(rows.reduce((sum, s) => sum + Number(s.pnl), 0)) ?? 0,
      win_rate: dec > 0 ? Math.round((w / dec) * 100) : 0,
      avg_r: round(avg(rs)),
    }
  }

  // ─ Streaks ─
  let curSign = 0
  let curLen = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  sortedAsc.forEach(s => {
    if (s.result === 'win') {
      if (curSign === 1) curLen++
      else { curSign = 1; curLen = 1 }
      maxWinStreak = Math.max(maxWinStreak, curLen)
    } else if (s.result === 'loss') {
      if (curSign === -1) curLen++
      else { curSign = -1; curLen = 1 }
      maxLossStreak = Math.max(maxLossStreak, curLen)
    } else { curSign = 0; curLen = 0 }
  })
  const currentStreak: Stats['current_streak'] = {
    type: curSign === 1 ? 'win' : curSign === -1 ? 'loss' : 'none',
    length: curLen,
  }

  // ─ R distribution ─
  const sessionRs: number[] = sessions
    .map(s => safeParse(s.setup)?.r_result ?? safeParse(s.setup)?.avg_r)
    .filter((v): v is number => typeof v === 'number')
  const rDist: RDistribution = {
    lt_minus2: sessionRs.filter(r => r < -2).length,
    m2_to_m1: sessionRs.filter(r => r >= -2 && r < -1).length,
    m1_to_0: sessionRs.filter(r => r >= -1 && r < 0).length,
    z0_to_1: sessionRs.filter(r => r >= 0 && r < 1).length,
    p1_to_2: sessionRs.filter(r => r >= 1 && r < 2).length,
    gt_2: sessionRs.filter(r => r >= 2).length,
  }

  // ─ Plan score correlation ─
  const sessionsWithPlan = sessions.map(s => ({ s, meta: safeParse(s.setup) })).filter(x => typeof x.meta?.plan_score === 'number')
  const highPlan = sessionsWithPlan.filter(x => (x.meta!.plan_score as number) >= 8)
  const lowPlan = sessionsWithPlan.filter(x => (x.meta!.plan_score as number) < 8)
  const planScoreCorrelation = {
    count_high_plan: highPlan.length,
    count_low_plan: lowPlan.length,
    avg_pnl_high_plan: round(avg(highPlan.map(x => Number(x.s.pnl)))),
    avg_pnl_low_plan: round(avg(lowPlan.map(x => Number(x.s.pnl)))),
    avg_plan_score: round(avg(sessionsWithPlan.map(x => x.meta!.plan_score as number))),
  }

  // ─ Mood ─
  const moodMap: Record<string, { count: number; pnl: number; wins: number; losses: number }> = {}
  sessions.forEach(s => {
    const m = safeParse(s.setup)?.mood
    if (!m) return
    if (!moodMap[m]) moodMap[m] = { count: 0, pnl: 0, wins: 0, losses: 0 }
    moodMap[m].count++
    moodMap[m].pnl += Number(s.pnl)
    if (s.result === 'win') moodMap[m].wins++
    if (s.result === 'loss') moodMap[m].losses++
  })
  const moodStats = Object.entries(moodMap).map(([mood, v]) => {
    const total = v.wins + v.losses
    return {
      mood,
      count: v.count,
      avg_pnl: round(v.count > 0 ? v.pnl / v.count : 0) ?? 0,
      win_rate: total > 0 ? Math.round((v.wins / total) * 100) : 0,
    }
  }).sort((a, b) => b.avg_pnl - a.avg_pnl)
  const bestMood = moodStats[0] || null

  // ─ Accounts ─
  const accountMap: Record<string, { count: number; pnl: number }> = {}
  sessions.forEach(s => {
    const ids = safeParse(s.setup)?.account_ids || []
    ids.forEach(id => {
      if (!accountMap[id]) accountMap[id] = { count: 0, pnl: 0 }
      accountMap[id].count++
      accountMap[id].pnl += Number(s.pnl) / Math.max(1, ids.length)
    })
  })
  const topAccounts: AccountStat[] = Object.entries(accountMap)
    .map(([account_id, d]) => ({ account_id, count: d.count, pnl: round(d.pnl) ?? 0 }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5)

  // ─ Trades distribution ─
  const tradesDist = {
    light_1_3: sessions.filter(s => s.trades_count >= 1 && s.trades_count <= 3).length,
    medium_4_6: sessions.filter(s => s.trades_count >= 4 && s.trades_count <= 6).length,
    heavy_7_plus: sessions.filter(s => s.trades_count >= 7).length,
  }

  // ─ Sessions/week ─
  let avgSessionsPerWeek: number | null = null
  if (sessions.length > 0) {
    const dates = sessions.map(s => new Date(s.session_date).getTime())
    const minD = Math.min(...dates)
    const maxD = Math.max(...dates)
    const spanDays = Math.max(1, (maxD - minD) / (1000 * 60 * 60 * 24))
    const spanWeeks = spanDays / 7
    avgSessionsPerWeek = round(sessions.length / Math.max(1, spanWeeks))
  }

  // ─ Notes ─
  const setupData = sessions.map(s => safeParse(s.setup)).filter((x): x is SessionMeta => x !== null)
  const recentTechNotes = setupData.map(s => s.technical_analysis).filter((x): x is string => !!x).slice(0, 8)
  const recentPsychoNotes = setupData.map(s => s.psychological_analysis).filter((x): x is string => !!x).slice(0, 8)
  const recentImprovements = setupData.map(s => s.improvement).filter((x): x is string => !!x).slice(0, 8)

  // ─ Backtests ─
  const setupBtMap: Record<string, { wins: number; total: number; rs: number[] }> = {}
  backtests.forEach(b => {
    (b.setup_types || []).forEach(st => {
      if (!setupBtMap[st]) setupBtMap[st] = { wins: 0, total: 0, rs: [] }
      setupBtMap[st].total++
      if (b.result === 'win') setupBtMap[st].wins++
      if (typeof b.r_result === 'number') setupBtMap[st].rs.push(Number(b.r_result))
    })
  })
  const topSetupsBacktest: BtSetupStat[] = Object.entries(setupBtMap)
    .filter(([, s]) => s.total >= 3)
    .map(([name, s]) => ({
      name,
      wr: Math.round((s.wins / s.total) * 100),
      n: s.total,
      avg_r: round(avg(s.rs)) ?? 0,
    }))
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 8)

  const signalMap: Record<string, { wins: number; total: number }> = {}
  backtests.forEach(b => {
    (b.signals || []).forEach(sig => {
      if (!signalMap[sig]) signalMap[sig] = { wins: 0, total: 0 }
      signalMap[sig].total++
      if (b.result === 'win') signalMap[sig].wins++
    })
  })
  const topSignalsBacktest: BtSignalStat[] = Object.entries(signalMap)
    .filter(([, s]) => s.total >= 3)
    .map(([name, s]) => ({ name, wr: Math.round((s.wins / s.total) * 100), n: s.total }))
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 5)

  const conflTrades = backtests.filter(b => b.has_confluence)
  const singleTrades = backtests.filter(b => !b.has_confluence)
  const winRateOf = (rows: BacktestRow[]): number => {
    const w = rows.filter(b => b.result === 'win').length
    const l = rows.filter(b => b.result === 'loss').length
    const tot = w + l
    return tot > 0 ? Math.round((w / tot) * 100) : 0
  }
  const confluenceComparison = {
    with_confluence: { count: conflTrades.length, win_rate: winRateOf(conflTrades), avg_r: round(avg(conflTrades.map(b => Number(b.r_result)))) },
    without_confluence: { count: singleTrades.length, win_rate: winRateOf(singleTrades), avg_r: round(avg(singleTrades.map(b => Number(b.r_result)))) },
  }

  const tfRegex = /\b(M5|M15|M30|H1|H4|D1)\b/i
  const tfMap: Record<string, { wins: number; total: number }> = {}
  backtests.forEach(b => {
    const m = (b.notes || '').match(tfRegex)
    if (!m) return
    const tf = m[1].toUpperCase()
    if (!tfMap[tf]) tfMap[tf] = { wins: 0, total: 0 }
    tfMap[tf].total++
    if (b.result === 'win') tfMap[tf].wins++
  })
  const timeframeStats = Object.entries(tfMap)
    .filter(([, s]) => s.total >= 2)
    .map(([name, s]) => ({ name, wr: Math.round((s.wins / s.total) * 100), n: s.total }))
    .sort((a, b) => b.wr - a.wr)

  const avgPlan = setupData.length
    ? round(avg(setupData.map(s => s.plan_score).filter((n): n is number => typeof n === 'number')) ?? 0, 1)
    : null

  return {
    period_label: opts.periodLabel || `${opts.from} → ${opts.to}`,
    period_from: opts.from,
    period_to: opts.to,
    period_days: Math.max(1, Math.round((new Date(opts.to).getTime() - new Date(opts.from).getTime()) / (1000 * 60 * 60 * 24)) + 1),
    sessions_count: sessions.length,
    backtests_count: backtests.length,
    total_pnl: round(totalPnl) ?? 0,
    win_rate: winRate,
    wins, losses, breakevens,
    profit_factor: profitFactor,
    expectancy: round(expectancy),
    avg_winner_eur: round(avgWinner),
    avg_loser_eur: round(avgLoser),
    risk_reward: round(riskReward),
    avg_plan_score: avgPlan,
    avg_sessions_per_week: avgSessionsPerWeek,
    trades_count_total: tradesCountTotal,
    max_drawdown: Math.round(maxDrawdown),
    max_drawdown_pct: maxDdPct,
    max_run_up: Math.round(maxRunUp),
    max_win_streak: maxWinStreak,
    max_loss_streak: maxLossStreak,
    current_streak: currentStreak,
    best_day_value: Math.round(bestDayValue),
    worst_day_value: Math.round(worstDayValue),
    r_distribution: rDist,
    trades_distribution: tradesDist,
    day_of_week: dayStats,
    best_day: bestDay,
    worst_day: worstDay,
    recent_vs_older: { recent: periodOf(recentHalf), older: periodOf(olderHalf) },
    instruments: instrumentStats,
    mood_stats: moodStats,
    best_mood: bestMood,
    plan_score_correlation: planScoreCorrelation,
    top_accounts: topAccounts,
    top_setups_backtest: topSetupsBacktest,
    top_signals_backtest: topSignalsBacktest,
    best_timeframe: timeframeStats[0] || null,
    timeframe_stats: timeframeStats,
    confluence_comparison: confluenceComparison,
    equity_curve: equityCurve,
    daily_pnl: dailyPnL,
    win_rate_rolling: winRateRolling,
    recent_tech_notes: recentTechNotes,
    recent_psycho_notes: recentPsychoNotes,
    recent_improvements: recentImprovements,
  }
}

/**
 * Build a compact context object for the AI prompt — strips noisy / large series
 * (equity curve, daily series, rolling win rate) and keeps the actionable signals.
 */
export function compactContext(stats: Stats): Record<string, unknown> {
  return {
    periode: stats.period_label,
    sessions_total: stats.sessions_count,
    pnl_total_eur: stats.total_pnl,
    win_rate_pct: stats.win_rate,
    wins_losses: `${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE`,
    profit_factor: stats.profit_factor,
    expectancy_eur: stats.expectancy,
    avg_winner_eur: stats.avg_winner_eur,
    avg_loser_eur: stats.avg_loser_eur,
    risk_reward: stats.risk_reward,
    max_drawdown_eur: stats.max_drawdown,
    max_drawdown_pct: stats.max_drawdown_pct,
    respect_plan_moyen: stats.avg_plan_score,
    sessions_par_semaine: stats.avg_sessions_per_week,
    plus_grosse_serie_pertes: stats.max_loss_streak,
    plus_grosse_serie_gains: stats.max_win_streak,
    streak_actuel: stats.current_streak,
    meilleur_jour_valeur_eur: stats.best_day_value,
    pire_jour_valeur_eur: stats.worst_day_value,
    tendance_recent_vs_older: stats.recent_vs_older,
    jours_de_semaine: stats.day_of_week,
    meilleur_jour: stats.best_day,
    pire_jour: stats.worst_day,
    top_instruments: stats.instruments,
    mood_stats: stats.mood_stats,
    meilleur_mood: stats.best_mood,
    correlation_plan_score: stats.plan_score_correlation,
    r_distribution: stats.r_distribution,
    trades_par_session: stats.trades_distribution,
    meilleurs_setups_backtest: stats.top_setups_backtest,
    meilleurs_signaux_backtest: stats.top_signals_backtest,
    meilleure_unite_temps: stats.best_timeframe,
    confluence_vs_simple: stats.confluence_comparison,
    notes_techniques_recentes: stats.recent_tech_notes,
    notes_psycho_recentes: stats.recent_psycho_notes,
    points_amelioration_recents: stats.recent_improvements,
  }
}
