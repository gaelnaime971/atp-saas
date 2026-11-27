/**
 * Actus officielles : appels aux flux (côté serveur uniquement). Une
 * source en panne n'empêche pas les autres (erreurs remontées).
 */
import { zonedTimeToUtc } from '@/lib/time'
import { dedupeNews, ecbItems, fedItems, parseRss, treasuryItems, type FedFeed, type NewsItem } from './news'

export const NEWS_FEEDS = {
  fed: [
    { feed: 'press' as FedFeed, url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
    { feed: 'speech' as FedFeed, url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
    { feed: 'testimony' as FedFeed, url: 'https://www.federalreserve.gov/feeds/testimony.xml' },
  ],
  ecb: 'https://www.ecb.europa.eu/rss/press.html',
  treasury: 'https://www.treasurydirect.gov/TA_WS/securities/auctioned',
} as const

async function get(url: string, label: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'ATP-Terminal/1.0' } })
  } catch (e) {
    throw new Error(`${label} : réseau (${(e as Error).name})`)
  }
  if (!res.ok) throw new Error(`${label} : HTTP ${res.status}`)
  return res
}

const closeAt = (date: string, timeEt: string) => zonedTimeToUtc(date, timeEt, 'America/New_York').getTime()

/** Toutes les actus officielles disponibles (dédoublonnées) et les erreurs par flux. */
export async function fetchOfficialNews(treasuryDays = 14): Promise<{ items: NewsItem[]; errors: string[] }> {
  const errors: string[] = []
  const settle = async (label: string, fn: () => Promise<NewsItem[]>) => {
    try { return await fn() } catch (e) { errors.push(`${label} : ${(e as Error).message}`); return [] }
  }
  const groups = await Promise.all([
    ...NEWS_FEEDS.fed.map(f => settle(`Fed ${f.feed}`, async () => fedItems(parseRss(await (await get(f.url, 'Fed')).text()), f.feed))),
    settle('BCE', async () => ecbItems(parseRss(await (await get(NEWS_FEEDS.ecb, 'BCE')).text()))),
    ...(['Note', 'Bond'] as const).map(type => settle(`Trésor ${type}`, async () =>
      treasuryItems(await (await get(`${NEWS_FEEDS.treasury}?format=json&type=${type}&days=${treasuryDays}`, 'TreasuryDirect')).json(), closeAt))),
  ])
  return { items: dedupeNews(groups.flat()), errors }
}
