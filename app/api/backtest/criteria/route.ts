/**
 * /api/backtest/criteria
 *
 * GET  → liste des catégories + options du trader connecté. Si le trader
 *        n'a pas encore de catégories en base, appelle seed_trader_criteria()
 *        pour poser le catalogue ATP par défaut + reprendre ses customs.
 * POST → crée :
 *          { kind: 'category',  label, selection, timeframes? }
 *          { kind: 'option',    category_id, label, value? }
 *          { kind: 'template',  template_key: 'session'|'context'|
 *                                             'management'|'news'|'mindset' }
 *
 * RLS own-only sur les deux tables → le DB garantit déjà la ségrégation.
 * Les 401 restent explicites (pas de 404 : la route n'est pas secrète).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Selection = 'single' | 'multi' | 'paired'
const SELECTIONS: ReadonlySet<Selection> = new Set(['single', 'multi', 'paired'])
const TEMPLATE_KEYS: ReadonlySet<string> = new Set(['session', 'context', 'management', 'news', 'mindset'])

function slugify(input: string): string {
  return input
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'critere'
}

export async function GET() {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Si rien en base, seed (idempotent côté SQL).
  const { data: existing } = await supabase
    .from('trader_criteria_categories')
    .select('id')
    .eq('trader_id', user.id)
    .limit(1)
  if (!existing || existing.length === 0) {
    const { error: seedErr } = await supabase.rpc('seed_trader_criteria', { p_trader_id: user.id })
    if (seedErr) {
      console.error('[criteria] seed failed', seedErr)
      return NextResponse.json({ error: 'seed_failed' }, { status: 500 })
    }
  }

  const [catsRes, optsRes] = await Promise.all([
    supabase.from('trader_criteria_categories')
      .select('id,trader_id,key,label,selection,timeframes,position,hidden')
      .eq('trader_id', user.id)
      .order('position', { ascending: true }),
    supabase.from('trader_criteria_options')
      .select('id,category_id,value,label,origin,hidden,position')
      .order('position', { ascending: true }),
  ])
  if (catsRes.error) return NextResponse.json({ error: catsRes.error.message }, { status: 500 })
  if (optsRes.error) return NextResponse.json({ error: optsRes.error.message }, { status: 500 })

  return NextResponse.json({
    categories: catsRes.data ?? [],
    options: optsRes.data ?? [],
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const kind = (body as { kind?: unknown }).kind

  if (kind === 'template') {
    const tplKey = String((body as { template_key?: unknown }).template_key ?? '')
    if (!TEMPLATE_KEYS.has(tplKey)) {
      return NextResponse.json({ error: 'unknown_template' }, { status: 400 })
    }
    const { data, error } = await supabase.rpc('seed_backtest_criteria_template', {
      p_trader_id: user.id, p_template_key: tplKey,
    })
    if (error) {
      console.error('[criteria] template rpc failed', error)
      return NextResponse.json({ error: 'template_failed' }, { status: 500 })
    }
    return NextResponse.json({ category_id: data })
  }

  if (kind === 'category') {
    const label = String((body as { label?: unknown }).label ?? '').trim()
    const selection = (body as { selection?: unknown }).selection as Selection
    const tfsRaw = (body as { timeframes?: unknown }).timeframes
    if (!label) return NextResponse.json({ error: 'label_required' }, { status: 400 })
    if (!SELECTIONS.has(selection)) {
      return NextResponse.json({ error: 'invalid_selection' }, { status: 400 })
    }
    const timeframes: string[] = Array.isArray(tfsRaw)
      ? tfsRaw.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 8).slice(0, 16)
      : []
    if (selection === 'paired' && timeframes.length === 0) {
      return NextResponse.json({ error: 'paired_requires_timeframes' }, { status: 400 })
    }
    const key = slugify(label)
    // Position = max + 1 (atomique côté DB serait mieux mais le volume est très faible).
    const { data: last } = await supabase
      .from('trader_criteria_categories')
      .select('position')
      .eq('trader_id', user.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextPos = ((last?.position as number | undefined) ?? -1) + 1
    const { data, error } = await supabase
      .from('trader_criteria_categories')
      .insert({ trader_id: user.id, key, label, selection, timeframes, position: nextPos })
      .select('*')
      .maybeSingle()
    if (error) {
      // Doublon de clé (deux catégories au même nom)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'duplicate_label' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ category: data }, { status: 201 })
  }

  if (kind === 'option') {
    const categoryId = String((body as { category_id?: unknown }).category_id ?? '')
    const label = String((body as { label?: unknown }).label ?? '').trim()
    const rawValue = (body as { value?: unknown }).value
    if (!categoryId) return NextResponse.json({ error: 'category_id_required' }, { status: 400 })
    if (!label) return NextResponse.json({ error: 'label_required' }, { status: 400 })
    // Vérifie que la catégorie appartient au trader (RLS SELECT suffit déjà,
    // mais on vérifie pour renvoyer un 404 propre).
    const { data: cat } = await supabase
      .from('trader_criteria_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('trader_id', user.id)
      .maybeSingle()
    if (!cat) return NextResponse.json({ error: 'category_not_found' }, { status: 404 })

    const value = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : label
    const { data: last } = await supabase
      .from('trader_criteria_options')
      .select('position')
      .eq('category_id', categoryId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextPos = ((last?.position as number | undefined) ?? -1) + 1

    const { data, error } = await supabase
      .from('trader_criteria_options')
      .insert({ category_id: categoryId, value, label, origin: 'custom', position: nextPos })
      .select('*')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'duplicate_value' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ option: data }, { status: 201 })
  }

  return NextResponse.json({ error: 'unknown_kind' }, { status: 400 })
}
