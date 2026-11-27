'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import { useMemberTimeZone } from '@/components/time/MemberTimeZone'
import { useMinuteNow } from '@/lib/hooks/useMinuteNow'
import {
  dateKey, formatDateKey, formatDayShort, formatDuration, formatTime, offsetLabel, parseDateKey,
  timeZoneLabel, zonedTimeToUtc,
} from '@/lib/time'
import {
  SESSION_BY_ID, STATS_SLOTS, allSessionStates, dayRanges, memberHours, monthlyOpex, publicationsAt, quarterlyExpirations,
  type SpecialDays,
  SPECIAL_DAYS_HORIZON_MONTHS, upcomingSpecialDays, usAppointments, usTradingDay,
  type SessionId, type SessionState, type SessionStatus,
} from '@/lib/terminal/sessions'
import { MARKET_SPECIAL_DAYS, SPECIAL_DAYS_UNTIL } from '@/lib/terminal/market-holidays'

/**
 * Marchés › Sessions & horaires (maquette 03). Tout est calculé dans le
 * navigateur, en heure du membre (lib/time.ts), à partir de
 * lib/terminal/sessions.ts. Aucune donnée réseau.
 *
 * Rendu après hydratation (useMinuteNow) : l'heure du serveur n'est pas
 * celle du membre. `serverTimeZone` (profil lu côté serveur) sert tant
 * que le fuseau du navigateur n'est pas résolu.
 */

// Couleurs des sessions : palette catégorielle existante (zéro vert/rouge).
const SESSION_COLOR: Record<SessionId, string> = {
  tokyo: 'var(--color-series-4)',
  london: 'var(--color-series-5)',
  newYork: 'var(--color-series-3)',
  cashUs: 'var(--color-accent)',
  globex: 'var(--color-series-2)',
}

const STATUS: Record<SessionStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Ouvert', tone: 'profit' },
  pause: { label: 'Pause', tone: 'warn' },
  closed: { label: 'Fermé', tone: 'neutral' },
}
const STATUS_F: Record<SessionStatus, string> = { open: 'Ouverte', pause: 'En pause', closed: 'Fermée' }

const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-data)', fontSize: 'var(--text-label)', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-3)', margin: '0 0 1rem 0', fontWeight: 500,
}
const mono: CSSProperties = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' }

/** Publication du calendrier économique, transmise par la page serveur. */
export interface BoardPublication { at: number; title: string; impact: string; kind: string }

