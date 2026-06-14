import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeStats, compactContext, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'

interface RequestBody {
  from?: string
  to?: string
  periodLabel?: string
  instrument?: string | null
  accountId?: string | null
  direction?: string | null
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Defaults to last 60 days for backwards compatibility
    let body: RequestBody = {}
    try { body = (await request.json()) as RequestBody } catch { /* empty body OK */ }

    const todayISO = new Date().toISOString().slice(0, 10)
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const defaultFrom = sixtyDaysAgo.toISOString().slice(0, 10)

    const opts: MetricsOptions = {
      from: body.from || defaultFrom,
      to: body.to || todayISO,
      periodLabel: body.periodLabel,
      instrument: body.instrument || null,
      accountId: body.accountId || null,
      direction: body.direction || null,
    }

    const [sessionsRes, backtestsRes] = await Promise.all([
      supabase.from('trading_sessions')
        .select('session_date,pnl,result,trades_count,instrument,setup,notes')
        .eq('trader_id', user.id)
        .gte('session_date', opts.from)
        .lte('session_date', opts.to)
        .order('session_date', { ascending: false }),
      supabase.from('backtests')
        .select('date,instrument,direction,setup_types,signals,has_confluence,r_result,result,notes')
        .eq('trader_id', user.id)
        .gte('date', opts.from)
        .lte('date', opts.to),
    ])

    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]

    if (sessions.length === 0 && backtests.length === 0) {
      return NextResponse.json({ error: 'Pas assez de données sur cette période. Enregistre au moins 1 session ou 1 backtest dans la plage choisie.' }, { status: 400 })
    }

    const stats = computeStats(sessions, backtests, opts)
    const context = compactContext(stats)

    const prompt = `Tu es un coach trading senior expert (10+ ans d'expérience prop firm). Tu analyses les données réelles de ton élève sur la période "${stats.period_label}" pour lui donner un diagnostic complet, nuancé et ACTIONNABLE. Ton ton est exigeant mais bienveillant, direct, sans banalités.

DONNÉES DU TRADER (${stats.period_from} → ${stats.period_to}, ${stats.sessions_count} sessions):
${JSON.stringify(context, null, 2)}

INSTRUCTIONS:
- Base TOUTES tes observations sur les chiffres ci-dessus. Cite des chiffres précis (ex: "Tu fais 65% WR sur YM mais seulement 38% sur NQ").
- Identifie les VRAIS patterns (ex: revenge trading, plan score qui chute le vendredi, pertes plus grosses que gains, drawdown rapide après une série de gains, etc.)
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
    return NextResponse.json({ analysis: text, stats })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
