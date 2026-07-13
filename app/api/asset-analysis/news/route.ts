import { NextResponse } from 'next/server'

interface FFEvent {
  title: string
  country: string
  date: string // ISO with timezone
  impact: 'High' | 'Medium' | 'Low' | 'Holiday' | string
  forecast?: string
  previous?: string
}

// Futures symbol → currency code(s) we care about
function currenciesFor(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/=F$|^M/, '')
  if (['ES', 'NQ', 'YM', 'RTY', 'CL', 'NG', 'GC', 'SI', 'HG', 'ZB', 'ZN', 'ZF', 'ZT'].includes(s)) return ['USD']
  if (['DX'].includes(s)) return ['USD']
  return ['USD'] // futures par défaut USD
}

interface Body { symbol: string }

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    if (!body?.symbol) return NextResponse.json({ error: 'symbol requis' }, { status: 400 })

    const cur = currenciesFor(body.symbol)

    // Fetch this week + next week to give 5-7 days horizon
    const [thisWeek, nextWeek] = await Promise.all([
      fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { next: { revalidate: 600 } })
        .then(r => r.json() as Promise<FFEvent[]>)
        .catch(() => [] as FFEvent[]),
      fetch('https://nfs.faireconomy.media/ff_calendar_nextweek.json', { next: { revalidate: 600 } })
        .then(r => r.json() as Promise<FFEvent[]>)
        .catch(() => [] as FFEvent[]),
    ])

    const now = Date.now()
    const allEvents = [...thisWeek, ...nextWeek]
      .filter(e => cur.includes(e.country))
      .filter(e => {
        const t = new Date(e.date).getTime()
        return !isNaN(t) && t >= now - 60 * 60_000 // include events still ongoing (within last 1h)
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 30)

    const events = allEvents.map(e => {
      const dt = new Date(e.date)
      const minutesUntil = Math.round((dt.getTime() - now) / 60_000)
      return {
        title: e.title,
        currency: e.country,
        impact: (e.impact || '').toLowerCase(), // high|medium|low|holiday
        datetime: dt.toISOString(),
        minutesUntil,
        forecast: e.forecast || null,
        previous: e.previous || null,
      }
    })

    const highImpact = events.filter(e => e.impact === 'high')
    const nextHigh = highImpact.find(e => e.minutesUntil >= 0) || null

    let implication = ''
    if (nextHigh) {
      const hours = Math.round(nextHigh.minutesUntil / 60)
      if (nextHigh.minutesUntil < 60) {
        implication = `⚠ ${nextHigh.title} dans ${nextHigh.minutesUntil} min — ne pas ouvrir de position, attendre 30 min après l'event.`
      } else if (nextHigh.minutesUntil < 24 * 60) {
        implication = `Event ${nextHigh.title} dans ${hours}h. Réduire la taille des positions à l'approche. Pas de trade 30 min avant/après.`
      } else {
        implication = `Prochain event high-impact : ${nextHigh.title} dans ~${Math.round(hours / 24)} jour(s).`
      }
    } else {
      implication = 'Aucun event high-impact dans le calendrier proche. Fenêtre ouverte pour trader.'
    }

    return NextResponse.json({
      news: {
        events,
        high_impact_count: highImpact.length,
        next_high_impact: nextHigh,
        implication,
      },
    })
  } catch (err) {
    console.error('News analysis fatal:', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