export default function SessionsBoard({ serverTimeZone, settingsHref, specialDays, publications = [] }: {
  serverTimeZone: string
  settingsHref?: string
  /** Jours spéciaux avec les confirmations CME de l'admin (défaut : table du code). */
  specialDays?: SpecialDays
  /** Publications officielles des prochains jours (calendrier économique). */
  publications?: BoardPublication[]
}) {
  const days = specialDays ?? MARKET_SPECIAL_DAYS
  const now = useMinuteNow()
  const { timeZone: clientTz, ready } = useMemberTimeZone()
  const tz = ready ? clientTz : serverTimeZone

  const states = now === null ? null : allSessionStates(now, days)
  const openPlaces = states
    ? (['tokyo', 'london', 'newYork'] as const).filter(id => states[id].status === 'open').map(id => SESSION_BY_ID[id].short)
    : []

  const subtitle = now === null
    ? 'Asie, Europe et US, à ton heure.'
    : `Ton heure : ${timeZoneLabel(tz)} (${offsetLabel(now, tz)}) · ${openPlaces.length ? `${joinFr(openPlaces)} ${openPlaces.length > 1 ? 'ouvertes' : 'ouverte'}` : 'Asie, Europe et US fermées'}`

  const tzChip = (
    <span style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-2)' }}>
      Fuseau · {timeZoneLabel(tz)}{now !== null ? ` (${offsetLabel(now, tz)})` : ''}
    </span>
  )

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: '84rem' }}>
      <PageHeader
        breadcrumb={<>Marchés · Global</>}
        title="Sessions & horaires"
        subtitle={subtitle}
        actions={settingsHref ? (
          <Link
            href={settingsHref}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', textDecoration: 'none' }}
          >
            {tzChip}
          </Link>
        ) : tzChip}
      />

      {now === null ? <BoardSkeleton /> : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
            <Card>
              <h2 style={sectionTitle}>Ton horloge · {timeZoneLabel(tz)}</h2>
              <RadialClock now={now} tz={tz} days={days} />
            </Card>
            <Card>
              <h2 style={sectionTitle}>Frise 24 h · heure de {timeZoneLabel(tz)}</h2>
              <Timeline now={now} tz={tz} days={days} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {(['tokyo', 'london', 'newYork', 'globex'] as const).map(id => (
              <SessionCard key={id} id={id} state={states![id]} now={now} tz={tz} days={days} cash={id === 'newYork' ? states!.cashUs : undefined} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <UsDay now={now} tz={tz} days={days} publications={publications} />
            <Expirations now={now} />
          </div>

          <SpecialDays now={now} tz={tz} days={days} />

          <p style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', margin: 0, lineHeight: 1.6 }}>
            Horaires calculés en direct dans ton fuseau, changements d’heure compris. Fériés et clôtures anticipées du cash US :
            calendrier officiel NYSE, connus jusqu’au {formatDateKey(SPECIAL_DAYS_UNTIL, { year: true })}. Horaires des fêtes sur CME Globex :
            schéma habituel des futures indices, à confirmer environ deux semaines avant chaque fête.
          </p>
        </>
      )}
    </div>
  )
}

function joinFr(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

// ─── Horloge radiale 24 h ───────────────────────────────────────

const RING_SESSIONS: SessionId[] = ['tokyo', 'london', 'newYork', 'cashUs']

function RadialClock({ now, tz, days }: { now: number; tz: string; days: SpecialDays }) {
  const size = 280
  const c = size / 2
  const today = dateKey(now, tz)
  const dayStart = zonedTimeToUtc(today, '00:00', tz).getTime()
  const dayEnd = zonedTimeToUtc(nextDay(today), '00:00', tz).getTime()
  const frac = (t: number) => (t - dayStart) / (dayEnd - dayStart)
  const angle = frac(now) * 360
  const hand = polar(c, c, 118, angle)

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox={`-16 -16 ${size + 32} ${size + 32}`} width="100%" style={{ maxWidth: 320 }} role="img"
        aria-label={`Il est ${formatTime(now, tz)} chez toi`}>
        <circle cx={c} cy={c} r={130} fill="none" stroke="var(--color-border-subtle)" />
        {Array.from({ length: 24 }, (_, h) => {
          const a = (h / 24) * 360
          const p1 = polar(c, c, 130, a)
          const p2 = polar(c, c, h % 6 === 0 ? 121 : 125, a)
          return <line key={h} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--color-text-3)" strokeWidth={h % 6 === 0 ? 1.5 : 1} />
        })}
        {RING_SESSIONS.map((id, i) => {
          const r = 108 - i * 12
          return (
            <g key={id}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={7} />
              {dayRanges(id, today, tz, days).map((rg, k) => (
                <path key={k} d={arc(c, c, r, frac(rg.start) * 360, frac(rg.end) * 360)} fill="none"
                  stroke={SESSION_COLOR[id]} strokeWidth={7} strokeLinecap="round" />
              ))}
            </g>
          )
        })}
        <line x1={c} y1={c} x2={hand.x} y2={hand.y} stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={hand.x} cy={hand.y} r={4} fill="var(--color-accent)" />
        <circle cx={c} cy={c} r={3} fill="var(--color-accent)" />
        {[['00', 0], ['06', 90], ['12', 180], ['18', 270]].map(([label, a]) => {
          const p = polar(c, c, 142, a as number)
          return (
            <text key={label} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              style={{ ...mono, fontSize: 9, fill: 'var(--color-text-3)' }}>{label}</text>
          )
        })}
        <rect x={c - 52} y={c - 30} width={104} height={58} rx={10} fill="var(--color-surface-1)" />
        <text x={c} y={c - 2} textAnchor="middle" style={{ ...mono, fontSize: 30, fontWeight: 600, fill: 'var(--color-text-1)' }}>
          {formatTime(now, tz)}
        </text>
        <text x={c} y={c + 18} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--color-text-2)' }}>
          {formatDayShort(now, tz)}
        </text>
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {RING_SESSIONS.map(id => (
          <li key={id} className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-label)', color: 'var(--color-text-2)' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: SESSION_COLOR[id] }} />
            {SESSION_BY_ID[id].short}
          </li>
        ))}
      </ul>
    </div>
  )
}

