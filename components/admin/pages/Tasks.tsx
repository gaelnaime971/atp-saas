'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface AdminTask {
  id: string
  title: string
  trader_id: string | null
  due_date: string | null
  done: boolean
  created_at: string
  trader_name?: string
}

export default function Tasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [traders, setTraders] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ title: '', trader_id: '', due_date: '' })
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const [{ data: taskData }, { data: traderData }] = await Promise.all([
      supabase
        .from('admin_tasks')
        .select('*, profiles(full_name)')
        .order('done', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'trader'),
    ])

    if (taskData) {
      setTasks(taskData.map((t: any) => ({
        ...t,
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
      done: false,
    })
    setForm({ title: '', trader_id: '', due_date: '' })
    setShowForm(false)
    setSubmitting(false)
    fetchData()
  }

  async function toggleDone(task: AdminTask) {
    await supabase.from('admin_tasks').update({ done: !task.done }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t))
  }

  async function deleteTask(id: string) {
    await supabase.from('admin_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function dueDateColor(dateStr: string | null): string {
    if (!dateStr) return 'text-[#5a6a82]'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dateStr)
    due.setHours(0, 0, 0, 0)
    if (due < today) return 'text-red-400'
    if (due.getTime() === today.getTime()) return 'text-amber-400'
    return 'text-green-400'
  }

  function dueDateLabel(dateStr: string | null): string {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('fr-FR')
  }

  const pending = tasks.filter(t => !t.done)
  const completed = tasks.filter(t => t.done)

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
          <p className="text-[#5a6a82] text-sm mt-1">Gérez vos tâches administratives</p>
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
            <div className="col-span-2 flex gap-3 justify-end">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" loading={submitting}>Ajouter</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Pending tasks */}
      <div>
        <h2 className="text-sm font-semibold text-[#e8edf5] mb-3 flex items-center gap-2">
          À faire
          <span className="text-xs font-normal text-[#5a6a82]">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <Card>
            <p className="text-[#5a6a82] text-sm text-center py-6">Aucune tâche en cours</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map(task => (
              <Card key={task.id} className="group flex items-center gap-3 py-3">
                <button
                  onClick={() => toggleDone(task)}
                  className="w-5 h-5 rounded border border-[rgba(255,255,255,0.15)] flex items-center justify-center hover:border-green-500/50 transition-colors flex-shrink-0"
                >
                  {/* empty checkbox */}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#e8edf5]">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {task.trader_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {task.trader_name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={`text-xs ${dueDateColor(task.due_date)}`}>
                        {dueDateLabel(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-[#5a6a82] hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed tasks */}
      <div>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-2 text-sm font-semibold text-[#5a6a82] hover:text-[#a0aec0] transition-colors mb-3"
        >
          <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Terminées
          <span className="text-xs font-normal">({completed.length})</span>
        </button>

        {showCompleted && (
          <div className="space-y-2">
            {completed.length === 0 ? (
              <Card>
                <p className="text-[#5a6a82] text-sm text-center py-6">Aucune tâche terminée</p>
              </Card>
            ) : (
              completed.map(task => (
                <Card key={task.id} className="group flex items-center gap-3 py-3 opacity-60">
                  <button
                    onClick={() => toggleDone(task)}
                    className="w-5 h-5 rounded border border-green-500/30 bg-green-500/10 flex items-center justify-center flex-shrink-0"
                  >
                    <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#a0aec0] line-through">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {task.trader_name && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {task.trader_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-[#5a6a82] hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
