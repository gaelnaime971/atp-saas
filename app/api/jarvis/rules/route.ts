import { NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { requireJarvisAccessFast } from '@/lib/jarvis/access'
import { invalidateRulesCache } from '@/lib/jarvis/brain'
import { DEFAULT_RULES, type TraderRules } from '@/lib/jarvis/rules-engine'

export const runtime = 'nodejs'

type TraderRulesWithAccount = TraderRules & { account_size_usd: number }

/**
 * GET /api/jarvis/rules → règles actuelles (ou défauts ATP si pas de
 * ligne encore). Lecture via SELECT standard (RLS own-row).
 */
export async function GET() {
  const auth = await requireJarvisAccessFast()
  if (auth instanceof Response) return auth
  const { userId } = auth

  const supabase = await createSsrClient()
  const { data } = await supabase
    .from('trader_personal_rules')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) {
    const defaults: TraderRulesWithAccount = { ...DEFAULT_RULES, account_size_usd: 0 }
    return NextResponse.json({ rules: defaults, defaults: defaults, exists: false })
  }
  return NextResponse.json({ rules: data, defaults: { ...DEFAULT_RULES, account_size_usd: 0 }, exists: true })
}

/**
 * PUT /api/jarvis/rules → appelle la RPC update_trader_rules qui
 * applique « durcir, jamais assouplir ». Body JSON = payload à
 * fusionner. Les erreurs SQL (invalid_parameter 22023) remontent en
 * 422 avec le message FR explicite extrait par Supabase.
 */
export async function PUT(request: Request) {
  const auth = await requireJarvisAccessFast()
  if (auth instanceof Response) return auth
  const { userId } = auth

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'payload JSON requis' }, { status: 400 })

  const supabase = await createSsrClient()
  const { data, error } = await supabase.rpc('update_trader_rules', { payload: body })

  if (error) {
    // Erreur fonctionnelle (22023 raise exception) → message FR
    const msg = error.message || 'Mise à jour refusée'
    const isValidation = /22023|durcir|assouplir|défaut ATP|dépasser|peut descendre|peut être désactivé|dépasse/i.test(msg)
    return NextResponse.json({ error: msg }, { status: isValidation ? 422 : 500 })
  }

  // Invalide le cache rules côté brain pour que le prochain échange
  // reprenne les nouvelles valeurs immédiatement.
  invalidateRulesCache(userId)

  return NextResponse.json({ ok: true, rules: data })
}
