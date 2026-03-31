'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface WelcomeModalProps {
  userId: string
  firstName: string
  onClose: () => void
}

const steps = [
  {
    icon: '👤',
    title: 'Complete ton profil',
    desc: 'Ajoute ta photo de profil et tes informations dans l\'onglet "Mon compte" pour personnaliser ton espace.',
  },
  {
    icon: '📊',
    title: 'Saisis ta première session',
    desc: 'Commence à logger tes sessions de trading pour suivre ta progression et tes performances en temps réel.',
  },
  {
    icon: '💬',
    title: 'Chat exclusif avec Gaël',
    desc: 'Tu as accès à une messagerie privée et sécurisée avec Gaël, accessible via la bulle verte en bas à droite. N\'hésite pas à poser tes questions !',
  },
  {
    icon: '✅',
    title: 'Checklist & Journal',
    desc: 'Utilise la checklist pré-open avant chaque session et tiens ton journal de trading pour ancrer les bonnes habitudes.',
  },
  {
    icon: '⚙️',
    title: 'Paramètre ton compte',
    desc: 'Configure ton instrument principal, ton expérience et tes notifications dans "Mon compte" pour une expérience adaptée.',
  },
]

export default function WelcomeModal({ userId, firstName, onClose }: WelcomeModalProps) {
  const [closing, setClosing] = useState(false)

  async function handleClose() {
    setClosing(true)
    const supabase = createClient()
    await supabase.from('profiles').update({ onboarded: true }).eq('id', userId)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          maxWidth: 520,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          animation: 'fadeInUp 0.3s ease-out',
        }}
      >
        <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

        {/* Header */}
        <div
          style={{
            padding: '28px 28px 20px',
            textAlign: 'center',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)',
              border: '2px solid rgba(34,197,94,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              margin: '0 auto 16px',
            }}
          >
            🎉
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
              margin: '0 0 8px',
            }}
          >
            Bienvenue {firstName} !
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text2)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Félicitations pour cet engagement dans ton coaching trading avec ATP.
            Tu fais partie d&apos;une communauté de traders déterminés à progresser.
            Voici quelques étapes pour bien démarrer :
          </p>
        </div>

        {/* Steps */}
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {steps.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '14px 16px',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {step.icon}
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      margin: '0 0 4px',
                    }}
                  >
                    {step.title}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text2)',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 28px 24px',
            textAlign: 'center',
          }}
        >
          <button
            onClick={handleClose}
            disabled={closing}
            style={{
              background: 'var(--green)',
              color: '#09090b',
              border: 'none',
              borderRadius: 10,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              opacity: closing ? 0.6 : 1,
            }}
          >
            C&apos;est parti ! 🚀
          </button>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text3)',
              marginTop: 12,
            }}
          >
            Ce message ne s&apos;affichera qu&apos;une seule fois
          </p>
        </div>
      </div>
    </div>
  )
}
