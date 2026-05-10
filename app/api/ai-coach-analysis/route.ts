import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SessionRow {
  session_date: string
  pnl: number
  result: string
  trades_count: number
  instrument: string | null
  setup: string | null
  notes: string | null
}

interface BacktestRow {
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

interface SessionMeta {
  plan_score?: number
  mood?: string
  technical_analysis?: string
  psychological_analysis?: string
  improvement?: string
  account_ids?: string[]
  // some sessions store r-multiple of the day or per-trade R
  r_result?: number
  avg_r?: number
}

interface InstrumentStat {
  instrument: string
  count: number
  pnl: number
  win_rate: number
  avg_r: number | null
}

interface DayStat {
  day: string
  count: number
  pnl: number
  avg_pnl: number
  win_rate: number
}

interface PeriodStats {
  count: number
  pnl: number
  win_rate: number
  avg_r: number | null
}

interface RDistribution {
  lt_minus2: number
  m2_to_m1: number
  m1_to_0: number
  z0_to_1: number
  p1_to_2: number
  gt_2: number
}

interface SetupBacktestStat {
  name: string
  wr: number
  n: number
  avg_r: number
}

interface AccountStat {
  account_id: string
  count: number
  pnl: number
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function safeParse(setup: string | null): SessionMeta | null {
  if (!setup) return null
  try {
    return JSON.parse(setup) as SessionMeta
  } catch {
    return null
  }
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function round(v: number | null, d = 2): number | null {
  if (v === null || !isFinite(v)) return null
  const m = Math.pow(10, d)
  return Math.round(v * m) / m
}

export async function POST() {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch last 60 days of sessions and backtests
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const fromDate = sixtyDaysAgo.toISOString().split('T')[0]

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const from30 = thirtyDaysAgo.toISOString().split('T')[0]

    const fifteenDaysAgo = new Date()
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15)
    const from15 = fifteenDaysAgo.toISOString().split('T')[0]

    const [sessionsRes, backtestsRes] = await Promise.all([
      supabase.from('trading_sessions').select('*').eq('trader_id', user.id).gte('session_date', fromDate).order('session_date', { ascending: false }),
      supabase.from('backtests').select('*').eq('trader_id', user.id).gte('date', fromDate),
    ])

    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]

    if (sessions.length === 0 && backtests.length === 0) {
      return NextResponse.json({ error: 'Pas assez de données pour une analyse. Enregistre au moins 1 session ou 1 backtest.' }, { status: 400 })
    }

    // ----- Global session metrics -----
    const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
    const wins = sessions.filter(s => s.result === 'win').length
    const losses = sessions.filter(s => s.result === 'loss').length
    const breakevens = sessions.filter(s => s.result === 'breakeven').length
    const decisive = wins + losses
    const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0
    const grossWin = sessions.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
    const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
    const profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null

    // Average winner / average loser / risk:reward
    const winnerPnls = sessions.filter(s => Number(s.pnl) > 0).map(s => Number(s.pnl))
    const loserPnls = sessions.filter(s => Number(s.pnl) < 0).map(s => Math.abs(Number(s.pnl)))
    const avgWinner = avg(winnerPnls)
    const avgLoser = avg(loserPnls)
    const riskReward = avgWinner !== null && avgLoser !== null && avgLoser > 0 ? avgWinner / avgLoser : null

