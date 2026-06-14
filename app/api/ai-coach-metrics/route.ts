import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeStats, type SessionRow, type BacktestRow, type MetricsOptions } from '@/lib/trader-metrics'

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: RequestBody = {}
    try { body = (await request.json()) as RequestBody } catch { /* empty body OK */ }

    const todayISO = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10)

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

    const stats = computeStats(sessions, backtests, opts)

    // Also expose available filter options to the client (so the page can
    // populate Instrument / Account dropdowns from the full data set)
    const instrumentSet = new Set<string>()
    const accountSet = new Set<string>()
    sessions.forEach(s => {
      if (s.instrument) instrumentSet.add(s.instrument.toUpperCase())
      try {
        const meta = JSON.parse(s.setup || '{}')
        if (Array.isArray(meta.account_ids)) {
          meta.account_ids.forEach((id: string) => accountSet.add(id))
        }
      } catch { /* ignore */ }
    })

    // Resolve account labels if we found any
    let accountLabels: Array<{ id: string; label: string; propfirm_name: string | null }> = []
    if (accountSet.size > 0) {
      const ids = Array.from(accountSet)
      const { data: accs } = await supabase
        .from('trader_accounts')
        .select('id,label,propfirm_name')
        .eq('trader_id', user.id)
        .in('id', ids)
      accountLabels = (accs as Array<{ id: string; label: string; propfirm_name: string | null }> | null) || []
    }

    return NextResponse.json({
      stats,
      filters: {
        instruments: Array.from(instrumentSet).sort(),
        accounts: accountLabels,
      },
    })
  } catch (err) {
    console.error('Metrics error:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
