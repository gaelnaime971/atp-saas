import { describe, expect, it } from 'vitest'
import { zonedTimeToUtc } from '@/lib/time'
import type { CalendarEvent } from '@/lib/market/calendar/events'
import {
  canonicalUrl, dedupeNews, ecbClassify, ecbItems, fedItems, flashLine, isFresh, matchesNews, newsHref, parseNewsParams,
  parseRss, rssText, termFr, treasuryItems, type NewsItem,
} from './news'

const FED_PRESS = `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel><title>FRB</title>
<item>
  <title>Federal Reserve issues FOMC statement</title>
  <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261209a.htm]]></link>
  <guid><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261209a.htm]]></guid>
  <description><![CDATA[Federal Reserve issues FOMC statement]]></description>
  <category>Monetary Policy</category>
  <pubDate><![CDATA[Wed, 09 Dec 2026 19:00:00 GMT]]></pubDate>
</item>
<item>
  <title>Minutes of the Board&#39;s discount rate meetings</title>
  <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261124a.htm]]></link>
  <description><![CDATA[Minutes of the Board&#39;s discount rate meetings]]></description>
  <category>Monetary Policy</category>
  <pubDate><![CDATA[Tue, 24 Nov 2026 19:00:00 GMT]]></pubDate>
</item>
<item>
  <title>Agencies announce dollar thresholds</title>
  <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/bcreg20261125b.htm]]></link>
  <category>Banking and Consumer Regulatory Policy</category>
  <pubDate><![CDATA[Wed, 25 Nov 2026 20:00:00 GMT]]></pubDate>
</item>
<item><title>Sans date</title><link>https://www.federalreserve.gov/x.htm</link></item>
<item><title>Ailleurs</title><link>https://example.com/x.htm</link><pubDate>Wed, 25 Nov 2026 20:00:00 GMT</pubDate></item>
</channel></rss>`

const FED_SPEECH = `<rss><channel><item>
  <title>Bowman, Modernizing Banking Supervision</title>
  <link><![CDATA[https://www.federalreserve.gov/newsevents/speech/bowman20261125a.htm]]></link>
  <description><![CDATA[Speech At the ASBA&ndash;BCBS High-Level Meeting, Bras&iacute;lia, Brazil]]></description>
  <category>Speech</category>
  <pubDate><![CDATA[Wed, 25 Nov 2026 12:25:00 GMT]]></pubDate>
</item></channel></rss>`

const ECB = `<rss version="2.0"><channel><title>ECB</title><item><title> Monetary policy decisions</title><link>https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.mp261217~abc.en.html</link><pubDate>Thu, 17 Dec 2026 14:15:00 +0100</pubDate></item><item><title> Christine Lagarde: Acting in time</title><link>https://www.ecb.europa.eu//press/key/date/2026/html/ecb.sp261120~def.en.html</link><pubDate>Fri, 20 Nov 2026 09:00:00 +0100</pubDate></item><item><title> ECB Consumer Expectations Survey results – October 2026</title><link>https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.pr261127~2e5.en.html</link><pubDate>Fri, 27 Nov 2026 10:00:00 +0100</pubDate></item></channel></rss>`

