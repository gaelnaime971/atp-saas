'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Landing ÉLITE PRO — route publique /.
 *
 * V2 : titre héro inversé, onglets dashboard cliquables (TradeZella-style),
 * vraies images + vidéos. Vidéos en preload="none" + play-on-view pour
 * limiter le téléchargement initial (voir alerte poids côté brief).
 *
 * Pour voir en dev :
 *   npm run dev → http://localhost:3000/
 *   DÉCONNECTÉ (proxy.ts redirige / vers /dashboard si session active).
 */

const WHOP_CHECKOUT = 'https://whop.com/elite-b6/elite-b6/'

// ─── Section 4 : onglets dashboard (TradeZella-style) ────────────────────
const DASHBOARD_TABS = [
  {
    id: 'score',
    label: 'ATP Score',
    image: '/landing/10-atp-score.webp',
    title: 'Mesure qui tu es, pas juste ton PnL.',
    body: "Un radar à 6 axes — discipline, gestion du risque, exécution, consistance, préparation, mental — construit à partir de ta data réelle. Tu vois ce qui te fait progresser, et ce qui te freine. En continu.",
  },
  {
    id: 'ia',
    label: 'Analyses IA',
    image: '/landing/09-analyses-ia.webp',
    title: "Une IA qui analyse même ton état mental.",
    body: "Technique, synthèse, et surtout mental. L'IA ATP détecte le tilt, la fatigue, la peur, l'excitation — à partir de ta journée de trading. Personne d'autre ne fait ça.",
  },
  {
    id: 'calendar',
    label: 'Calendrier P&L',
    image: '/landing/07-calendrier-pnl.webp',
    title: "Tes meilleurs et pires jours, d'un coup d'œil.",
    body: "Vue mois complète, zoom par jour, répartition instrument, winrate journalier. Tu vois les patterns qui t'échappent — jours, horaires, émotions dominantes.",
  },
  {
    id: 'propfirm',
    label: 'Prop Firm',
    image: '/landing/11-prop-firm.webp',
    title: 'Tes challenges prop firm, synchronisés et clairs.',
    body: "Equity curve, drawdown max, règles, objectifs restants, dates butoir. Un dashboard par challenge. Zéro Excel. Tu ne rates plus une règle, tu valides mieux.",
  },
  {
    id: 'assistant',
    label: 'Assistant IA',
    image: '/landing/05-assistant-trader-ia.webp',
    title: 'Un coach IA entraîné sur ta façon de trader.',
    body: "Pose-lui tes questions sur ta session, tes stats, un setup. Il connaît ton historique, ta checklist, tes règles. Il t'oriente — pas de bullshit motivationnel.",
  },
  {
    id: 'bilan',
    label: 'Bilan 2027',
    image: '/landing/13-bilan-trader-2027.webp',
    title: 'Ton année en PDF : stats, insights, progression.',
    body: "Un rapport annuel propre : courbes, KPIs clés, insights IA, prop firms, points de rupture. À garder, à relire, à partager avec ton coach.",
  },
] as const

// ─── Bouton CTA primaire (or) réutilisable ──────────────────────────────
function PrimaryCTA({
  href,
  children,
  size = 'md',
  external = true,
}: {
  href: string
  children: React.ReactNode
  size?: 'md' | 'lg'
  external?: boolean
}) {
  const padding = size === 'lg' ? '16px 28px' : '14px 24px'
  const fontSize = size === 'lg' ? 16 : 15
  const extra = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}
  return (
    <a
      href={href}
      {...extra}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-accent)',
        color: 'var(--color-surface-0)',
        fontSize,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        textDecoration: 'none',
        boxShadow: '0 8px 24px rgba(var(--color-accent-rgb), 0.28)',
        transition:
          'background var(--motion-base) var(--motion-ease-out), transform var(--motion-fast) var(--motion-ease-out), box-shadow var(--motion-base) var(--motion-ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-accent-strong)'
        e.currentTarget.style.boxShadow =
          '0 10px 28px rgba(var(--color-accent-rgb), 0.38)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-accent)'
        e.currentTarget.style.boxShadow =
          '0 8px 24px rgba(var(--color-accent-rgb), 0.28)'
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(1px)'
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {children}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </a>
  )
}

