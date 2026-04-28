import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SessionRow {
  session_date: string
  pnl: number
  result: string
  trades_count: number
  instrument: string
  setup: string | null
  notes: string | null
}

interface BacktestRow {
  date: string
  instrument: string
  direction: string
  setup_types: string[]
  signals: string[]
  has_confluence: boolean
  r_result: number
  result: string
}

export async function POST() {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch last 30 days of sessions
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromDate = thirtyDaysAgo.toISOString().split('T')[0]

    const [sessionsRes, backtestsRes] = await Promise.all([
      supabase.from('trading_sessions').select('*').eq('trader_id', user.id).gte('session_date', fromDate).order('session_date', { ascending: false }),
      supabase.from('backtests').select('*').eq('trader_id', user.id).gte('date', fromDate),
    ])

    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]

    if (sessions.length === 0 && backtests.length === 0) {
      return NextResponse.json({ error: 'Pas assez de données pour une analyse. Enregistre au moins 1 session ou 1 backtest.' }, { status: 400 })
    }

    // Aggregate stats
    const totalPnl = sessions.reduce((s, x) => s + Number(x.pnl), 0)
    const wins = sessions.filter(s => s.result === 'win').length
    const losses = sessions.filter(s => s.result === 'loss').length
    const winRate = sessions.length > 0 ? Math.round((wins / sessions.length) * 100) : 0
    const grossWin = sessions.filter(s => Number(s.pnl) > 0).reduce((sum, s) => sum + Number(s.pnl), 0)
    const grossLoss = Math.abs(sessions.filter(s => Number(s.pnl) < 0).reduce((sum, s) => sum + Number(s.pnl), 0))
    const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '∞'

    // Parse setup data for psychological/technical insights
    const setupData = sessions.map(s => {
      try { return s.setup ? JSON.parse(s.setup) : null } catch { return null }
    }).filter(Boolean)

    const planScores = setupData.map(s => s.plan_score).filter(n => typeof n === 'number')
    const avgPlan = planScores.length > 0 ? (planScores.reduce((a, b) => a + b, 0) / planScores.length).toFixed(1) : 'N/A'

    const techNotes = setupData.map(s => s.technical_analysis).filter(Boolean).slice(0, 10)
    const psychoNotes = setupData.map(s => s.psychological_analysis).filter(Boolean).slice(0, 10)
    const improvements = setupData.map(s => s.improvement).filter(Boolean).slice(0, 10)

    // Streaks
    let maxLossStreak = 0
    let currentLossStreak = 0
    sessions.slice().reverse().forEach(s => {
      if (s.result === 'loss') { currentLossStreak++; maxLossStreak = Math.max(maxLossStreak, currentLossStreak) }
      else currentLossStreak = 0
    })

    // Backtest setup performance
    const setupStats: Record<string, { wins: number; total: number }> = {}
    backtests.forEach(b => {
      b.setup_types.forEach(st => {
        if (!setupStats[st]) setupStats[st] = { wins: 0, total: 0 }
        setupStats[st].total++
        if (b.result === 'win') setupStats[st].wins++
      })
    })
    const topSetups = Object.entries(setupStats)
      .filter(([, s]) => s.total >= 3)
      .map(([name, s]) => ({ name, wr: Math.round((s.wins / s.total) * 100), n: s.total }))
      .sort((a, b) => b.wr - a.wr)
      .slice(0, 5)

    // Build compact context for AI
    const context = {
      periode: '30 derniers jours',
      sessions_total: sessions.length,
      pnl_total_eur: totalPnl.toFixed(2),
      win_rate_pct: winRate,
      wins_losses: `${wins}W / ${losses}L`,
      profit_factor: profitFactor,
      respect_plan_moyen: avgPlan,
      plus_grosse_serie_pertes: maxLossStreak,
      meilleurs_setups_backtest: topSetups,
      derniere_session: sessions[0] ? { date: sessions[0].session_date, pnl: sessions[0].pnl, instrument: sessions[0].instrument } : null,
      notes_techniques_recentes: techNotes,
      notes_psycho_recentes: psychoNotes,
      points_amelioration_recents: improvements,
    }

    const prompt = `Tu es un coach trading senior expert. Tu analyses les données réelles d'un de tes élèves traders sur les 30 derniers jours pour lui donner un diagnostic actionnable.

DONNÉES DU TRADER:
${JSON.stringify(context, null, 2)}

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "verdict_general": "1-2 phrases qui résument l'état général (positif/négatif, ce qui ressort le plus)",
  "forces": ["3 forces concrètes basées sur les données, courtes (1 phrase chacune)"],
  "faiblesses": ["3 faiblesses identifiées, courtes (1 phrase chacune)"],
  "patterns_detectes": ["3 patterns récurrents (ex: revenge trading après perte, plan_score qui chute en fin de semaine, etc.)"],
  "actions_concretes": ["3 actions précises à appliquer cette semaine, format: 'Faire X parce que Y'"],
  "discipline_note_sur_10": 7,
  "psychologie_note_sur_10": 6,
  "methode_note_sur_10": 8,
  "message_motivant": "1 phrase de fin, ton coach bienveillant mais exigeant"
}

Sois concret, basé sur les chiffres. Pas de banalités. Si une donnée manque, dis-le.`

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
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
      stats: {
        sessions_count: sessions.length,
        backtests_count: backtests.length,
        total_pnl: totalPnl,
        win_rate: winRate,
        profit_factor: profitFactor,
      }
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