describe('RSS', () => {
  it('texte : CDATA, entités nommées et numériques, balises', () => {
    expect(rssText('<![CDATA[Board&#39;s <b>rate</b> &amp; Bras&iacute;lia]]>')).toBe('Board\'s rate & Brasília')
  })
  it('items : titre et lien obligatoires', () => {
    const items = parseRss(FED_PRESS)
    expect(items).toHaveLength(5)
    expect(items[0]).toMatchObject({ title: 'Federal Reserve issues FOMC statement', category: 'Monetary Policy', pubDate: 'Wed, 09 Dec 2026 19:00:00 GMT' })
  })
  it('adresse canonique : https, doubles barres, requête et fragment retirés', () => {
    expect(canonicalUrl('http://www.ecb.europa.eu//press/pr/x.html?utm=1#top')).toBe('https://www.ecb.europa.eu/press/pr/x.html')
    expect(canonicalUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('Fed', () => {
  it('communiqués : nature, impact, résumé seulement s’il apporte plus que le titre ; sans date ou hors domaine ignorés', () => {
    const items = fedItems(parseRss(FED_PRESS), 'press')
    expect(items.map(i => [i.kind, i.impact])).toEqual([['monetary', 'high'], ['monetary', 'medium'], ['press', 'low']])
    expect(items[0].summary).toBeNull()
    expect(items[1].title).toBe('Minutes of the Board\'s discount rate meetings')
    expect(items[0].publishedAt).toBe(Date.parse('2026-12-09T19:00:00Z'))
  })
  it('discours : résumé officiel gardé', () => {
    const [s] = fedItems(parseRss(FED_SPEECH), 'speech')
    expect(s).toMatchObject({ kind: 'speech', impact: 'medium', summary: 'Speech At the ASBA–BCBS High-Level Meeting, Brasília, Brazil' })
  })
})

describe('BCE', () => {
  it('décision de politique monétaire forte, discours de la présidente moyen, le reste faible', () => {
    const items = ecbItems(parseRss(ECB))
    expect(items.map(i => [i.title, i.kind, i.impact])).toEqual([
      ['Monetary policy decisions', 'monetary', 'high'],
      ['Christine Lagarde: Acting in time', 'speech', 'medium'],
      ['ECB Consumer Expectations Survey results – October 2026', 'press', 'low'],
    ])
    expect(items[0].url).toBe('https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261217~abc.en.html')
    expect(ecbClassify('https://www.ecb.europa.eu/press/accounts/2026/html/ecb.mg261126~c.en.html', 'Meeting').impact).toBe('medium')
  })
})

describe('Trésor : adjudications', () => {
  const closeAt = (d: string, t: string) => zonedTimeToUtc(d, t, 'America/New_York').getTime()
  const row = (over: Record<string, string>) => ({
    cusip: '91282CSA0', securityType: 'Note', securityTerm: '10-Year', originalSecurityTerm: '10-Year', highYield: '4.708',
    bidToCoverRatio: '2.43', reopening: 'No', floatingRate: 'No', tips: 'No',
    competitiveAuctionCloseDate: '2026-12-09T00:00:00', competitiveAuctionCloseTime: '01:00 PM', treasuryAuctionResultsXmlFileName: 'R_20261209_3.xml', ...over,
  })
  it('ligne rédigée par ATP, lien vers le communiqué de résultats, heure de clôture', () => {
    const [a] = treasuryItems([row({})], closeAt)
    expect(a).toMatchObject({
      source: 'treasury', kind: 'auction', impact: 'medium',
      title: 'Adjudication à 10 ans : taux retenu 4,708 %', summary: 'Ratio de couverture 2,43.',
      url: 'https://www.treasurydirect.gov/instit/annceresult/press/preanre/2026/R_20261209_3.pdf',
    })
    expect(a.publishedAt).toBe(closeAt('2026-12-09', '13:00'))
  })
  it('réouverture, autres durées faibles, sans taux ou bons du Trésor ignorés', () => {
    const items = treasuryItems([
      row({ securityTerm: '29-Year 11-Month', originalSecurityTerm: '30-Year', reopening: 'Yes', treasuryAuctionResultsXmlFileName: 'R_1.xml' }),
      row({ originalSecurityTerm: '7-Year', securityTerm: '7-Year', treasuryAuctionResultsXmlFileName: 'R_2.xml' }),
      row({ highYield: '', treasuryAuctionResultsXmlFileName: 'R_3.xml' }),
      row({ securityType: 'Bill', treasuryAuctionResultsXmlFileName: 'R_4.xml' }),
    ], closeAt)
    expect(items.map(i => [i.title, i.impact])).toEqual([
      ['Adjudication à 30 ans (réouverture) : taux retenu 4,708 %', 'medium'],
      ['Adjudication à 7 ans : taux retenu 4,708 %', 'low'],
    ])
    expect(termFr('9-Year 10-Month')).toBe('9 ans 10 mois')
    expect(treasuryItems('pas un tableau', closeAt)).toEqual([])
  })
})

describe('dédoublonnage', () => {
  const base: NewsItem = { id: 'fed:https://www.federalreserve.gov/a.htm', source: 'fed', kind: 'press', title: 'A', summary: null, url: 'https://www.federalreserve.gov/a.htm', category: null, impact: 'low', publishedAt: 2000 }
  it('même clé (flux relu ou adresse écrite autrement) : une ligne, la plus ancienne, le résumé le plus complet', () => {
    const twice = fedItems(parseRss(FED_PRESS), 'press').concat(fedItems(parseRss(FED_PRESS.replace(/https:\/\/www\.federalreserve/g, 'http://www.federalreserve')), 'press'))
    expect(dedupeNews(twice)).toHaveLength(3)
    const merged = dedupeNews([base, { ...base, publishedAt: 1000, summary: 'Résumé', impact: 'medium' }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ publishedAt: 1000, summary: 'Résumé', impact: 'medium' })
  })
  it('triées de la plus récente à la plus ancienne', () => {
    const out = dedupeNews([{ ...base, id: 'a', publishedAt: 1 }, { ...base, id: 'b', publishedAt: 3 }, { ...base, id: 'c', publishedAt: 2 }])
    expect(out.map(i => i.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('lignes flash (chiffres du calendrier)', () => {
  const at = zonedTimeToUtc('2026-12-10', '08:30', 'America/New_York').getTime()
  const cpi: CalendarEvent = {
    id: 'release:10:2026-12-10', kind: 'release', title: 'Inflation (IPC)', agency: 'BLS', at, date: '2026-12-10', impact: 'high', timeOfficial: false,
    figure: { series: 'CPIAUCSL', transform: 'pct_mom', label: 'sur un mois' },
  }
  it('« IPC publiée : chiffre (précédent) »', () => {
    const f = flashLine(cpi, { status: 'published', actual: 0.31, previous: 0.2, period: '2026-11-01' })
    expect(f).toMatchObject({ id: 'flash:release:10:2026-12-10', impact: 'high', at, agency: 'BLS' })
    expect(f!.text).toBe('Inflation (IPC) publiée : +0,3 % sur un mois (précédent +0,2 %)')
  })
  it('accords et unités : emplois, inscriptions, ventes', () => {
    const nfp = { ...cpi, id: 'release:50:x', title: 'Rapport sur l’emploi (NFP)', figure: { series: 'PAYEMS', transform: 'change_k' as const, label: 'emplois créés' } }
    expect(flashLine(nfp, { status: 'published', actual: 165, previous: 60, period: '' })!.text).toBe('Rapport sur l’emploi (NFP) publié : +165 k emplois créés (précédent +60 k)')
    const claims = { ...cpi, id: 'release:180:x', title: 'Inscriptions au chômage', figure: { series: 'ICSA', transform: 'level_k' as const, label: 'nouvelles demandes' } }
    expect(flashLine(claims, { status: 'published', actual: 189, previous: null, period: '' })!.text).toBe('Inscriptions au chômage publiées : 189 k nouvelles demandes')
  })
  it('rien tant que le chiffre n’est pas en ligne, ni pour un férié', () => {
    expect(flashLine(cpi, { status: 'pending' })).toBeNull()
    expect(flashLine(cpi, null)).toBeNull()
    expect(flashLine({ ...cpi, kind: 'holiday', figure: undefined }, { status: 'published', actual: 1, previous: 1, period: '' })).toBeNull()
  })
})

describe('filtres et nouveautés', () => {
  it('paramètres de page aller-retour, valeurs inconnues ignorées', () => {
    const p = parseNewsParams({ source: 'fed,bce,inconnue', impact: ['fort', 'x'] })
    expect(p).toEqual({ sources: ['fed', 'ecb'], impacts: ['high'] })
    expect(newsHref('/dashboard/marches/actus', p)).toBe('/dashboard/marches/actus?source=fed,bce&impact=fort')
    expect(newsHref('/dashboard/marches/actus', { sources: [], impacts: [] })).toBe('/dashboard/marches/actus')
  })
  it('filtres vides = tout ; sinon source ET impact', () => {
    expect(matchesNews({ sources: [], impacts: [] }, 'agencies', 'low')).toBe(true)
    expect(matchesNews({ sources: ['fed'], impacts: ['high'] }, 'fed', 'medium')).toBe(false)
    expect(matchesNews({ sources: ['fed', 'agencies'], impacts: [] }, 'agencies', 'low')).toBe(true)
  })
  it('nouveau : moins de 24 h', () => {
    const now = Date.parse('2026-11-27T15:00:00Z')
    expect(isFresh(now - 23 * 3_600_000, now)).toBe(true)
    expect(isFresh(now - 25 * 3_600_000, now)).toBe(false)
  })
})
