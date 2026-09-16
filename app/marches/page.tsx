'use client'

/**
 * /marches — poste de commandement public du trader.
 *
 * Landing pédagogique et data-dense, accessible sans compte (voir
 * proxy.ts publicRoutes). Objectif : donner au visiteur la sensation
 * d'entrer dans une salle des marchés — calendrier économique live,
 * Bloomberg TV, indices, news top stories, sessions marchés en temps
 * réel, watchlist futures. Tout en widgets TradingView gratuits (dark
 * natif + FR) + iframe YouTube pour Bloomberg. Aucune API paid.
 *
 * Design : DA ATP tokens (--color-surface-*, --color-accent),
 * Outfit display + DM Mono data (chargés par le layout root). Sombre
 * premium, gold accent réservé aux moments d'invite à agir.
 *
 * Sensible à l'hydratation : aucun new Date() au render level. Les
 * composants live (LiveClock, MarketSessions) sont client-only avec
 * état null au SSR — zéro mismatch #418 possible.
 */

import TradingViewWidget from '@/components/marches/TradingViewWidget'
import BloombergLive from '@/components/marches/BloombergLive'
import MarketSessions from '@/components/marches/MarketSessions'
import LiveClock from '@/components/marches/LiveClock'

export default function MarchesPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-surface-0)',
      color: 'var(--color-text-1)',
      paddingBottom: 80,
    }}>
      <div style={{
        maxWidth: 1440,
        margin: '0 auto',
        padding: '32px 24px 0',
      }}>
        <Hero />

        {/* Ticker tape défilant — indices + FX + crypto (bandeau top) */}
        <Section marginTop={24} noPadding>
          <TradingViewWidget
            scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
            configKey="ticker-tape-mixed"
            height={62}
            config={{
              symbols: [
                { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
                { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
                { proName: 'FOREXCOM:DJI', title: 'Dow Jones' },
                { proName: 'CME_MINI:ES1!', title: 'ES Futures' },
                { proName: 'CME_MINI:NQ1!', title: 'NQ Futures' },
                { proName: 'CME_MINI:YM1!', title: 'YM Futures' },
                { proName: 'FX:EURUSD', title: 'EUR/USD' },
                { proName: 'FX:GBPUSD', title: 'GBP/USD' },
                { proName: 'FX:USDJPY', title: 'USD/JPY' },
                { proName: 'TVC:GOLD', title: 'Or' },
                { proName: 'TVC:USOIL', title: 'Pétrole WTI' },
                { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
              ],
              showSymbolLogo: true,
              isTransparent: true,
              displayMode: 'adaptive',
              colorTheme: 'dark',
              locale: 'fr',
            }}
          />
        </Section>

        {/* Rangée principale : Calendrier économique (2/3) + Bloomberg TV (1/3) */}
        <Section marginTop={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }} className="marches-hero-row">
            <Card
              eyebrow="Live"
              title="Calendrier économique"
              subtitle="Publications macro, importance et consensus — filtrable par pays et niveau"
            >
              <TradingViewWidget
                scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
                configKey="calendar-fr"
                height={520}
                config={{
                  colorTheme: 'dark',
                  isTransparent: true,
                  locale: 'fr',
                  width: '100%',
                  height: 520,
                  importanceFilter: '-1,0,1',   // toutes importances
                  countryFilter: 'us,eu,gb,fr,de,jp,cn,ca,au,ch',
                }}
              />
            </Card>

            <Card
              eyebrow="En direct"
              title="Bloomberg TV"
              subtitle="Flux live — muet par défaut, active le son via les contrôles"
            >
              <BloombergLive />
              <div style={{
                marginTop: 12,
                fontSize: 11, color: 'var(--color-text-3)', lineHeight: 1.5,
              }}>
                Bloomberg TV diffuse en anglais 24/7 depuis New York. Le flux est
                fourni par YouTube — activez le son directement sur le lecteur.
              </div>
            </Card>
          </div>
        </Section>

        {/* Rangée news : Market Overview + Top Stories */}
        <Section marginTop={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }} className="marches-news-row">
            <Card
              eyebrow="Marchés"
              title="Vue d'ensemble"
              subtitle="Indices majeurs par région, sparkline temps réel"
            >
              <TradingViewWidget
                scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
                configKey="market-overview"
                height={480}
                config={{
                  colorTheme: 'dark',
                  dateRange: '1D',
                  showChart: true,
                  locale: 'fr',
                  largeChartUrl: '',
                  isTransparent: true,
                  showSymbolLogo: true,
                  showFloatingTooltip: true,
                  width: '100%',
                  height: 480,
                  plotLineColorGrowing: '#22c55e',
                  plotLineColorFalling: '#ef4444',
                  gridLineColor: 'rgba(255,255,255,0.06)',
                  scaleFontColor: '#a1a1aa',
                  belowLineFillColorGrowing: 'rgba(34, 197, 94, 0.12)',
                  belowLineFillColorFalling: 'rgba(239, 68, 68, 0.12)',
                  belowLineFillColorGrowingBottom: 'rgba(34, 197, 94, 0)',
                  belowLineFillColorFallingBottom: 'rgba(239, 68, 68, 0)',
                  symbolActiveColor: 'rgba(201, 165, 116, 0.12)',
                  tabs: [
                    {
                      title: 'Indices',
                      symbols: [
                        { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
                        { s: 'FOREXCOM:NSXUSD', d: 'Nasdaq 100' },
                        { s: 'FOREXCOM:DJI', d: 'Dow Jones' },
                        { s: 'INDEX:CAC40', d: 'CAC 40' },
                        { s: 'INDEX:DAX', d: 'DAX' },
                        { s: 'INDEX:NKY', d: 'Nikkei 225' },
                      ],
                    },
                    {
                      title: 'FX',
                      symbols: [
                        { s: 'FX:EURUSD', d: 'EUR/USD' },
                        { s: 'FX:GBPUSD', d: 'GBP/USD' },
                        { s: 'FX:USDJPY', d: 'USD/JPY' },
                        { s: 'FX:USDCHF', d: 'USD/CHF' },
                        { s: 'FX:AUDUSD', d: 'AUD/USD' },
                        { s: 'FX:USDCAD', d: 'USD/CAD' },
                      ],
                    },
                    {
                      title: 'Matières',
                      symbols: [
                        { s: 'TVC:GOLD', d: 'Or' },
                        { s: 'TVC:SILVER', d: 'Argent' },
                        { s: 'TVC:USOIL', d: 'Pétrole WTI' },
                        { s: 'TVC:UKOIL', d: 'Brent' },
                        { s: 'NYMEX:NG1!', d: 'Gaz naturel' },
                        { s: 'COMEX:HG1!', d: 'Cuivre' },
                      ],
                    },
                  ],
                }}
              />
            </Card>

            <Card
              eyebrow="Fil d'actu"
              title="Top stories"
              subtitle="Dépêches Reuters/Bloomberg agrégées, tri par pertinence"
            >
              <TradingViewWidget
                scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
                configKey="timeline-fr"
                height={480}
                config={{
                  feedMode: 'all_symbols',
                  isTransparent: true,
                  displayMode: 'regular',
                  width: '100%',
                  height: 480,
                  colorTheme: 'dark',
                  locale: 'fr',
                }}
              />
            </Card>
          </div>
        </Section>

        {/* Sessions marchés — live */}
        <Section marginTop={32}>
          <SectionHeader
            eyebrow="Sessions"
            title="Où se joue le marché en ce moment"
            subtitle="Statut live des 3 grandes sessions cash — futures US quasi 24/7 ci-dessous"
          />
          <div style={{ marginTop: 16 }}>
            <MarketSessions />
          </div>
        </Section>

        {/* Watchlist futures — Symbol Overview */}
        <Section marginTop={32}>
          <SectionHeader
            eyebrow="Futures"
            title="Watchlist temps réel"
            subtitle="Les 4 grands futures index US suivis par la méthode ATP"
          />
          <div style={{
            marginTop: 16,
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: 20,
          }}>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js"
              configKey="futures-us"
              height={480}
              config={{
                symbols: [
                  ['S&P 500', 'CME_MINI:ES1!|1D'],
                  ['Nasdaq 100', 'CME_MINI:NQ1!|1D'],
                  ['Dow Jones', 'CBOT_MINI:YM1!|1D'],
                  ['Russell 2000', 'CME_MINI:RTY1!|1D'],
                ],
                chartOnly: false,
                width: '100%',
                height: 480,
                locale: 'fr',
                colorTheme: 'dark',
                autosize: true,
                showVolume: false,
                showMA: false,
                hideDateRanges: false,
                hideMarketStatus: false,
                hideSymbolLogo: false,
                scalePosition: 'right',
                scaleMode: 'Normal',
                fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, Roboto, Ubuntu, sans-serif',
                fontSize: '10',
                noTimeScale: false,
                valuesTracking: '1',
                changeMode: 'price-and-percent',
                chartType: 'area',
                lineColor: 'rgba(201, 165, 116, 1)',
                topColor: 'rgba(201, 165, 116, 0.28)',
                bottomColor: 'rgba(201, 165, 116, 0)',
                lineWidth: 2,
                lineType: 0,
                dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
              }}
            />
          </div>
        </Section>

        {/* Footer CTA */}
        <Section marginTop={48}>
          <div style={{
            padding: '32px 28px',
            background: 'linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.08), rgba(var(--color-accent-rgb), 0.02))',
            border: '1px solid rgba(var(--color-accent-rgb), 0.24)',
            borderRadius: 'var(--radius-xl)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 24, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20, fontWeight: 700, color: 'var(--color-text-1)',
                lineHeight: 1.25,
              }}>
                Envie d'aller plus loin que la lecture du marché ?
              </div>
              <div style={{
                fontSize: 14, color: 'var(--color-text-2)', marginTop: 6, maxWidth: 620,
                lineHeight: 1.5,
              }}>
                Le dashboard ATP suit tes vraies sessions, calcule ton profil trader
                et te donne un feedback IA sur ta discipline, ton mental et ta méthode.
              </div>
            </div>
            <a
              href="/login"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 22px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-accent)',
                color: 'var(--color-surface-0)',
                fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
                transition: 'background var(--motion-fast) var(--motion-ease-out)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)' }}
            >
              Accéder au dashboard →
            </a>
          </div>
        </Section>

        <div style={{
          marginTop: 32,
          fontSize: 11, color: 'var(--color-text-3)',
          textAlign: 'center', lineHeight: 1.6,
        }}>
          Données de marché fournies par TradingView. Bloomberg TV via YouTube Live.
          Cette page est publique et à titre informatif — aucune donnée n'est
          reliée à ton compte ATP.
        </div>
      </div>

      {/* Responsive : rangées 2 col → 1 col en < 900px */}
      <style>{`
        @media (max-width: 900px) {
          .marches-hero-row, .marches-news-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sous-composants de mise en page
// ─────────────────────────────────────────────────────────────

function Hero() {
  return (
    <header style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      gap: 24, flexWrap: 'wrap',
      padding: '24px 0 8px',
      borderBottom: '1px solid var(--color-border-subtle)',
    }}>
      <div style={{ maxWidth: 620 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
          marginBottom: 10,
        }}>
          Salle des marchés · ATP
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 4vw, 42px)',
          fontWeight: 700, color: 'var(--color-text-1)',
          margin: 0, lineHeight: 1.1, letterSpacing: '-0.02em',
        }}>
          Le poste de commandement du trader.
        </h1>
        <p style={{
          fontSize: 15, color: 'var(--color-text-2)',
          marginTop: 12, lineHeight: 1.55, maxWidth: 560,
        }}>
          Calendrier économique, Bloomberg TV en direct, indices, actus
          Reuters — tout ce que je regarde chaque matin avant d'ouvrir
          la première session, sur un seul écran.
        </p>
      </div>
      <LiveClock />
    </header>
  )
}

function SectionHeader({
  eyebrow, title, subtitle,
}: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--color-text-3)',
      }}>
        {eyebrow}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 20, fontWeight: 600, color: 'var(--color-text-1)',
        marginTop: 4, letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 13, color: 'var(--color-text-3)', marginTop: 4,
        }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function Section({
  children, marginTop = 0, noPadding = false,
}: { children: React.ReactNode; marginTop?: number; noPadding?: boolean }) {
  return (
    <section style={{ marginTop, padding: noPadding ? 0 : undefined }}>
      {children}
    </section>
  )
}

function Card({
  eyebrow, title, subtitle, children,
}: { eyebrow: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface-1)',
      border: '1px solid var(--color-border-subtle)',
      borderRadius: 'var(--radius-xl)',
      padding: 20,
      display: 'flex', flexDirection: 'column', gap: 14,
      minWidth: 0,
    }}>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--color-accent)',
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16, fontWeight: 600, color: 'var(--color-text-1)',
          marginTop: 4,
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 12, color: 'var(--color-text-3)', marginTop: 4,
            lineHeight: 1.5,
          }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  )
}
