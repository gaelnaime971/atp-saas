/**
 * Bloc MARCHÉ pour Jarvis (étape 3F-bis).
 *
 * Agrège trois sources déjà utilisées par le projet :
 *   1. yahoo-finance2 : DXY, VIX, 10Y US (^TNX), ES, NQ, Gold (GC=F)
 *      — même source que /api/asset-analysis/macro
 *   2. ForexFactory JSON (nfs.faireconomy.media) : calendrier éco
 *      sem. en cours + sem. prochaine, mêmes URLs que
 *      /api/asset-analysis/news
 *   3. CNN Fear & Greed : score + classification, même source que
 *      /api/asset-analysis/sentiment
 *
 * Cache module-level 5 min PARTAGÉ entre tous les utilisateurs
 * (données publiques, aucune info trader). Les fetches sont
 * tolérants : si une source rate, les autres continuent et le bloc
 * mentionne l'absence proprement.
 *
 * Taille cible : < 400 tokens quand sérialisé en texte pour que
 * l'injection reste dans la fenêtre de 8 000 tok/min de Groq.
 */

import YahooFinance from 'yahoo-finance2'

type YF = {
  chart: (s: string, opts: { period1: Date; period2: Date; interval: '1d' | '1wk' }) => Promise<{
    meta?: Record<string, unknown>
    quotes?: Array<{ date?: Date; close?: number | null }>
  }>
  suppressNotices?: (n: string[]) => void
}
const YFCtor = YahooFinance as unknown as new () => YF
const yf: YF = new YFCtor()
try { yf.suppressNotices?.(['yahooSurvey', 'ripHistorical']) } catch { /* ignore */ }

const MARKET_TTL_MS = 5 * 60 * 1000
let marketCache: { at: number; block: string } | null = null

interface MacroPoint {
  symbol: string
  label: string
  price: number
  changePct: number
}

async function fetchMacroPoint(ticker: string, label: string): Promise<MacroPoint | null> {
  try {
    const now = new Date()
    const from = new Date(now.getTime() - 7 * 86400_000)
    const r = await yf.chart(ticker, { period1: from, period2: now, interval: '1d' })
    const closes = (r.quotes || []).filter(q => q.close != null).map(q => Number(q.close))
    if (closes.length === 0) return null
    const last = closes[closes.length - 1]
    const prev = closes.length > 1 ? closes[closes.length - 2] : last
    const changePct = prev ? ((last - prev) / prev) * 100 : 0
    return { symbol: ticker, label, price: last, changePct }
  } catch { return null }
}

interface FFEvent {
  title: string
  country: string
  date: string
  impact: 'High' | 'Medium' | 'Low' | 'Holiday' | string
  forecast?: string
  previous?: string
}

async function fetchCalendar(): Promise<FFEvent[]> {
  try {
    const [thisW, nextW] = await Promise.all([
      fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { next: { revalidate: 600 } })
        .then(r => r.json() as Promise<FFEvent[]>).catch(() => [] as FFEvent[]),
      fetch('https://nfs.faireconomy.media/ff_calendar_nextweek.json', { next: { revalidate: 600 } })
        .then(r => r.json() as Promise<FFEvent[]>).catch(() => [] as FFEvent[]),
    ])
    const all = [...thisW, ...nextW]
    const now = Date.now()
    const horizon = now + 48 * 3600_000
    return all
      .filter(e => {
        const t = new Date(e.date).getTime()
        return t >= now - 3600_000 && t <= horizon
          && (e.impact === 'High' || e.impact === 'Medium')
          && (e.country === 'USD' || e.country === 'EUR')
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8)
  } catch { return [] }
}

interface FearGreed { score: number | null; label: string | null }

async function fetchFearGreed(): Promise<FearGreed> {
  try {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        Origin: 'https://www.cnn.com',
        Referer: 'https://www.cnn.com/markets/fear-and-greed',
      },
      next: { revalidate: 1800 },
    })
    if (!r.ok) return { score: null, label: null }
    const data = (await r.json()) as { fear_and_greed?: { score: number; rating: string } }
    return {
      score: data.fear_and_greed?.score ?? null,
      label: data.fear_and_greed?.rating ?? null,
    }
  } catch { return { score: null, label: null } }
}

