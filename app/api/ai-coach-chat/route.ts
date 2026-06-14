import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeStats, compactContext, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  messages: ChatMessage[]
  from?: string
  to?: string
  periodLabel?: string
  instrument?: string | null
  accountId?: string | null
}

const SYSTEM = `Tu es le coach trading senior d'un trader. Tu as accès à ses statistiques chiffrées sur la période sélectionnée (fournies en début de conversation). Tu réponds aux questions du trader en t'appuyant TOUJOURS sur ses chiffres réels.

RÈGLES STRICTES :
- Cite les chiffres précis quand tu réponds (ex: "Tu fais 65% WR sur YM contre 38% sur NQ")
- Si la donnée manque ou est insuffisante, dis-le clairement ("Je n'ai pas assez de sessions le mercredi pour conclure")
- N'invente JAMAIS de chiffre
- Réponds en français, ton direct et exigeant mais bienveillant, sans banalités
- Garde tes réponses concises (3-8 phrases max sauf si on te demande un plan détaillé)
- Utilise des bullets ou des sauts de ligne pour la lisibilité quand tu listes des points
- Pas de markdown lourd, juste du texte propre avec quelques tirets si besoin
- Quand on te demande "pourquoi" un pattern, donne 2-3 causes probables basées sur les chiffres + 1 action concrète à tester
- Quand on te demande une comparaison, structure : période A vs période B + ce que ça révèle`

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages requis' }, { status: 400 })
    }

    const todayISO = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const opts: MetricsOptions = {
      from: body.from || thirtyDaysAgo.toISOString().slice(0, 10),
      to: body.to || todayISO,
      periodLabel: body.periodLabel,
      instrument: body.instrument || null,
      accountId: body.accountId || null,
      direction: null,
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
    const stats = computeStats(sessions, backtests, opts)
    const context = compactContext(stats)

    // Take only the last ~10 messages to keep payload small
    const trimmed = body.messages.slice(-10)

    const messages = [
      { role: 'system' as const, content: SYSTEM },
      {
        role: 'system' as const,
        content: `Statistiques du trader sur la période "${stats.period_label}" (${stats.period_from} → ${stats.period_to}) :

${JSON.stringify(context, null, 2)}`,
      },
      ...trimmed.map(m => ({ role: m.role, content: m.content })),
    ]

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        temperature: 0.4,
        messages,
      }),
    })

    const data = await r.json()
    if (data.error) {
      console.error('Coach chat error:', data.error)
      return NextResponse.json({ error: typeof data.error === 'string' ? data.error : data.error.message || 'Erreur API' }, { status: 500 })
    }

    const reply = data.choices?.[0]?.message?.content || ''
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Coach chat fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