    // ----- Per-instrument breakdown -----
    const instrumentMap: Record<string, { pnl: number; wins: number; losses: number; rs: number[] }> = {}
    sessions.forEach(s => {
      const inst = (s.instrument || 'INCONNU').toUpperCase()
      if (!instrumentMap[inst]) instrumentMap[inst] = { pnl: 0, wins: 0, losses: 0, rs: [] }
      instrumentMap[inst].pnl += Number(s.pnl)
      if (s.result === 'win') instrumentMap[inst].wins++
      if (s.result === 'loss') instrumentMap[inst].losses++
      const meta = safeParse(s.setup)
      const r = meta?.r_result ?? meta?.avg_r
      if (typeof r === 'number' && isFinite(r)) instrumentMap[inst].rs.push(r)
    })
    const instrumentStats: InstrumentStat[] = Object.entries(instrumentMap)
      .map(([instrument, d]) => {
        const total = d.wins + d.losses
        return {
          instrument,
          count: d.wins + d.losses + (instrumentMap[instrument] ? 0 : 0),
          pnl: round(d.pnl, 2) ?? 0,
          win_rate: total > 0 ? Math.round((d.wins / total) * 100) : 0,
          avg_r: round(avg(d.rs), 2),
        }
      })
      .map(i => ({ ...i, count: instrumentMap[i.instrument].wins + instrumentMap[i.instrument].losses + sessions.filter(s => (s.instrument || 'INCONNU').toUpperCase() === i.instrument && s.result === 'breakeven').length }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5)

    // ----- Day-of-week analysis -----
    const dayMap: Record<number, { count: number; pnl: number; wins: number; losses: number }> = {}
    sessions.forEach(s => {
      const d = new Date(s.session_date)
      const dow = d.getDay()
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
        pnl: round(v.pnl, 2) ?? 0,
        avg_pnl: round(v.count > 0 ? v.pnl / v.count : 0, 2) ?? 0,
        win_rate: total > 0 ? Math.round((v.wins / total) * 100) : 0,
      }
    }).sort((a, b) => DAY_LABELS.indexOf(a.day) - DAY_LABELS.indexOf(b.day))

    let bestDay: DayStat | null = null
    let worstDay: DayStat | null = null
    dayStats.forEach(d => {
      if (!bestDay || d.avg_pnl > bestDay.avg_pnl) bestDay = d
      if (!worstDay || d.avg_pnl < worstDay.avg_pnl) worstDay = d
    })

    // ----- Recent vs older (last 15 vs prior 15 within last 30) -----
    const sessionsLast30 = sessions.filter(s => s.session_date >= from30)
    const recent = sessionsLast30.filter(s => s.session_date >= from15)
    const older = sessionsLast30.filter(s => s.session_date < from15)

    const periodOf = (rows: SessionRow[]): PeriodStats => {
      const w = rows.filter(s => s.result === 'win').length
      const l = rows.filter(s => s.result === 'loss').length
      const dec = w + l
      const rs = rows.map(s => safeParse(s.setup)?.r_result ?? safeParse(s.setup)?.avg_r).filter((v): v is number => typeof v === 'number')
      return {
        count: rows.length,
        pnl: round(rows.reduce((sum, s) => sum + Number(s.pnl), 0), 2) ?? 0,
        win_rate: dec > 0 ? Math.round((w / dec) * 100) : 0,
        avg_r: round(avg(rs), 2),
      }
    }
    const recentStats = periodOf(recent)
    const olderStats = periodOf(older)

    // ----- Streaks (chronological) -----
    const sortedAsc = sessions.slice().sort((a, b) => a.session_date.localeCompare(b.session_date))
    let curStreakSign = 0 // +1 win, -1 loss, 0 none/be
    let curStreakLen = 0
    let maxWinStreak = 0
    let maxLossStreak = 0
    sortedAsc.forEach(s => {
      if (s.result === 'win') {
        if (curStreakSign === 1) curStreakLen++
        else { curStreakSign = 1; curStreakLen = 1 }
        maxWinStreak = Math.max(maxWinStreak, curStreakLen)
      } else if (s.result === 'loss') {
        if (curStreakSign === -1) curStreakLen++
        else { curStreakSign = -1; curStreakLen = 1 }
        maxLossStreak = Math.max(maxLossStreak, curStreakLen)
      } else {
        curStreakSign = 0
        curStreakLen = 0
      }
    })
    const currentStreak = { type: curStreakSign === 1 ? 'win' : curStreakSign === -1 ? 'loss' : 'none', length: curStreakLen }

    // ----- R-multiple distribution from sessions setup.r_result -----
    const sessionRs: number[] = sessions.map(s => safeParse(s.setup)?.r_result ?? safeParse(s.setup)?.avg_r).filter((v): v is number => typeof v === 'number')
    const rDist: RDistribution = {
      lt_minus2: sessionRs.filter(r => r < -2).length,
      m2_to_m1: sessionRs.filter(r => r >= -2 && r < -1).length,
      m1_to_0: sessionRs.filter(r => r >= -1 && r < 0).length,
      z0_to_1: sessionRs.filter(r => r >= 0 && r < 1).length,
      p1_to_2: sessionRs.filter(r => r >= 1 && r < 2).length,
      gt_2: sessionRs.filter(r => r >= 2).length,
    }

