import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { reconcileRuleTriggered } from '@/lib/jarvis/session-write'
import { DEFAULT_RULES, type TraderRules } from '@/lib/jarvis/rules-engine'

export const runtime = 'nodejs'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

interface Params { id: string }

/** Vérifie que l'event appartient bien au trader avant toute écriture. */
async function assertOwnership(eventId: string, userId: string): Promise<boolean> {
  const supabase = serviceClient()
  const { data } = await supabase.from('jarvis_session_events')
    .select('id, user_id, type')
    .eq('id', eventId)
    .maybeSingle()
  if (!data) return false
  if (data.user_id !== userId) return false
  if (data.type !== 'trade') return false // seuls les trades sont modifiables/supprimables côté UI
  return true
}

/** Charge les règles perso du trader (défauts ATP si absente). */
async function loadRules(userId: string): Promise<TraderRules> {
  const supabase = serviceClient()
  const { data } = await supabase.from('trader_personal_rules')
    .select('*').eq('user_id', userId).maybeSingle()
  if (!data) return DEFAULT_RULES
  const d = data as Partial<TraderRules>
  return {
    risk_per_trade_usd:          Number(d.risk_per_trade_usd ?? DEFAULT_RULES.risk_per_trade_usd),
    max_trades:                  Number(d.max_trades ?? DEFAULT_RULES.max_trades),
    stop_after_losses:           Number(d.stop_after_losses ?? DEFAULT_RULES.stop_after_losses),
    target_r:                    Number(d.target_r ?? DEFAULT_RULES.target_r),
    stop_after_first_win:        d.stop_after_first_win ?? DEFAULT_RULES.stop_after_first_win,
    stop_after_loss_win:         d.stop_after_loss_win ?? DEFAULT_RULES.stop_after_loss_win,
    same_config_hard_stop_after: Number(d.same_config_hard_stop_after ?? DEFAULT_RULES.same_config_hard_stop_after),
    min_ratio:                   Number(d.min_ratio ?? DEFAULT_RULES.min_ratio),
  }
}

/**
 * PATCH /api/jarvis/events/[id]
 * Body: { result_r?, result_usd?, instrument?, side?, config? }
 * Un seul event, propriétaire uniquement, type 'trade'.
 */
export async function PATCH(request: Request, context: { params: Promise<Params> }) {
  const auth = await requireJarvisAccessFast()
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  if (!(await assertOwnership(id, userId))) {
    return new NextResponse(null, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'payload invalide' }, { status: 400 })

  // On lit l'event existant pour merger
  const supabase = serviceClient()
  const { data: current } = await supabase.from('jarvis_session_events')
    .select('payload')
    .eq('id', id).maybeSingle()
  if (!current) return new NextResponse(null, { status: 404 })

  const nextPayload = { ...(current.payload as Record<string, unknown>) }
  for (const key of ['result_r', 'result_usd', 'instrument', 'side', 'config'] as const) {
    if (key in body) {
      const v = body[key]
      if (v === null || typeof v === 'number' || typeof v === 'string') {
        nextPayload[key] = v
      }
    }
  }
  // Toujours forcer source=declared + pending=false
  nextPayload.source = 'declared'
  nextPayload.pending = false

  const { error } = await supabase.from('jarvis_session_events')
    .update({ payload: nextPayload }).eq('id', id)
  if (error) return NextResponse.json({ error: 'update failed' }, { status: 500 })

  // Reconcile : le trade modifié peut invalider une règle déjà annoncée
  // (ex: first_win sur un +1R devenu -1R → la règle n'est plus vraie,
  //  on supprime le rule_triggered correspondant pour que la session
  //  reprenne sans trade_after_stop fantôme).
  const rules = await loadRules(userId)
  const snapshot = await reconcileRuleTriggered(userId, rules)
  return NextResponse.json({ ok: true, payload: nextPayload, session: snapshot })
}

/** DELETE /api/jarvis/events/[id] — propriétaire + type trade uniquement. */
export async function DELETE(_request: Request, context: { params: Promise<Params> }) {
  const auth = await requireJarvisAccessFast()
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  if (!(await assertOwnership(id, userId))) {
    return new NextResponse(null, { status: 404 })
  }

  const supabase = serviceClient()
  const { error } = await supabase.from('jarvis_session_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'delete failed' }, { status: 500 })

  const rules = await loadRules(userId)
  const snapshot = await reconcileRuleTriggered(userId, rules)
  return NextResponse.json({ ok: true, session: snapshot })
}