function fmtPct(x: number): string {
  const sign = x > 0 ? '+' : ''
  return `${sign}${x.toFixed(2)} %`
}
function fmtPrice(x: number, decimals = 2): string {
  return x.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtEventTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

async function buildMarketBlock(): Promise<string> {
  const [macro, cal, fg] = await Promise.all([
    Promise.all([
      fetchMacroPoint('DX-Y.NYB', 'Dollar Index'),
      fetchMacroPoint('^VIX',     'VIX'),
      fetchMacroPoint('^TNX',     'Taux US 10 ans'),
      fetchMacroPoint('ES=F',     'S&P 500 (ES)'),
      fetchMacroPoint('NQ=F',     'Nasdaq 100 (NQ)'),
      fetchMacroPoint('GC=F',     'Or'),
    ]),
    fetchCalendar(),
    fetchFearGreed(),
  ])

  const nowParis = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
  }).format(new Date())

  const macroLines = macro
    .filter((m): m is MacroPoint => m !== null)
    .map(m => {
      // ^TNX est le taux ×10 chez Yahoo → divise pour affichage lisible
      const price = m.symbol === '^TNX' ? m.price / 10 : m.price
      const decimals = m.symbol === '^TNX' ? 2 : (price > 1000 ? 0 : 2)
      return `- ${m.label} : ${fmtPrice(price, decimals)} (${fmtPct(m.changePct)})`
    })
    .join('\n') || '- (données macro indisponibles)'

  const calLines = cal.length > 0
    ? cal.map(e => `- ${fmtEventTime(e.date)} · ${e.country} · ${e.impact} · ${e.title}${e.forecast ? ` (prév. ${e.forecast})` : ''}`).join('\n')
    : '- (aucun événement majeur US/EUR dans les 48 h)'

  const fgLine = fg.score != null
    ? `Fear & Greed (CNN) : ${fg.score}/100 — ${fg.label}`
    : 'Fear & Greed : indisponible'

  return `BLOC MARCHÉ (snapshot ${nowParis} Paris, cache 5 min)

Macro :
${macroLines}

${fgLine}

Calendrier éco (prochaines 48 h, US/EUR, impact Medium/High) :
${calLines}

Règle : utilise UNIQUEMENT ces chiffres pour parler du présent. Si une info n'est pas dans ce bloc, dis-le au trader et explique les mécanismes sans inventer de niveau actuel.`
}

/** Retourne le bloc marché (cache 5 min). Jamais throw : si tout
 *  rate, retourne un bloc avec les lignes "indisponibles". */
export async function getMarketBlock(): Promise<string> {
  const now = Date.now()
  if (marketCache && (now - marketCache.at) < MARKET_TTL_MS) return marketCache.block
  try {
    const block = await buildMarketBlock()
    marketCache = { at: now, block }
    return block
  } catch (err) {
    console.error('[jarvis-market] buildMarketBlock failed', err)
    const fallback = 'BLOC MARCHÉ : données indisponibles pour le moment. Explique les mécanismes mais n\'invente pas de chiffre actuel.'
    marketCache = { at: now, block: fallback }
    return fallback
  }
}

/**
 * Le message trader touche-t-il la macro / l'actualité / le marché ?
 * Déclenche l'injection du bloc MARCHÉ dans le prompt (coûteux en
 * tokens → on l'évite quand c'est inutile).
 */
export function needsMarketContext(input: string): boolean {
  if (!input) return false
  const t = input.toLowerCase()
  return /(?<![\p{L}])(fed|fomc|powell|taux|inflation|cpi|nfp|dollar|dxy|vix|news|nouvel\s?les?|actualité|actualités|macro|march[éee]s?|indices?|s&?p|nasdaq|dow|or\b|gold|p[ée]trole|crude|wti|bitcoin|btc|fear.?greed|sentiment|en\s+ce\s+moment|aujourd'?hui|cette semaine)(?![\p{L}])/iu.test(t)
}
