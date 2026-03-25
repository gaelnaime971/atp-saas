'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import Card from '@/components/ui/Card'

interface TraderActivity extends Profile {
  last_session: string | null
  last_journal: string | null
  last_coaching: string | null
  last_payment: string | null
  activity_score: number
  status_label: string
  status_color: string
  days_since_session: number | null
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatRelative(dateStr: string | null): string {
  const days = daysSince(dateStr)
  if (days === null) return 'Jamais'
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  return `il y a ${days} j`
}

function dateColor(dateStr: string | null): string {
  const days = daysSince(dateStr)
  if (days === null) return '#ef4444'
  if (days < 3) return '#22c55e'
  if (days <= 7) return '#f59e0b'
  return '#ef4444'
}

function computeScore(trader: { last_session: string | null; last_journal: string | null; last_coaching: string | null; last_payment: string | null }): number {
  const items = [trader.last_session, trader.last_journal, trader.last_coaching, trader.last_payment]
  let total = 0
  for (const d of items) {
    const days = daysSince(d)
    if (days === null) { total += 0; continue }
    if (days <= 1) total += 25
    else if (days <= 3) total += 20
    else if (days <= 7) total += 12
    else if (days <= 14) total += 5
    else total += 1
  }
  return Math.min(100, total)
}

function computeStatus(daysSinceSession: number | null): { label: string; color: string } {
  if (daysSinceSession === null) return { label: 'Décroché', color: '#ef4444' }
  if (daysSinceSession <= 2) return { label: 'Très actif', color: '#22c55e' }
  if (daysSinceSession <= 5) return { label: 'Actif', color: '#3b82f6' }
  if (daysSinceSession <= 10) return { label: 'Inactif', color: '#f59e0b' }
  return { label: 'Décroché', color: '#ef4444' }
}

export default function CRM() {
  const [traders, setTraders] = useState<TraderActivity[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function fetchData() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'trader')

    if (!profiles || profiles.length === 0) {
      setTraders([])
      setLoading(false)
      return
    }

    const enriched = await Promise.all(
      profiles.map(async (trader: Profile) => {
        const [sessRes, journalRes, coachRes, revRes] = await Promise.all([
          supabase
            .from('trading_sessions')
            .select('session_date')
            .eq('trader_id', trader.id)
            .order('session_date', { ascending: false })
            .limit(1),
          supabase
            .from('journal_entries')
            .select('entry_date')
            .eq('trader_id', trader.id)
            .order('entry_date', { ascending: false })
            .limit(1),
          supabase
            .from('coaching_sessions')
            .select('scheduled_at')
            .eq('trader_id', trader.id)
            .eq('status', 'completed')
            .order('scheduled_at', { ascending: false })
            .limit(1),
          supabase
            .from('revenues')
            .select('payment_date')
            .eq('trader_id', trader.id)
            .order('payment_date', { ascending: false })
            .limit(1),
        ])

        const last_session = sessRes.data?.[0]?.session_date ?? null
        const last_journal = journalRes.data?.[0]?.entry_date ?? null
        const last_coaching = coachRes.data?.[0]?.scheduled_at ?? null
        const last_payment = revRes.data?.[0]?.payment_date ?? null

        const activity_score = computeScore({ last_session, last_journal, last_coaching, last_payment })
        const days_since_session = daysSince(last_session)
        const { label: status_label, color: status_color } = computeStatus(days_since_session)

        return {
          ...trader,
          last_session,
          last_journal,
          last_coaching,
          last_payment,
          activity_score,
          status_label,
          status_color,
          days_since_session,
        }
      })
    )

    // Sort least active first
    enriched.sort((a, b) => a.activity_score - b.activity_score)
    setTraders(enriched)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const alertTraders = traders.filter(t => t.days_since_session === null || t.days_since_session >= 7)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[#e8edf5]">Vue CRM</h1>
        <p className="text-[#5a6a82] text-sm mt-1">
          Suivi d&apos;activit&eacute; de vos traders &middot; {traders.length} trader{traders.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Alert banner */}
      {alertTraders.length > 0 && (
        <div
          className="rounded-xl border px-5 py-4"
          style={{
            background: 'rgba(245,158,11,0.06)',
            borderColor: 'rgba(245,158,11,0.2)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-amber-400 font-medium text-sm">
              {alertTraders.length} trader{alertTraders.length !== 1 ? 's' : ''} sans session depuis 7+ jours
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertTraders.map(t => (
              <span
                key={t.id}
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
              >
                {t.full_name ?? t.email ?? 'Trader'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trader cards */}
      {traders.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <p className="text-[#a0aec0] font-medium">Aucun trader</p>
            <p className="text-[#5a6a82] text-sm mt-1">Invitez des traders pour voir leur activité ici</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {traders.map(trader => (
            <Card key={trader.id} className="hover:border-[rgba(255,255,255,0.12)] transition-colors">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border"
                  style={{
                    background: `${trader.status_color}15`,
                    borderColor: `${trader.status_color}30`,
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: trader.status_color }}>
                    {(trader.full_name || 'T')[0].toUpperCase()}
                  </span>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* Top row: name + badges + status */}
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="text-sm font-medium text-[#e8edf5]">
                      {trader.full_name ?? 'Sans nom'}
                    </span>
                    <span className="text-xs text-[#5a6a82]">{trader.email}</span>
                    {trader.plan_type && (
                      <span className="px-2 py-0.5 bg-[#1c2333] rounded text-xs text-[#a0aec0] font-medium">
                        {trader.plan_type}
                      </span>
                    )}
                    {trader.propfirm_name && (
                      <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400 font-medium">
                        {trader.propfirm_name}
                      </span>
                    )}
                    <span
                      className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium border"
                      style={{
                        background: `${trader.status_color}15`,
                        borderColor: `${trader.status_color}30`,
                        color: trader.status_color,
                      }}
                    >
                      {trader.status_label}
                    </span>
                  </div>

                  {/* Activity indicators row */}
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {([
                      { label: 'Dernière session', date: trader.last_session },
                      { label: 'Dernier journal', date: trader.last_journal },
                      { label: 'Dernier coaching', date: trader.last_coaching },
                      { label: 'Dernier paiement', date: trader.last_payment },
                    ] as const).map(item => (
                      <div
                        key={item.label}
                        className="rounded-lg px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.02)' }}
                      >
                        <p className="text-[10px] text-[#5a6a82] uppercase tracking-wider mb-1">{item.label}</p>
                        <p className="text-xs font-medium font-mono" style={{ color: dateColor(item.date) }}>
                          {formatRelative(item.date)}
                        </p>
                        {item.date && (
                          <p className="text-[10px] text-[#5a6a82] mt-0.5">
                            {new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Activity score bar */}
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#5a6a82] uppercase tracking-wider shrink-0 w-20">
                      Activité
                    </span>
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${trader.activity_score}%`,
                          background: trader.activity_score >= 70
                            ? '#22c55e'
                            : trader.activity_score >= 40
                            ? '#3b82f6'
                            : trader.activity_score >= 20
                            ? '#f59e0b'
                            : '#ef4444',
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-mono font-medium shrink-0 w-10 text-right"
                      style={{
                        color: trader.activity_score >= 70
                          ? '#22c55e'
                          : trader.activity_score >= 40
                          ? '#3b82f6'
                          : trader.activity_score >= 20
                          ? '#f59e0b'
                          : '#ef4444',
                      }}
                    >
                      {trader.activity_score}%
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
