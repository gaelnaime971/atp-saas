/**
 * /api/backtest/criteria/options/[id]
 *
 * PATCH  → { label?, position?, hidden? }
 *          Les options ATP ne peuvent pas changer de `value` (clé stable
 *          écrite dans backtests.criteria). Les customs non plus — on
 *          supprime puis on recrée si besoin.
 * DELETE → une option ATP se MASQUE (hidden=true), elle ne se supprime
 *          JAMAIS physiquement (sinon seed suivant la recrée). Les
 *          options custom se suppriment librement — les backtests
 *          existants qui référencent la valeur par string la gardent.
 *
 * Vérifie l'appartenance de la catégorie au trader (RLS fait la même
 * chose côté DB, mais 404 explicite = plus lisible côté UI).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

interface OptionRow { id: string; category_id: string; origin: 'atp' | 'custom' }

async function requireOwnedOption(id: string) {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { supabase, user: null, option: null, err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: option } = await supabase
    .from('trader_criteria_options')
    .select('id, category_id, origin, trader_criteria_categories!inner(trader_id)')
    .eq('id', id)
    .maybeSingle()
  if (!option) {
    return { supabase, user, option: null, err: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }
  const traderId = (option as unknown as { trader_criteria_categories: { trader_id: string } })
    .trader_criteria_categories?.trader_id
  if (traderId !== user.id) {
    return { supabase, user, option: null, err: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }
  const typed: OptionRow = {
    id: (option as { id: string }).id,
    category_id: (option as { category_id: string }).category_id,
    origin: (option as { origin: 'atp' | 'custom' }).origin,
  }
  return { supabase, user, option: typed, err: null }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, option, err } = await requireOwnedOption(id)
  if (err) return err
  if (!option) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  const { label, position, hidden } = body as Record<string, unknown>

  if (typeof label === 'string') {
    const l = label.trim()
    if (!l) return NextResponse.json({ error: 'label_required' }, { status: 400 })
    patch.label = l
  }
  if (typeof position === 'number' && Number.isFinite(position)) {
    patch.position = Math.max(0, Math.floor(position))
  }
  if (typeof hidden === 'boolean') patch.hidden = hidden

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no_fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('trader_criteria_options')
    .update(patch)
    .eq('id', id)
    .select('id,category_id,value,label,origin,hidden,position')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ option: data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, option, err } = await requireOwnedOption(id)
  if (err) return err
  if (!option) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Option ATP : masquer, pas supprimer (sinon seed la ressusciterait).
  if (option.origin === 'atp') {
    const { data, error } = await supabase
      .from('trader_criteria_options')
      .update({ hidden: true })
      .eq('id', id)
      .select('id,category_id,value,label,origin,hidden,position')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ option: data, action: 'hidden' })
  }

  // Option custom : suppression physique. Les backtests existants qui
  // référencent cette valeur par string la gardent (JSONB ≠ FK).
  const { error } = await supabase
    .from('trader_criteria_options')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'deleted' })
}
