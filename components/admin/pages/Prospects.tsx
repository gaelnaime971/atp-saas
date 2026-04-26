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
  score: number
  score_updated_at: string
  reactivity: string
}

// ── Scoring Algorithm ─────────────────────────────────────────────

const DEFAULT_EXP_SCORES: Record<string, number> = {
  'Aucune': 0, 'debutant': 10, 'Débutant (< 6 mois)': 10,
  'intermediaire': 20, '6 mois à 2 ans': 20,
  'confirme': 30, '+ de 2 ans': 30,
}

const DEFAULT_OBJ_SCORES: Record<string, number> = {
  'Comprendre les marchés': 10, 'Commencer à trader': 10,
  'methode': 20, 'Améliorer ma méthode': 20,
  'consistance': 15,
  'propfirm': 25, 'Passer en prop firm': 25,
  'vivre': 25, 'Vivre du trading': 25,
}

const DEFAULT_SRC_SCORES: Record<string, number> = {
  'reference-client': 25,
  'whop-2000': 22, 'whop-1000-2000': 20, 'whop-1000': 18,
  'video-methode': 15, 'methode-atp': 15, 'landing-capture': 15,
  'trading-night': 12, 'preinscription-event': 10,
  'organique-instagram': 8, 'organique-x': 6,
  'manual': 5, 'csv-import': 5,
}

const DEFAULT_REACT_SCORES: Record<string, number> = {
  '24h': 20, '72h': 10, 'question': 10, 'link_click': 5, 'none': 0,
}

const SCORING_KEY = 'atp_scoring_config'