// ─── Carte image avec bordure + ombre (pour les cartes flottantes héro) ──
function CardImage({
  src,
  alt,
  priority = false,
  sizes,
  width = 800,
  height = 600,
}: {
  src: string
  alt: string
  priority?: boolean
  sizes?: string
  width?: number
  height?: number
}) {
  return (
    <div
      style={{
        width: '100%',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'var(--color-surface-1)',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35)',
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  )
}

// ─── Vidéo paresseuse (preload=none + autoplay quand visible) ───────────
function LazyVideo({
  src,
  aspectRatio = '16 / 9',
  rounded = 'var(--radius-xl)',
}: {
  src: string
  aspectRatio?: string
  rounded?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            v.play().catch(() => {})
          } else {
            v.pause()
          }
        })
      },
      { threshold: 0.3 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  return (
    <div
      style={{
        width: '100%',
        aspectRatio,
        borderRadius: rounded,
        overflow: 'hidden',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  )
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [activeTabId, setActiveTabId] = useState<string>(DASHBOARD_TABS[0].id)
  const activeTab =
    DASHBOARD_TABS.find((t) => t.id === activeTabId) ?? DASHBOARD_TABS[0]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          },
        )
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={rootRef}
      style={{
        background: 'var(--color-surface-0)',
        color: 'var(--color-text-1)',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* ─── 1. NAV ────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          background: scrolled ? 'rgba(9, 9, 11, 0.78)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          borderBottom: scrolled
            ? '1px solid var(--color-border-subtle)'
            : '1px solid transparent',
          transition:
            'background var(--motion-base) var(--motion-ease-out), border-color var(--motion-base) var(--motion-ease-out)',
        }}
      >
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Image
            src="/logo-atp-white.png"
            alt="Alpha Trading Pro"
            width={160}
            height={35}
            priority
            style={{ height: 32, width: 'auto' }}
          />
        </Link>
        <Link
          href="/login"
          style={{
            fontSize: 14,
            color: 'var(--color-text-2)',
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: 'var(--radius-md)',
            transition: 'color var(--motion-fast) var(--motion-ease-out)',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--color-text-1)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--color-text-2)')
          }
        >
          Connexion
        </Link>
      </nav>

      {/* ─── 2. HÉRO ──────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '40px 24px 80px',
          minHeight: 'calc(100vh - 60px)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 60% 50% at 70% 40%, rgba(var(--color-accent-rgb), 0.10) 0%, transparent 70%)',
          }}
        />

        <div
          className="hero-grid"
          style={{
            position: 'relative',
            maxWidth: 1240,
            margin: '0 auto',
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 48,
            alignItems: 'center',
          }}
        >
          {/* GAUCHE — texte */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent-soft)',
                border: '1px solid rgba(var(--color-accent-rgb), 0.24)',
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.02em',
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--color-accent)',
                }}
              />
              La plateforme des traders ATP
            </div>

            <h1
              style={{
                fontSize: 'clamp(40px, 6.4vw, 80px)',
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: '-0.035em',
                margin: 0,
                marginBottom: 28,
                color: 'var(--color-text-1)',
              }}
            >
              Ton PnL ne dit pas tout.{' '}
              <span style={{ color: 'var(--color-accent)' }}>
                Deviens un meilleur trader.
              </span>
            </h1>

            <p
              style={{
                fontSize: 'clamp(15px, 1.6vw, 18px)',
                lineHeight: 1.55,
                color: 'var(--color-text-2)',
                maxWidth: 540,
                margin: 0,
                marginBottom: 32,
              }}
            >
              Dashboard pro, lives trading quotidiens, coaching psychologique
              avec coach en neuroscience et vraie communauté. Tout ce qu&apos;il
              te faut pour construire ton identité de trader.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <PrimaryCTA href={WHOP_CHECKOUT} size="lg">
                Rejoindre ÉLITE PRO
              </PrimaryCTA>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--color-text-3)',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--color-accent)', letterSpacing: 1 }}>
                  ★★★★★
                </span>
                <span>5.0 (19 avis)</span>
              </div>
            </div>
          </div>

          {/* DROITE — mockup dashboard + 3 cartes flottantes */}
          <div
            style={{
              position: 'relative',
              aspectRatio: '4 / 3',
              width: '100%',
            }}
          >
            {/* Mockup dashboard de fond */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <CardImage
                src="/landing/01-dashboard.webp"
                alt="Dashboard Alpha Trading Pro"
                priority
                sizes="(min-width: 900px) 50vw, 100vw"
                width={1600}
                height={1200}
              />
            </div>

            {/* Carte flottante 1 — ATP Score (haut gauche) */}
            <div
              style={{
                position: 'absolute',
                top: '6%',
                left: '-8%',
                width: '38%',
                zIndex: 3,
              }}
              className="hero-card hero-card-1"
            >
              <CardImage
                src="/landing/10-atp-score.webp"
                alt="ATP Score radar"
                sizes="(min-width: 900px) 20vw, 40vw"
                width={800}
                height={800}
              />
            </div>

            {/* Carte flottante 2 — Calendrier (bas gauche) */}
            <div
              style={{
                position: 'absolute',
                bottom: '-8%',
                left: '18%',
                width: '42%',
                zIndex: 4,
              }}
              className="hero-card hero-card-2"
            >
              <CardImage
                src="/landing/07-calendrier-pnl.webp"
                alt="Calendrier P&L"
                sizes="(min-width: 900px) 22vw, 45vw"
                width={1200}
                height={900}
              />
            </div>

            {/* Carte flottante 3 — Analyses IA (haut droite) */}
            <div
              style={{
                position: 'absolute',
                top: '18%',
                right: '-10%',
                width: '38%',
                zIndex: 5,
              }}
              className="hero-card hero-card-3"
            >
              <CardImage
                src="/landing/09-analyses-ia.webp"
                alt="Analyses IA ATP"
                sizes="(min-width: 900px) 20vw, 40vw"
                width={800}
                height={1000}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. BANDEAU CONFIANCE ────────────────────────────────── */}
      <section
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
          padding: '28px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 32,
            color: 'var(--color-text-2)',
            fontSize: 14,
          }}
        >
          <span>
            <strong style={{ color: 'var(--color-text-1)' }}>+1 200</strong>{' '}
            traders
          </span>
          <span style={{ color: 'var(--color-text-3)' }}>·</span>
          <span>
            <span style={{ color: 'var(--color-accent)', letterSpacing: 1 }}>
              ★★★★★
            </span>{' '}
            5.0 (19 avis)
          </span>
          <span style={{ color: 'var(--color-text-3)' }}>·</span>
          <span>depuis 2024</span>
        </div>
      </section>

      {/* ─── 4. DASHBOARD EN ACTION — ONGLETS ────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '112px 24px',
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div
            className="reveal"
            style={{ textAlign: 'center', marginBottom: 56 }}
          >
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              Le dashboard en action
            </div>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 16,
              }}
            >
              Tout ton trading.{' '}
              <span style={{ color: 'var(--color-accent)' }}>
                Un seul endroit.
              </span>
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: 'var(--color-text-2)',
                maxWidth: 620,
                margin: '0 auto',
              }}
            >
              Six outils construits pour les traders sérieux — pensés par un
              ex-trader de banque, utilisés par +1 200 personnes.
            </p>
          </div>

          {/* Onglets (scrollables horizontalement sur mobile) */}
          <div
            className="reveal"
            style={{
              marginBottom: 40,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: 4,
                minWidth: 'max-content',
                margin: '0 auto',
                borderBottom: '1px solid var(--color-border-subtle)',
                padding: '0 4px',
              }}
            >
              {DASHBOARD_TABS.map((tab) => {
                const isActive = tab.id === activeTabId
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '14px 18px',
                      fontSize: 14,
                      fontWeight: 500,
                      color: isActive
                        ? 'var(--color-accent)'
                        : 'var(--color-text-3)',
                      borderBottom: isActive
                        ? '2px solid var(--color-accent)'
                        : '2px solid transparent',
                      marginBottom: -1,
                      whiteSpace: 'nowrap',
                      transition:
                        'color var(--motion-fast) var(--motion-ease-out), border-color var(--motion-fast) var(--motion-ease-out)',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = 'var(--color-text-1)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = 'var(--color-text-3)'
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Zone contenu — texte gauche + image droite, fade on change */}
          <div
            key={activeTab.id}
            className="tabs-content tabs-fade-in"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 32,
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--color-accent)',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  marginBottom: 12,
                }}
              >
                {activeTab.label}
              </div>
              <h3
                style={{
                  fontSize: 'clamp(22px, 2.8vw, 30px)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  margin: 0,
                  marginBottom: 16,
                  color: 'var(--color-text-1)',
                }}
              >
                {activeTab.title}
              </h3>
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'var(--color-text-2)',
                  margin: 0,
                }}
              >
                {activeTab.body}
              </p>
            </div>
            <div
              style={{
                position: 'relative',
                padding: '32px 16px',
              }}
            >
              {/* Halo radial accent + or derrière l'image active —
                  "fait briller" la capture, zéro cadre, zéro bordure */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background:
                    'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(var(--color-accent-rgb), 0.14) 0%, rgba(var(--color-accent-rgb), 0.04) 40%, transparent 72%)',
                  filter: 'blur(8px)',
                }}
              />
              {/* Image "nue" : pas de bordure, pas de fond, juste une
                  drop-shadow premium pour la profondeur */}
              <Image
                src={activeTab.image}
                alt={activeTab.title}
                width={1600}
                height={1000}
                sizes="(min-width: 900px) 50vw, 100vw"
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  filter:
                    'drop-shadow(0 30px 60px rgba(0, 0, 0, 0.55)) drop-shadow(0 6px 16px rgba(0, 0, 0, 0.35))',
                }}
              />
            </div>
          </div>

          {/* Mosaïque "Et plus encore" — captures bonus (02, 04, 06, 08, 12) */}
          <div
            className="reveal"
            style={{
              marginTop: 72,
              paddingTop: 48,
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                textAlign: 'center',
                marginBottom: 32,
                color: 'var(--color-text-3)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
              }}
            >
              Et bien plus encore
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              {[
                {
                  src: '/landing/02-routine-pre-marche.webp',
                  label: 'Routine pré-marché',
                },
                {
                  src: '/landing/04-calculateur-risque.webp',
                  label: 'Calculateur de risque',
                },
                {
                  src: '/landing/06-journal-de-trading.webp',
                  label: 'Journal de trading',
                },
                {
                  src: '/landing/08-stats-performance.webp',
                  label: 'Stats de performance',
                },
                {
                  src: '/landing/12-achievements.webp',
                  label: 'Achievements',
                },
              ].map((item) => (
                <div key={item.src}>
                  <CardImage
                    src={item.src}
                    alt={item.label}
                    sizes="(min-width: 900px) 20vw, 45vw"
                    width={800}
                    height={600}
                  />
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. OFFRE ÉLITE PRO ──────────────────────────────────── */}
      <section
        style={{
          padding: '96px 24px',
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div
            className="reveal"
            style={{ textAlign: 'center', marginBottom: 56 }}
          >
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              L&apos;offre
            </div>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Ce qui est inclus dans{' '}
              <span style={{ color: 'var(--color-accent)' }}>ÉLITE PRO</span>
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 20,
            }}
          >
            {[
              {
                title: 'Dashboard complet',
                desc: 'ATP Score, 3 analyses IA, calendrier P&L, prop firm, assistant IA, bilan annuel.',
              },
              {
                title: 'Lives trading quotidiens',
                desc: 'Sessions en direct avec analyse marchés et exécution en temps réel.',
              },
              {
                title: 'Discord exclusif',
                desc: 'Communauté active, questions, partage de trades, support entre pairs.',
              },
              {
                title: 'Coaching neuroscience',
                desc: 'Un vrai coach psychologique spécialisé neurosciences, pour travailler le mental.',
              },
              {
                title: 'Contenu crypto + forex',
                desc: 'Analyses, setups, et formations sur les marchés que tu trades vraiment.',
              },
              {
                title: 'Formations vidéo',
                desc: 'Modules structurés — gestion du risque, psychologie, stratégies, journaling.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="reveal"
                style={{
                  padding: 24,
                  borderRadius: 'var(--radius-xl)',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-subtle)',
                  transition:
                    'border-color var(--motion-base) var(--motion-ease-out), transform var(--motion-base) var(--motion-ease-out)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    'rgba(var(--color-accent-rgb), 0.3)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    'var(--color-border-subtle)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-accent-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                    marginBottom: 14,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: 0,
                    marginBottom: 6,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--color-text-2)',
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 6. QUI EST DERRIÈRE ATP ─────────────────────────────── */}
      <section style={{ padding: '96px 24px' }}>
        <div
          className="reveal"
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 48,
            alignItems: 'center',
          }}
          data-section="gael"
        >
          <div style={{ maxWidth: 360, justifySelf: 'center' }}>
            <div
              style={{
                borderRadius: 'var(--radius-2xl)',
                overflow: 'hidden',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
              }}
            >
              <Image
                src="/landing/gael-portrait.jpg"
                alt="Gaël, fondateur ATP"
                width={1400}
                height={1750}
                sizes="(min-width: 900px) 320px, 80vw"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
          <div>
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              Qui est derrière ATP
            </div>
            <h2
              style={{
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 20,
              }}
            >
              Gaël. Pas un gourou Instagram.{' '}
              <span style={{ color: 'var(--color-accent)' }}>
                Un vrai pro des marchés.
              </span>
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
                margin: 0,
                marginBottom: 12,
              }}
            >
              Ingénieur financier spécialisé en finance de marché. Ancien
              trader en banque d&apos;investissement et en hedge fund, à Paris et
              Luxembourg.
            </p>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--color-text-2)',
                margin: 0,
              }}
            >
              ATP est né de ce qui lui manquait quand il tradait pro : un
              outil qui ne mesure pas que le PnL, qui prend l&apos;humain au
              sérieux, et qui construit vraiment des traders — pas des coups
              de chance.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 7. LE SÉMINAIRE ─────────────────────────────────────── */}
      <section
        style={{
          padding: '96px 24px',
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div
            className="reveal"
            style={{ textAlign: 'center', marginBottom: 56 }}
          >
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              Le séminaire
            </div>
            <h2
              style={{
                fontSize: 'clamp(28px, 4vw, 44px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                marginBottom: 16,
              }}
            >
              Une vraie communauté,{' '}
              <span style={{ color: 'var(--color-accent)' }}>
                pas juste un Discord
              </span>
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: 'var(--color-text-2)',
                maxWidth: 620,
                margin: '0 auto',
              }}
            >
              On se retrouve en vrai. Formations intensives, trading en
              groupe, moments de vie. Parce qu&apos;un écran, ça ne construit
              pas un trader seul.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
            }}
          >
            {[
              '/landing/seminaire-routine-julien.mp4',
              '/landing/seminaire-trader-20-ans.mp4',
              '/landing/seminaire-journee.mp4',
            ].map((src) => (
              <div key={src} className="reveal">
                <LazyVideo src={src} aspectRatio="9 / 16" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 8. ANGLE MENTAL (section signature) ──────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '112px 24px',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 50% 60% at 50% 50%, rgba(var(--color-accent-rgb), 0.12) 0%, transparent 65%)',
          }}
        />
        <div
          className="reveal"
          style={{
            position: 'relative',
            maxWidth: 980,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              color: 'var(--color-accent)',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: 16,
            }}
          >
            Notre vraie différence
          </div>
          <h2
            style={{
              fontSize: 'clamp(30px, 4.5vw, 52px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.12,
              margin: 0,
              marginBottom: 24,
            }}
          >
            Le trading, c&apos;est 80%{' '}
            <span style={{ color: 'var(--color-accent)' }}>mental</span>.
            <br />
            On est les seuls à l&apos;analyser.
          </h2>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
              maxWidth: 680,
              margin: '0 auto 40px',
            }}
          >
            Une IA qui détecte ton état mental dans ta data. Un vrai coach
            formé en neurosciences qui t&apos;aide à travailler ce qui se passe
            dans ta tête. Pas un module optionnel — c&apos;est le cœur d&apos;ATP.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 20,
              marginTop: 40,
            }}
          >
            <div className="reveal">
              <CardImage
                src="/landing/09-analyses-ia.webp"
                alt="Analyse mentale IA — carte psychologie"
                sizes="(min-width: 900px) 40vw, 90vw"
                width={1200}
                height={900}
              />
            </div>
            <div className="reveal">
              <CardImage
                src="/landing/03-analyse-multi-piliers.webp"
                alt="Analyse multi-piliers"
                sizes="(min-width: 900px) 40vw, 90vw"
                width={1200}
                height={900}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── 8bis. VIDÉO PLATEFORME ───────────────────────────────── */}
      <section
        style={{
          padding: '96px 24px',
          background: 'var(--color-surface-1)',
          borderTop: '1px solid var(--color-border-subtle)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div
            className="reveal"
            style={{ textAlign: 'center', marginBottom: 48 }}
          >
            <div
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: 12,
              }}
            >
              Découvre la plateforme
            </div>
            <h2
              style={{
                fontSize: 'clamp(26px, 3.6vw, 38px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              L&apos;outil que tu attendais, en{' '}
              <span style={{ color: 'var(--color-accent)' }}>60 secondes</span>
            </h2>
          </div>
          <div className="reveal">
            <LazyVideo
              src="/landing/motion-plateforme.mp4"
              aspectRatio="16 / 9"
            />
          </div>
        </div>
      </section>

      {/* ─── 9. CTA FINAL ────────────────────────────────────────── */}
      <section style={{ padding: '112px 24px' }}>
        <div
          className="reveal"
          style={{
            maxWidth: 820,
            margin: '0 auto',
            textAlign: 'center',
            padding: '56px 32px',
            borderRadius: 'var(--radius-3xl)',
            background:
              'linear-gradient(135deg, var(--color-surface-1) 0%, var(--color-surface-2) 100%)',
            border: '1px solid rgba(var(--color-accent-rgb), 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.14,
              margin: 0,
              marginBottom: 20,
            }}
          >
            Prêt à devenir{' '}
            <span style={{ color: 'var(--color-accent)' }}>un vrai trader</span>{' '}
            ?
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: 'var(--color-text-2)',
              maxWidth: 540,
              margin: '0 auto 32px',
            }}
          >
            Dashboard, lives, coaching neuroscience, Discord. Tout ce qu&apos;il
            te faut pour arrêter de deviner et commencer à construire.
          </p>
          <PrimaryCTA href={WHOP_CHECKOUT} size="lg">
            Rejoindre ÉLITE PRO
          </PrimaryCTA>
          <div
            style={{
              marginTop: 20,
              fontSize: 13,
              color: 'var(--color-text-3)',
            }}
          >
            +1 200 traders déjà dedans · 5.0 ★ (19 avis)
          </div>
        </div>
      </section>

      {/* ─── 10. FOOTER ──────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid var(--color-border-subtle)',
          padding: '48px 24px 32px',
          background: 'var(--color-surface-0)',
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 32,
            marginBottom: 32,
          }}
        >
          <div>
            <Image
              src="/logo-atp-white.png"
              alt="Alpha Trading Pro"
              width={120}
              height={26}
              style={{ height: 24, width: 'auto', marginBottom: 12 }}
            />
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--color-text-3)',
                margin: 0,
                maxWidth: 240,
              }}
            >
              La plateforme des traders qui veulent construire une vraie
              identité, pas juste chasser le PnL.
            </p>
          </div>
          <FooterCol
            title="Produit"
            links={[
              { label: 'Dashboard', href: '#' },
              { label: 'Lives', href: '#' },
              { label: 'Discord', href: '#' },
              {
                label: 'Rejoindre ÉLITE PRO',
                href: WHOP_CHECKOUT,
                external: true,
              },
            ]}
          />
          <FooterCol
            title="ATP"
            links={[
              { label: 'Qui sommes-nous', href: '#' },
              { label: 'Méthode', href: '/methode-atp' },
              { label: 'Séminaire', href: '/trading-night-guadeloupe' },
              { label: 'Connexion', href: '/login' },
            ]}
          />
          <FooterCol
            title="Suivez-nous"
            links={[
              { label: 'Discord', href: '#', external: true },
              { label: 'Instagram', href: '#', external: true },
              { label: 'X (Twitter)', href: '#', external: true },
            ]}
          />
        </div>
        <div
          style={{
            maxWidth: 1240,
            margin: '0 auto',
            paddingTop: 24,
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 11,
            color: 'var(--color-text-3)',
          }}
        >
          <span>© 2026 Alpha Trading Pro · Tous droits réservés</span>
          <Link
            href="#"
            style={{ color: 'var(--color-text-3)', textDecoration: 'none' }}
          >
            Mentions légales
          </Link>
        </div>
      </footer>

      {/* ─── Styles responsive + animation onglets ──────────────── */}
      <style jsx global>{`
        @keyframes tabsFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tabs-fade-in {
          animation: tabsFadeIn 320ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .tabs-fade-in { animation: none; }
        }
        /* Masque la scrollbar de la rangée d'onglets */
        .reveal::-webkit-scrollbar,
        [class*='reveal'] > div::-webkit-scrollbar { display: none; }

        @media (min-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr 1.05fr !important;
            gap: 56px !important;
          }
          [data-section='gael'] {
            grid-template-columns: 320px 1fr !important;
            gap: 56px !important;
          }
          .tabs-content {
            grid-template-columns: 1fr 1.2fr !important;
            gap: 56px !important;
          }
        }
        /* Sur mobile, cache les cartes flottantes du héro — mockup seul */
        @media (max-width: 640px) {
          .hero-card { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Colonne footer ─────────────────────────────────────────────────────
function FooterCol({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string; external?: boolean }[]
}) {
  return (
    <div>
      <h4
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          margin: 0,
          marginBottom: 14,
        }}
      >
        {title}
      </h4>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--color-text-3)',
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'color var(--motion-fast) var(--motion-ease-out)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = 'var(--color-text-1)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = 'var(--color-text-3)')
                }
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                style={{
                  color: 'var(--color-text-3)',
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'color var(--motion-fast) var(--motion-ease-out)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = 'var(--color-text-1)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = 'var(--color-text-3)')
                }
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
