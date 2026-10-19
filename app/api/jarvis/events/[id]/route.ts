import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'

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

  return NextResponse.json({ ok: true, payload: nextPayload })
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
  return NextResponse.json({ ok: true })
}
