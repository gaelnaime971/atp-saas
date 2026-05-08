'use client'

import { useState } from 'react'

const STRIPE_LINK = 'https://buy.stripe.com/8x2dR99dH9ndbJAd5EdUY07'
const CONTACT_EMAIL = 'omega.investment971@gmail.com'
const COMPANY_ADDRESS = '316 Route De Neron, 97160, Le Moule, Guadeloupe, France'

export default function Paiement() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['cgv', 'refund', 'legal']))

  const G = '#22c55e'

  const toggleSection = (id: string) => setOpenSections(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => {
    const isOpen = openSections.has(id)
    return (
      <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
        <button
          onClick={() => toggleSection(id)}
          style={{
            width: '100%', padding: '20px 24px', background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.06em' }}>
            {title}
          </span>
          <span style={{ color: G, fontSize: 18, transition: 'transform 0.3s', display: 'inline-block', transform: isOpen ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
        </button>
        {isOpen && (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ paddingTop: 18, fontSize: 14, lineHeight: 1.75, color: '#bbb' }}>{children}</div>
          </div>
        )}
      </div>
    )
  }

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ minWidth: 200, fontSize: 11, fontWeight: 600, color: '#666', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: '#ddd' }}>{value}</div>
    </div>
  )

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Orbitron:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#040a04;color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;}
body::before{content:'';position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:900px;height:700px;background:radial-gradient(ellipse,rgba(34,197,94,0.06) 0%,transparent 70%);pointer-events:none;z-index:0;}
.pay-wrap{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:60px 24px 80px;}
.pay-nav{display:flex;align-items:center;justify-content:center;padding:0 0 40px;}
.pay-nav img{height:32px;}
.pay-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 18px;border-radius:100px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.18);font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;}
.pay-h1{font-family:'Orbitron',sans-serif;font-size:clamp(32px,5vw,44px);font-weight:900;line-height:1.1;letter-spacing:-0.02em;}
.pay-sub{font-size:15px;color:#888;line-height:1.7;font-weight:300;}
.btn-pay{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:18px 40px;background:#22c55e;color:#000;border:none;border-radius:10px;font-family:'Orbitron',sans-serif;font-size:14px;font-weight:800;letter-spacing:0.08em;text-decoration:none;cursor:pointer;transition:all 0.25s;text-transform:uppercase;}
.btn-pay:hover{box-shadow:0 6px 30px rgba(34,197,94,0.4);transform:translateY(-1px);}
@media(max-width:480px){.pay-wrap{padding:36px 16px 60px;}}
      `}</style>

      <div className="pay-wrap">
        {/* Logo */}
        <nav className="pay-nav">
          <img src="/logo-atp.png" alt="ATP" />
        </nav>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div className="pay-pill" style={{ color: G, marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} />
            Paiement sécurisé · Stripe
          </div>
          <h1 className="pay-h1" style={{ marginBottom: 14 }}>
            Programme <span style={{ color: G }}>ATP ULTRA</span>
          </h1>
          <p className="pay-sub" style={{ maxWidth: 540, margin: '0 auto' }}>
            Prestation de formation et accompagnement stratégique en méthodes de trading. Coaching individuel personnalisé avec Gaël Naime.
          </p>
        </div>

        {/* Offer card */}
        <div style={{ background: '#0a0a0a', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 16, padding: 32, marginBottom: 28, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -100, right: -100, width: 280, height: 280, background: 'radial-gradient(circle, rgba(34,197,94,0.12), transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, color: G, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                Paiement unique
              </div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 6 }}>
                3 000 <span style={{ fontSize: 28, color: G }}>€</span>
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>TTC · Paiement comptant sécurisé</div>
            </div>

            <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" className="btn-pay">
              Payer maintenant →
            </a>
          </div>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 10 }}>
            {[
              'Coaching individuel 1v1 avec Gaël Naime',
              'Méthode ATP institutionnelle complète',
              'Accès dashboard SaaS pendant 12 mois',
              'Discord ATP Élite Pro pendant 12 mois',
              'Suivi WhatsApp permanent',
            ].map(item => (
              <div key={item} style={{ display: 'flex', gap: 10, fontSize: 14, color: '#ccc' }}>
                <span style={{ color: G, flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 36, flexWrap: 'wrap', fontSize: 11, color: '#666' }}>
          <span>🔒 Paiement sécurisé Stripe</span>
          <span>·</span>
          <span>✅ Société française enregistrée</span>
          <span>·</span>
          <span>📧 Support sous 24h</span>
        </div>

        {/* Section title */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Informations légales
          </div>
        </div>

        {/* CGV */}
        <Section id="cgv" title="📋 Conditions Générales de Vente">
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>1. Description du service</div>
            <p>Prestation de formation et accompagnement stratégique en méthodes de trading — Programme ATP ULTRA. Service dématérialisé incluant un coaching individuel, l&apos;accès à une plateforme SaaS, à une communauté Discord privée et à des supports de formation vidéo.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>2. Prix</div>
            <p><strong style={{ color: '#fff' }}>3 000 € TTC</strong> — paiement comptant en ligne. Le prix est ferme et définitif au moment de la commande.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>3. Modalités de paiement</div>
            <p>Paiement en ligne sécurisé via Stripe. Lien de paiement : <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" style={{ color: G, textDecoration: 'underline', wordBreak: 'break-all' }}>{STRIPE_LINK}</a></p>
            <p style={{ marginTop: 8 }}>Aucune information bancaire n&apos;est conservée par Omega Investment. Toutes les transactions sont chiffrées et traitées directement par Stripe.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>4. Délais</div>
            <p>La prestation démarre dans les <strong style={{ color: '#fff' }}>48 heures suivant la réception du paiement</strong>. Un email de confirmation et d&apos;accès est envoyé automatiquement, suivi d&apos;un appel d&apos;onboarding planifié.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>5. Livraison / Exécution</div>
            <p>Prestation de service dématérialisée. Les accès au dashboard SaaS, au Discord et aux contenus de formation sont transmis par email sous 48 heures à l&apos;adresse fournie lors du paiement.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>6. Obligations du prestataire</div>
            <p>Omega Investment s&apos;engage à fournir un accompagnement personnalisé conforme à la description du service, dans les conditions définies au moment de la commande. Les performances passées ne préjugent pas des résultats futurs et aucune garantie de gain financier n&apos;est offerte.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>7. Réclamations</div>
            <p>Toute réclamation doit être adressée par email à <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a> dans un délai de <strong style={{ color: '#fff' }}>30 jours suivant la prestation</strong>. Une réponse sera apportée sous 7 jours ouvrés.</p>
          </div>

          <div>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>8. Droit applicable</div>
            <p>Les présentes CGV sont soumises au droit français. En cas de litige, les parties s&apos;engagent à rechercher une solution amiable. À défaut, le litige sera porté devant les juridictions compétentes du ressort du siège social d&apos;Omega Investment.</p>
          </div>
        </Section>

        {/* Politique remboursement */}
        <Section id="refund" title="↩️ Politique de remboursement">
          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>Droit de rétractation</div>
            <p>Conformément à l&apos;<strong style={{ color: '#fff' }}>article L221-18 du Code de la consommation</strong>, le client dispose d&apos;un délai de <strong style={{ color: '#fff' }}>14 jours</strong> à compter de la conclusion du contrat pour exercer son droit de rétractation, sans avoir à justifier de motifs ni payer de pénalités.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>Exception</div>
            <p>Conformément à l&apos;<strong style={{ color: '#fff' }}>article L221-28</strong> du Code de la consommation, le droit de rétractation ne peut être exercé pour les prestations de services pleinement exécutées avant la fin du délai de rétractation et dont l&apos;exécution a commencé après accord exprès du consommateur et renoncement exprès à son droit de rétractation.</p>
            <p style={{ marginTop: 8 }}>Si le client demande expressément à ce que la prestation démarre avant la fin du délai de 14 jours, il accepte de renoncer à son droit de rétractation pour la part de prestation déjà exécutée.</p>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>Procédure de remboursement</div>
            <p>En cas de rétractation valide, le remboursement sera effectué dans un délai de <strong style={{ color: '#fff' }}>14 jours</strong> à compter de la réception de la demande de rétractation, par le même moyen de paiement utilisé lors de la transaction initiale, sauf accord exprès contraire du client.</p>
          </div>

          <div>
            <div style={{ color: G, fontWeight: 700, marginBottom: 8, fontSize: 13, letterSpacing: '0.04em' }}>Comment exercer mon droit de rétractation</div>
            <p>Pour exercer votre droit de rétractation, vous devez nous notifier votre décision par une déclaration dénuée d&apos;ambiguïté :</p>
            <div style={{ marginTop: 12, padding: '14px 18px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 10 }}>
              <div style={{ marginBottom: 6 }}><strong style={{ color: '#fff' }}>Par email :</strong> <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a></div>
              <div><strong style={{ color: '#fff' }}>Par courrier :</strong> Omega Investment, {COMPANY_ADDRESS}</div>
            </div>
          </div>
        </Section>

        {/* Mentions légales */}
        <Section id="legal" title="⚖️ Mentions légales">
          <Field label="Raison sociale" value="Omega Investment" />
          <Field label="SIREN" value="919 495 424" />
          <Field label="Adresse" value={COMPANY_ADDRESS} />
          <Field label="Activité" value="Prestation de formation et accompagnement en trading" />
          <Field label="Responsable de publication" value="Gaël Naime" />
          <Field label="Email de contact" value={CONTACT_EMAIL} />
          <Field label="Hébergeur du site" value="Vercel Inc. — 340 S Lemon Ave #4133, Walnut, CA 91789, USA" />

          <p style={{ marginTop: 18, fontSize: 12, color: '#777', lineHeight: 1.7 }}>
            Le présent site est édité par Omega Investment, société immatriculée au Registre du Commerce et des Sociétés sous le numéro SIREN 919 495 424. Conformément à la loi pour la confiance dans l&apos;économie numérique (LCEN) du 21 juin 2004, l&apos;ensemble des informations légales est mis à disposition des utilisateurs.
          </p>
        </Section>

        {/* Final CTA */}
        <div style={{ textAlign: 'center', marginTop: 40, padding: 32, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
            Prêt à démarrer ?
          </div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 1.6 }}>
            Paiement sécurisé · Accès envoyé sous 48h · Support disponible
          </p>
          <a href={STRIPE_LINK} target="_blank" rel="noopener noreferrer" className="btn-pay">
            ▸ Payer 3 000 € — ATP ULTRA
          </a>
          <div style={{ marginTop: 14, fontSize: 11, color: '#666' }}>
            Une question avant de payer ? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: G }}>{CONTACT_EMAIL}</a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#555' }}>
          © 2026 Omega Investment · SIREN 919 495 424 · Le Moule, Guadeloupe
        </div>
      </div>
    </>
  )
}
