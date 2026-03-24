'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { Profile } from '@/lib/types'

const experienceOptions = [
  'Debutant (< 1 an)',
  'Intermediaire (1-3 ans)',
  'Avance (3-5 ans)',
  'Expert (5+ ans)',
]

const instrumentOptions = [
  'ES (S&P 500)',
  'NQ (Nasdaq)',
  'DAX',
  'YM (Dow)',
]

export default function Compte() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [experience, setExperience] = useState(experienceOptions[0])
  const [instrument, setInstrument] = useState(instrumentOptions[0])
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [loading, setLoading] = useState(true)

  // Notification toggles (local state only)
  const [notifChecklist, setNotifChecklist] = useState(true)
  const [notifSaisie, setNotifSaisie] = useState(true)
  const [notifMessages, setNotifMessages] = useState(true)

  // Reset
  const [resetInput, setResetInput] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        setEmail(user.email ?? '')

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (prof) {
          const p = prof as Profile
          setProfile(p)
          const parts = (p.full_name ?? '').split(' ')
          setFirstName(parts[0] ?? '')
          setLastName(parts.slice(1).join(' '))
        }
      } catch (err) {
        console.error('Compte fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaveSuccess(false)

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', profile.id)

      if (!error) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Save profile error:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (resetInput.trim() !== 'RESET ATP') return
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--bg2, #1a1f2e)',
    border: '1px solid var(--border, rgba(255,255,255,0.07))',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 32,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text2)',
    marginBottom: 6,
  }

  const formGroupStyle: React.CSSProperties = {
    marginBottom: 14,
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text2)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Chargement...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
      {/* Left: Profil */}
      <Card>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
          Profil
        </h2>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Prenom</label>
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Nom</label>
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} readOnly style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Experience</label>
          <select value={experience} onChange={e => setExperience(e.target.value)} style={selectStyle}>
            {experienceOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Instrument principal</label>
          <select value={instrument} onChange={e => setInstrument(e.target.value)} style={selectStyle}>
            {instrumentOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <Button variant="primary" onClick={handleSave} loading={saving}>
          {saveSuccess ? 'Profil mis a jour' : 'Enregistrer'}
        </Button>
      </Card>

      {/* Right side */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Notifications */}
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            Notifications
          </h2>

          {[
            { label: 'Rappel checklist pre-open', value: notifChecklist, setter: setNotifChecklist },
            { label: 'Rappel saisie session', value: notifSaisie, setter: setNotifSaisie },
            { label: 'Messages de Gael', value: notifMessages, setter: setNotifMessages },
          ].map((notif, i, arr) => (
            <div
              key={notif.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border, rgba(255,255,255,0.07))' : 'none',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{notif.label}</span>
              <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notif.value}
                  onChange={e => notif.setter(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: notif.value ? 'var(--green, #22c55e)' : 'var(--bg3, #222940)',
                  borderRadius: 22,
                  transition: 'background 0.2s',
                }}>
                  <span style={{
                    position: 'absolute',
                    top: 3,
                    left: notif.value ? 21 : 3,
                    width: 16,
                    height: 16,
                    background: '#fff',
                    borderRadius: '50%',
                    transition: 'left 0.2s',
                  }} />
                </span>
              </label>
            </div>
          ))}
        </Card>

        {/* Zone danger */}
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--red, #ef4444)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 12, borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
            Zone danger
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.6 }}>
            Reinitialiser toutes les donnees locales du dashboard. Cette action est irreversible.
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Confirmer en tapant &quot;RESET ATP&quot;</label>
            <input
              type="text"
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder="RESET ATP"
              style={inputStyle}
            />
          </div>
          <Button
            variant="danger"
            onClick={handleReset}
            disabled={resetInput.trim() !== 'RESET ATP'}
          >
            Reinitialiser
          </Button>
        </Card>
      </div>
    </div>
  )
}
