'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Revenue } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface RevenueWithTrader extends Revenue {
  trader_name?: string
}

export default function Revenus() {
  const [revenues, setRevenues] = useState<RevenueWithTrader[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ trader_id: '', amount: '', description: '', payment_date: new Date().toISOString().split('T')[0] })
  const [traders, setTraders] = useState<{ id: string; full_name: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  async function fetchData() {
    const [{ data: revenueData }, { data: traderData }] = await Promise.all([
      supabase.from('revenues').select('*, profiles(full_name)').order('payment_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'trader'),
    ])

    if (revenueData) {
      setRevenues(revenueData.map((r: any) => ({
        ...r,
        trader_name: r.profiles?.full_name ?? 'Trader',
      })))
    }
    if (traderData) setTraders(traderData.map((t: any) => ({ id: t.id, full_name: t.full_name ?? 'Unnamed' })))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const total = revenues.reduce((sum, r) => sum + r.amount, 0)
  const thisMonth = revenues.filter(r => {
    const date = new Date(r.payment_date)
    const now = new Date()
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  }).reduce((sum, r) => sum + r.amount, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await supabase.from('revenues').insert({
      trader_id: form.trader_id || null,
      amount: parseFloat(form.amount),
      description: form.description,
      payment_date: form.payment_date,
    })
    setShowForm(false)
    setForm({ trader_id: '', amount: '', description: '', payment_date: new Date().toISOString().split('T')[0] })
    setSubmitting(false)
    fetchData()
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
          <h1 className="text-xl font-semibold text-[#e8edf5]">Revenus</h1>
          <p className="text-[#5a6a82] text-sm mt-1">Suivi des paiements de coaching</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau Paiement
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border border-green-500/20">
          <p className="text-xs text-[#5a6a82] mb-1">CA Total</p>
          <p className="text-2xl font-bold font-mono text-green-400">{total.toLocaleString('fr-FR')} €</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">CA ce Mois</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{thisMonth.toLocaleString('fr-FR')} €</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">Transactions</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{revenues.length}</p>
        </Card>
      </div>

      {/* Add Payment Form */}
      {showForm && (
        <Card className="border border-green-500/20">
          <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">Enregistrer un paiement</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Trader</label>
              <select
                value={form.trader_id}
                onChange={e => setForm(f => ({ ...f, trader_id: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="">Sélectionner un trader</option>
                {traders.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Montant (€)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                placeholder="ex: 497"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                placeholder="ex: Coaching 1:1 - Mars 2025"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Date de paiement</label>
              <input
                type="date"
                required
                value={form.payment_date}
                onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" loading={submitting}>Enregistrer</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Revenue Table */}
      <Card>
        {revenues.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5a6a82] text-sm">Aucun paiement enregistré</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Description</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Date</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {revenues.map(r => (
                  <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3 text-sm font-medium text-[#e8edf5]">{r.trader_name}</td>
                    <td className="py-3 text-sm text-[#a0aec0]">{r.description ?? '—'}</td>
                    <td className="py-3 text-sm text-[#a0aec0]">
                      {new Date(r.payment_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-sm font-mono font-semibold text-green-400 text-right">
                      +{r.amount.toLocaleString('fr-FR')} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
