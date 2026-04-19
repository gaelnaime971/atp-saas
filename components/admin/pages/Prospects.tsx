'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Prospect {
  id: string
  created_at: string
  prenom: string
  nom: string
  email: string
  whatsapp: string
  experience: string
  objectif: string
  source: string
  status: string
  action: string
  notes: string
}

const STATUS_OPTIONS = [
  { value: 'nouveau', label: 'Nouveau', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { value: 'contacte', label: 'Contacté', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { value: 'call_booke', label: 'Call booké', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  { value: 'close', label: 'Closé', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  { value: 'disqualifie', label: 'Disqualifié', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
]

const ACTION_OPTIONS = [
  { value: 'rien_fait', label: 'Rien fait' },
  { value: 'whatsapp_envoye', label: 'WhatsApp envoyé' },
  { value: 'mail_envoye', label: 'Mail envoyé' },
  { value: 'whatsapp_et_mail', label: 'WhatsApp + Mail' },
  { value: 'pas_qualifie', label: 'Pas qualifié' },
]

const OBJECTIF_LABELS: Record<string, string> = {
  // Méthode ATP (codes courts)
  methode: 'Méthode structurée',
  propfirm: 'Prop firm',
  consistance: 'Consistance',
  vivre: 'Vivre du trading',
  // Trading Night (texte direct)
  'Comprendre les marchés': 'Comprendre les marchés',
  'Commencer à trader': 'Commencer à trader',
  'Améliorer ma méthode': 'Améliorer ma méthode',
  'Passer en prop firm': 'Passer en prop firm',
  'Vivre du trading': 'Vivre du trading',
}

const EXP_LABELS: Record<string, string> = {
  debutant: 'Débutant (< 6 mois)',
  intermediaire: '6 mois à 2 ans',
  confirme: '+ de 2 ans',
  // Trading Night (texte direct)
  'Aucune': 'Aucune',
  'Débutant (< 6 mois)': 'Débutant (< 6 mois)',
  '6 mois à 2 ans': '6 mois à 2 ans',
  '+ de 2 ans': '+ de 2 ans',
}

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'methode-atp': { label: 'Méthode ATP', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  'landing-capture': { label: 'Méthode ATP', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  'trading-night': { label: 'Trading Night', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  'preinscription-event': { label: 'Pré-inscr. Event', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'manual': { label: 'Manuel', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
}

const PAGE_SIZE = 15

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterObjectif, setFilterObjectif] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [filterExp, setFilterExp] = useState('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const supabase = createClient()

  const fetchProspects = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('prospects')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)
    if (filterObjectif !== 'all') query = query.eq('objectif', filterObjectif)
    if (filterSource !== 'all') {
      if (filterSource === 'methode-atp') {
        query = query.in('source', ['methode-atp', 'landing-capture'])
      } else {
        query = query.eq('source', filterSource)
      }
    }
    if (filterExp !== 'all') query = query.eq('experience', filterExp)

    const { data, count } = await query
    setProspects(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filterStatus, filterObjectif, filterSource, filterExp, supabase])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from('prospects').update({ [field]: value }).eq('id', id)
    setProspects(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, [field]: value } : null)
  }

  const saveNotes = async () => {
    if (!selected) return
    await updateField(selected.id, 'notes', editNotes)
  }

  const deleteProspect = async (id: string) => {
    if (!confirm('Supprimer ce prospect ?')) return
    await supabase.from('prospects').delete().eq('id', id)
    setProspects(prev => prev.filter(p => p.id !== id))
    setTotal(prev => prev - 1)
    setSelected(null)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getStatusStyle = (status: string) => {
    const s = STATUS_OPTIONS.find(o => o.value === status)
    return s ? { color: s.color, background: s.bg, border: `1px solid ${s.color}33` } : {}
  }

  // KPI counts
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.from('prospects').select('status')
      if (!data) return
      const c: Record<string, number> = { total: data.length }
      data.forEach(p => { c[p.status] = (c[p.status] || 0) + 1 })
      setCounts(c)
    }
    fetchCounts()
  }, [prospects, supabase])

  // Add prospect modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ prenom: '', nom: '', email: '', whatsapp: '', experience: '', objectif: '', source: 'manual' })
  const [addLoading, setAddLoading] = useState(false)

  const handleAddProspect = async () => {
    if (!addForm.prenom || !addForm.nom || !addForm.email || !addForm.whatsapp || !addForm.experience || !addForm.objectif) return
    setAddLoading(true)
    await supabase.from('prospects').insert({
      prenom: addForm.prenom,
      nom: addForm.nom,
      email: addForm.email,
      whatsapp: addForm.whatsapp,
      experience: addForm.experience,
      objectif: addForm.objectif,
      source: addForm.source,
      status: 'nouveau',
      action: 'rien_fait',
      notes: `Ajouté manuellement le ${new Date().toLocaleDateString('fr-FR')}`,
    })
    setShowAdd(false)
    setAddForm({ prenom: '', nom: '', email: '', whatsapp: '', experience: '', objectif: '', source: 'manual' })
    setAddLoading(false)
    fetchProspects()
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total', value: counts.total || 0, color: '#fff' },
          ...STATUS_OPTIONS.map(s => ({
            label: s.label,
            value: counts[s.value] || 0,
            color: s.color,
          })),
        ].map(k => (
          <div
            key={k.label}
            className="rounded-xl p-4 text-center"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
          >
            <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--text3)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Add button */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Tous les statuts</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <select
          value={filterObjectif}
          onChange={e => { setFilterObjectif(e.target.value); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Tous les objectifs</option>
          {Object.entries(OBJECTIF_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          value={filterSource}
          onChange={e => { setFilterSource(e.target.value); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Toutes les sources</option>
          <option value="methode-atp">Méthode ATP</option>
          <option value="trading-night">Trading Night</option>
          <option value="preinscription-event">Pré-inscr. Event</option>
        </select>

        <select
          value={filterExp}
          onChange={e => { setFilterExp(e.target.value); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Tous les niveaux</option>
          {Object.entries(EXP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>{total} prospect{total > 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--green)', color: '#09090b' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouveau prospect
          </button>
        </div>
      </div>

      {/* Add prospect modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Nouveau prospect</h2>
              <button onClick={() => setShowAdd(false)} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Prénom</label>
                <input type="text" value={addForm.prenom} onChange={e => setAddForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Thomas" required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Nom</label>
                <input type="text" value={addForm.nom} onChange={e => setAddForm(f => ({ ...f, nom: e.target.value }))} placeholder="Dupont" required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Email</label>
              <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="thomas@email.com" required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>WhatsApp</label>
              <input type="tel" value={addForm.whatsapp} onChange={e => setAddForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+590 6 90 XX XX XX" required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Expérience</label>
                <select value={addForm.experience} onChange={e => setAddForm(f => ({ ...f, experience: e.target.value }))} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: addForm.experience ? 'var(--text)' : 'var(--text3)' }}>
                  <option value="" disabled>Niveau</option>
                  <option value="Aucune">Aucune</option>
                  <option value="debutant">Débutant</option>
                  <option value="intermediaire">Intermédiaire</option>
                  <option value="confirme">Confirmé</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Objectif</label>
                <select value={addForm.objectif} onChange={e => setAddForm(f => ({ ...f, objectif: e.target.value }))} required className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: addForm.objectif ? 'var(--text)' : 'var(--text3)' }}>
                  <option value="" disabled>Objectif</option>
                  <option value="methode">Méthode structurée</option>
                  <option value="propfirm">Prop firm</option>
                  <option value="consistance">Consistance</option>
                  <option value="vivre">Vivre du trading</option>
                  <option value="Comprendre les marchés">Comprendre les marchés</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text3)' }}>Source</label>
              <select value={addForm.source} onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="manual">Ajout manuel</option>
                <option value="trading-night">Trading Night</option>
                <option value="preinscription-event">Pré-inscr. Event</option>
                <option value="methode-atp">Méthode ATP</option>
              </select>
            </div>

            <button
              onClick={handleAddProspect}
              disabled={addLoading || !addForm.prenom || !addForm.nom || !addForm.email || !addForm.whatsapp || !addForm.experience || !addForm.objectif}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--green)', color: '#09090b' }}
            >
              {addLoading ? 'Ajout en cours...' : 'Ajouter le prospect'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              {['Date', 'Nom', 'Source', 'Email', 'WhatsApp', 'Expérience', 'Objectif', 'Statut', 'Action', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)', fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-12" style={{ color: 'var(--text3)' }}>Chargement...</td></tr>
            ) : prospects.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12" style={{ color: 'var(--text3)' }}>Aucun prospect</td></tr>
            ) : prospects.map(p => {
              const src = SOURCE_LABELS[p.source] || { label: p.source, color: 'var(--text3)', bg: 'var(--bg3)' }
              return (
              <tr
                key={p.id}
                className="transition-colors hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
                style={{ borderTop: '1px solid var(--border)' }}
                onClick={() => { setSelected(p); setEditNotes(p.notes || '') }}
              >
                <td className="px-4 py-3" style={{ color: 'var(--text3)' }}>
                  {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{p.prenom} {p.nom}</td>
                <td className="px-4 py-3">
                  <span
                    className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: src.color, background: src.bg, border: `1px solid ${src.color}33` }}
                  >
                    {src.label}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>{p.email}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>{p.whatsapp}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text3)' }}>{EXP_LABELS[p.experience] || p.experience}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>{OBJECTIF_LABELS[p.objectif] || p.objectif}</td>
                <td className="px-4 py-3">
                  <span
                    className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                    style={getStatusStyle(p.status)}
                  >
                    {STATUS_OPTIONS.find(s => s.value === p.status)?.label || p.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={p.action}
                    onChange={e => { e.stopPropagation(); updateField(p.id, 'action', e.target.value) }}
                    onClick={e => e.stopPropagation()}
                    className="text-[11px] px-2 py-1 rounded-md outline-none"
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                  >
                    {ACTION_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <svg className="w-4 h-4" style={{ color: 'var(--text3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
          >
            ←
          </button>
          <span className="text-xs" style={{ color: 'var(--text3)' }}>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
          >
            →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{selected.prenom} {selected.nom}</h2>
                <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                  Inscrit le {new Date(selected.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}{selected.source}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Email', value: selected.email },
                { label: 'WhatsApp', value: selected.whatsapp },
                { label: 'Expérience', value: EXP_LABELS[selected.experience] || selected.experience },
                { label: 'Objectif', value: OBJECTIF_LABELS[selected.objectif] || selected.objectif },
              ].map(f => (
                <div key={f.label} className="rounded-lg p-3" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{f.label}</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{f.value}</div>
                </div>
              ))}
            </div>

            {/* Status */}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Statut</div>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => updateField(selected.id, 'status', s.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={selected.status === s.value
                      ? { background: s.bg, color: s.color, border: `1px solid ${s.color}` }
                      : { background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action */}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Mon action</div>
              <div className="flex gap-2 flex-wrap">
                {ACTION_OPTIONS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => updateField(selected.id, 'action', a.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={selected.action === a.value
                      ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                      : { background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Notes</div>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                onBlur={saveNotes}
                rows={4}
                placeholder="Ajouter des notes sur ce prospect..."
                className="w-full rounded-lg p-3 text-sm outline-none resize-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>

            {/* Contact buttons */}
            <div className="flex gap-3">
              <a
                href={`https://wa.me/${selected.whatsapp.replace(/\s+/g, '').replace('+', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: '#25d366', color: '#fff' }}
              >
                WhatsApp →
              </a>
              <a
                href={`mailto:${selected.email}`}
                className="flex-1 text-center py-2.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                Envoyer un mail →
              </a>
              <button
                onClick={() => deleteProspect(selected.id)}
                className="py-2.5 px-4 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
