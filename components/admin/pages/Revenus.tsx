'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Revenue } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

type PaymentMethod = 'virement' | 'stripe_comptant' | 'stripe_2x' | 'stripe_3x' | 'stripe_4x'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  virement: 'Virement',
  stripe_comptant: 'Stripe',
  stripe_2x: 'Stripe 2\u00d7',
  stripe_3x: 'Stripe 3\u00d7',
  stripe_4x: 'Stripe 4\u00d7',
}

const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  virement: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  stripe_comptant: 'bg-green-500/15 text-green-400 border-green-500/30',
  stripe_2x: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  stripe_3x: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  stripe_4x: 'bg-red-500/15 text-red-400 border-red-500/30',
}

interface RevenueWithTrader extends Revenue {
  trader_name?: string
}

export default function Revenus() {
  const [revenues, setRevenues] = useState<RevenueWithTrader[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    trader_id: '',
    amount: '',
    description: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'virement' as PaymentMethod,
    is_ttc: true,
  })
  const [traders, setTraders] = useState<{ id: string; full_name: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null)
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
  const totalHT = revenues.reduce((sum, r) => {
    if (r.amount_ht != null) return sum + r.amount_ht
    return sum + (r.is_ttc ? r.amount / 1.2 : r.amount)
  }, 0)

  const parsedAmount = parseFloat(form.amount) || 0
  const computedHT = form.is_ttc ? parsedAmount / 1.2 : parsedAmount
  const computedTTC = form.is_ttc ? parsedAmount : parsedAmount * 1.2
  const computedTVA = form.is_ttc ? parsedAmount - parsedAmount / 1.2 : parsedAmount * 0.2

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const amount = parseFloat(form.amount)
    const amountHT = form.is_ttc ? amount / 1.2 : amount
    const tvaAmount = form.is_ttc ? amount - amount / 1.2 : amount * 0.2

    await supabase.from('revenues').insert({
      trader_id: form.trader_id || null,
      amount,
      description: form.description,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      is_ttc: form.is_ttc,
      amount_ht: Math.round(amountHT * 100) / 100,
      tva_amount: Math.round(tvaAmount * 100) / 100,
    })
    setShowForm(false)
    setForm({
      trader_id: '',
      amount: '',
      description: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'virement',
      is_ttc: true,
    })
    setSubmitting(false)
    fetchData()
  }

  async function handleGenerateInvoice(revenueId: string) {
    setGeneratingInvoice(revenueId)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revenue_id: revenueId }),
      })
      if (res.ok) {
        await fetchData()
      }
    } finally {
      setGeneratingInvoice(null)
    }
  }

  async function handleDownloadInvoice(invoiceUrl: string) {
    const { data } = await supabase.storage.from('invoices').createSignedUrl(invoiceUrl, 3600)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
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
      <div className="grid grid-cols-4 gap-4">
        <Card className="border border-green-500/20">
          <p className="text-xs text-[#5a6a82] mb-1">CA Total</p>
          <p className="text-2xl font-bold font-mono text-green-400">{total.toLocaleString('fr-FR')} &euro;</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">CA ce Mois</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{thisMonth.toLocaleString('fr-FR')} &euro;</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">Transactions</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{revenues.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-[#5a6a82] mb-1">CA HT</p>
          <p className="text-2xl font-bold font-mono text-[#e8edf5]">{Math.round(totalHT).toLocaleString('fr-FR')} &euro;</p>
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
                <option value="">S&eacute;lectionner un trader</option>
                {traders.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Mode de paiement</label>
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="virement">Virement bancaire</option>
                <option value="stripe_comptant">Stripe comptant</option>
                <option value="stripe_2x">Stripe 2&times;</option>
                <option value="stripe_3x">Stripe 3&times;</option>
                <option value="stripe_4x">Stripe 4&times;</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#5a6a82] mb-1.5">Montant (&euro;)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="flex-1 bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                  placeholder="ex: 497"
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_ttc: !f.is_ttc }))}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    form.is_ttc
                      ? 'bg-green-500/15 text-green-400 border-green-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {form.is_ttc ? 'TTC' : 'HT'}
                </button>
              </div>
              {parsedAmount > 0 && (
                <p className="text-xs text-[#5a6a82] mt-1.5">
                  {form.is_ttc
                    ? `HT: ${computedHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac \u00b7 TVA: ${computedTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac`
                    : `TTC: ${computedTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac \u00b7 TVA: ${computedTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac`
                  }
                </p>
              )}
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
            <div className="col-span-2">
              <label className="block text-xs text-[#5a6a82] mb-1.5">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-[#1c2333] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[#5a6a82]"
                placeholder="ex: Coaching 1:1 - Mars 2025"
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
            <p className="text-[#5a6a82] text-sm">Aucun paiement enregistr&eacute;</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Trader</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Description</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Mode</th>
                  <th className="text-left text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Date</th>
                  <th className="text-center text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">HT/TTC</th>
                  <th className="text-right text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Montant</th>
                  <th className="text-center text-xs font-medium text-[#5a6a82] uppercase tracking-wider pb-3">Facture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {revenues.map(r => {
                  const method = (r.payment_method ?? 'virement') as PaymentMethod
                  return (
                    <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-3 text-sm font-medium text-[#e8edf5]">{r.trader_name}</td>
                      <td className="py-3 text-sm text-[#a0aec0]">{r.description ?? '\u2014'}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PAYMENT_METHOD_COLORS[method] ?? 'bg-[#222940] text-[#a0aec0] border-[rgba(255,255,255,0.07)]'}`}>
                          {PAYMENT_METHOD_LABELS[method] ?? method}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-[#a0aec0]">
                        {new Date(r.payment_date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          r.is_ttc
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {r.is_ttc ? 'TTC' : 'HT'}
                        </span>
                      </td>
                      <td className="py-3 text-sm font-mono font-semibold text-green-400 text-right">
                        +{r.amount.toLocaleString('fr-FR')} &euro;
                      </td>
                      <td className="py-3 text-center">
                        {r.invoice_number && r.invoice_url ? (
                          <button
                            onClick={() => handleDownloadInvoice(r.invoice_url!)}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                          >
                            {r.invoice_number}
                          </button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={generatingInvoice === r.id}
                            onClick={() => handleGenerateInvoice(r.id)}
                          >
                            G&eacute;n&eacute;rer
                          </Button>
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