function nextDay(key: string): string {
  const { year, month, day } = parseDateKey(key)
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return d.toISOString().slice(0, 10)
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arc(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const end = Math.min(a2, a1 + 359.9)
  const p1 = polar(cx, cy, r, a1)
  const p2 = polar(cx, cy, r, end)
  const large = end - a1 > 180 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`
}

// ─── Frise 24 h ─────────────────────────────────────────────────

const TIMELINE_SESSIONS: SessionId[] = ['tokyo', 'london', 'newYork', 'cashUs', 'globex']

function Timeline({ now, tz, days }: { now: number; tz: string; days: SpecialDays }) {
  const today = dateKey(now, tz)
  const ranges = Object.fromEntries(TIMELINE_SESSIONS.map(id => [id, dayRanges(id, today, tz, days)])) as Record<SessionId, ReturnType<typeof dayRanges>>
  const any = ranges.globex[0] ?? ranges.tokyo[0]
  const dayStart = any?.dayStart ?? zonedTimeToUtc(today, '00:00', tz).getTime()
  const dayEnd = any?.dayEnd ?? zonedTimeToUtc(nextDay(today), '00:00', tz).getTime()
  const pct = (t: number) => ((t - dayStart) / (dayEnd - dayStart)) * 100
  const nowPct = pct(now)
  const labelCol = '6.5rem'

  return (
    // Sur petit écran, la frise défile dans sa carte (largeur minimale lisible).
    <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
    <div className="flex flex-col gap-3" style={{ minWidth: 520 }}>
      <div className="grid" style={{ gridTemplateColumns: `${labelCol} 1fr` }}>
        <span />
        <div className="relative" style={{ height: 32 }}>
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
            // Libellés des bords alignés à l'intérieur de la frise (pas de débordement).
            <span key={h} style={{ ...mono, position: 'absolute', left: `${(h / 24) * 100}%`, bottom: 0, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)', fontSize: 10, color: 'var(--color-text-3)' }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
          <span style={{ ...mono, position: 'absolute', left: `${nowPct}%`, top: 0, transform: `translateX(-${Math.min(100, Math.max(0, nowPct))}%)`, fontSize: 10, fontWeight: 600, color: 'var(--color-accent)' }}>
            {formatTime(now, tz)}
          </span>
        </div>
      </div>
      {TIMELINE_SESSIONS.map(id => (
        <div key={id} className="grid items-center" style={{ gridTemplateColumns: `${labelCol} 1fr` }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)' }}>
            {id === 'globex' ? 'CME Globex' : SESSION_BY_ID[id].short}
          </span>
          <div className="relative" style={{ height: 28, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
            {ranges[id].map((rg, k) => {
              const left = pct(rg.start)
              const width = pct(rg.end) - left
              return (
                <div key={k} title={`${formatTime(rg.start, tz)}–${rg.end >= dayEnd ? '24:00' : formatTime(rg.end, tz)}`}
                  style={{
                    position: 'absolute', top: 3, bottom: 3, left: `${left}%`, width: `${width}%`,
                    background: SESSION_COLOR[id], borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', paddingLeft: 6,
                  }}>
                  {width > 16 && (
                    <span style={{ ...mono, fontSize: 10, color: 'var(--color-surface-0)', whiteSpace: 'nowrap' }}>
                      {formatTime(rg.start, tz)}–{rg.end >= dayEnd ? '24:00' : formatTime(rg.end, tz)}
                    </span>
                  )}
                </div>
              )
            })}
            <span aria-hidden style={{ position: 'absolute', top: -4, bottom: -4, left: `${nowPct}%`, width: 1, background: 'var(--color-accent)' }} />
          </div>
        </div>
      ))}
      <p style={{ ...mono, fontSize: 'var(--text-label)', color: 'var(--color-text-3)', margin: '0.25rem 0 0 0', lineHeight: 1.6 }}>
        NQ et YM sur CME Globex : du dimanche {formatTime(zonedTimeToUtc(today, '18:00', 'America/New_York'), tz)} au vendredi{' '}
        {formatTime(zonedTimeToUtc(today, '17:00', 'America/New_York'), tz)} chez toi, pause quotidienne de{' '}
        {formatTime(zonedTimeToUtc(today, '17:00', 'America/New_York'), tz)} à {formatTime(zonedTimeToUtc(today, '18:00', 'America/New_York'), tz)}.
      </p>
    </div>
    </div>
  )
}

// ─── Cartes de session ──────────────────────────────────────────

const PLACE_TZ: Record<SessionId, string> = {
  tokyo: 'Asia/Tokyo', london: 'Europe/London', newYork: 'America/New_York', cashUs: 'America/New_York', globex: 'America/New_York',
}
const CARD_TITLE: Record<SessionId, string> = {
  tokyo: 'Tokyo', london: 'Londres', newYork: 'New York', cashUs: 'Cash US', globex: 'NQ · YM',
}
const CARD_GROUP: Record<SessionId, string> = {
  tokyo: 'Session Asie', london: 'Session Europe', newYork: 'Session US', cashUs: 'NYSE', globex: 'CME Globex',
}

function SessionCard({ id, state, now, tz, days, cash }: { id: SessionId; state: SessionState; now: number; tz: string; days: SpecialDays; cash?: SessionState }) {
  const placeTz = PLACE_TZ[id]
  const status = STATUS[state.status]
  const next = state.nextChange
  const countdown = next === null ? null : formatDuration(next - now)
  const hours = memberHours(id, now, tz, days)
  const isOpen = state.status === 'open'

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div style={{ ...sectionTitle, margin: 0 }}>{CARD_GROUP[id]}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-1)', marginTop: 2 }}>{CARD_TITLE[id]}</div>
        </div>
        <Badge tone={status.tone} uppercase bordered dot>{id === 'globex' ? status.label : STATUS_F[state.status]}</Badge>
      </div>

      <div className="flex items-baseline gap-2" style={{ marginTop: 12 }}>
        <span style={{ ...mono, fontSize: 30, fontWeight: 600, color: isOpen ? 'var(--color-text-1)' : 'var(--color-text-2)' }}>
          {formatTime(now, placeTz)}
        </span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>{formatDayShort(now, placeTz)} · {offsetLabel(now, placeTz)}</span>
      </div>

      <div style={{ ...mono, fontSize: 13, color: 'var(--color-text-1)', marginTop: 10 }}>
        {countdown === null ? 'Pas de séance connue' : isOpen ? `Ferme dans ${countdown}` : `${state.status === 'pause' ? 'Reprend' : 'Ouvre'} dans ${countdown}`}
      </div>
      {next !== null && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
          {isOpen ? 'clôture' : 'ouverture'} à {formatTime(next, tz)} chez toi{dateKey(next, tz) !== dateKey(now, tz) ? `, ${formatDayShort(next, tz)}` : ''}
        </div>
      )}

      {state.special && (id !== 'globex' || state.special.globex) && (
        <div style={{ fontSize: 12, color: 'var(--color-warn)', marginTop: 10 }}>
          {state.special.name}{id === 'globex' && !state.special.cmeConfirmed ? ' · horaires CME à confirmer' : ''}
        </div>
      )}
      {cash && (
        <div style={{ ...mono, fontSize: 12, color: cash.status === 'open' ? 'var(--color-accent)' : 'var(--color-text-2)', marginTop: 10 }}>
          Cash US {cash.status === 'open' ? 'ouvert' : 'fermé'}
          {cash.nextChange !== null && ` · ${cash.status === 'open' ? 'clôture' : 'ouverture'} à ${formatTime(cash.nextChange, tz)}`}
        </div>
      )}

      <div style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)', marginTop: 12, lineHeight: 1.7, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 10 }}>
        <div>{SESSION_BY_ID[id].localHours} {id === 'globex' ? 'à New York' : 'locale'}</div>
        {hours && id !== 'globex' && <div>{hours} chez toi</div>}
      </div>
    </Card>
  )
}

// ─── Journée US ─────────────────────────────────────────────────

function UsDay({ now, tz, days, publications }: { now: number; tz: string; days: SpecialDays; publications: BoardPublication[] }) {
  const day = usTradingDay(now)
  const items = usAppointments(day, days)
  const todayUs = dateKey(now, 'America/New_York') === day

  return (
    <Card>
      <h2 style={sectionTitle}>
        Rendez-vous de la journée US · {todayUs ? 'aujourd’hui' : formatDateKey(day)}
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it, i) => {
          const inWindow = now >= it.windowStart && now < it.windowEnd
          const past = now >= it.windowEnd
          let chip: ReactNode
          if (inWindow) chip = <Badge tone="accent" bordered dot>Fenêtre ATP</Badge>
          else if (past) chip = <Badge tone="neutral">Passé</Badge>
          else chip = <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>dans {formatDuration(it.windowStart - now)}</span>
          return (
            <li key={it.id} className="grid items-center gap-3"
              style={{
                gridTemplateColumns: '4rem 1fr auto', padding: '0.625rem 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)', opacity: past ? 0.55 : 1,
              }}>
              <span style={{ ...mono, fontSize: 18, fontWeight: 600, color: inWindow ? 'var(--color-accent)' : 'var(--color-text-1)' }}>
                {formatTime(it.at, tz)}
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--color-text-1)' }}>{it.label}</span>
                {(STATS_SLOTS as readonly string[]).includes(it.id) && (() => {
                  // Vraies publications du créneau (calendrier économique), sinon « aucune publication ».
                  const pubs = publicationsAt(publications, it.at)
                  return (
                    <span style={{ display: 'block', fontSize: 12, color: pubs.length ? 'var(--color-text-1)' : 'var(--color-text-3)', marginTop: 1 }}>
                      {pubs.length ? pubs.map(p => p.title).join(' · ') : 'Aucune publication'}
                      {pubs.some(p => p.impact === 'high') && <Badge tone="loss" size="sm" className="ml-2">fort</Badge>}
                    </span>
                  )
                })()}
                <span style={{ ...mono, fontSize: 11, color: 'var(--color-text-3)' }}>
                  {it.etTime.replace(/^0/, '')} à New York · fenêtre ATP {formatTime(it.windowStart, tz)}–{formatTime(it.windowEnd, tz)}
                </span>
              </span>
              {chip}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ─── Échéances ──────────────────────────────────────────────────

function Expirations({ now }: { now: number }) {
  const today = dateKey(now, 'America/New_York')
  const quarters = quarterlyExpirations(today, 4)
  const opex = monthlyOpex(today, 4)
  const days = (key: string) => {
    const { year, month, day } = parseDateKey(key)
    const t = parseDateKey(today)
    return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(t.year, t.month - 1, t.day)) / 86_400_000)
  }
  const inDays = (key: string) => {
    const n = days(key)
    return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} j`
  }

  return (
    <Card>
      <h2 style={sectionTitle}>Échéances NQ et YM · roll · OPEX</h2>
      <div style={{ overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
      <table style={{ width: '100%', minWidth: 360, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ ...mono, fontSize: 10, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
            <th style={{ fontWeight: 500, paddingBottom: 8 }}>Contrat</th>
            <th style={{ fontWeight: 500, paddingBottom: 8 }}>Roll conseillé</th>
            <th style={{ fontWeight: 500, paddingBottom: 8 }}>Échéance</th>
          </tr>
        </thead>
        <tbody>
          {quarters.map((q, i) => (
            <tr key={q.code} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <td style={{ padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--color-text-1)', fontWeight: i === 0 ? 600 : 400 }}>{q.contract}</span>
                <span style={{ ...mono, display: 'block', fontSize: 11, color: 'var(--color-text-3)' }}>NQ{q.code} · YM{q.code}</span>
              </td>
              <td style={{ ...mono, fontSize: 12, color: days(q.roll) >= 0 && i === 0 ? 'var(--color-accent)' : 'var(--color-text-2)' }}>
                {formatDateKey(q.roll)}
                {i === 0 && days(q.roll) >= 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-3)' }}>{inDays(q.roll)}</span>}
              </td>
              <td style={{ ...mono, fontSize: 12, color: 'var(--color-text-2)' }}>
                {formatDateKey(q.date, { year: i > 0 && q.date.slice(0, 4) !== today.slice(0, 4) })}
                {i === 0 && <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-3)' }}>{inDays(q.date)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div style={{ ...sectionTitle, margin: '1.25rem 0 0.5rem 0' }}>OPEX mensuelles</div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {opex.map(d => (
          <li key={d} style={{ ...mono, fontSize: 12, color: 'var(--color-text-1)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.625rem' }}>
            {formatDateKey(d)}
            <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-3)' }}>{inDays(d)}</span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0.875rem 0 0 0', lineHeight: 1.5 }}>
        Échéance et OPEX : 3e vendredi (la veille si la bourse est fermée). Roll conseillé : 8 jours avant l’échéance, le jeudi de la semaine précédente.
      </p>
    </Card>
  )
}

// ─── Jours spéciaux ─────────────────────────────────────────────

function SpecialDays({ now, tz, days }: { now: number; tz: string; days: SpecialDays }) {
  const items = upcomingSpecialDays(now, tz, undefined, days)

  return (
    <Card>
      <h2 style={sectionTitle}>Jours spéciaux à venir · {SPECIAL_DAYS_HORIZON_MONTHS} prochains mois</h2>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', margin: 0 }}>Aucun férié, clôture anticipée ni changement d’heure dans les 4 prochains mois.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.date}`} className="grid gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr_auto] items-baseline"
              style={{ padding: '0.75rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)' }}>
              <span style={{ ...mono, fontSize: 13, color: 'var(--color-text-1)' }}>{formatDateKey(it.date, { year: it.date.slice(0, 4) !== dateKey(now, tz).slice(0, 4) })}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--color-text-1)', fontWeight: 600 }}>{it.title}</strong> · {it.detail}
              </span>
              <span>
                {it.kind === 'closed' && <Badge tone="loss" size="sm">Fermé</Badge>}
                {it.kind === 'early' && <Badge tone="warn" size="sm">Clôture anticipée</Badge>}
                {it.kind === 'dst' && <Badge tone="info" size="sm">Heure</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─── Squelette (avant hydratation) ──────────────────────────────

function BoardSkeleton() {
  const block = (h: number): CSSProperties => ({ height: h, background: 'var(--color-surface-1)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-xl)' })
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Calcul des horaires">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"><div style={block(380)} /><div style={block(380)} /></div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} style={block(230)} />)}</div>
    </div>
  )
}
