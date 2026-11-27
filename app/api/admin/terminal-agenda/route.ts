/**
 * /api/admin/terminal-agenda — page admin « Agenda Terminal ».
 *
 * GET    : agenda (résultats, discours) des 30 derniers jours et à venir,
 *          et jours de fête à venir avec leur confirmation CME.
 * POST   : { action: 'save_item', item } (création ou modification),
 *          { action: 'confirm_holiday', confirmation }.
 * DELETE : ?id=<uuid> (élément de l'agenda).
 *
 * Admin uniquement (404 sinon). Saisies validées (lib/market/agenda-admin)
 * puis écrites par le service-role (aucune règle d'écriture en base) ;
 * le cache partagé des pages Terminal est invalidé après chaque écriture.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MARKET_CACHE_TAG } from '@/lib/market/run'
import { isUuid, validateAgendaItem, validateConfirmation } from '@/lib/market/agenda-admin'
import { MARKET_SPECIAL_DAYS } from '@/lib/terminal/market-holidays'
import { addDays } from '@/lib/time'

export const runtime = 'nodejs'

const NOT_FOUND = () => new NextResponse(null, { status: 404 })

async function isAdmin(): Promise<boolean> {
  const supabase = await createSsrClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return (data as { role?: string } | null)?.role === 'admin'
}

const todayUtc = () => new Date().toISOString().slice(0, 10)

async function snapshot() {
  const db = createAdminClient()
  const today = todayUtc()
  const [items, confirmations] = await Promise.all([
    db.from('market_agenda_items').select('id, kind, event_date, time_et, timing, ticker, title')
      .gte('event_date', addDays(today, -30)).order('event_date', { ascending: true }).limit(500),
    db.from('market_holiday_confirmations').select('holiday_date, cme_confirmed, globex_ranges, note, updated_at'),
  ])
  if (items.error) throw new Error(items.error.message)
  if (confirmations.error) throw new Error(confirmations.error.message)
  const byDate = new Map((confirmations.data ?? []).map(c => [c.holiday_date as string, c]))
  const holidays = MARKET_SPECIAL_DAYS.filter(d => d.date >= addDays(today, -7) && d.globex).map(d => ({
    date: d.date, name: d.name, nyse: d.nyse ?? null, codeRanges: (d.globex ?? []).map(([a, b]) => `${a}-${b}`).join(','),
    confirmation: byDate.get(d.date) ?? null,
  }))
  return { items: items.data ?? [], holidays }
}

export async function GET() {
  if (!(await isAdmin())) return NOT_FOUND()
  try {
    return NextResponse.json(await snapshot())
  } catch (e) {
    console.error('[admin terminal-agenda] lecture :', (e as Error).message)
    return NextResponse.json({ error: 'unavailable' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NOT_FOUND()
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requête invalide' }, { status: 400 }) }
  const db = createAdminClient()
  try {
    if (body.action === 'save_item') {
      const item = (body.item ?? {}) as Record<string, unknown>
      const v = validateAgendaItem(item)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const record = { ...v.value, updated_at: new Date().toISOString() }
      const { error } = item.id !== undefined
        ? (isUuid(item.id) ? await db.from('market_agenda_items').update(record).eq('id', item.id) : { error: { message: 'Identifiant invalide' } })
        : await db.from('market_agenda_items').insert(record)
      if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 400 })
    } else if (body.action === 'confirm_holiday') {
      const v = validateConfirmation(body.confirmation)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      const { error } = await db.from('market_holiday_confirmations').upsert({ ...v.value, updated_at: new Date().toISOString() }, { onConflict: 'holiday_date' })
      if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }
    revalidateTag(MARKET_CACHE_TAG, { expire: 0 })
    return NextResponse.json(await snapshot())
  } catch (e) {
    console.error('[admin terminal-agenda] écriture :', (e as Error).message)
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return NOT_FOUND()
  const id = request.nextUrl.searchParams.get('id')
  if (!isUuid(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  const { error } = await createAdminClient().from('market_agenda_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 400 })
  revalidateTag(MARKET_CACHE_TAG, { expire: 0 })
  return NextResponse.json(await snapshot())
}