    // ----- Plan score correlation -----
    const sessionsWithPlan = sessions.map(s => ({ s, meta: safeParse(s.setup) })).filter(x => typeof x.meta?.plan_score === 'number')
    const highPlan = sessionsWithPlan.filter(x => (x.meta!.plan_score as number) >= 8)
    const lowPlan = sessionsWithPlan.filter(x => (x.meta!.plan_score as number) < 8)
    const planScoreCorrelation = {
      count_high_plan: highPlan.length,
      count_low_plan: lowPlan.length,
      avg_pnl_high_plan: round(avg(highPlan.map(x => Number(x.s.pnl))), 2),
      avg_pnl_low_plan: round(avg(lowPlan.map(x => Number(x.s.pnl))), 2),
      avg_plan_score: round(avg(sessionsWithPlan.map(x => x.meta!.plan_score as number)), 2),
    }

    // ----- Mood correlation -----
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
        avg_pnl: round(v.count > 0 ? v.pnl / v.count : 0, 2) ?? 0,
        win_rate: total > 0 ? Math.round((v.wins / total) * 100) : 0,
      }
    }).sort((a, b) => b.avg_pnl - a.avg_pnl)
    const bestMood = moodStats[0] || null

    // ----- Account breakdown -----
    const accountMap: Record<string, { count: number; pnl: number }> = {}
    sessions.forEach(s => {
      const ids = safeParse(s.setup)?.account_ids || []
      ids.forEach(id => {
        if (!accountMap[id]) accountMap[id] = { count: 0, pnl: 0 }
        accountMap[id].count++
        // Distribute P&L equally across accounts on the session
        accountMap[id].pnl += Number(s.pnl) / Math.max(1, ids.length)
      })
    })
    const topAccounts: AccountStat[] = Object.entries(accountMap)
      .map(([account_id, d]) => ({ account_id, count: d.count, pnl: round(d.pnl, 2) ?? 0 }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 3)

    // ----- Trades count distribution per session -----
    const tradesDist = {
      light_1_3: sessions.filter(s => s.trades_count >= 1 && s.trades_count <= 3).length,
      medium_4_6: sessions.filter(s => s.trades_count >= 4 && s.trades_count <= 6).length,
      heavy_7_plus: sessions.filter(s => s.trades_count >= 7).length,
    }

    // ----- Session frequency: avg sessions per week (over the actual span) -----
    let avgSessionsPerWeek: number | null = null
    if (sessions.length > 0) {
      const dates = sessions.map(s => new Date(s.session_date).getTime())
      const minD = Math.min(...dates)
      const maxD = Math.max(...dates)
      const spanDays = Math.max(1, (maxD - minD) / (1000 * 60 * 60 * 24))
      const spanWeeks = spanDays / 7
      avgSessionsPerWeek = round(sessions.length / Math.max(1, spanWeeks), 2)
    }

    // ----- Notes for AI context -----
    const setupData = sessions.map(s => safeParse(s.setup)).filter((x): x is SessionMeta => x !== null)
    const techNotes = setupData.map(s => s.technical_analysis).filter(Boolean).slice(0, 8)
    const psychoNotes = setupData.map(s => s.psychological_analysis).filter(Boolean).slice(0, 8)
    const improvements = setupData.map(s => s.improvement).filter(Boolean).slice(0, 8)
    const planScoresAll = setupData.map(s => s.plan_score).filter((n): n is number => typeof n === 'number')
    const avgPlan = planScoresAll.length > 0 ? Number((planScoresAll.reduce((a, b) => a + b, 0) / planScoresAll.length).toFixed(1)) : null

    // ----- Backtests aggregations -----
    const setupBtMap: Record<string, { wins: number; total: number; rs: number[] }> = {}
    backtests.forEach(b => {
      (b.setup_types || []).forEach(st => {
        if (!setupBtMap[st]) setupBtMap[st] = { wins: 0, total: 0, rs: [] }
        setupBtMap[st].total++
        if (b.result === 'win') setupBtMap[st].wins++
        if (typeof b.r_result === 'number') setupBtMap[st].rs.push(Number(b.r_result))
      })
    })
    const topSetupsBacktest: SetupBacktestStat[] = Object.entries(setupBtMap)
      .filter(([, s]) => s.total >= 3)
      .map(([name, s]) => ({
        name,
        wr: Math.round((s.wins / s.total) * 100),
        n: s.total,
        avg_r: round(avg(s.rs), 2) ?? 0,
      }))
      .sort((a, b) => b.wr - a.wr)
      .slice(0, 5)

    const signalMap: Record<string, { wins: number; total: number }> = {}
    backtests.forEach(b => {
      (b.signals || []).forEach(sig => {
        if (!signalMap[sig]) signalMap[sig] = { wins: 0, total: 0 }
        signalMap[sig].total++
        if (b.result === 'win') signalMap[sig].wins++
      })
    })
    const topSignalsBacktest = Object.entries(signalMap)
      .filter(([, s]) => s.total >= 3)
      .map(([name, s]) => ({ name, wr: Math.round((s.wins / s.total) * 100), n: s.total }))
      .sort((a, b) => b.wr - a.wr)
      .slice(0, 3)

    // Confluence vs single
    const conflTrades = backtests.filter(b => b.has_confluence)
    const singleTrades = backtests.filter(b => !b.has_confluence)
    const winRateOf = (rows: BacktestRow[]): number => {
      const w = rows.filter(b => b.result === 'win').length
      const l = rows.filter(b => b.result === 'loss').length
      const tot = w + l
      return tot > 0 ? Math.round((w / tot) * 100) : 0
    }
    const confluenceComparison = {
      with_confluence: { count: conflTrades.length, win_rate: winRateOf(conflTrades), avg_r: round(avg(conflTrades.map(b => Number(b.r_result))), 2) },
      without_confluence: { count: singleTrades.length, win_rate: winRateOf(singleTrades), avg_r: round(avg(singleTrades.map(b => Number(b.r_result))), 2) },
    }

    // Best timeframe — backtests don't have explicit TF column; try to infer from notes if present
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

    // Build full stats object for UI
    const fullStats = {
      period_days: 60,
      sessions_count: sessions.length,
      backtests_count: backtests.length,
      total_pnl: round(totalPnl, 2) ?? 0,
      win_rate: winRate,
      wins,
      losses,
      breakevens,
      profit_factor: profitFactor,
      avg_winner_eur: round(avgWinner, 2),
      avg_loser_eur: round(avgLoser, 2),
      risk_reward: round(riskReward, 2),
      avg_plan_score: avgPlan,
      avg_sessions_per_week: avgSessionsPerWeek,
      max_win_streak: maxWinStreak,
      max_loss_streak: maxLossStreak,
      current_streak: currentStreak,
      r_distribution: rDist,
      trades_distribution: tradesDist,
      day_of_week: dayStats,
      best_day: bestDay,
      worst_day: worstDay,
      recent_vs_older: { recent_15d: recentStats, older_15d: olderStats },
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
    }

    // Compact context to send to AI (smaller subset to reduce tokens but still rich)
    const context = {
      periode: '60 derniers jours',
      sessions_total: sessions.length,
      pnl_total_eur: fullStats.total_pnl,
      win_rate_pct: winRate,
      wins_losses: `${wins}W / ${losses}L / ${breakevens}BE`,
      profit_factor: profitFactor,
      avg_winner_eur: fullStats.avg_winner_eur,
      avg_loser_eur: fullStats.avg_loser_eur,
      risk_reward: fullStats.risk_reward,
      respect_plan_moyen: avgPlan,
      sessions_par_semaine: avgSessionsPerWeek,
      plus_grosse_serie_pertes: maxLossStreak,
      plus_grosse_serie_gains: maxWinStreak,
      streak_actuel: currentStreak,
      derniere_session: sessions[0] ? { date: sessions[0].session_date, pnl: Number(sessions[0].pnl), instrument: sessions[0].instrument, result: sessions[0].result } : null,
      tendance_15d_vs_15d_precedents: { recent: recentStats, prior: olderStats },
      jours_de_semaine: dayStats,
      meilleur_jour: bestDay,
      pire_jour: worstDay,
      top_instruments: instrumentStats,
      mood_stats: moodStats,
      meilleur_mood: bestMood,
      correlation_plan_score: planScoreCorrelation,
      r_distribution: rDist,
      trades_par_session: tradesDist,
      meilleurs_setups_backtest: topSetupsBacktest,
      meilleurs_signaux_backtest: topSignalsBacktest,
      meilleure_unite_temps: timeframeStats[0] || null,
      confluence_vs_simple: confluenceComparison,
      notes_techniques_recentes: techNotes,
      notes_psycho_recentes: psychoNotes,
      points_amelioration_recents: improvements,
    }

    const prompt = `Tu es un coach trading senior expert (10+ ans d'expérience prop firm). Tu analyses les données réelles de ton élève sur les 60 derniers jours pour lui donner un diagnostic complet, nuancé et ACTIONNABLE. Ton ton est exigeant mais bienveillant, direct, sans banalités.

DONNÉES DU TRADER:
${JSON.stringify(context, null, 2)}

INSTRUCTIONS:
- Base TOUTES tes observations sur les chiffres ci-dessus. Cite des chiffres précis (ex: "Tu fais 65% WR sur YM mais seulement 38% sur NQ").
- Identifie les VRAIS patterns (ex: revenge trading, plan score qui chute le vendredi, pertes plus grosses que gains, etc.)
- Sois nuancé: un faible win rate avec un fort R:R peut être OK.
- Si une donnée manque (instrument unique, peu de sessions, etc.), dis-le.
- Pour les "instruments_analysis", ne renvoie que les instruments présents dans top_instruments.
- Notes /10: sois honnête, pas de complaisance, mais reste cohérent avec les données.

Réponds UNIQUEMENT en JSON valide avec EXACTEMENT cette structure:
{
  "verdict_general": "2-3 phrases nuancées qui résument l'état général basé sur les chiffres",
  "trend_global": "PROGRESSION ou STAGNATION ou DEGRADATION",
  "trend_explanation": "1 phrase qui justifie la tendance avec les chiffres recent vs prior",
  "forces": [
    { "titre": "Titre court 4-6 mots", "detail": "2-3 phrases concrètes basées sur les chiffres", "impact": "ÉLEVÉ" }
  ],
  "faiblesses": [
    { "titre": "Titre court 4-6 mots", "detail": "2-3 phrases concrètes basées sur les chiffres", "impact": "ÉLEVÉ", "fix": "Action précise pour corriger ce point" }
  ],
  "patterns_detectes": [
    { "titre": "Pattern court", "detail": "Explication factuelle", "frequence": "X% des sessions ou X sessions sur Y" }
  ],
  "alertes": [
    { "niveau": "CRITIQUE", "message": "Message court et direct" }
  ],
  "actions_semaine": [
    { "action": "Action précise et mesurable", "priorite": "HAUTE", "metric_cible": "Comment mesurer le succès (chiffre concret)" }
  ],
  "instruments_analysis": [
    { "instrument": "YM", "verdict": "Verdict basé sur les chiffres pour cet instrument", "conseil": "Conseil spécifique à cet instrument" }
  ],
  "plan_jour_type": {
    "matin": "Routine pré-marché concrète (3-4 actions)",
    "session": "Comment aborder la session (règles claires)",
    "post_session": "Debriefing concret (questions à se poser)"
  },
  "objectifs_realistes": {
    "court_terme": "Objectif chiffré sur 7 jours",
    "moyen_terme": "Objectif chiffré sur 30 jours",
    "long_terme": "Objectif chiffré sur 90 jours"
  },
  "stop_doing": ["3 à 5 actions concrètes à arrêter"],
  "keep_doing": ["3 à 5 actions concrètes à garder"],
  "discipline_note_sur_10": 7,
  "psychologie_note_sur_10": 6,
  "methode_note_sur_10": 8,
  "gestion_risque_note_sur_10": 7,
  "consistance_note_sur_10": 5,
  "force_mentale_note_sur_10": 6,
  "message_motivant": "1 phrase puissante de coach, pas une banalité"
}

Donne 3 à 5 forces, 3 à 5 faiblesses, 2 à 4 patterns, 0 à 3 alertes, 3 à 5 actions_semaine.
IMPORTANT: réponds UNIQUEMENT le JSON, rien d'autre.`

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await r.json()
    if (data.error) {
      console.error('Groq error:', data.error)
      return NextResponse.json({ error: typeof data.error === 'string' ? data.error : data.error.message || 'Erreur API' }, { status: 500 })
    }

    const text = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({
      analysis: text,
      stats: fullStats,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
