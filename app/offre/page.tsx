'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function OffrePage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('v') })
    }, { threshold: 0.08 })
    document.querySelectorAll('.a').forEach(el => obs.observe(el))

    // GSAP
    ;(async () => {
      try {
        const { gsap } = await import('gsap')
        const { ScrollTrigger } = await import('gsap/ScrollTrigger')
        gsap.registerPlugin(ScrollTrigger)
        gsap.fromTo('.hero-pill', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' })
        gsap.fromTo('.hero-h', { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.08, ease: 'power3.out' })
        gsap.fromTo('.hero-p', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.16, ease: 'power3.out' })
        gsap.fromTo('.hero-btns', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: 0.26, ease: 'power3.out' })
        gsap.fromTo('.hero-proof', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: 0.36, ease: 'power3.out' })
        gsap.fromTo('.hero-visual', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, delay: 0.4, ease: 'power3.out' })
        document.querySelectorAll('.stg').forEach(g => {
          gsap.fromTo(g.querySelectorAll('.sti'), { y: 32, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out',
            scrollTrigger: { trigger: g, start: 'top 82%' },
          })
        })
      } catch {}
    })()
    return () => { window.removeEventListener('scroll', onScroll); obs.disconnect() }
  }, [])

  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  // Shared styles
  const G = '#22c55e'
  const accent = (o: number) => `rgba(34,197,94,${o})`

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
.kp *{margin:0;padding:0;box-sizing:border-box;}
.kp{background:#050505;color:#fff;font-family:'Inter',sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased;}

/* Nav */
.kn{position:fixed;top:0;left:0;right:0;z-index:100;transition:all 0.35s;}
.kn-in{max-width:1200px;margin:0 auto;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;}
.kn-l{display:flex;align-items:center;gap:8px;}
.kn-l img{height:26px;}
.kn-l span{font-weight:700;font-size:15px;letter-spacing:0.03em;}
.kn-m{display:flex;gap:28px;}
.kn-m a{font-size:13px;font-weight:400;color:#888;text-decoration:none;transition:color 0.2s;}
.kn-m a:hover{color:#fff;}
.kn-r{display:flex;gap:10px;align-items:center;}
.btn-g{padding:10px 22px;border-radius:10px;font-size:13px;font-weight:600;background:${G};color:#050505;text-decoration:none;border:none;cursor:pointer;transition:all 0.25s;}
.btn-g:hover{box-shadow:0 4px 20px ${accent(0.35)};transform:translateY(-1px);}
.btn-o{padding:10px 22px;border-radius:10px;font-size:13px;font-weight:500;background:transparent;color:#ccc;text-decoration:none;border:1px solid rgba(255,255,255,0.1);transition:all 0.25s;}
.btn-o:hover{border-color:rgba(255,255,255,0.2);color:#fff;background:rgba(255,255,255,0.03);}

/* Section */
.ks{max-width:1200px;margin:0 auto;padding:100px 32px;}
.ks-label{font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${G};margin-bottom:14px;}
.ks-h{font-size:clamp(32px,4vw,52px);font-weight:800;line-height:1.12;letter-spacing:-0.025em;color:#fff;}
.ks-h span{color:${G};}
.ks-p{font-size:16px;color:#888;max-width:540px;margin-top:14px;line-height:1.7;font-weight:300;}
.divider{max-width:1200px;margin:0 auto;height:1px;background:rgba(255,255,255,0.06);}

/* Hero */
.hero{max-width:1200px;margin:0 auto;padding:140px 32px 80px;text-align:center;position:relative;}
.hero-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;background:${accent(0.08)};border:1px solid ${accent(0.15)};font-size:12px;font-weight:500;color:${G};margin-bottom:28px;}
.hero-pill::before{content:'';width:6px;height:6px;border-radius:50%;background:${G};box-shadow:0 0 8px ${G};animation:blink 2s infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.35;}}
.hero-h{font-size:clamp(40px,6vw,72px);font-weight:800;line-height:1.05;letter-spacing:-0.035em;max-width:800px;margin:0 auto;}
.hero-h span{color:${G};}
.hero-p{font-size:17px;color:#777;max-width:560px;margin:22px auto 0;line-height:1.7;font-weight:300;}
.hero-p strong{color:#ccc;font-weight:500;}
.hero-btns{margin-top:36px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
.hero-proof{margin-top:32px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#666;}
.hero-proof .dots{display:flex;gap:-4px;}
.hero-proof .dot{width:28px;height:28px;border-radius:50%;background:${accent(0.12)};border:2px solid #111;margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${G};}
.hero-proof .dot:first-child{margin-left:0;}

/* Visual mockup */
.hero-visual{margin-top:56px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;max-width:900px;margin-left:auto;margin-right:auto;}
.hv-bar{padding:10px 16px;display:flex;align-items:center;gap:6px;border-bottom:1px solid rgba(255,255,255,0.06);background:#080808;}
.hv-d{width:8px;height:8px;border-radius:50%;}.hv-r{background:#ff5f56;}.hv-y{background:#ffbd2e;}.hv-g{background:#27c93f;}
.hv-url{flex:1;text-align:center;font-size:10px;color:#444;}
.hv-body{padding:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.hv-card{background:#0e0e0e;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:16px;}
.hv-card-l{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.08em;}
.hv-card-v{font-size:22px;font-weight:800;margin-top:4px;}
.hv-card-v.green{color:${G};}.hv-card-v.white{color:#fff;}
.hv-chart{grid-column:1/-1;background:#0e0e0e;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:16px;height:80px;}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;margin-top:48px;}
.stat{background:#0a0a0a;padding:28px 16px;text-align:center;}
.stat-n{font-size:28px;font-weight:800;color:${G};}
.stat-l{font-size:11px;color:#555;margin-top:4px;text-transform:uppercase;letter-spacing:0.06em;}

/* Cards grid */
.cg{display:grid;gap:14px;margin-top:40px;}
.cg-2{grid-template-columns:1fr 1fr;}
.cg-3{grid-template-columns:repeat(3,1fr);}
.cg-4{grid-template-columns:repeat(4,1fr);}
.card{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:28px;transition:all 0.3s;}
.card:hover{border-color:rgba(255,255,255,0.1);background:#0c0c0c;transform:translateY(-3px);}
.card-icon{font-size:28px;margin-bottom:14px;}
.card-t{font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;}
.card-d{font-size:13px;color:#777;line-height:1.65;}
.card-full{grid-column:1/-1;}
.card-list{list-style:none;margin-top:14px;}
.card-list li{display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
.card-list li:last-child{border-bottom:none;}
.card-ck{color:${G};font-size:13px;flex-shrink:0;}
.card-num{position:absolute;top:16px;right:20px;font-size:40px;font-weight:800;color:rgba(255,255,255,0.03);line-height:1;}

/* For who */
.fw{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;margin-top:40px;}
.fw-s{background:#0a0a0a;padding:32px;}
.fw-s::before{content:'';display:block;height:2px;margin-bottom:20px;border-radius:2px;}
.fw-y::before{background:${G};}.fw-n::before{background:#ef4444;}
.fw-tag{font-size:11px;font-weight:600;letter-spacing:0.06em;padding:4px 12px;border-radius:100px;display:inline-block;margin-bottom:18px;}
.fw-y .fw-tag{color:${G};background:${accent(0.1)};border:1px solid ${accent(0.2)};}
.fw-n .fw-tag{color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);}
.fw-i{display:flex;gap:10px;margin-bottom:12px;font-size:13px;color:#ccc;line-height:1.5;}
.fw-ic{flex-shrink:0;margin-top:1px;}

/* Steps */
.steps{margin-top:40px;display:flex;flex-direction:column;gap:12px;}
.step{display:grid;grid-template-columns:48px 1fr;gap:20px;align-items:start;}
.step-n{width:48px;height:48px;border-radius:12px;background:#0e0e0e;border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:${G};flex-shrink:0;transition:all 0.3s;}
.step:hover .step-n{background:${accent(0.1)};border-color:${accent(0.25)};box-shadow:0 0 16px ${accent(0.15)};}
.step-b{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:24px;transition:all 0.3s;}
.step:hover .step-b{border-color:rgba(255,255,255,0.1);}
.step-tag{font-size:11px;font-weight:600;color:${G};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;}
.step-t{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px;}
.step-d{font-size:13px;color:#777;line-height:1.65;}

/* Offer */
.offer{background:#0a0a0a;border:1px solid ${accent(0.15)};border-radius:20px;margin-top:40px;overflow:hidden;position:relative;}
.offer-glow{position:absolute;top:-120px;right:-120px;width:350px;height:350px;background:radial-gradient(circle,${accent(0.2)},transparent 70%);filter:blur(80px);pointer-events:none;}
.offer-top{padding:40px;display:grid;grid-template-columns:1fr 300px;gap:36px;align-items:start;}
.offer-old{font-size:14px;color:#555;text-decoration:line-through;margin-bottom:4px;}
.offer-pr{font-size:56px;font-weight:800;color:${G};line-height:1;}
.offer-pr sub{font-size:16px;font-weight:400;color:#555;}
.offer-info{font-size:12px;color:#555;margin-top:6px;}
.offer-inst{display:inline-block;margin-top:12px;padding:7px 16px;border-radius:8px;font-size:12px;color:#ccc;background:${accent(0.08)};border:1px solid ${accent(0.15)};}
.offer-ul{list-style:none;margin-top:24px;}
.offer-ul li{display:flex;align-items:center;gap:8px;font-size:13px;color:#ccc;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
.offer-ul li:last-child{border-bottom:none;}
.offer-ul .ck{color:${G};font-size:14px;flex-shrink:0;}
.offer-side{display:flex;flex-direction:column;gap:12px;}
.offer-bot{border-top:1px solid rgba(255,255,255,0.06);padding:24px 40px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#080808;}
.offer-bot-t{font-size:12px;color:#666;}.offer-bot-t strong{color:#ccc;}
.places{background:#0e0e0e;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;}
.places-l{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;}
.places-d{display:flex;gap:5px;}
.pl-on{width:22px;height:22px;border-radius:4px;background:${accent(0.12)};border:1px solid ${G};}
.pl-off{width:22px;height:22px;border-radius:4px;background:#111;border:1px solid rgba(255,255,255,0.06);}
.places-c{font-size:12px;color:#ccc;margin-top:8px;}.places-c em{color:${G};font-style:normal;font-size:16px;font-weight:800;}

/* Testimonials */
.tg{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:40px;}
.tc{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:28px;display:flex;flex-direction:column;}
.tc-r{font-size:24px;font-weight:800;color:${G};margin-bottom:8px;}
.tc-t{font-size:13px;color:#777;line-height:1.7;flex:1;margin-bottom:16px;}
.tc-a{display:flex;align-items:center;gap:10px;}
.tc-av{width:32px;height:32px;border-radius:50%;background:${accent(0.1)};border:1px solid ${accent(0.15)};display:flex;align-items:center;justify-content:center;font-size:12px;}
.tc-nm{font-size:12px;font-weight:600;color:#ccc;}
.tc-rl{font-size:10px;color:#555;}

/* FAQ */
.faq{margin-top:40px;display:flex;flex-direction:column;gap:6px;}
.faq-i{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;}
.faq-q{padding:20px 22px;font-size:14px;font-weight:500;color:#ccc;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;transition:color 0.2s;user-select:none;}
.faq-q:hover{color:#fff;}
.faq-arr{color:${G};font-size:16px;transition:transform 0.3s;flex-shrink:0;}
.faq-i.open .faq-arr{transform:rotate(45deg);}
.faq-a{max-height:0;overflow:hidden;transition:max-height 0.4s ease,padding 0.3s;padding:0 22px;font-size:13px;color:#666;line-height:1.8;}
.faq-i.open .faq-a{max-height:300px;padding:0 22px 20px;}

/* CTA Final */
.cta{text-align:center;padding:100px 32px;position:relative;overflow:hidden;}
.cta-glow{position:absolute;inset:0;background:radial-gradient(ellipse 50% 40% at 50% 50%,${accent(0.08)},transparent);pointer-events:none;}
.cta h2{font-size:clamp(32px,4.5vw,56px);font-weight:800;letter-spacing:-0.03em;line-height:1.1;margin-bottom:16px;position:relative;z-index:1;}
.cta h2 span{color:${G};}
.cta p{font-size:15px;color:#666;max-width:460px;margin:0 auto 32px;line-height:1.7;position:relative;z-index:1;}
.urg{margin-top:16px;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;gap:6px;position:relative;z-index:1;}
.urg::before{content:'';width:5px;height:5px;border-radius:50%;background:${G};animation:blink 1.5s infinite;}

/* Footer */
.ft{border-top:1px solid rgba(255,255,255,0.06);max-width:1200px;margin:0 auto;padding:32px;display:flex;align-items:center;justify-content:space-between;}
.ft-c{font-size:10px;color:#444;}

/* Reveal */
.a{opacity:0;transform:translateY(24px);transition:opacity 0.65s ease,transform 0.65s ease;}
.a.v{opacity:1;transform:translateY(0);}

@media(max-width:768px){
  .kn-m{display:none;}.hero{padding:110px 20px 60px;}
  .ks{padding:72px 20px;}.stats{grid-template-columns:repeat(2,1fr);}
  .cg-2,.cg-3,.cg-4,.fw,.tg{grid-template-columns:1fr;}
  .hv-body{grid-template-columns:1fr 1fr;}.offer-top{grid-template-columns:1fr;}
  .offer-bot{flex-direction:column;text-align:center;}
  .ft{flex-direction:column;gap:12px;text-align:center;}
  .card-full{grid-column:1;}
}
      `}</style>

      <div className="kp">
        {/* NAV */}
        <nav className="kn" style={{ background: scrolled ? 'rgba(5,5,5,0.85)' : 'transparent', backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none', borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent' }}>
          <div className="kn-in">
            <div className="kn-l"><img src="/logo-atp.png" alt="ATP" /></div>
            <div className="kn-m">
              <a href="#programme">Programme</a>
              <a href="#resultats">Résultats</a>
              <a href="#offre">Tarif</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="kn-r">
              <a href="#offre" className="btn-g">Rejoindre</a>
            </div>
          </div>
        </nav>

        {/* ━━ HERO ━━ */}
        <section className="hero">
          <div className="hero-pill">Sélection sur dossier — Places limitées</div>
          <h1 className="hero-h">Trade au niveau des<br /><span>professionnels</span> de marché</h1>
          <p className="hero-p">Le programme d&apos;accompagnement pour les traders qui veulent des <strong>résultats réels</strong>. Coaching 1v1, méthode institutionnelle, outils pro.</p>
          <div className="hero-btns">
            <a href="#offre" className="btn-g" style={{ padding: '14px 32px', fontSize: 15 }}>Découvrir l&apos;offre →</a>
            <a href="#programme" className="btn-o" style={{ padding: '14px 32px', fontSize: 15 }}>Voir le programme</a>
          </div>
          <div className="hero-proof">
            <div className="dots">
              {['G', 'M', 'T', '+'].map((l, i) => <div key={i} className="dot">{l}</div>)}
            </div>
            <span>Rejoins les traders formés par ATP</span>
          </div>

          {/* Dashboard screenshot */}
          <div className="hero-visual" style={{ padding: 0 }}>
            <div className="hv-bar"><div className="hv-d hv-r" /><div className="hv-d hv-y" /><div className="hv-d hv-g" /><div className="hv-url">alphatradingpro-coaching.fr — Dashboard</div></div>
            <img src="/dashboard-screenshot.png" alt="Dashboard ATP — Stats & Performance" style={{ width: '100%', display: 'block' }} />
          </div>

          {/* Stats */}
          <div className="stats">
            {[{ n: '1 200+', l: 'Membres Discord' }, { n: 'Ex-Banque', l: '& Hedge Fund' }, { n: '9 ans', l: "d'expérience" }, { n: '100%', l: 'Personnalisé' }].map(s => (
              <div key={s.l} className="stat"><div className="stat-n">{s.n}</div><div className="stat-l">{s.l}</div></div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ PROBLÈME ━━ */}
        <section className="ks">
          <div className="ks-label a">Le constat</div>
          <div className="ks-h a">Pourquoi la plupart des traders <span>échouent</span></div>
          <div className="ks-p a">Ce n&apos;est pas un problème de marché. C&apos;est un problème de méthode, de suivi et d&apos;accompagnement.</div>
          <div className="cg cg-2 stg" style={{ marginTop: 40 }}>
            {[
              { i: '🎰', t: 'Pas de méthode structurée', d: "Tu passes d'une stratégie à l'autre chaque semaine. Scalping le lundi, swing le mercredi, une nouvelle formation le week-end. Résultat : aucune edge mesurable, aucune consistance. Tu trades tes émotions et tes intuitions au lieu de trader le marché avec un plan clair et répétable." },
              { i: '📉', t: 'Aucun suivi de performance', d: "Tu ne connais pas ton vrai win rate. Tu n'as aucun journal de trading sérieux. Tu ne sais pas quels setups fonctionnent et lesquels te coûtent de l'argent. Sans données, tu répètes les mêmes erreurs semaine après semaine sans jamais t'en rendre compte — et tu appelles ça de la malchance." },
              { i: '🧠', t: 'Psychologie non travaillée', d: "Revenge trading après une perte. FOMO quand le prix part sans toi. Déplacement de stop loss en plein trade. Overtrading en fin de journée pour \"se refaire\". Tu sais que tout ça est destructeur — mais tu continues. Parce que personne ne t'a donné les outils concrets pour gérer ta psychologie en conditions réelles." },
              { i: '🏝️', t: 'Seul face au marché', d: "Pas de mentor pour te dire quand tu fais fausse route. Pas de feedback sur tes trades. Pas de communauté de traders sérieux avec qui échanger. Tu galères seul devant tes charts, tu regardes des vidéos YouTube contradictoires, et tu n'as aucune idée de si tu progresses ou si tu stagnes." },
            ].map(c => (
              <div key={c.t} className="card sti">
                <div className="card-icon">{c.i}</div>
                <div className="card-t">{c.t}</div>
                <div className="card-d">{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ POUR QUI ━━ */}
        <section className="ks">
          <div className="ks-label a">Pour qui</div>
          <div className="ks-h a">ATP ULTRA est fait pour <span>toi</span> si...</div>
          <div className="fw a">
            <div className="fw-s fw-y">
              <div className="fw-tag">✓ Tu es prêt</div>
              {['Tu trades déjà ou tu veux démarrer sérieusement', 'Tu veux une méthode claire et structurée', "Tu es prêt à investir dans ta progression", 'Tu veux des outils pro pour mesurer tes perfs', 'Tu vises ton capital ou une prop firm'].map(t => (
                <div key={t} className="fw-i"><span className="fw-ic" style={{ color: G }}>✓</span>{t}</div>
              ))}
            </div>
            <div className="fw-s fw-n">
              <div className="fw-tag">✕ Pas pour toi</div>
              {["Tu cherches quelqu'un qui trade à ta place", 'Tu veux des résultats sans travailler', "Tu n'es pas prêt à te remettre en question", 'Tu attends des rendements garantis', "Tu n'as pas le temps de te former"].map(t => (
                <div key={t} className="fw-i"><span className="fw-ic" style={{ color: '#ef4444' }}>✕</span>{t}</div>
              ))}
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ━━ PROP FIRM ━━ */}
        <section className="ks">
          <div className="ks-label a">Accès au capital</div>
          <div className="ks-h a">Trader avec <span>le capital des autres</span></div>
          <div className="ks-p a">Tu n&apos;as pas besoin de 50 000€ ou 100 000€ de capital personnel pour vivre du trading. Les prop firms te donnent acc&egrave;s &agrave; leur capital — et tu gardes une partie des profits.</div>

          <div className="cg cg-2 stg" style={{ marginTop: 40 }}>
            {/* What is a prop firm */}
            <div className="card sti" style={{ position: 'relative' }}>
              <div className="card-icon">🏦</div>
              <div className="card-t">C&apos;est quoi une Prop Firm ?</div>
              <div className="card-d" style={{ lineHeight: 1.8 }}>
                Une <strong style={{ color: '#fff' }}>Proprietary Trading Firm</strong> (prop firm) est une soci&eacute;t&eacute; qui met &agrave; disposition son propre capital pour que des traders ind&eacute;pendants le fassent fructifier. Le principe est simple :
                <br /><br />
                <strong style={{ color: '#ccc' }}>1.</strong> Tu passes un <strong style={{ color: '#ccc' }}>challenge</strong> (une &eacute;valuation sur compte de simulation) pour prouver que tu sais trader de mani&egrave;re disciplin&eacute;e et rentable.
                <br />
                <strong style={{ color: '#ccc' }}>2.</strong> Si tu r&eacute;ussis, la prop firm te donne acc&egrave;s &agrave; un <strong style={{ color: '#ccc' }}>compte financ&eacute;</strong> — 25K, 50K, 100K, voire 200K+ de capital r&eacute;el.
                <br />
                <strong style={{ color: '#ccc' }}>3.</strong> Tu trades ce capital et tu gardes entre <strong style={{ color: G }}>70% et 90% des profits</strong> g&eacute;n&eacute;r&eacute;s.
                <br /><br />
                C&apos;est le mod&egrave;le utilis&eacute; par des milliers de traders dans le monde pour acc&eacute;der &agrave; des capitaux importants sans risquer leur propre argent.
              </div>
            </div>

            {/* Why it matters */}
            <div className="card sti" style={{ position: 'relative' }}>
              <div className="card-icon">💰</div>
              <div className="card-t">Pourquoi c&apos;est un game changer</div>
              <div className="card-d" style={{ marginBottom: 16 }}>
                Avec une m&eacute;thode solide et un suivi rigoureux, le passage en prop firm te permet de g&eacute;n&eacute;rer des revenus significatifs <strong style={{ color: '#fff' }}>sans capital personnel</strong>. C&apos;est exactement ce qu&apos;ATP ULTRA te pr&eacute;pare &agrave; faire.
              </div>
              <ul className="card-list">
                <li><span className="card-ck">✓</span>Pas besoin de capital — le co&ucirc;t d&apos;un challenge va de 100€ &agrave; 500€</li>
                <li><span className="card-ck">✓</span>Acc&egrave;s &agrave; 50K, 100K, 200K+ de capital &agrave; trader</li>
                <li><span className="card-ck">✓</span>Tu gardes 70 &agrave; 90% de tes profits</li>
                <li><span className="card-ck">✓</span>Aucun risque de perte de ton argent personnel</li>
                <li><span className="card-ck">✓</span>Possibilit&eacute; de cumuler plusieurs comptes</li>
                <li><span className="card-ck">✓</span>Retraits r&eacute;guliers (payouts) vers ton compte bancaire</li>
              </ul>
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: accent(0.06), border: `1px solid ${accent(0.12)}`, fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                <strong style={{ color: G }}>ATP ULTRA inclut la pr&eacute;paration prop firm</strong> — on travaille ensemble ta strat&eacute;gie de passage de challenge, la gestion du drawdown, et le plan pour scaler tes comptes financ&eacute;s.
              </div>
            </div>
          </div>

          {/* Prop firm logos / examples */}
          <div className="a" style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
            {['TopStep', 'Apex', 'FTMO', 'E8 Funding'].map(name => (
              <div key={name} style={{ padding: '10px 24px', borderRadius: 10, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', fontSize: 13, fontWeight: 600, color: '#666', letterSpacing: '0.02em' }}>
                {name}
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ 6 PILIERS ━━ */}
        <section className="ks" id="programme">
          <div className="ks-label a">Ce qui est inclus</div>
          <div className="ks-h a">Les 6 piliers d&apos;<span>ATP ULTRA</span></div>
          <div className="cg cg-2 stg" style={{ marginTop: 40 }}>
            {[
              { i: '🎯', t: 'Coaching 1v1 personnalisé', st: 'Ton coach à disposition', d: "Calls individuels avec Gaël pour travailler ta méthode, ta psychologie et tes trades en temps réel. Pas de groupe, pas de template générique.", items: ['Calls vidéo dédiés avec Gaël', 'Review de tes trades réels', 'Plan de trading personnalisé', 'Suivi WhatsApp permanent'] },
              { i: '🎬', t: 'Formation vidéo exclusive', st: 'La méthode complète en replay', d: "Tout le contenu vidéo de la méthode ATP accessible en illimité. Structure de marché, setups codifiés, psychologie appliquée.", items: ['Replay illimité à vie', 'Méthode ATP complète', 'Psychologie du trading', 'Futures US : ES, NQ, YM'] },
              { i: '🖥️', t: 'Dashboard SaaS ATP', st: '12 mois d\'accès inclus', d: "Outil pro développé par Gaël, exclusif aux élèves. Suivi de performance temps réel comme en salle de marché.", items: ['P&L, Win Rate, Profit Factor, Heatmap', 'Journal psychologique intégré', 'Prop Firm Tracker', 'Assistant Trader IA'] },
              { i: '💬', t: 'Discord ATP Premium', st: '12 mois — Valeur 890€', d: "Accès complet au Discord normalement payant. Une communauté de traders tous formés à la même méthode.", items: ['Lives trading lundi–vendredi', 'Sections Crypto, Forex, Actions', 'Plans d\'analyse quotidiens', 'Replays de toutes les sessions'] },
              { i: '📊', t: 'Suivi de performance continu', st: 'Tes résultats mesurés', d: "Reviews régulières de tes trades via le dashboard. On identifie ce qui fonctionne, ce qui ne fonctionne pas, et on ajuste.", items: ['Review hebdomadaire des trades', 'Analyse de tes patterns', 'Optimisation de ton edge', 'Feedback actionnable à chaque session'] },
              { i: '🚀', t: "Accompagnement jusqu'au résultat", st: 'À ton rythme, sans pression', d: "Pas de durée imposée. On travaille ensemble jusqu'à ce que tu aies un edge réel et la confiance pour trader seul.", items: ['Sans pression de temps', 'Objectifs concrets et mesurables', 'Préparation prop firm', 'Mises à jour à vie'] },
            ].map(p => (
              <div key={p.t} className="card sti" style={{ position: 'relative' }}>
                <div className="card-icon">{p.i}</div>
                <div className="card-t">{p.t}</div>
                <div style={{ fontSize: 11, color: G, marginBottom: 6, fontWeight: 500 }}>{p.st}</div>
                <div className="card-d">{p.d}</div>
                <ul className="card-list">{p.items.map(item => <li key={item}><span className="card-ck">✓</span>{item}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ PROCESS ━━ */}
        <section className="ks">
          <div className="ks-label a">Le parcours</div>
          <div className="ks-h a">4 étapes vers <span>l&apos;autonomie</span></div>
          <div className="steps stg">
            {[
              { n: 1, tag: 'Diagnostic', t: 'Audit complet & fondations', d: "On commence par un audit détaillé de ton trading actuel : tes entrées, tes sorties, ta gestion du risque, ta psychologie. On identifie précisément les failles, les biais cognitifs qui te font perdre, et les points forts sur lesquels construire. C'est la base de tout ce qu'on va faire ensemble." },
              { n: 2, tag: 'Transmission', t: 'La méthode ATP en profondeur', d: "Tu apprends la méthode ATP dans sa totalité. Structure de marché, order blocks, liquidity zones, sessions US/EU — chaque setup est codifié, chaque règle d'entrée et de sortie est claire. On traduit tout ça dans ton plan de trading personnalisé que tu pourras appliquer immédiatement." },
              { n: 3, tag: 'Live trading', t: 'Trading en conditions réelles', d: "Tu trades en direct avec moi en observation. Review détaillée de chaque session via le dashboard ATP. On affine ta lecture du marché, on travaille ta gestion émotionnelle en temps réel, et on optimise ton edge de manière mesurable. C'est ici que la théorie devient de la pratique rentable." },
              { n: 4, tag: 'Autonomie', t: 'Indépendance & scaling', d: "Tu es maintenant autonome et profitable. On prépare la suite selon tes objectifs : passage en prop firm avec un plan d'attaque clair, scaling de ton compte personnel, ou structuration de ta gestion de capital. Tu repars avec un plan d'action concret et toutes les ressources pour continuer seul." },
            ].map(s => (
              <div key={s.n} className="step sti">
                <div className="step-n">{s.n}</div>
                <div className="step-b">
                  <div className="step-tag">{s.tag}</div>
                  <div className="step-t">{s.t}</div>
                  <div className="step-d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ RÉSULTATS ━━ */}
        <section className="ks" id="resultats">
          <div className="ks-label a">Preuves</div>
          <div className="ks-h a">Ils ont fait le <span>choix</span></div>
          <div className="stats a" style={{ marginTop: 32 }}>
            {[{ n: '+3 386$', l: 'P&L en 7 jours' }, { n: '100%', l: 'Win Rate' }, { n: '6W', l: 'Streak' }, { n: '+22R', l: 'R / session' }].map(s => (
              <div key={s.l} className="stat"><div className="stat-n">{s.n}</div><div className="stat-l">{s.l}</div></div>
            ))}
          </div>
          <div className="tg stg" style={{ marginTop: 24 }}>
            {[
              { r: '+3 386$ en 7j', t: "Le coaching m'a aidé à comprendre pourquoi je perdais et à le corriger. La méthode est claire et le dashboard me permet de voir exactement où j'en suis.", v: '🎯', n: 'Kevin D.', rl: 'Compte propre' },
              { r: 'Prop Firm validée', t: "J'avais raté 3 challenges. En 2 mois j'ai validé mon premier compte 50K. La gestion du risque enseignée ici est institutionnelle.", v: '🏆', n: 'Marcus L.', rl: 'Prop Trader' },
              { r: 'Edge mesurable', t: "Le dashboard a changé ma vision. Mon edge est enfin mesurable et cohérent. Je sais exactement ce qui fonctionne.", v: '📊', n: 'Thomas R.', rl: 'Futures YM/ES' },
            ].map(t => (
              <div key={t.n} className="tc sti">
                <div className="tc-r">{t.r}</div>
                <div className="tc-t">&ldquo;{t.t}&rdquo;</div>
                <div className="tc-a"><div className="tc-av">{t.v}</div><div><div className="tc-nm">{t.n}</div><div className="tc-rl">Élève ATP · {t.rl}</div></div></div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ━━ OFFRE ━━ */}
        <section className="ks" id="offre">
          <div className="ks-label a">L&apos;investissement</div>
          <div className="ks-h a">Un seul programme. <span>Sans compromis.</span></div>
          <div className="offer a">
            <div className="offer-glow" />
            <div className="offer-top">
              <div>
                <div className="offer-pr" style={{ fontSize: 36, color: '#fff' }}>ATP ULTRA</div>
                <div className="offer-info" style={{ marginTop: 8 }}>Accompagnement complet &middot; Acc&egrave;s illimit&eacute; &agrave; Ga&euml;l</div>
                <div className="offer-inst" style={{ marginTop: 14 }}>Prix communiqu&eacute; lors du call de pr&eacute;s&eacute;lection</div>
                <ul className="offer-ul">
                  {['Coaching 1v1 personnalisé avec Gaël', 'Accès 12 mois au Dashboard ATP SaaS', 'Accès 12 mois Discord ATP (valeur 890€)', 'Formation vidéo complète', 'Review hebdomadaire de tes trades', 'Suivi WhatsApp permanent', 'Plan de trading personnalisé', 'Préparation prop firm'].map(item => (
                    <li key={item}><span className="ck" style={{ color: G }}>✓</span>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="offer-side">
                <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" className="btn-g" style={{ textAlign: 'center', padding: '16px 24px', fontSize: 15, width: '100%', display: 'block' }}>Réserver un call gratuit →</a>
                <div style={{ fontSize: 10, color: '#555', textAlign: 'center' }}>30 min · Sans engagement</div>
                <div className="places">
                  <div className="places-l">Places disponibles</div>
                  <div className="places-d"><div className="pl-on" /><div className="pl-on" /><div className="pl-off" /><div className="pl-off" /><div className="pl-off" /></div>
                  <div className="places-c"><em>2</em> places ce mois</div>
                </div>
              </div>
            </div>
            <div className="offer-bot">
              <div className="offer-bot-t">🔒 <strong>Garantie :</strong> Call gratuit — si on n&apos;est pas alignés, aucun engagement.</div>
              <a href="#faq" className="btn-o" style={{ padding: '10px 20px', fontSize: 12 }}>FAQ</a>
            </div>
          </div>
        </section>

        <div className="divider" />

        {/* ━━ FAQ ━━ */}
        <section className="ks" id="faq">
          <div className="ks-label a">FAQ</div>
          <div className="ks-h a">Tes <span>questions</span></div>
          <div className="faq a">
            {[
              { q: 'Comment se déroule le coaching concrètement ?', a: "On commence par un appel de diagnostic complet où on fait le point sur ton trading actuel, tes objectifs et tes blocages. Ensuite on organise des calls individuels réguliers en visio. Entre les sessions, je review tes trades via le dashboard ATP et tu as accès à mon WhatsApp pour les questions urgentes. Tout est adapté à ton rythme et à ton niveau — il n'y a pas de programme figé, on avance ensemble." },
              { q: 'Quel niveau faut-il pour commencer ?', a: "Le coaching s'adresse aussi bien aux débutants sérieux qu'aux traders intermédiaires qui veulent passer un cap. L'important n'est pas ton niveau actuel, c'est ta motivation et ta capacité à travailler. Si tu es prêt à t'investir, on peut travailler ensemble. On adapte entièrement le programme à ta situation." },
              { q: 'Pourquoi si peu de places par mois ?', a: "Je trade moi-même tous les jours sur les marchés. Je refuse de déléguer la qualité de l'accompagnement. Chaque élève bénéficie de mon attention personnelle complète — reviews de trades, calls, WhatsApp. Pour maintenir ce niveau de qualité institutionnelle, je limite à 2-3 élèves maximum par mois. C'est mon standard et ça ne changera pas." },
              { q: 'Le dashboard ATP est-il vraiment inclus ?', a: "Oui, 12 mois d'accès complet au Dashboard ATP SaaS sont inclus dans le programme. C'est un outil que j'ai développé moi-même exclusivement pour mes élèves. Il inclut le suivi P&L, win rate, profit factor, heatmap, journal psychologique, tracker prop firm, assistant trader IA, achievements — tout ce dont tu as besoin pour suivre ta progression comme un professionnel." },
              { q: 'Comment fonctionne le paiement ?', a: "Le tarif et les modalités de paiement sont communiqués lors du call de présélection. Des facilités de paiement sont disponibles. Mon objectif est que le financement ne soit pas un obstacle si tu es le bon profil pour le programme — on trouve toujours une solution ensemble." },
              { q: 'Sur quels marchés et instruments tu travailles ?', a: "Je suis spécialisé sur les futures américains : ES (S&P 500), NQ (Nasdaq), YM (Dow Jones). Ce sont les marchés les plus liquides au monde, avec les meilleures conditions d'exécution. La méthode ATP est optimisée pour ces instruments mais les principes de structure de marché s'appliquent à tous les actifs." },
            ].map((f, i) => (
              <div key={i} className={`faq-i ${faqOpen === i ? 'open' : ''}`}>
                <div className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>{f.q}<span className="faq-arr">+</span></div>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ CTA ━━ */}
        <div className="cta">
          <div className="cta-glow" />
          <h2>Prêt à trader comme<br />un <span>professionnel</span> ?</h2>
          <p>Le call de présélection est gratuit et sans engagement.</p>
          <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" className="btn-g" style={{ padding: '16px 40px', fontSize: 16, position: 'relative', zIndex: 1 }}>Réserver mon call →</a>
          <div className="urg">2 places disponibles · Réponse sous 24h</div>
        </div>

        {/* Footer */}
        <footer className="ft">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Alpha Trading Pro</span>
          <div className="ft-c">© 2026 ATP · Guadeloupe</div>
          <a href="https://calendly.com/gael-n971/60min" target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#444', textDecoration: 'none' }}>Contact</a>
        </footer>
      </div>
    </>
  )
}
