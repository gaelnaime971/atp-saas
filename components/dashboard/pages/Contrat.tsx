'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface Invoice {
  id: string
  invoice_number: number
  amount: number
  amount_ht: number | null
  tva_amount: number | null
  is_ttc: boolean
  description: string | null
  payment_date: string
  payment_method: string | null
  invoice_url: string | null
}

interface ContratState {
  signed: boolean
  name: string
  date: string
}

const STORAGE_KEY = 'atp_contrat_signed'

const articles = [
  {
    num: 1,
    title: 'Objet',
    content: "Ce contrat etablit les conditions du programme de coaching individuel Alpha Trading Pro entre Gael (coach) et le trader (coache). L'objectif est de rendre le trader rentable et autonome selon la methodologie ATP.",
  },
  {
    num: 2,
    title: 'Duree',
    content: 'Le programme de coaching est etabli pour une duree minimale de 3 mois, renouvelable par accord mutuel. Chaque mois comprend entre 2 et 4 sessions de coaching selon la formule choisie.',
  },
  {
    num: 3,
    title: 'Tarifs & Paiement',
    content: "Le reglement s'effectue en debut de mois. Toute session annulee moins de 24h a l'avance est due. Les paiements sont non remboursables sauf accord exceptionnel du coach.",
  },
  {
    num: 4,
    title: 'Engagements du trader',
    content: "Le trader s'engage a : tenir son journal de trading, saisir ses sessions dans le dashboard ATP, respecter le plan de trading defini, assister aux sessions de coaching programmees et maintenir une communication transparente sur ses resultats.",
  },
  {
    num: 5,
    title: 'Engagements du coach',
    content: "Gael s'engage a : preparer chaque session, fournir un feedback structure, etre disponible entre les sessions pour les questions urgentes, adapter le programme selon la progression du trader.",
  },
  {
    num: 6,
    title: 'Confidentialite',
    content: "Les performances, resultats et contenus partages dans le cadre du coaching sont strictement confidentiels. Aucune information ne sera partagee sans accord ecrit prealable.",
  },
  {
    num: 7,
    title: 'Resultats',
    content: "Le trading comporte des risques. Les resultats passes ne garantissent pas les resultats futurs. Le coach s'engage a transmettre une methode eprouvee mais ne peut garantir la rentabilite.",
  },
  {
    num: 8,
    title: 'Litiges',
    content: "En cas de litige, les parties s'engagent a rechercher une solution amiable. Le droit francais est applicable. Juridiction competente : Tribunal de Basse-Terre, Guadeloupe.",
  },
]

const PAYMENT_LABELS: Record<string, string> = {
  virement: 'Virement',
  stripe_comptant: 'Stripe',
  stripe_2x: 'Stripe 2×',
  stripe_3x: 'Stripe 3×',
  stripe_4x: 'Stripe 4×',
}

