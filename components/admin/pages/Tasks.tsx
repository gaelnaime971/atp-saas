'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

type TaskStatus = 'todo' | 'in_progress' | 'done'

interface AdminTask {
  id: string
  title: string
  trader_id: string | null
  due_date: string | null
  status: TaskStatus
  created_at: string
  trader_name?: string
}

const COLUMNS: { id: TaskStatus; label: string; color: string; bgActive: string }[] = [
  { id: 'todo', label: 'À faire', color: '#60a5fa', bgActive: 'rgba(96,165,250,0.08)' },
  { id: 'in_progress', label: 'En cours', color: '#f59e0b', bgActive: 'rgba(245,158,11,0.08)' },
  { id: 'done', label: 'Terminée', color: '#22c55e', bgActive: 'rgba(34,197,94,0.08)' },
]

export default function Tasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [traders, setTraders] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ title: '', trader_id: '', due_date: '', status: 'todo' as TaskStatus })
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [{ data: taskData }, { data: traderData }] = await Promise.all([
      supabase
        .from('admin_tasks')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'trader'),
    ])

    if (taskData) {
      setTasks(taskData.map((t: any) => ({
        ...t,
        status: t.status || (t.done ? 'done' : 'todo'),
        trader_name: t.profiles?.full_name ?? null,
      })))
    }
    if (traderData) {
      setTraders(traderData.map((t: any) => ({ id: t.id, full_name: t.full_name ?? 'Unnamed' })))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    await supabase.from('admin_tasks').insert({
      title: form.title.trim(),
      trader_id: form.trader_id || null,
      due_date: form.due_date || null,
      done: form.status === 'done',
      status: form.status,
    })
    setForm({ title: '', trader_id: '', due_date: '', status: 'todo' })
    setShowForm(false)
    setSubmitting(false)
    fetchData()
  }

  async function updateStatus(id: string, status: TaskStatus) {
    await supabase.from('admin_tasks').update({ status, done: status === 'done' }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, done: status === 'done' } : t))
  }

  async function deleteTask(id: string) {
    if (!confirm('Supprimer cette tâche ?')) return
    await supabase.from('admin_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  // Drag & Drop handlers
  function onDragStart(e: React.DragEvent, taskId: string) {
    setDraggedId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  function onDragEnd(e: React.DragEvent) {
    setDraggedId(null)
    setDragOverCol(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  function onDragOver(e: React.DragEvent, colId: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  function onDragLeave() {
    setDragOverCol(null)
  }

  function onDrop(e: React.DragEvent, colId: TaskStatus) {
    e.preventDefault()
    setDragOverCol(null)
    if (draggedId) {
      updateStatus(draggedId, colId)
      setDraggedId(null)
    }
  }

  function dueDateColor(dateStr: string | null): string {
    if (!dateStr) return '#5a6a82'
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(dateStr); due.setHours(0, 0, 0, 0)
    if (due < today) return '#ef4444'
    if (due.getTime() === today.getTime()) return '#f59e0b'
    return '#5a6a82'
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#e8edf5]">Tâches</h1>
          <p className="text-[#5a6a82] text-sm mt-1">
            {tasks.filter(t => t.status !== 'done').length} en cours · {tasks.filter(t => t.status === 'done').length} terminée{tasks.filter(t => t.status === 'done').length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle tâche
        </Button>
      </div>

      {/* Add task form */}
      {showForm && (
        <Card className="border border-green-500/20">
          <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">Ajouter une tâche</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-[#5a6a82] mb-1.5">Titre</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                placeholder="ex: Préparer le bilan mensuel"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Trader (optionnel)</label>
              <select
                value={form.trader_id}
                onChange={e => setForm(f => ({ ...f, trader_id: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="">Aucun trader</option>
                {traders.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Date limite (optionnel)</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Colonne</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3 justify-end">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" loading={submitting}>Ajouter</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id)
          const isDragOver = dragOverCol === col.id
          return (
            <div
              key={col.id}
              onDragOver={e => onDragOver(e, col.id)}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, col.id)}
              className="rounded-xl flex flex-col transition-all duration-200"
              style={{
                background: isDragOver ? col.bgActive : 'var(--bg2)',
                border: `1px solid ${isDragOver ? col.color + '40' : 'var(--border)'}`,
              }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: col.color }}>
                    {col.label}
                  </span>
                </div>
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ background: col.color + '15', color: col.color }}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex-1 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                {colTasks.length === 0 && (
                  <div
                    className="text-center py-8 rounded-lg border-2 border-dashed"
                    style={{ borderColor: isDragOver ? col.color + '40' : 'var(--border)', color: 'var(--text3)' }}
                  >
                    <p className="text-xs">
                      {isDragOver ? 'Déposer ici' : 'Aucune tâche'}
                    </p>
                  </div>
                )}
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => onDragStart(e, task.id)}
                    onDragEnd={onDragEnd}
                    className="p-3 rounded-lg border group cursor-grab active:cursor-grabbing transition-all hover:border-[rgba(255,255,255,0.15)]"
                    style={{
                      background: 'var(--bg3)',
                      borderColor: draggedId === task.id ? col.color + '40' : 'var(--border)',
                    }}
                  >
                    <p
                      className="text-sm font-medium mb-1.5"
                      style={{
                        color: col.id === 'done' ? 'var(--text3)' : 'var(--text)',
                        textDecorationLine: col.id === 'done' ? 'line-through' : 'none',
                      }}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.trader_name && (
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}
                        >
                          {task.trader_name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="text-[10px] font-mono" style={{ color: dueDateColor(task.due_date) }}>
                          {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-1 rounded transition-all hover:bg-[rgba(239,68,68,0.1)]"
                      >
                        <svg className="w-3 h-3" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
