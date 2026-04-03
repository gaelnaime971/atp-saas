'use client'

import { useState } from 'react'

export default function MethodeATP() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const form = e.currentTarget
    const data = {
      prenom: (form.elements.namedItem('prenom') as HTMLInputElement).value,
      nom: (form.elements.namedItem('nom') as HTMLInputElement).value,
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
      whatsapp: (form.elements.namedItem('whatsapp') as HTMLInputElement).value,
      experience: (form.elements.namedItem('experience') as HTMLSelectElement).value,
      objectif: (form.elements.namedItem('objectif') as HTMLSelectElement).value,
      source: 'methode-atp',
    }

    try {
      await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch {}

    setTimeout(() => {
      setSubmitted(true)
      setLoading(false)
      window.scrollTo(0, 0)
    }, 600)
  }

  const G = '#22c55e'

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#050505;color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;}
body::before{content:'';position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:800px;height:600px;background:radial-gradient(ellipse,rgba(34,197,94,0.07) 0%,transparent 70%);pointer-events:none;z-index:0;}
.wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:60px 24px 80px;}
nav{display:flex;align-items:center;justify-content:center;padding:20px 0 48px;}
.nav-logo{display:flex;align-items:center;gap:8px;}
.nav-logo img{height:24px;}
.nav-logo span{font-size:14px;font-weight:700;letter-spacing:0.03em;color:#fff;}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);font-size:12px;font-weight:500;color:${G};margin-bottom:28px;}
.pill-dot{width:6px;height:6px;border-radius:50%;background:${G};box-shadow:0 0 8px ${G};animation:blink 2s infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.35;}}
h1{font-size:clamp(32px,5vw,48px);font-weight:800;line-height:1.08;letter-spacing:-0.03em;margin-bottom:18px;}
h1 span{color:${G};}
.sub{font-size:16px;color:#777;line-height:1.7;font-weight:300;margin-bottom:32px;}
.sub strong{color:#ccc;font-weight:500;}
.wyg{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px 22px;margin-bottom:32px;}
.wyg-title{font-size:11px;font-weight:600;letter-spacing:0.1em;color:${G};text-transform:uppercase;margin-bottom:14px;}
.wyg-item{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#ccc;line-height:1.55;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
.wyg-item:last-child{border-bottom:none;}
.wyg-ck{color:${G};flex-shrink:0;margin-top:1px;}
.form-wrap{background:#0a0a0a;border:1px solid rgba(34,197,94,0.15);border-radius:16px;padding:28px;position:relative;overflow:hidden;}
.form-wrap::before{content:'';position:absolute;top:-80px;right:-80px;width:240px;height:240px;background:radial-gradient(circle,rgba(34,197,94,0.12),transparent 70%);pointer-events:none;}
.form-title{font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;}
.form-sub{font-size:12px;color:#555;margin-bottom:22px;line-height:1.6;}
.field{margin-bottom:14px;}
.field label{display:block;font-size:11px;font-weight:600;color:#555;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:7px;}
.field input,.field select{width:100%;background:#0e0e0e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:13px 16px;font-size:14px;color:#fff;font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s;-webkit-appearance:none;}
.field input::placeholder{color:#444;}
.field input:focus,.field select:focus{border-color:rgba(34,197,94,0.4);}
.field select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;cursor:pointer;color:#777;}
.field select option{background:#0e0e0e;color:#fff;}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.btn-submit{width:100%;padding:16px;background:${G};color:#050505;border:none;border-radius:10px;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:all 0.25s;margin-top:6px;letter-spacing:0.01em;}
.btn-submit:hover{box-shadow:0 4px 24px rgba(34,197,94,0.4);transform:translateY(-1px);}
.btn-submit:active{transform:translateY(0);}
.btn-submit:disabled{opacity:0.6;cursor:not-allowed;transform:none;}
.form-footer{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;font-size:11px;color:#444;}
.proof{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px;font-size:12px;color:#555;}
.proof-avatars{display:flex;}
.proof-av{width:26px;height:26px;border-radius:50%;background:rgba(34,197,94,0.12);border:2px solid #050505;margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${G};}
.proof-av:first-child{margin-left:0;}
.already{text-align:center;font-size:12px;color:#444;margin-top:20px;}
.already a{color:${G};text-decoration:none;font-weight:500;}
.already a:hover{text-decoration:underline;}
.success{text-align:center;padding:40px 24px;}
.success-icon{font-size:48px;margin-bottom:20px;}
.success h2{font-size:24px;font-weight:800;margin-bottom:10px;}
.success p{font-size:14px;color:#777;line-height:1.7;margin-bottom:24px;}
.success .btn-link{max-width:280px;margin:0 auto;display:block;text-decoration:none;text-align:center;background:${G};color:#050505;padding:14px;border-radius:10px;font-weight:700;font-size:14px;transition:all 0.25s;}
.success .btn-link:hover{box-shadow:0 4px 24px rgba(34,197,94,0.4);transform:translateY(-1px);}
@media(max-width:480px){.wrap{padding:40px 16px 60px;}.field-row{grid-template-columns:1fr;}h1{font-size:28px;}}
      `}</style>

      <div className="wrap">
        <nav>
          <div className="nav-logo">
            <img src="/logo-atp.png" alt="ATP" style={{ height: 40 }} />
          </div>
        </nav>

        {submitted ? (
          <div className="success">
            <div className="success-icon">🎯</div>
            <h2>C&apos;est parti !</h2>
            <p>
              Ta m&eacute;thode est pr&ecirc;te.<br />
              Acc&egrave;de maintenant &agrave; la vid&eacute;o compl&egrave;te &mdash; <strong style={{ color: '#ccc' }}>ma m&eacute;thode de trading de A &agrave; Z</strong>, telle que je l&apos;applique chaque matin avant l&apos;open US.
            </p>
            <a href="#" className="btn-link">Acc&eacute;der &agrave; la vid&eacute;o →</a>
            <div style={{ marginTop: 16, fontSize: 11, color: '#444' }}>Tu recevras aussi un email de confirmation dans quelques minutes.</div>
          </div>
        ) : (
          <>
            <div className="pill">
              <div className="pill-dot" />
              Acc&egrave;s gratuit &middot; Imm&eacute;diat
            </div>

            <h1>Ma m&eacute;thode de trading<br /><span>de A &agrave; Z.</span></h1>

            <p className="sub">
              J&apos;ai trad&eacute; 8 ans en banque d&apos;investissement et hedge fund.<br />
              <strong>Voil&agrave; exactement comment je pr&eacute;pare et ex&eacute;cute chaque session.</strong><br />
              Gratuit. Sans engagement.
            </p>

            <div className="wyg">
              <div className="wyg-title">Ce que tu vas apprendre</div>
              {[
                "Comment je prépare mes sessions avant l'open US — analyse multi-timeframes en 20 minutes",
                'Les 3 setups que je trade exclusivement — et pourquoi je refuse tout le reste',
                'Ma gestion du risque exacte — sizing, SL, TP et drawdown maximum',
                "Comment j'évalue une session — le débriefing qui m'a rendu profitable sur la durée",
                'Les erreurs psychologiques que je vois chez 90% des traders — et comment les corriger',
              ].map(item => (
                <div key={item} className="wyg-item">
                  <span className="wyg-ck">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="proof">
              <div className="proof-avatars">
                {['J', 'M', 'A', 'T', '+'].map((l, i) => (
                  <div key={i} className="proof-av">{l}</div>
                ))}
              </div>
              <span>+1 200 traders ont d&eacute;j&agrave; rejoint la communaut&eacute; ATP</span>
            </div>

            <div className="form-wrap">
              <div className="form-title">Acc&egrave;de &agrave; la m&eacute;thode gratuitement</div>
              <div className="form-sub">Remplis le formulaire &mdash; acc&egrave;s imm&eacute;diat &agrave; la vid&eacute;o.</div>

              <form onSubmit={handleSubmit}>
                <div className="field-row">
                  <div className="field">
                    <label>Pr&eacute;nom</label>
                    <input type="text" name="prenom" placeholder="Thomas" required autoComplete="given-name" />
                  </div>
                  <div className="field">
                    <label>Nom</label>
                    <input type="text" name="nom" placeholder="Dupont" required autoComplete="family-name" />
                  </div>
                </div>

                <div className="field">
                  <label>Email</label>
                  <input type="email" name="email" placeholder="thomas@email.com" required autoComplete="email" />
                </div>

                <div className="field">
                  <label>WhatsApp</label>
                  <input type="tel" name="whatsapp" placeholder="+33 6 XX XX XX XX" required autoComplete="tel" />
                </div>

                <div className="field">
                  <label>Depuis combien de temps tu trades ?</label>
                  <select name="experience" required defaultValue="">
                    <option value="" disabled>S&eacute;lectionne ton niveau</option>
                    <option value="debutant">Je d&eacute;bute — moins de 6 mois</option>
                    <option value="intermediaire">6 mois &agrave; 2 ans</option>
                    <option value="confirme">Plus de 2 ans</option>
                  </select>
                </div>

                <div className="field">
                  <label>Ton principal objectif</label>
                  <select name="objectif" required defaultValue="">
                    <option value="" disabled>Qu&apos;est-ce que tu vises ?</option>
                    <option value="methode">Avoir une m&eacute;thode structur&eacute;e</option>
                    <option value="propfirm">Passer un challenge prop firm</option>
                    <option value="consistance">Devenir consistant et profitable</option>
                    <option value="vivre">Vivre du trading</option>
                  </select>
                </div>

                <button type="submit" className="btn-submit" disabled={loading}>
                  {loading ? 'Envoi en cours...' : 'Accéder à ma méthode gratuitement →'}
                </button>
              </form>

              <div className="form-footer">🔒 Tes informations sont confidentielles &middot; Z&eacute;ro spam</div>
            </div>

            <div className="already">
              Tu es d&eacute;j&agrave; &eacute;l&egrave;ve ATP ?{' '}
              <a href="/login">Acc&eacute;der &agrave; ton espace →</a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
