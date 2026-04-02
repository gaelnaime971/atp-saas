'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function OffrePage() {
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    // Scroll listener for navbar
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)

    // GSAP animations
    let gsapModule: any = null
    ;(async () => {
      const mod = await import('gsap')
      const { ScrollTrigger } = await import('gsap/ScrollTrigger')
      gsapModule = mod.gsap
      gsapModule.registerPlugin(ScrollTrigger)

      // Hero entrance
      gsapModule.fromTo('.hero-title', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out' })
      gsapModule.fromTo('.hero-sub', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, delay: 0.2, ease: 'power3.out' })
      gsapModule.fromTo('.hero-cta', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.5, ease: 'power3.out' })
      gsapModule.fromTo('.hero-badge', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, delay: 0.3, ease: 'back.out(1.7)' })

      // Scroll reveal sections
      document.querySelectorAll('.reveal-section').forEach((el) => {
        gsapModule.fromTo(el, { y: 80, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
        })
      })

      // Cards stagger
      document.querySelectorAll('.stagger-group').forEach((group) => {
        const children = group.querySelectorAll('.stagger-item')
        gsapModule.fromTo(children, { y: 50, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'power2.out',
          scrollTrigger: { trigger: group, start: 'top 80%', toggleActions: 'play none none none' },
        })
      })

      // Parallax elements
      document.querySelectorAll('.parallax-slow').forEach((el) => {
        gsapModule.to(el, {
          y: -60,
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.5 },
        })
      })

      // Number counters
      document.querySelectorAll('.counter').forEach((el) => {
        const target = parseInt(el.getAttribute('data-target') || '0')
        const suffix = el.getAttribute('data-suffix') || ''
        gsapModule.to({ val: 0 }, {
          val: target, duration: 2, ease: 'power1.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
          onUpdate: function (this: any) {
            (el as HTMLElement).textContent = Math.round(this.targets()[0].val) + suffix
          },
        })
      })
    })()

    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const G = '#22c55e'
  const GD = 'rgba(34,197,94,0.15)'

  return (
    <div style={{ background: '#040a04', color: '#f0f0f3', fontFamily: "'Outfit', sans-serif", overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '14px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(4,10,4,0.8)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(34,197,94,0.1)' : '1px solid transparent',
        transition: 'all 0.4s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo-atp.png" alt="ATP" style={{ height: 28 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: G, letterSpacing: '0.1em' }}>ULTRA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Programme', 'Resultats', 'Temoignages', 'Tarif'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{
              fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
              transition: 'color 0.2s',
            }} onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}>
              {item}
            </a>
          ))}
          <a href="#tarif" style={{
            padding: '10px 24px', borderRadius: 99, fontSize: 13, fontWeight: 700,
            background: G, color: '#040a04', textDecoration: 'none',
            transition: 'all 0.2s', boxShadow: `0 0 20px ${GD}`,
          }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = `0 0 30px rgba(34,197,94,0.3)` }}
             onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = `0 0 20px ${GD}` }}>
            Rejoindre ATP ULTRA
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '120px 24px 80px', position: 'relative',
      }}>
        {/* Glow orbs */}
        <div className="parallax-slow" style={{ position: 'absolute', top: '15%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.08), transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div className="parallax-slow" style={{ position: 'absolute', bottom: '10%', right: '15%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.05), transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div className="hero-badge" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 99,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          fontSize: 12, fontWeight: 600, color: G, marginBottom: 32, letterSpacing: '0.06em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} />
          PROGRAMME DE COACHING TRADING
        </div>

        <h1 className="hero-title" style={{
          fontSize: 'clamp(48px, 7vw, 88px)', fontWeight: 800, lineHeight: 1.05,
          letterSpacing: '-0.03em', maxWidth: 900, margin: '0 0 24px',
        }}>
          Deviens un trader<br />
          <span style={{ background: `linear-gradient(135deg, ${G}, #16a34a)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            consistant et rentable
          </span>
        </h1>

        <p className="hero-sub" style={{
          fontSize: 'clamp(16px, 2vw, 20px)', color: 'rgba(255,255,255,0.5)', maxWidth: 600,
          lineHeight: 1.7, margin: '0 0 40px',
        }}>
          Un accompagnement complet pour maitriser les futures et atteindre tes objectifs de trading avec une methode eprouvee.
        </p>

        <div className="hero-cta" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="#tarif" style={{
            padding: '16px 40px', borderRadius: 12, fontSize: 16, fontWeight: 700,
            background: G, color: '#040a04', textDecoration: 'none',
            boxShadow: `0 4px 30px rgba(34,197,94,0.3)`,
            transition: 'all 0.3s',
          }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 40px rgba(34,197,94,0.4)` }}
             onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 30px rgba(34,197,94,0.3)` }}>
            Decouvrir le programme
          </a>
          <a href="#programme" style={{
            padding: '16px 40px', borderRadius: 12, fontSize: 16, fontWeight: 600,
            background: 'transparent', color: '#fff', textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            transition: 'all 0.3s',
          }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
             onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'transparent' }}>
            En savoir plus
          </a>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: 'absolute', bottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Scroll</span>
          <div style={{ width: 1, height: 40, background: `linear-gradient(to bottom, ${G}, transparent)`, animation: 'scrollPulse 2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ── */}
      <section className="reveal-section" style={{
        padding: '40px 24px', borderTop: '1px solid rgba(34,197,94,0.08)', borderBottom: '1px solid rgba(34,197,94,0.08)',
        background: 'rgba(34,197,94,0.02)',
      }}>
        <div className="stagger-group" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, textAlign: 'center' }}>
          {[
            { value: '150', suffix: '+', label: 'Traders formes' },
            { value: '89', suffix: '%', label: 'Taux de reussite' },
            { value: '3', suffix: 'M+', label: 'Profits cumules' },
            { value: '5', suffix: ' ans', label: "D'experience" },
          ].map(stat => (
            <div key={stat.label} className="stagger-item">
              <div className="counter" data-target={stat.value} data-suffix={stat.suffix} style={{
                fontSize: 40, fontWeight: 800, color: G, fontFamily: "'DM Mono', monospace",
                lineHeight: 1,
              }}>0</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROGRAMME ── */}
      <section id="programme" className="reveal-section" style={{ padding: '120px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Le programme</span>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Tout ce dont tu as besoin<br />pour <span style={{ color: G }}>performer</span>
            </h2>
          </div>

          <div className="stagger-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { icon: '📈', title: 'Methode ATP', desc: 'Un systeme de trading complet, teste et eprouve sur les futures indices US.' },
              { icon: '🎯', title: 'Coaching individuel', desc: 'Sessions 1:1 pour analyser tes trades et accelerer ta progression.' },
              { icon: '🖥️', title: 'Dashboard personnel', desc: 'Suivi en temps reel de tes stats, P&L, et objectifs depuis ton espace.' },
              { icon: '📊', title: 'Trades live partages', desc: 'Observe les trades du coach en direct pour apprendre par l\'exemple.' },
              { icon: '🧠', title: 'Psychologie du trader', desc: 'Gestion des emotions, discipline, et mindset de performance.' },
              { icon: '💬', title: 'Support illimite', desc: 'Chat direct avec ton coach, reponses rapides, suivi permanent.' },
            ].map(feature => (
              <div key={feature.title} className="stagger-item" style={{
                padding: 32, borderRadius: 16,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                transition: 'all 0.3s',
                cursor: 'default',
              }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.25)'; e.currentTarget.style.background = 'rgba(34,197,94,0.04)'; e.currentTarget.style.transform = 'translateY(-4px)' }}
                 onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>{feature.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{feature.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RESULTATS ── */}
      <section id="resultats" className="reveal-section" style={{
        padding: '120px 24px',
        background: `linear-gradient(180deg, transparent, rgba(34,197,94,0.03), transparent)`,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Resultats</span>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Des resultats qui<br /><span style={{ color: G }}>parlent d&apos;eux-memes</span>
            </h2>
          </div>

          <div className="stagger-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { metric: '+847$', label: 'P&L moyen / mois', sub: 'Sur les 6 derniers mois' },
              { metric: '63%', label: 'Win Rate moyen', sub: 'Tous traders confondus' },
              { metric: '1.8', label: 'Profit Factor', sub: 'Performance globale' },
            ].map(r => (
              <div key={r.label} className="stagger-item" style={{
                padding: 40, borderRadius: 16, textAlign: 'center',
                background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.1)',
              }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: G, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{r.metric}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 12 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{r.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEMOIGNAGES ── */}
      <section id="temoignages" className="reveal-section" style={{ padding: '120px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Temoignages</span>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Ils ont rejoint<br /><span style={{ color: G }}>ATP ULTRA</span>
            </h2>
          </div>

          <div className="stagger-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'Thomas R.', text: "En 3 mois j'ai atteint la consistance que je cherchais depuis 2 ans. La methode ATP est claire et le coaching fait toute la difference.", role: 'Trader Futures' },
              { name: 'Julien M.', text: "Le dashboard est incroyable. Voir mes stats en temps reel m'a permis d'identifier mes erreurs et de les corriger rapidement.", role: 'Prop Firm Trader' },
              { name: 'Sarah L.', text: "L'accompagnement personnalise est top. Gael est toujours disponible et ses analyses sont d'une precision chirurgicale.", role: 'Trader Independante' },
            ].map(t => (
              <div key={t.name} className="stagger-item" style={{
                padding: 32, borderRadius: 16,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Stars */}
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill={G}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  ))}
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, flex: 1 }}>&ldquo;{t.text}&rdquo;</p>
                <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `linear-gradient(135deg, ${G}, #16a34a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#040a04' }}>
                    {t.name[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="tarif" className="reveal-section" style={{
        padding: '120px 24px',
        background: `linear-gradient(180deg, transparent, rgba(34,197,94,0.04), transparent)`,
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Tarif</span>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              Investis dans<br /><span style={{ color: G }}>ta reussite</span>
            </h2>
          </div>

          <div className="stagger-group" style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="stagger-item" style={{
              padding: 48, borderRadius: 24, width: '100%', maxWidth: 520,
              background: 'rgba(34,197,94,0.04)', border: '2px solid rgba(34,197,94,0.2)',
              textAlign: 'center', position: 'relative', overflow: 'hidden',
            }}>
              {/* Glow */}
              <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, borderRadius: '50%', background: `radial-gradient(circle, rgba(34,197,94,0.12), transparent 70%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />

              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'inline-block', padding: '6px 16px', borderRadius: 99, marginBottom: 20,
                  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                  fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.1em',
                }}>
                  ATP ULTRA
                </div>

                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>A partir de</div>
                <div style={{ fontSize: 56, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                  <span style={{ fontSize: 28, verticalAlign: 'top', color: 'rgba(255,255,255,0.5)' }}>€</span>
                  XXX
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Prix a definir selon la formule</div>

                <div style={{ margin: '32px 0', height: 1, background: 'rgba(255,255,255,0.06)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left', marginBottom: 36 }}>
                  {[
                    'Methode ATP complete (videos + PDF)',
                    'Sessions de coaching individuelles',
                    'Dashboard de suivi personnel',
                    'Trades live partages par le coach',
                    'Assistant Trader (cockpit de session)',
                    'Chat direct avec le coach',
                    'Acces a vie aux mises a jour',
                    'Communaute privee de traders',
                  ].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${G}18`, border: `1px solid ${G}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={G} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{item}</span>
                    </div>
                  ))}
                </div>

                <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', padding: '18px 40px', borderRadius: 14, fontSize: 16, fontWeight: 700,
                  background: G, color: '#040a04', textDecoration: 'none',
                  boxShadow: `0 4px 30px rgba(34,197,94,0.3)`,
                  transition: 'all 0.3s',
                }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 40px rgba(34,197,94,0.4)` }}
                   onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 30px rgba(34,197,94,0.3)` }}>
                  Reserver un appel decouverte
                </a>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>Appel gratuit et sans engagement — 30 min</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="reveal-section" style={{ padding: '120px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>FAQ</span>
            <h2 style={{ fontSize: 'clamp(32px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Questions frequentes</h2>
          </div>

          <div className="stagger-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { q: 'A qui s\'adresse ATP ULTRA ?', a: 'Aux traders debutants ou intermediaires qui veulent structurer leur approche et devenir consistants sur les futures indices US.' },
              { q: 'Combien de temps dure le programme ?', a: 'Le coaching est un accompagnement sur la duree. La plupart des traders voient des resultats significatifs en 3 a 6 mois.' },
              { q: 'Faut-il un capital minimum ?', a: 'Non. Tu peux commencer avec un compte prop firm (pas de capital personnel requis) ou un petit compte de simulation.' },
              { q: 'Le coaching est-il individuel ?', a: 'Oui. Chaque session est en 1:1 et adaptee a ton niveau, tes objectifs et tes erreurs specifiques.' },
              { q: 'Comment se passe un appel decouverte ?', a: 'On fait le point sur ta situation, tes objectifs et on voit ensemble si le programme est adapte. Sans engagement.' },
            ].map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} green={G} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="reveal-section" style={{
        padding: '120px 24px', textAlign: 'center',
        background: `radial-gradient(ellipse at center, rgba(34,197,94,0.06), transparent 70%)`,
      }}>
        <h2 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, maxWidth: 600, margin: '0 auto 20px' }}>
          Pret a passer au<br /><span style={{ color: G }}>niveau superieur</span> ?
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', maxWidth: 500, margin: '0 auto 36px', lineHeight: 1.7 }}>
          Rejoins ATP ULTRA et commence ta transformation en tant que trader.
        </p>
        <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-block', padding: '18px 48px', borderRadius: 14, fontSize: 16, fontWeight: 700,
          background: G, color: '#040a04', textDecoration: 'none',
          boxShadow: `0 4px 30px rgba(34,197,94,0.3)`,
          transition: 'all 0.3s',
        }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
           onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}>
          Reserver mon appel decouverte
        </a>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1100, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo-atp.png" alt="ATP" style={{ height: 20 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Alpha Trading Pro — Tous droits reserves</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/login" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Connexion</Link>
          <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>Contact</a>
        </div>
      </footer>

      <style>{`
        @keyframes scrollPulse { 0%,100% { opacity:0.3; transform:scaleY(1) } 50% { opacity:1; transform:scaleY(1.2) } }
        html { scroll-behavior: smooth; }
        ::selection { background: rgba(34,197,94,0.3); }
      `}</style>
    </div>
  )
}

// FAQ Accordion
function FAQItem({ q, a, green }: { q: string; a: string; green: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="stagger-item"
      onClick={() => setOpen(!open)}
      style={{
        padding: '20px 24px', borderRadius: 14, cursor: 'pointer',
        background: open ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${open ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: open ? '#fff' : 'rgba(255,255,255,0.8)' }}>{q}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.3s', flexShrink: 0, marginLeft: 16 }}>
          <path d="M12 5v14M5 12h14" stroke={open ? green : 'rgba(255,255,255,0.4)'} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{
        maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height 0.4s ease, margin 0.3s ease',
        marginTop: open ? 12 : 0,
      }}>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{a}</p>
      </div>
    </div>
  )
}
