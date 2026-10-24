/**
 * /api/backtest/criteria/categories/[id]
 *
 * PATCH  → met à jour { label?, selection?, timeframes?, position?, hidden? }
 * DELETE → supprime la catégorie et toutes ses options (CASCADE).
 *          Les backtests existants gardent leur JSONB — les anciennes
 *          valeurs restent lisibles côté UI/metrics.
 *
 * RLS own-only sur trader_criteria_categories → DB coupe toute action
 * cross-trader. On vérifie quand même l'appartenance pour renvoyer un
 * 404 propre au lieu de laisser silencieusement passer un no-op.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const SELECTIONS = new Set(['single', 'multi', 'paired'])

type Params = { params: Promise<{ id: string }> }

async function requireOwnedCategory(id: string) {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, cat: null, err: new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }
  const { data: cat } = await supabase
    .from('trader_criteria_categories')
    .select('id, trader_id')
    .eq('id', id)
    .eq('trader_id', user.id)
    .maybeSingle()
  if (!cat) return { supabase, user, cat: null, err: new NextResponse(JSON.stringify({ error: 'not_found' }), { status: 404 }) }
  return { supabase, user, cat, err: null }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, cat, err } = await requireOwnedCategory(id)
  if (err) return err
  if (!cat) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const { label, selection, timeframes, position, hidden } = body as Record<string, unknown>

  if (typeof label === 'string') {
    const l = label.trim()
    if (!l) return NextResponse.json({ error: 'label_required' }, { status: 400 })
    patch.label = l
  }
  if (typeof selection === 'string') {
    if (!SELECTIONS.has(selection)) return NextResponse.json({ error: 'invalid_selection' }, { status: 400 })
    patch.selection = selection
  }
  if (Array.isArray(timeframes)) {
    patch.timeframes = timeframes
      .filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 8)
      .slice(0, 16)
  }
  if (typeof position === 'number' && Number.isFinite(position)) {
    patch.position = Math.max(0, Math.floor(position))
  }
  if (typeof hidden === 'boolean') patch.hidden = hidden

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no_fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('trader_criteria_categories')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, err } = await requireOwnedCategory(id)
  if (err) return err

  const { error } = await supabase
    .from('trader_criteria_categories')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