function loadScoringConfig() {
  try {
    const stored = localStorage.getItem(SCORING_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

function saveScoringConfig(config: { exp: Record<string, number>; obj: Record<string, number>; src: Record<string, number>; react: Record<string, number> }) {
  localStorage.setItem(SCORING_KEY, JSON.stringify(config))
}

// Editable scoring config labels for UI
const EXP_SCORE_LABELS: Record<string, string> = {
  'Aucune': 'Aucune', 'debutant': 'Débutant (<6m)', 'intermediaire': 'Intermédiaire (6m-2a)', 'confirme': 'Confirmé (2a+)',
}
const OBJ_SCORE_LABELS: Record<string, string> = {
  'Comprendre les marchés': 'Comprendre les marchés', 'Commencer à trader': 'Commencer à trader',
  'methode': 'Méthode structurée', 'consistance': 'Consistance', 'propfirm': 'Prop firm', 'vivre': 'Vivre du trading',
}
const SRC_SCORE_LABELS: Record<string, string> = {
  'reference-client': 'Référence client', 'whop-2000': 'Whop +2000€', 'whop-1000-2000': 'Whop 1K-2K€', 'whop-1000': 'Whop <1000€',
  'video-methode': 'Vidéo Méthode', 'methode-atp': 'Méthode ATP', 'trading-night': 'Trading Night', 'preinscription-event': 'Pré-inscr. Event',
  'organique-instagram': 'Instagram', 'organique-x': 'X/Twitter', 'manual': 'Manuel',
}
const REACT_SCORE_LABELS: Record<string, string> = {
  '24h': 'Répondu <24h', '72h': 'Répondu <72h', 'question': 'Question posée', 'link_click': 'Clic lien', 'none': 'Pas de réponse',
}

function computeScore(p: Prospect, cfg?: { exp: Record<string, number>; obj: Record<string, number>; src: Record<string, number>; react: Record<string, number> }): number {
  const expS = cfg?.exp ?? loadScoringConfig()?.exp ?? DEFAULT_EXP_SCORES
  const objS = cfg?.obj ?? loadScoringConfig()?.obj ?? DEFAULT_OBJ_SCORES
  const srcS = cfg?.src ?? loadScoringConfig()?.src ?? DEFAULT_SRC_SCORES
  const reactS = cfg?.react ?? loadScoringConfig()?.react ?? DEFAULT_REACT_SCORES
  const exp = expS[p.experience] ?? 0
  const obj = objS[p.objectif] ?? 0
  const src = srcS[p.source] ?? 5
  const react = reactS[p.reactivity] ?? 0
  return Math.min(100, exp + obj + src + react)
}

function scoreLabel(s: number): { label: string; emoji: string; color: string; bg: string } {
  if (s >= 75) return { label: 'CHAUD', emoji: '🔥', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
  if (s >= 50) return { label: 'TIÈDE', emoji: '📞', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
  if (s >= 25) return { label: 'FROID', emoji: '❄️', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' }
  return { label: 'NON QUAL.', emoji: '⏸️', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
}

function scoreRecommendation(s: number): string {
  if (s >= 75) return '✅ Appeler en priorité — prospect chaud'
  if (s >= 50) return '📞 Appeler cette semaine'
  if (s >= 25) return '📧 Nurture d\'abord — pas prêt'
  return '⏸️ Mettre en veille'
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
  'video-methode': { label: 'Vidéo Méthode', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  'whop-1000': { label: 'Whop <1000€', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  'whop-1000-2000': { label: 'Whop 1K-2K€', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  'whop-2000': { label: 'Whop +2000€', color: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
  'organique-instagram': { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.1)' },
  'organique-x': { label: 'X/Twitter', color: '#aaa', bg: 'rgba(170,170,170,0.1)' },
  'reference-client': { label: 'Référence', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'manual': { label: 'Manuel', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  'csv-import': { label: 'Import CSV', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
}

const IMPORT_SOURCES = [
  { value: 'trading-night', label: 'Trading Night' },
  { value: 'video-methode', label: 'Vidéo Méthode ATP' },
  { value: 'whop-1000', label: 'Whop <1000€' },
  { value: 'whop-1000-2000', label: 'Whop 1K-2K€' },
  { value: 'whop-2000', label: 'Whop +2000€' },
  { value: 'organique-instagram', label: 'Organique Instagram' },
  { value: 'organique-x', label: 'Organique X/Twitter' },
  { value: 'reference-client', label: 'Référence client' },
  { value: 'manual', label: 'Ajout manuel' },
]

const PAGE_SIZE = 15

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterObjectif, setFilterObjectif] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [filterExp, setFilterExp] = useState('all')
  const [filterQual, setFilterQual] = useState('all')
  const [sortByScore, setSortByScore] = useState(false)
  const [showPriorities, setShowPriorities] = useState(false)
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

    if (filterQual !== 'all') {
      if (filterQual === 'hot') query = query.gte('score', 75)
      else if (filterQual === 'warm') query = query.gte('score', 50).lt('score', 75)
      else if (filterQual === 'cold') query = query.gte('score', 25).lt('score', 50)
      else if (filterQual === 'unqualified') query = query.lt('score', 25)
    }
    if (showPriorities) {
      query = query.gte('score', 75).in('status', ['nouveau', 'contacte'])
    }
    if (sortByScore) query = query.order('score', { ascending: false })

    const { data, count } = await query
    // Recalculate scores for prospects missing score
    const prospects = (data || []).map((p: Prospect) => {
      if (!p.score && p.score !== 0) {
        const score = computeScore(p)
        supabase.from('prospects').update({ score, score_updated_at: new Date().toISOString() }).eq('id', p.id)
        return { ...p, score }
      }
      return p
    })
    setProspects(prospects)
    setTotal(count || 0)
    setLoading(false)
  }, [page, filterStatus, filterObjectif, filterSource, filterExp, filterQual, sortByScore, showPriorities, supabase])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from('prospects').update({ [field]: value }).eq('id', id)
    setProspects(prev => prev.map(p => {
      if (p.id !== id) return p
      const updated = { ...p, [field]: value }
      const newScore = computeScore(updated as Prospect)
      if (newScore !== p.score) {
        supabase.from('prospects').update({ score: newScore, score_updated_at: new Date().toISOString() }).eq('id', id)
        updated.score = newScore
      }
      return updated
    }))
    if (selected?.id === id) setSelected(prev => {
      if (!prev) return null
      const updated = { ...prev, [field]: value }
      updated.score = computeScore(updated as Prospect)
      return updated
    })
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

  // Scoring config
  const [showScoring, setShowScoring] = useState(false)
  const [scoreCfg, setScoreCfg] = useState<{ exp: Record<string, number>; obj: Record<string, number>; src: Record<string, number>; react: Record<string, number> }>(() => {
    const stored = loadScoringConfig()
    return stored || { exp: { ...DEFAULT_EXP_SCORES }, obj: { ...DEFAULT_OBJ_SCORES }, src: { ...DEFAULT_SRC_SCORES }, react: { ...DEFAULT_REACT_SCORES } }
  })

  function handleSaveScoring() {
    saveScoringConfig(scoreCfg)
    // Recalculate all visible prospect scores
    setProspects(prev => prev.map(p => {
      const score = computeScore(p, scoreCfg)
      supabase.from('prospects').update({ score, score_updated_at: new Date().toISOString() }).eq('id', p.id)
      return { ...p, score }
    }))
    setShowScoring(false)
  }

  function resetScoring() {
    const def = { exp: { ...DEFAULT_EXP_SCORES }, obj: { ...DEFAULT_OBJ_SCORES }, src: { ...DEFAULT_SRC_SCORES }, react: { ...DEFAULT_REACT_SCORES } }
    setScoreCfg(def)
  }

  // CSV Import
  const [showImport, setShowImport] = useState(false)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvSource, setCsvSource] = useState('trading-night')
  const [csvCustomSource, setCsvCustomSource] = useState('')
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({ prenom: '', nom: '', email: '', whatsapp: '', experience: '', objectif: '' })
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; errors: number } | null>(null)

  function handleCsvFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return
      const sep = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
      const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()))
      setCsvHeaders(headers)
      setCsvData(rows)
      // Auto-map by guessing
      const map: Record<string, string> = { prenom: '', nom: '', email: '', whatsapp: '', experience: '', objectif: '' }
      headers.forEach(h => {
        const lh = h.toLowerCase()
        if (lh.includes('prénom') || lh.includes('prenom') || lh === 'first' || lh.includes('first name')) map.prenom = h
        else if (lh.includes('nom') || lh === 'last' || lh.includes('last name') || lh.includes('family')) map.nom = h
        else if (lh.includes('mail') || lh.includes('e-mail')) map.email = h
        else if (lh.includes('phone') || lh.includes('tel') || lh.includes('whatsapp') || lh.includes('mobile')) map.whatsapp = h
        else if (lh.includes('expéri') || lh.includes('experience') || lh.includes('niveau')) map.experience = h
        else if (lh.includes('objectif') || lh.includes('goal')) map.objectif = h
      })
      // If no prenom but has "nom complet" or "name", use nom for both
      if (!map.prenom && !map.nom) {
        const nameCol = headers.find(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('nom'))
        if (nameCol) { map.prenom = nameCol; map.nom = nameCol }
      }
      setCsvMapping(map)
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (csvData.length === 0) return
    setImporting(true)
    setImportProgress(0)
    setImportResult(null)

    const hi = (col: string) => csvHeaders.indexOf(col)
    const prospects = csvData.map(row => {
      const get = (field: string) => {
        const col = csvMapping[field]
        if (!col) return ''
        const idx = hi(col)
        return idx >= 0 ? (row[idx] || '') : ''
      }
      let prenom = get('prenom')
      let nom = get('nom')
      // If same column for prenom/nom, split on space
      if (csvMapping.prenom === csvMapping.nom && prenom) {
        const parts = prenom.split(/\s+/)
        prenom = parts[0] || ''
        nom = parts.slice(1).join(' ') || parts[0] || ''
      }
      return {
        prenom, nom,
        email: get('email'),
        whatsapp: get('whatsapp'),
        experience: get('experience'),
        objectif: get('objectif'),
      }
    }).filter(p => p.email)

    const source = csvSource === 'autre' ? (csvCustomSource || 'csv-import') : csvSource

    // Simulate progress
    const progressIv = setInterval(() => {
      setImportProgress(prev => Math.min(prev + 3, 90))
    }, 100)

    try {
      const res = await fetch('/api/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects, source }),
      })
      const data = await res.json()
      clearInterval(progressIv)
      setImportProgress(100)
      setImportResult({ imported: data.imported || 0, duplicates: data.duplicates || 0, errors: data.errors || 0 })
      fetchProspects()
    } catch {
      clearInterval(progressIv)
      setImportResult({ imported: 0, duplicates: 0, errors: csvData.length })
    }
    setImporting(false)
  }

  function resetImport() {
    setShowImport(false)
    setCsvData([])
    setCsvHeaders([])
    setCsvSource('trading-night')
    setCsvCustomSource('')
    setCsvMapping({ prenom: '', nom: '', email: '', whatsapp: '', experience: '', objectif: '' })
    setImportResult(null)
    setImportProgress(0)
  }

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
          {Object.entries(SOURCE_LABELS)
            .filter(([k]) => k !== 'landing-capture' && k !== 'csv-import')
            .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
          }
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

        <select
          value={filterQual}
          onChange={e => { setFilterQual(e.target.value); setShowPriorities(false); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Qualification</option>
          <option value="hot">🔥 Chaud (75+)</option>
          <option value="warm">📞 Tiède (50-74)</option>
          <option value="cold">❄️ Froid (25-49)</option>
          <option value="unqualified">⏸️ Non qualifié (&lt;25)</option>
        </select>

        <button
          onClick={() => { setSortByScore(!sortByScore); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg transition-all"
          style={{
            background: sortByScore ? 'rgba(34,197,94,0.1)' : 'var(--bg2)',
            border: `1px solid ${sortByScore ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
            color: sortByScore ? '#22c55e' : 'var(--text3)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          Score ↓
        </button>

        <button
          onClick={() => setShowScoring(true)}
          className="text-xs px-3 py-2 rounded-lg transition-all"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', fontWeight: 600 }}
        >
          ⚙️ Scoring
        </button>

        <button
          onClick={() => { setShowPriorities(!showPriorities); setFilterQual('all'); setPage(0) }}
          className="text-xs px-3 py-2 rounded-lg transition-all"
          style={{
            background: showPriorities ? 'rgba(239,68,68,0.1)' : 'var(--bg2)',
            border: `1px solid ${showPriorities ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
            color: showPriorities ? '#ef4444' : 'var(--text3)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          🔥 Priorités
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text3)' }}>{total} prospect{total > 1 ? 's' : ''}</span>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Importer CSV
          </button>
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

      {/* Scoring config modal */}
      {showScoring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setShowScoring(false)}>
          <div className="w-full max-w-2xl rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Configuration du scoring</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Modifie les points attribués à chaque critère (score total sur 100)</p>
              </div>
              <button onClick={() => setShowScoring(false)} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
            </div>

            {/* 4 sections */}
            <div className="grid grid-cols-2 gap-5">
              {/* Expérience */}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: '#22c55e' }}>Expérience (max 30)</div>
                {Object.entries(EXP_SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={scoreCfg.exp[key] ?? 0}
                      onChange={e => setScoreCfg(prev => ({ ...prev, exp: { ...prev.exp, [key]: Number(e.target.value) } }))}
                      className="w-14 text-center rounded-md px-2 py-1 text-xs outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                ))}
              </div>

              {/* Objectif */}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: '#3b82f6' }}>Objectif (max 25)</div>
                {Object.entries(OBJ_SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={scoreCfg.obj[key] ?? 0}
                      onChange={e => setScoreCfg(prev => ({ ...prev, obj: { ...prev.obj, [key]: Number(e.target.value) } }))}
                      className="w-14 text-center rounded-md px-2 py-1 text-xs outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                ))}
              </div>

              {/* Source */}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: '#a855f7' }}>Source (max 25)</div>
                {Object.entries(SRC_SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={scoreCfg.src[key] ?? 0}
                      onChange={e => setScoreCfg(prev => ({ ...prev, src: { ...prev.src, [key]: Number(e.target.value) } }))}
                      className="w-14 text-center rounded-md px-2 py-1 text-xs outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                ))}
              </div>

              {/* Réactivité */}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: '#f59e0b' }}>Réactivité (max 20)</div>
                {Object.entries(REACT_SCORE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text2)' }}>{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={scoreCfg.react[key] ?? 0}
                      onChange={e => setScoreCfg(prev => ({ ...prev, react: { ...prev.react, [key]: Number(e.target.value) } }))}
                      className="w-14 text-center rounded-md px-2 py-1 text-xs outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button onClick={resetScoring} className="px-4 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer' }}>
                Réinitialiser les valeurs par défaut
              </button>
              <div className="flex-1" />
              <button onClick={() => setShowScoring(false)} className="px-4 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSaveScoring} className="px-6 py-2.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--green)', color: '#09090b', cursor: 'pointer' }}>
                Sauvegarder & recalculer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={resetImport}>
          <div className="w-full max-w-2xl rounded-2xl p-6" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Importer des contacts CSV</h2>
              <button onClick={resetImport} className="text-lg" style={{ color: 'var(--text3)' }}>✕</button>
            </div>

            {/* Step 1: Upload */}
            {csvData.length === 0 && (
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#22c55e' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f) }}
                  style={{
                    border: '2px dashed var(--border)', borderRadius: 12, padding: '48px 24px',
                    textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
                  }}
                  onClick={() => {
                    const inp = document.createElement('input')
                    inp.type = 'file'; inp.accept = '.csv,.txt'
                    inp.onchange = () => { if (inp.files?.[0]) handleCsvFile(inp.files[0]) }
                    inp.click()
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Glisse ton fichier CSV ici</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>ou clique pour sélectionner — CSV depuis Google Contacts, iPhone, Excel</div>
                </div>
              </div>
            )}

            {/* Step 2: Mapping + Preview */}
            {csvData.length > 0 && !importResult && (
              <div className="space-y-5">
                {/* Source select */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--text3)' }}>Source à attribuer</label>
                  <div className="flex gap-2 flex-wrap">
                    {IMPORT_SOURCES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setCsvSource(s.value)}
                        className="transition-all"
                        style={{
                          padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: csvSource === s.value ? (SOURCE_LABELS[s.value]?.bg || 'var(--bg3)') : 'var(--bg3)',
                          border: `1px solid ${csvSource === s.value ? (SOURCE_LABELS[s.value]?.color || 'var(--green)') + '44' : 'var(--border)'}`,
                          color: csvSource === s.value ? (SOURCE_LABELS[s.value]?.color || 'var(--green)') : 'var(--text3)',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setCsvSource('autre')}
                      className="transition-all"
                      style={{
                        padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: csvSource === 'autre' ? 'var(--bg3)' : 'var(--bg3)',
                        border: `1px solid ${csvSource === 'autre' ? 'var(--green)44' : 'var(--border)'}`,
                        color: csvSource === 'autre' ? 'var(--green)' : 'var(--text3)',
                      }}
                    >
                      Autre
                    </button>
                  </div>
                  {csvSource === 'autre' && (
                    <input
                      type="text"
                      value={csvCustomSource}
                      onChange={e => setCsvCustomSource(e.target.value)}
                      placeholder="Nom de la source..."
                      className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  )}
                </div>

                {/* Column mapping */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--text3)' }}>Mapping des colonnes</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'prenom', label: 'Prénom', req: true },
                      { key: 'nom', label: 'Nom', req: true },
                      { key: 'email', label: 'Email', req: true },
                      { key: 'whatsapp', label: 'WhatsApp', req: false },
                      { key: 'experience', label: 'Expérience', req: false },
                      { key: 'objectif', label: 'Objectif', req: false },
                    ].map(f => (
                      <div key={f.key}>
                        <div className="text-[10px] mb-1" style={{ color: f.req ? 'var(--text2)' : 'var(--text3)' }}>
                          {f.label} {f.req && <span style={{ color: '#ef4444' }}>*</span>}
                        </div>
                        <select
                          value={csvMapping[f.key]}
                          onChange={e => setCsvMapping(m => ({ ...m, [f.key]: e.target.value }))}
                          className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                          style={{ background: 'var(--bg3)', border: `1px solid ${csvMapping[f.key] ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, color: csvMapping[f.key] ? 'var(--text)' : 'var(--text3)' }}
                        >
                          <option value="">— Non mappé —</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--text3)' }}>
                    Aperçu ({csvData.length} lignes)
                  </label>
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--bg3)' }}>
                          {csvHeaders.map(h => (
                            <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text3)', fontSize: 10 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.slice(0, 5).map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-1.5" style={{ color: 'var(--text2)' }}>{cell || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvData.length > 5 && <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>... et {csvData.length - 5} autres lignes</div>}
                </div>

                {/* Progress */}
                {importing && (
                  <div>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text3)' }}>
                      <span>Import en cours...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${importProgress}%`, background: 'var(--green)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={resetImport} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || !csvMapping.email}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'var(--green)', color: '#09090b', cursor: importing ? 'default' : 'pointer' }}
                  >
                    {importing ? 'Import en cours...' : `Importer ${csvData.filter(r => { const idx = csvHeaders.indexOf(csvMapping.email); return idx >= 0 && r[idx] }).length} contacts`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Result */}
            {importResult && (
              <div className="text-center py-6">
                <div style={{ fontSize: 48, marginBottom: 16 }}>{importResult.imported > 0 ? '✅' : '⚠️'}</div>
                <div className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>Import terminé</div>
                <div className="flex gap-4 justify-center mb-6">
                  <div className="rounded-lg p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', minWidth: 100 }}>
                    <div className="text-2xl font-bold" style={{ color: '#22c55e' }}>{importResult.imported}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Importés</div>
                  </div>
                  <div className="rounded-lg p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', minWidth: 100 }}>
                    <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{importResult.duplicates}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Doublons</div>
                  </div>
                  <div className="rounded-lg p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', minWidth: 100 }}>
                    <div className="text-2xl font-bold" style={{ color: '#ef4444' }}>{importResult.errors}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Erreurs</div>
                  </div>
                </div>
                <button onClick={resetImport} className="px-6 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: '#09090b', cursor: 'pointer' }}>
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                {IMPORT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              {['Date', 'Nom', 'Source', 'Score', 'Email', 'WhatsApp', 'Objectif', 'Statut', 'Action', ''].map(h => (
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
                <td className="px-4 py-3">
                  {(() => {
                    const sl = scoreLabel(p.score || computeScore(p))
                    return (
                      <span
                        className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider cursor-default"
                        style={{ color: sl.color, background: sl.bg, border: `1px solid ${sl.color}33` }}
                        title={`Score: ${p.score || computeScore(p)}/100`}
                      >
                        {sl.emoji} {sl.label}
                      </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>{p.email}</td>
                <td className="px-4 py-3" style={{ color: 'var(--text2)' }}>{p.whatsapp}</td>
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

            {/* Score detail */}
            {(() => {
              const s = selected.score || computeScore(selected)
              const sl = scoreLabel(s)
              const cfg = loadScoringConfig()
              const expPts = (cfg?.exp ?? DEFAULT_EXP_SCORES)[selected.experience] ?? 0
              const objPts = (cfg?.obj ?? DEFAULT_OBJ_SCORES)[selected.objectif] ?? 0
              const srcPts = (cfg?.src ?? DEFAULT_SRC_SCORES)[selected.source] ?? 5
              const reactPts = (cfg?.react ?? DEFAULT_REACT_SCORES)[selected.reactivity] ?? 0
              return (
                <div className="rounded-xl p-4" style={{ background: sl.bg, border: `1px solid ${sl.color}33` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold" style={{ color: sl.color }}>{s}</div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: sl.color }}>{sl.emoji} {sl.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text3)' }}>{scoreRecommendation(s)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Expérience', pts: expPts, max: 30 },
                      { label: 'Objectif', pts: objPts, max: 25 },
                      { label: 'Source', pts: srcPts, max: 25 },
                      { label: 'Réactivité', pts: reactPts, max: 20 },
                    ].map(c => (
                      <div key={c.label} className="text-center">
                        <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>{c.pts}/{c.max}</div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: '100%', width: `${(c.pts / c.max) * 100}%`, background: sl.color, borderRadius: 2 }} />
                        </div>
                        <div className="text-[9px] mt-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Reactivity */}
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Réactivité</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'none', label: 'Pas de réponse' },
                  { value: '72h', label: 'Répondu <72h' },
                  { value: '24h', label: 'Répondu <24h' },
                  { value: 'question', label: 'A posé une question' },
                  { value: 'link_click', label: 'A cliqué un lien' },
                ].map(r => (
                  <button
                    key={r.value}
                    onClick={() => updateField(selected.id, 'reactivity', r.value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={(selected.reactivity || 'none') === r.value
                      ? { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                      : { background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
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
