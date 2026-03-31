'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface CoachingSession {
  id: string
  trader_name: string
  trader_id: string
  scheduled_at: string
  duration_minutes: number
  status: 'planned' | 'completed' | 'cancelled'
  notes: string | null
}

interface TraderOption {
  id: string
  full_name: string | null
}

export default function Sessions() {
  const [sessions, setSessions] = useState<CoachingSession[]>([])
  const [traders, setTraders] = useState<TraderOption[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'planned' | 'completed' | 'cancelled'>('all')
  const [traderFilter, setTraderFilter] = useState<string>('all')

  // New session form
  const [showForm, setShowForm] = useState(false)
  const [formTraderId, setFormTraderId] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formTime, setFormTime] = useState('10:00')
  const [formDuration, setFormDuration] = useState(60)
  const [formNotes, setFormNotes] = useState('')
  const [formStatus, setFormStatus] = useState<'planned' | 'completed'>('completed')
  const [saving, setSaving] = useState(false)

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null)

  const supabase = createClient()

  async function fetchSessions() {
    const { data } = await supabase
      .from('coaching_sessions')
      .select('*, profiles(full_name)')
      .order('scheduled_at', { ascending: false })

    if (data) {
      setSessions(data.map((s: any) => ({
        id: s.id,
        trader_name: s.profiles?.full_name ?? 'Trader',
        trader_id: s.trader_id,
        scheduled_at: s.scheduled_at,
        duration_minutes: s.duration_minutes,
        status: s.status,
        notes: s.notes,
      })))
    }
  }

  async function fetchTraders() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'trader')
      .order('full_name', { ascending: true })
    if (data) setTraders(data)
  }

  useEffect(() => {
    Promise.all([fetchSessions(), fetchTraders()]).then(() => setLoading(false))
  }, [])

  async function updateStatus(id: string, status: 'planned' | 'completed' | 'cancelled') {
    await supabase.from('coaching_sessions').update({ status }).eq('id', id)
    fetchSessions()
  }

  async function deleteSession(id: string) {
    if (!confirm('Supprimer cette session ?')) return
    await supabase.from('coaching_sessions').delete().eq('id', id)
    fetchSessions()
  }

  function resetForm() {
    setFormTraderId('')
    setFormDate(new Date().toISOString().split('T')[0])
    setFormTime('10:00')
    setFormDuration(60)
    setFormNotes('')
    setFormStatus('completed')
    setEditingId(null)
    setShowForm(false)
  }

  function openEdit(s: CoachingSession) {
    const d = new Date(s.scheduled_at)
    setEditingId(s.id)
    setFormTraderId(s.trader_id)
    setFormDate(d.toISOString().split('T')[0])
    setFormTime(d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    setFormDuration(s.duration_minutes)
    setFormNotes(s.notes ?? '')
    setFormStatus(s.status === 'cancelled' ? 'completed' : s.status)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formTraderId) return
    setSaving(true)

    const scheduled_at = new Date(`${formDate}T${formTime}:00`).toISOString()
    const payload = {
      trader_id: formTraderId,
      scheduled_at,
      duration_minutes: formDuration,
      notes: formNotes.trim() || null,
      status: formStatus,
    }

    if (editingId) {
      await supabase.from('coaching_sessions').update(payload).eq('id', editingId)
    } else {
      await supabase.from('coaching_sessions').insert(payload)
    }

    setSaving(false)
    resetForm()
    fetchSessions()
  }

  const filtered = sessions
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => traderFilter === 'all' || s.trader_id === traderFilter)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: '#18181b',
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
          <h1 className="text-xl font-semibold text-[#e8edf5]">Sessions de Coaching</h1>
          <p className="text-[#5a6a82] text-sm mt-1">{sessions.length} session{sessions.length !== 1 ? 's' : ''} au total</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter une session
          </Button>
        )}
      </div>

      {/* New/Edit session form */}
      {showForm && (
        <Card>
          <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">
            {editingId ? 'Modifier la session' : 'Nouvelle session coaching'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label style={labelStyle}>Trader</label>
              <select value={formTraderId} onChange={e => setFormTraderId(e.target.value)} style={inputStyle}>
                <option value="">Sélectionner un trader...</option>
                {traders.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name ?? 'Unnamed'}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={labelStyle}>Heure</label>
              <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={labelStyle}>Durée (min)</label>
              <select value={formDuration} onChange={e => setFormDuration(Number(e.target.value))} style={inputStyle}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Statut</label>
              <select value={formStatus} onChange={e => setFormStatus(e.target.value as 'planned' | 'completed')} style={inputStyle}>
                <option value="completed">Terminée</option>
                <option value="planned">Planifiée</option>
              </select>
            </div>
            <div className="col-span-2">
              <label style={labelStyle}>Notes / Résumé</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Points abordés, objectifs fixés..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={handleSave} loading={saving} disabled={!formTraderId}>
              {editingId ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
            <Button variant="secondary" onClick={resetForm}>Annuler</Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'planned', 'completed', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === f
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-[#5a6a82] hover:text-[#a0aec0] bg-[#18181b] border border-[rgba(255,255,255,0.07)]'
            }`}
          >
            {f === 'all' ? `Tout (${sessions.length})` : f === 'planned' ? 'Planifié' : f === 'completed' ? 'Terminé' : 'Annulé'}
          </button>
        ))}

        <div className="h-5 w-px mx-1" style={{ background: 'rgba(255,255,255,0.07)' }} />

        <select
          value={traderFilter}
          onChange={e => setTraderFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium outline-none"
          style={{
            background: traderFilter !== 'all' ? 'rgba(34,197,94,0.1)' : '#18181b',
            color: traderFilter !== 'all' ? '#22c55e' : '#5a6a82',
            border: `1px solid ${traderFilter !== 'all' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
          }}
        >
          <option value="all">Tous les traders</option>
          {traders.map(t => (
            <option key={t.id} value={t.id}>{t.full_name ?? 'Unnamed'}</option>
          ))}
        </select>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucune session trouvée</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(session => (
              <div
                key={session.id}
                className="flex items-center gap-4 p-4 bg-[#18181b] rounded-xl border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] transition-all group"
              >
                <div className={`w-1 self-stretch rounded-full ${
                  session.status === 'completed' ? 'bg-green-500' :
                  session.status === 'cancelled' ? 'bg-red-500' :
                  'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-semibold text-[#e8edf5]">{session.trader_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      session.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      session.status === 'cancelled' ? 'bg-red-500/10 text-red-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {session.status === 'planned' ? 'Planifié' : session.status === 'completed' ? 'Terminé' : 'Annulé'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#5a6a82]">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(session.scheduled_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(session.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{session.duration_minutes} min
                    </span>
                  </div>
                  {session.notes && (
                    <p className="text-xs text-[#a0aec0] mt-1.5 leading-relaxed">{session.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {session.status === 'planned' && (
                    <>
                      <button
                        onClick={() => updateStatus(session.id, 'completed')}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        Terminer
                      </button>
                      <button
                        onClick={() => updateStatus(session.id, 'cancelled')}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        Annuler
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => openEdit(session)}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)]"
                    title="Modifier"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="p-1.5 rounded-lg transition-all hover:bg-[rgba(239,68,68,0.1)]"
                    title="Supprimer"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