export default function Contrat() {
  const [check1, setCheck1] = useState(false)
  const [check2, setCheck2] = useState(false)
  const [check3, setCheck3] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [signed, setSigned] = useState(false)
  const [signedName, setSignedName] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data: ContratState = JSON.parse(stored)
        if (data.signed) {
          setSigned(true)
          setSignedName(data.name)
          setSignedDate(data.date)
        }
      }
    } catch {}

    // Fetch invoices
    async function fetchInvoices() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('revenues')
        .select('*')
        .eq('trader_id', user.id)
        .not('invoice_number', 'is', null)
        .order('payment_date', { ascending: false })
      if (data) setInvoices(data as Invoice[])
      setLoadingInvoices(false)
    }
    fetchInvoices()
  }, [])

  const canSign = check1 && check2 && check3 && name.trim().length > 0

  function handleSign() {
    if (!canSign) return
    const state: ContratState = { signed: true, name: name.trim(), date }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    setSigned(true)
    setSignedName(name.trim())
    setSignedDate(date)
  }

  const checkboxStyle: React.CSSProperties = {
    width: 'auto',
    marginTop: 2,
    accentColor: 'var(--green, #22c55e)',
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    cursor: 'pointer',
    marginBottom: 10,
  }

  async function downloadInvoice(invoiceUrl: string) {
    const { data } = await supabase.storage.from('invoices').createSignedUrl(invoiceUrl, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
      {/* Left: Contract signing form */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Contrat de Coaching ATP
          </h2>
          <span style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 4,
            fontWeight: 600,
            background: signed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: signed ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
            border: `1px solid ${signed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {signed ? 'Signe \u2713' : 'A signer'}
          </span>
        </div>

        {!signed ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
              En signant ce contrat vous acceptez les conditions du programme de coaching Alpha Trading Pro. Lisez attentivement chaque article avant de signer.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                <input type="checkbox" checked={check1} onChange={e => setCheck1(e.target.checked)} style={checkboxStyle} />
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>J&apos;ai lu et accepte l&apos;integralite du contrat de coaching ATP</span>
              </label>
              <label style={labelStyle}>
                <input type="checkbox" checked={check2} onChange={e => setCheck2(e.target.checked)} style={checkboxStyle} />
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Je m&apos;engage a respecter les engagements decrits dans les articles 4, 5 et 6</span>
              </label>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                <input type="checkbox" checked={check3} onChange={e => setCheck3(e.target.checked)} style={checkboxStyle} />
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Je comprends que cette signature est definitive et juridiquement engageante</span>
              </label>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
                Nom complet
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Prenom Nom"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg2, #1a1f2e)',
                  border: '1px solid var(--border, rgba(255,255,255,0.07))',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
                Date de signature
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg2, #1a1f2e)',
                  border: '1px solid var(--border, rgba(255,255,255,0.07))',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  colorScheme: 'dark',
                }}
              />
            </div>

            <Button
              variant="primary"
              disabled={!canSign}
              onClick={handleSign}
              style={{ width: '100%', justifyContent: 'center', opacity: canSign ? 1 : 0.4 }}
            >
              Signer le contrat
            </Button>
          </>
        ) : (
          <>
            <div style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 10,
              padding: 16,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{'\u2713'}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green, #22c55e)', marginBottom: 6 }}>
                Contrat signe
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{signedName}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                {new Date(signedDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <Button
              variant="ghost"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={() => {/* PDF download placeholder */}}
            >
              Telecharger le PDF
            </Button>
          </>
        )}
      </Card>

      {/* Right: Articles du contrat */}
      <Card style={{ overflowY: 'auto', maxHeight: 600 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
          Articles du contrat
        </h2>
        {articles.map((art, i) => (
          <div
            key={art.num}
            style={{
              padding: '14px 0',
              borderBottom: i < articles.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.07))' : 'none',
            }}
          >
            <h4 style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--green, #22c55e)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: '0 0 6px 0',
            }}>
              Art. {art.num} — {art.title}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
              {art.content}
            </p>
          </div>
        ))}
      </Card>
    </div>

    {/* Invoices section */}
    <Card>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
        Mes factures
      </h2>
      {loadingInvoices ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: 24 }}>
          Aucune facture disponible
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>N°</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mode</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>HT</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>TVA</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>TTC</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--text3)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const ht = inv.amount_ht ?? (inv.is_ttc ? inv.amount / 1.2 : inv.amount)
                const tva = inv.tva_amount ?? (inv.is_ttc ? inv.amount - inv.amount / 1.2 : inv.amount * 0.2)
                const ttc = inv.is_ttc ? inv.amount : inv.amount * 1.2
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
                    <td style={{ padding: '10px', color: 'var(--green, #22c55e)', fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12 }}>
                      F-{String(inv.invoice_number).padStart(4, '0')}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      {new Date(inv.payment_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text2)', fontSize: 12 }}>
                      {inv.description ?? '—'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text3)', fontSize: 12 }}>
                      {PAYMENT_LABELS[inv.payment_method ?? ''] ?? inv.payment_method ?? '—'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text2)', fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: 'right' }}>
                      {ht.toFixed(2)} €
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text3)', fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: 'right' }}>
                      {tva.toFixed(2)} €
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text)', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                      {ttc.toFixed(2)} €
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {inv.invoice_url ? (
                        <button
                          onClick={() => downloadInvoice(inv.invoice_url!)}
                          style={{
                            background: 'rgba(34,197,94,0.1)',
                            color: '#22c55e',
                            border: '1px solid rgba(34,197,94,0.2)',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Télécharger
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    </div>
  )
}
