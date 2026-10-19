import { NextResponse, after } from 'next/server'
import { GROQ_TEXT_MODEL } from '@/lib/ai/groq-models'
import { createClient } from '@/lib/supabase/server'
import { computeStats, compactContext, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'
import { requireUser, checkAndCount, recordUsage, buildQuotaResponse, buildProviderErrorResponse } from '@/lib/ai/quota'

interface RequestBody {
  from?: string
  to?: string
  periodLabel?: string
  instrument?: string | null
  accountId?: string | null
  direction?: string | null
}

interface RoutineRow {
  routine_date: string
  confidence: number | null
  mental_note: string | null
  bias: string | null
  checks: Record<string, boolean> | null
}

/**
 * Agrège les routines pré-marché pour injection dans le prompt IA.
 * Zéro inférence côté serveur (pas de "jours de confiance faible = tilt")
 * — on fournit les chiffres bruts à l'IA, elle les croise avec les
 * sessions elle-même. On lui simplifie juste la vie en pré-mâchant les
 * distributions courantes et un extrait jour-par-jour corrélable à la date.
 */
function buildRoutineStats(
  routines: RoutineRow[],
  sessions: SessionRow[],
) {
  // Couverture : % des jours de trading couverts par une routine (30j).
  const windowStartMs = Date.now() - 30 * 86400000
  const tradingDaysInWindow = new Set(
    sessions
      .filter(s => new Date(s.session_date + 'T00:00:00').getTime() >= windowStartMs)
      .map(s => s.session_date),
  )
  const routineDatesInWindow = new Set(
    routines.map(r => r.routine_date),
  )
  let coveredCount = 0
  for (const d of tradingDaysInWindow) {
    if (routineDatesInWindow.has(d)) coveredCount++
  }

  // Confidence stats (ignore null = jamais touché le slider)
  const confVals = routines
    .map(r => r.confidence)
    .filter((c): c is number => typeof c === 'number')
  const confidence = {
    n_renseigne: confVals.length,
    moyenne: confVals.length
      ? Number((confVals.reduce((a, b) => a + b, 0) / confVals.length).toFixed(1))
      : null,
    min: confVals.length ? Math.min(...confVals) : null,
    max: confVals.length ? Math.max(...confVals) : null,
  }

  // Bias counts
  const biasCounts: Record<string, number> = {}
  for (const r of routines) {
    const b = (r.bias || '').trim() || 'non_renseigne'
    biasCounts[b] = (biasCounts[b] || 0) + 1
  }

  // Checks rate — agrège par label, calcule % de coche sur routines présentes
  const checkStats: Record<string, { coches: number, total: number }> = {}
  for (const r of routines) {
    if (!r.checks) continue
    for (const [label, val] of Object.entries(r.checks)) {
      const prev = checkStats[label] || { coches: 0, total: 0 }
      prev.total++
      if (val === true) prev.coches++
      checkStats[label] = prev
    }
  }
  const top_checks = Object.entries(checkStats)
    .map(([label, s]) => ({
      label,
      coches: s.coches,
      total: s.total,
      pct: s.total > 0 ? Math.round((s.coches / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // 5 dernières notes mentales non-vides (triées desc par date)
  const notes_recent = routines
    .filter(r => (r.mental_note || '').trim().length > 0)
    .slice(0, 5)
    .map(r => ({ date: r.routine_date, note: (r.mental_note || '').trim() }))

  // Vue jour-par-jour (10 derniers) — permet à l'IA de corréler avec le pnl
  // du MÊME jour via les trades_last_X_days du context existant.
  const routines_jour_par_jour = routines.slice(0, 10).map(r => {
    const checks = r.checks || {}
    const key_checks = ['Je suis reposé', 'Pas de stress externe', 'Mindset stable']
      .filter(k => k in checks)
      .map(k => ({ label: k, cochee: !!checks[k] }))
    return {
      date: r.routine_date,
      confidence: r.confidence,
      bias: r.bias || '',
      note: (r.mental_note || '').slice(0, 120),
      checks_mentaux: key_checks,
    }
  })

  return {
    couverture: {
      routines_total: routines.length,
      trading_days: tradingDaysInWindow.size,
      couverts: coveredCount,
      pct: tradingDaysInWindow.size > 0
        ? Math.round((coveredCount / tradingDaysInWindow.size) * 100)
        : 0,
    },
    confidence,
    bias_counts: biasCounts,
    top_checks,
    notes_recent,
    routines_jour_par_jour,
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return buildProviderErrorResponse({ route: '/api/ai-coach-analysis', detail: 'GROQ_API_KEY missing' })

    const auth = await requireUser()
    if (auth instanceof Response) return auth
    const { user, isAdmin } = auth
    const supabase = await createClient()

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

    // Routines pré-marché : fenêtre 30 derniers jours. Fournit à l'IA
    // Mental l'état déclaré AVANT chaque session (confidence, bias,
    // checks, notes). Fenêtre indépendante de opts.from (le prompt ne
    // peut pas raisonnablement regarder 60 jours de routines sans
    // exploser le contexte).
    const routinesFromDate = new Date()
    routinesFromDate.setDate(routinesFromDate.getDate() - 30)
    const routinesFrom = routinesFromDate.toISOString().slice(0, 10)

    const [sessionsRes, backtestsRes, routinesRes] = await Promise.all([
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
      supabase.from('pre_market_routines')
        .select('routine_date,confidence,mental_note,bias,checks')
        .eq('user_id', user.id)
        .gte('routine_date', routinesFrom)
        .order('routine_date', { ascending: false }),
    ])

    const sessions = (sessionsRes.data || []) as SessionRow[]
    const backtests = (backtestsRes.data || []) as BacktestRow[]
    const routines = (routinesRes.data || []) as RoutineRow[]

    if (sessions.length === 0 && backtests.length === 0) {
      return NextResponse.json({ error: 'Pas assez de données sur cette période. Enregistre au moins 1 session ou 1 backtest dans la plage choisie.' }, { status: 400 })
    }

    const stats = computeStats(sessions, backtests, opts)
    const context = compactContext(stats)
    const routine_stats = buildRoutineStats(routines, sessions)

    const prompt = `Tu es un coach trading senior expert (10+ ans d'expérience prop firm). Tu analyses les données réelles de ton élève sur la période "${stats.period_label}" pour lui donner un diagnostic complet, nuancé et ACTIONNABLE. Ton ton est exigeant mais bienveillant, direct, sans banalités.

DONNÉES DU TRADER (${stats.period_from} → ${stats.period_to}, ${stats.sessions_count} sessions):
${JSON.stringify(context, null, 2)}

ROUTINES PRÉ-MARCHÉ (30 derniers jours — état déclaré AVANT chaque session, c'est la source la plus directe pour l'analyse mentale) :
${JSON.stringify(routine_stats, null, 2)}

INSTRUCTIONS:
- DEVISE: tous les montants du trader sont en DOLLARS AMÉRICAINS (USD). Cite les chiffres avec le symbole "$" UNIQUEMENT, JAMAIS "€" ni "EUR". Exemples: "PnL de +2 400 $", "drawdown de -850 $", "objectif 500 $/jour". Aucune mention d'euros nulle part.
- Base TOUTES tes observations sur les chiffres ci-dessus. Cite des chiffres précis (ex: "Tu fais 65% WR sur YM mais seulement 38% sur NQ").
- Identifie les VRAIS patterns (ex: revenge trading, plan score qui chute le vendredi, pertes plus grosses que gains, drawdown rapide après une série de gains, etc.)
- Sois nuancé: un faible win rate avec un fort R:R peut être OK.
- Si une donnée manque (instrument unique, peu de sessions, etc.), dis-le.
- Pour les "instruments_analysis", ne renvoie que les instruments présents dans top_instruments.
- Notes /10: sois honnête, pas de complaisance, mais reste cohérent avec les données.
- BLOC MENTAL — OBLIGATOIRE. Le champ "analyse_mentale" est le différenciateur clé de ce produit (le trader a une formation neuroscience). PRIORITÉ ABSOLUE aux ROUTINES PRÉ-MARCHÉ ci-dessus — c'est l'état déclaré AVANT la session (confidence, bias, checks mentaux, note), la source la plus directe pour analyser le mental. Croise-les systématiquement avec les sessions du MÊME JOUR (match par date routine_date = session_date dans trades_last_X_days) :
  * Corrèle confidence déclarée ↔ pnl/winrate observé (ex: "Les jours à confidence ≤5, tu fais -120$ moyenne vs +230$ au-dessus de 8 — l'auto-évaluation précède le résultat").
  * Corrèle checks mentaux décochés ("Je suis reposé" ❌) ↔ plan_score bas ou pertes (ex: "4 jours sur 5 où tu n'as pas coché 'reposé' → plan_score chute à 4").
  * Cite des notes mentales récentes (notes_recent) QUAND ELLES EXPLIQUENT un résultat (ex: 'Note du 11/10 "fatigué" → -340$ ce jour-là').
  * Si couverture.pct <50% → le routine_stats n'est pas statistiquement significatif, mentionne-le et pousse "fais ta routine 2 semaines, on reparse".
  * Si routines absent/vide → verdict = "manque de données routine pour analyser le mental" + conseil_mental explicite.
  * Fallback historique : si pas assez de routines, utilise aussi mood_stats, meilleur_mood, notes_psycho_recentes, correlation_plan_score du context sessions (ce que l'IA avait avant).
Le verdict cite des chiffres réels issus de routine_stats. Le conseil_mental est une action MESURABLE fondée sur SES données (ex: "Coupe la session les jours où tu décoches 'reposé' : -75$ moyenne vs +180$ sinon" — PAS "reste calme" ni "respire", banalités interdites). tilt_signal enum strict {AUCUN, FAIBLE, MODERE, FORT} : AUCUN si régularité émotionnelle solide (confidence stable, checks mentaux ≥70% cochés) ET pas de chute plan_score en série pertes ; FORT si écart >30% WR entre moods/confidence OU chute plan_score >3 pts en série OU notes_recent mentionnent clairement "tilt/revanche/stress".

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
  "analyse_mentale": {
    "verdict": "1-2 phrases citant des chiffres réels de mood_stats/plan_correlation/notes_psycho. Ex: 'En 😊 tu fais 65% WR contre 32% en 😐 — ton état émotionnel est ton premier levier.'",
    "tilt_signal": "AUCUN ou FAIBLE ou MODERE ou FORT",
    "tilt_explication": "1 phrase sur le déclencheur observé dans les données. Ex: 'ton plan_score chute de 8 à 4 après 2 pertes consécutives.' Si tilt_signal=AUCUN, décris pourquoi la régularité est bonne.",
    "regularite_emotionnelle_note_sur_10": 7,
    "conseil_mental": "1 action MESURABLE basée sur SES données. Ex: 'Coupe la session à la 2e perte : ton plan_score chute de 8 à 4 après.' PAS de banalités type 'reste calme' / 'respire' / 'garde ton sang-froid'."
  },
  "message_motivant": "1 phrase puissante de coach, pas une banalité"
}

Donne 3 à 5 forces, 3 à 5 faiblesses, 2 à 4 patterns, 0 à 3 alertes, 3 à 5 actions_semaine.
IMPORTANT: réponds UNIQUEMENT le JSON, rien d'autre.`

    // ─── Quota IA : check + increment atomique AVANT fetch Groq ───
    // Comportement selon AI_QUOTA_MODE (défaut 'off' = bypass total).
    const quota = await checkAndCount(user.id, 'coach-analysis', isAdmin)
    if (!quota.allowed) return buildQuotaResponse(quota)

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await r.json()
    if (!r.ok || data.error) {
      return buildProviderErrorResponse({
        route: '/api/ai-coach-analysis', model: GROQ_TEXT_MODEL, status: r.status, detail: data.error,
      })
    }

    // ─── Record usage réel APRÈS retour Groq, via after() ───
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
    if (usage) {
      after(async () => {
        await recordUsage(user.id, 'coach-analysis', {
          tokensIn: usage.prompt_tokens ?? 0,
          tokensOut: usage.completion_tokens ?? 0,
          model: GROQ_TEXT_MODEL,
        })
      })
    }

    const text = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ analysis: text, stats })
  } catch (err) {
    return buildProviderErrorResponse({ route: '/api/ai-coach-analysis', model: GROQ_TEXT_MODEL, detail: err })
  }
}
