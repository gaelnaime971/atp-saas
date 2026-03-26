'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import AvatarUpload from '@/components/ui/AvatarUpload'

interface TraderInfo {
  id: string
  full_name: string | null
  email: string | null
  plan_type: string | null
  propfirm_name: string | null
  capital: number
  nb_accounts: number
  created_at: string
}

interface PendingInvite {
  id: string
  email: string
  full_name: string
  code: string
  plan_type: string
  created_at: string
  expires_at: string
}

interface AppConfig {
  calendly_url: string
  tva_rate: number
  company_name: string
  company_address: string
  company_siren: string
}

const defaultConfig: AppConfig = {
  calendly_url: 'https://calendly.com/gael-n971/60min',
  tva_rate: 20,
  company_name: 'Omega Investment',
  company_address: '316 route de Néron, 97160 Le Moule, Guadeloupe',
  company_siren: '919495424',
}

export default function Settings() {
  const [traders, setTraders] = useState<TraderInfo[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTrader, setEditingTrader] = useState<TraderInfo | null>(null)
  const [editForm, setEditForm] = useState({ plan_type: '', propfirm_name: '', capital: '', nb_accounts: '' })
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [configSaved, setConfigSaved] = useState(false)
  const [tab, setTab] = useState<'traders' | 'invites' | 'config'>('traders')
  const [adminId, setAdminId] = useState<string | null>(null)
  const [adminName, setAdminName] = useState<string | null>(null)
  const [adminAvatar, setAdminAvatar] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchAll()
    // Load config from Supabase
    async function loadConfig() {
      const { data } = await supabase.from('app_settings').select('key, value')
      if (data) {
        const map: Record<string, string> = {}
        data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
        setConfig({
          calendly_url: map.calendly_url || defaultConfig.calendly_url,
          tva_rate: parseFloat(map.tva_rate) || defaultConfig.tva_rate,
          company_name: map.company_name || defaultConfig.company_name,
          company_address: map.company_address || defaultConfig.company_address,
          company_siren: map.company_siren || defaultConfig.company_siren,
        })
      }
    }
    loadConfig()
    // Fetch admin profile
    async function fetchAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setAdminId(user.id)
      const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
      if (data) {
        setAdminName(data.full_name)
        setAdminAvatar(data.avatar_url)
      }
    }
    fetchAdmin()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: traderData }, { data: inviteData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, plan_type, propfirm_name, capital, nb_accounts, created_at').eq('role', 'trader').order('created_at', { ascending: false }),
      supabase.from('invitations').select('*').is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ])
    if (traderData) setTraders(traderData as TraderInfo[])
    if (inviteData) setInvites(inviteData as PendingInvite[])
    setLoading(false)
  }

  function startEdit(t: TraderInfo) {
    setEditingTrader(t)
    setEditForm({
      plan_type: t.plan_type ?? '',
      propfirm_name: t.propfirm_name ?? '',
      capital: String(t.capital || 0),
      nb_accounts: String(t.nb_accounts || 1),
    })
  }

  async function saveEdit() {
    if (!editingTrader) return
    setSaving(true)
    await supabase.from('profiles').update({
      plan_type: editForm.plan_type || null,
      propfirm_name: editForm.propfirm_name || null,
      capital: parseFloat(editForm.capital) || 0,
      nb_accounts: parseInt(editForm.nb_accounts) || 1,
    }).eq('id', editingTrader.id)
    setEditingTrader(null)
    setSaving(false)
    fetchAll()
  }

  async function resetPassword(email: string) {
    if (!confirm(`Envoyer un email de réinitialisation à ${email} ?`)) return
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) alert('Email de réinitialisation envoyé')
    else alert('Erreur lors de l\'envoi')
  }

  async function deleteTrader(trader: TraderInfo) {
    if (!confirm(`Supprimer définitivement ${trader.full_name ?? trader.email} ? Cette action est irréversible.`)) return
    // Delete profile (cascade will handle related data)
    const res = await fetch('/api/admin/delete-trader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trader_id: trader.id }),
    })
    if (res.ok) fetchAll()
    else alert('Erreur lors de la suppression')
  }

  async function cancelInvite(inviteId: string) {
    if (!confirm('Annuler cette invitation ?')) return
    await supabase.from('invitations').update({ used_at: new Date().toISOString() }).eq('id', inviteId)
    fetchAll()
  }

  async function saveConfig() {
    const entries = [
      { key: 'calendly_url', value: config.calendly_url },
      { key: 'tva_rate', value: String(config.tva_rate) },
      { key: 'company_name', value: config.company_name },
      { key: 'company_address', value: config.company_address },
      { key: 'company_siren', value: config.company_siren },
    ]
    for (const entry of entries) {
      await supabase.from('app_settings').upsert(entry, { onConflict: 'key' })
    }
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#1c2333',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 8,
    color: '#e8edf5',
    fontSize: 13,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: '#5a6a82',
    marginBottom: 4,
    fontWeight: 500,
  }

  const tabs = [
    { id: 'traders' as const, label: `Traders (${traders.length})` },
    { id: 'invites' as const, label: `Invitations (${invites.length})` },
    { id: 'config' as const, label: 'Configuration' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8edf5]">Paramètres</h1>
          <p className="text-[#5a6a82] text-sm mt-1">Gérer les traders, invitations et configuration</p>
        </div>
        {adminId && (
          <div className="flex items-center gap-4">
            <AvatarUpload
              userId={adminId}
              currentUrl={adminAvatar}
              name={adminName}
              size={48}
              onUploaded={(url) => setAdminAvatar(url)}
            />
            <div>
              <p className="text-sm font-medium text-[#e8edf5]">{adminName}</p>
              <p className="text-xs text-[#5a6a82]">Modifier ma photo</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === t.id ? 'rgba(34,197,94,0.1)' : '#1c2333',
              color: tab === t.id ? '#22c55e' : '#5a6a82',
              border: `1px solid ${tab === t.id ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TRADERS TAB */}
      {tab === 'traders' && (
        <Card>
          {traders.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#5a6a82' }}>Aucun trader</p>
          ) : (
            <div className="space-y-3">
              {traders.map(t => (
                <div
                  key={t.id}
                  className="flex items-center gap-4 p-4 rounded-xl border"
                  style={{ background: '#1c2333', borderColor: 'rgba(255,255,255,0.05)' }}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                    <span className="text-green-400 text-xs font-bold">{(t.full_name ?? 'T')[0].toUpperCase()}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#e8edf5] truncate">{t.full_name ?? 'Unnamed'}</p>
                    <p className="text-xs text-[#5a6a82] truncate">{t.email}</p>
                  </div>

                  {/* Tags */}
                  <div className="flex items-center gap-2 shrink-0">
                    {t.plan_type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">{t.plan_type}</span>
                    )}
                    {t.propfirm_name && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: '#222940', color: '#a0aec0' }}>{t.propfirm_name}</span>
                    )}
                    {Number(t.capital) > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: '#222940', color: '#a0aec0' }}>
                        {(Number(t.capital) * (t.nb_accounts || 1) / 1000).toFixed(0)}K
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => resetPassword(t.email!)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}
                    >
                      Reset MDP
                    </button>
                    <button
                      onClick={() => deleteTrader(t)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* INVITES TAB */}
      {tab === 'invites' && (
        <Card>
          {invites.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: '#5a6a82' }}>Aucune invitation en attente</p>
          ) : (
            <div className="space-y-3">
              {invites.map(inv => {
                const expiresIn = Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-4 p-4 rounded-xl border"
                    style={{ background: '#1c2333', borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <span className="text-amber-400 text-xs font-bold">{inv.full_name[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#e8edf5]">{inv.full_name}</p>
                      <p className="text-xs text-[#5a6a82]">{inv.email}</p>
                    </div>
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                      {inv.code}
                    </span>
                    <span className="text-xs text-[#5a6a82]">{inv.plan_type}</span>
                    <span className={`text-xs font-mono ${expiresIn <= 2 ? 'text-amber-400' : 'text-[#5a6a82]'}`}>
                      {expiresIn}j restants
                    </span>
                    <button
                      onClick={() => cancelInvite(inv.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      Annuler
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* CONFIG TAB */}
      {tab === 'config' && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-semibold text-[#e8edf5] mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 8 }}>
              Coaching
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Lien Calendly / Réservation</label>
              <input
                type="url"
                value={config.calendly_url}
                onChange={e => setConfig(c => ({ ...c, calendly_url: e.target.value }))}
                style={inputStyle}
                placeholder="https://calendly.com/..."
              />
            </div>
            <div>
              <label style={labelStyle}>Taux de TVA (%)</label>
              <input
                type="number"
                value={config.tva_rate}
                onChange={e => setConfig(c => ({ ...c, tva_rate: parseFloat(e.target.value) || 0 }))}
                style={{ ...inputStyle, width: 100 }}
                min="0"
                max="100"
                step="0.1"
              />
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-[#e8edf5] mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 8 }}>
              Informations société (factures)
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nom de la société</label>
              <input
                type="text"
                value={config.company_name}
                onChange={e => setConfig(c => ({ ...c, company_name: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Adresse</label>
              <input
                type="text"
                value={config.company_address}
                onChange={e => setConfig(c => ({ ...c, company_address: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>SIREN</label>
              <input
                type="text"
                value={config.company_siren}
                onChange={e => setConfig(c => ({ ...c, company_siren: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </Card>

          <div className="col-span-2 flex items-center gap-3">
            <Button onClick={saveConfig}>
              Enregistrer la configuration
            </Button>
            {configSaved && (
              <span className="text-xs text-green-400 font-medium">Configuration sauvegardée ✓</span>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingTrader && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => e.target === e.currentTarget && setEditingTrader(null)}
        >
          <div className="w-full max-w-md rounded-xl border" style={{ background: '#161b27', borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <h2 className="text-sm font-semibold text-[#e8edf5]">
                Modifier — {editingTrader.full_name}
              </h2>
              <button onClick={() => setEditingTrader(null)} className="text-[#5a6a82] hover:text-[#e8edf5]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label style={labelStyle}>Plan</label>
                <select
                  value={editForm.plan_type}
                  onChange={e => setEditForm(f => ({ ...f, plan_type: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Aucun</option>
                  <option value="1:1">1:1</option>
                  <option value="group">Group</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Prop Firm</label>
                <select
                  value={editForm.propfirm_name}
                  onChange={e => setEditForm(f => ({ ...f, propfirm_name: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Aucune</option>
                  <option value="FTMO">FTMO</option>
                  <option value="TopStep">TopStep</option>
                  <option value="Apex">Apex</option>
                  <option value="E8">E8</option>
                  <option value="My Forex Funds">My Forex Funds</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Capital / compte ($)</label>
                  <input
                    type="number"
                    value={editForm.capital}
                    onChange={e => setEditForm(f => ({ ...f, capital: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Nb comptes</label>
                  <input
                    type="number"
                    value={editForm.nb_accounts}
                    onChange={e => setEditForm(f => ({ ...f, nb_accounts: e.target.value }))}
                    style={inputStyle}
                    min="1"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="secondary" onClick={() => setEditingTrader(null)}>Annuler</Button>
                <Button onClick={saveEdit} loading={saving}>Enregistrer</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
