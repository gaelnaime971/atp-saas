'use client'

import { useState } from 'react'

const EXPERIENCES = ['Aucune', 'Débutant (< 6 mois)', '6 mois à 2 ans', '+ de 2 ans']
const OBJECTIFS = [
  'Comprendre les marchés',
  'Commencer à trader',
  'Améliorer ma méthode',
  'Passer en prop firm',
  'Vivre du trading',
]

export default function TradingNightPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = e.currentTarget
    const fullName = (form.elements.namedItem('nom_complet') as HTMLInputElement).value.trim()
    const parts = fullName.split(/\s+/)
    const prenom = parts[0]
    const nom = parts.slice(1).join(' ') || parts[0]

    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

    const data = {
      prenom,
      nom,
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
      whatsapp: (form.elements.namedItem('whatsapp') as HTMLInputElement).value,
      experience: (form.elements.namedItem('experience') as HTMLSelectElement).value,
      objectif: (form.elements.namedItem('objectif') as HTMLSelectElement).value,
      source: 'preinscription-event',
      notes: `Pré-inscrit via la page Trading Night le ${today} — prochain événement fin mai 2026`,
    }

    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur réseau')
    } catch {
      setError('Une erreur est survenue. Réessaie dans un instant.')
      setLoading(false)
      return
    }

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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#050505;color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;}
body::before{content:'';position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:900px;height:700px;background:radial-gradient(ellipse,rgba(34,197,94,0.08) 0%,transparent 70%);pointer-events:none;z-index:0;}
.tn-wrap{position:relative;z-index:1;max-width:620px;margin:0 auto;padding:50px 24px 80px;}
.tn-nav{display:flex;align-items:center;justify-content:center;padding:0 0 36px;}
.tn-nav img{height:36px;}
.tn-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18);font-size:11px;font-weight:600;color:${G};margin-bottom:24px;letter-spacing:0.08em;text-transform:uppercase;}
.tn-pill-dot{width:6px;height:6px;border-radius:50%;background:${G};box-shadow:0 0 8px ${G};animation:tnblink 2s infinite;}
@keyframes tnblink{0%,100%{opacity:1;}50%{opacity:.35;}}
.tn-h1{font-size:clamp(34px,5.5vw,52px);font-weight:900;line-height:1.05;letter-spacing:-0.035em;margin-bottom:14px;}
.tn-h1 span{color:${G};display:block;}
.tn-sub{font-size:15px;color:#888;line-height:1.7;font-weight:300;margin-bottom:28px;}
.tn-sub strong{color:#ddd;font-weight:500;}

.tn-info{background:#0a0a0a;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px 22px;margin-bottom:24px;display:grid;gap:14px;}
.tn-info-row{display:flex;align-items:flex-start;gap:14px;font-size:13px;color:#ccc;}
.tn-info-icon{width:32px;height:32px;border-radius:8px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
.tn-info-lbl{font-size:10px;letter-spacing:0.12em;color:${G};text-transform:uppercase;font-weight:600;margin-bottom:2px;}
.tn-info-val{color:#fff;font-weight:500;}
.tn-info-sub{color:#777;font-size:12px;font-weight:300;margin-top:2px;}

.tn-badges{display:flex;gap:8px;margin-bottom:28px;flex-wrap:wrap;}
.tn-badge{padding:6px 14px;border-radius:100px;font-size:11px;font-weight:600;letter-spacing:0.04em;}
.tn-badge-g{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.22);color:${G};}
.tn-badge-a{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.22);color:#f59e0b;}

.tn-form{background:#0a0a0a;border:1px solid rgba(34,197,94,0.18);border-radius:16px;padding:28px;position:relative;overflow:hidden;}
.tn-form::before{content:'';position:absolute;top:-80px;right:-80px;width:240px;height:240px;background:radial-gradient(circle,rgba(34,197,94,0.12),transparent 70%);pointer-events:none;}
.tn-form-title{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px;}
.tn-form-sub{font-size:12px;color:#666;margin-bottom:22px;line-height:1.6;}

.tn-field{margin-bottom:14px;}
.tn-field label{display:block;font-size:11px;font-weight:600;color:#666;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:7px;}
.tn-field input,.tn-field select{width:100%;background:#0e0e0e;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:13px 16px;font-size:14px;color:#fff;font-family:'Inter',sans-serif;outline:none;transition:border-color 0.2s;-webkit-appearance:none;}
.tn-field input::placeholder{color:#444;}
.tn-field input:focus,.tn-field select:focus{border-color:rgba(34,197,94,0.4);}
.tn-field select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;cursor:pointer;}
.tn-field select option{background:#0e0e0e;color:#fff;}

.tn-btn{width:100%;padding:16px;background:${G};color:#050505;border:none;border-radius:10px;font-size:15px;font-weight:800;font-family:'Inter',sans-serif;cursor:pointer;transition:all 0.25s;margin-top:6px;letter-spacing:0.01em;}
.tn-btn:hover{box-shadow:0 4px 24px rgba(34,197,94,0.4);transform:translateY(-1px);}
.tn-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none;}

.tn-error{margin-top:12px;padding:10px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.22);border-radius:8px;font-size:12px;color:#ef4444;text-align:center;}
.tn-foot{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px;font-size:11px;color:#444;}

.tn-success{text-align:center;padding:48px 24px;}
.tn-success-icon{font-size:56px;margin-bottom:24px;}
.tn-success h2{font-size:28px;font-weight:800;margin-bottom:12px;letter-spacing:-0.02em;}
.tn-success h2 span{color:${G};}
.tn-success p{font-size:14px;color:#888;line-height:1.7;margin-bottom:24px;max-width:420px;margin-left:auto;margin-right:auto;}
.tn-success p strong{color:#ddd;}
.tn-success-card{background:#0a0a0a;border:1px solid rgba(34,197,94,0.18);border-radius:14px;padding:20px;max-width:380px;margin:0 auto 24px;text-align:left;}
.tn-success-card-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;font-size:13px;}
.tn-success-card-row:last-child{margin-bottom:0;}
.tn-success-card-icon{font-size:16px;width:28px;height:28px;border-radius:6px;background:rgba(34,197,94,0.08);display:flex;align-items:center;justify-content:center;flex-shrink:0;}

.tn-page-foot{text-align:center;font-size:11px;color:#444;margin-top:36px;}
.tn-page-foot a{color:${G};text-decoration:none;}

@media(max-width:480px){
  .tn-wrap{padding:32px 16px 60px;}
  .tn-h1{font-size:30px;}
  .tn-form{padding:22px 20px;}
}
      `}</style>

      <div className="tn-wrap">
        <nav className="tn-nav">
          <img src="/logo-atp.png" alt="ATP" />
        </nav>

        {submitted ? (
          <div className="tn-success">
            <div className="tn-success-icon">🎉</div>
            <h2>Pré-inscription <span>confirmée</span></h2>
            <p>
              Tu es sur la liste pour le <strong>prochain événement fin mai 2026</strong> en Guadeloupe. On te recontacte dès que la date et le lieu sont confirmés.
            </p>
            <div className="tn-success-card">
              <div className="tn-success-card-row">
                <div className="tn-success-card-icon">📅</div>
                <div>
                  <div style={{ fontSize: 10, color: G, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Prochain événement</div>
                  <div style={{ color: '#fff', fontWeight: 500 }}>Fin mai 2026 · Date exacte à venir</div>
                </div>
              </div>
              <div className="tn-success-card-row">
                <div className="tn-success-card-icon">📍</div>
                <div>
                  <div style={{ fontSize: 10, color: G, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Lieu</div>
                  <div style={{ color: '#fff', fontWeight: 500 }}>Guadeloupe</div>
                  <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>Lieu communiqué aux inscrits</div>
                </div>
              </div>
              <div className="tn-success-card-row">
                <div className="tn-success-card-icon">📱</div>
                <div>
                  <div style={{ fontSize: 10, color: G, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Restez connecté</div>
                  <div style={{ color: '#fff', fontWeight: 500 }}>Suivez <a href="https://instagram.com/gael_omega" target="_blank" rel="noopener noreferrer" style={{ color: G, textDecoration: 'none' }}>@gael_omega</a> pour les annonces</div>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#555' }}>
              Tu recevras un email quand la date sera annoncée.
            </p>
          </div>
        ) : (
          <>
            {/* COMPLET BANNER */}
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 24,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                TRADING NIGHT #1 — COMPLET
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                L&apos;événement du 2 mai est complet. <strong style={{ color: '#ddd' }}>Un nouvel événement arrive fin mai !</strong>
              </div>
            </div>

            <div className="tn-pill">
              <div className="tn-pill-dot" />
              Prochain événement · Fin mai 2026
            </div>

            <h1 className="tn-h1">
              TRADING NIGHT
              <span>by Alpha Trading Pro</span>
            </h1>

            <p className="tn-sub">
              La soirée networking trading & investissement de la Guadeloupe revient fin mai.<br />
              <strong>Pré-inscris-toi maintenant</strong> pour être informé en priorité de la date, du lieu et sécuriser ta place.
            </p>

            <div className="tn-info">
              <div className="tn-info-row">
                <div className="tn-info-icon">📅</div>
                <div>
                  <div className="tn-info-lbl">Prochain événement</div>
                  <div className="tn-info-val">Fin mai 2026</div>
                  <div className="tn-info-sub">Date exacte annoncée sur mes réseaux</div>
                </div>
              </div>
              <div className="tn-info-row">
                <div className="tn-info-icon">📍</div>
                <div>
                  <div className="tn-info-lbl">Lieu</div>
                  <div className="tn-info-val">Guadeloupe</div>
                  <div className="tn-info-sub">Lieu communiqué aux pré-inscrits</div>
                </div>
              </div>
              <div className="tn-info-row">
                <div className="tn-info-icon">📱</div>
                <div>
                  <div className="tn-info-lbl">Restez connecté</div>
                  <div className="tn-info-val"><a href="https://instagram.com/gael_omega" target="_blank" rel="noopener noreferrer" style={{ color: G, textDecoration: 'none' }}>@gael_omega</a> sur Instagram</div>
                  <div className="tn-info-sub">Toutes les annonces en avant-première</div>
                </div>
              </div>
            </div>

            <div className="tn-badges">
              <span className="tn-badge tn-badge-g">✓ 100% Gratuit</span>
              <span className="tn-badge tn-badge-a">⚡ Places limitées</span>
            </div>

            <div className="tn-form">
              <div className="tn-form-title">Se pré-inscrire au prochain événement</div>
              <div className="tn-form-sub">Remplis le formulaire pour être contacté en priorité dès que la date est fixée.</div>

              <form onSubmit={handleSubmit}>
                <div className="tn-field">
                  <label>Nom complet</label>
                  <input type="text" name="nom_complet" placeholder="Thomas Dupont" required autoComplete="name" />
                </div>

                <div className="tn-field">
                  <label>Email</label>
                  <input type="email" name="email" placeholder="thomas@email.com" required autoComplete="email" />
                </div>

                <div className="tn-field">
                  <label>WhatsApp</label>
                  <input type="tel" name="whatsapp" placeholder="+590 6 90 XX XX XX" required autoComplete="tel" />
                </div>

                <div className="tn-field">
                  <label>Expérience en trading</label>
                  <select name="experience" required defaultValue="">
                    <option value="" disabled>Sélectionne ton niveau</option>
                    {EXPERIENCES.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>

                <div className="tn-field">
                  <label>Ton objectif</label>
                  <select name="objectif" required defaultValue="">
                    <option value="" disabled>Qu&apos;est-ce que tu vises ?</option>
                    {OBJECTIFS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <button type="submit" className="tn-btn" disabled={loading}>
                  {loading ? 'Pré-inscription en cours...' : 'Se pré-inscrire →'}
                </button>

                {error && <div className="tn-error">{error}</div>}
              </form>

              <div className="tn-foot">🔒 Tes informations sont confidentielles · Zéro spam</div>
            </div>
          </>
        )}

        <div className="tn-page-foot">
          <a href="https://instagram.com/gael_omega" target="_blank" rel="noopener noreferrer">@gael_omega</a> · Alpha Trading Pro
        </div>
      </div>
    </>
  )
}
