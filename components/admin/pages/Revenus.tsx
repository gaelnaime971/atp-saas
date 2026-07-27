'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Revenue } from '@/lib/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import DataTable, { type Column } from '@/components/ui/DataTable'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { fmtEur, fmtNumber } from '@/lib/format'

type PaymentMethod = 'virement' | 'stripe_comptant' | 'stripe_2x' | 'stripe_3x' | 'stripe_4x' | 'crypto'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  virement: 'Virement',
  stripe_comptant: 'Stripe',
  stripe_2x: 'Stripe 2\u00d7',
  stripe_3x: 'Stripe 3\u00d7',
  stripe_4x: 'Stripe 4\u00d7',
  crypto: 'Crypto',
}

const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  virement: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  stripe_comptant: 'bg-green-500/15 text-green-400 border-green-500/30',
  stripe_2x: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  stripe_3x: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  stripe_4x: 'bg-red-500/15 text-red-400 border-red-500/30',
  crypto: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
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
  const [editingId, setEditingId] = useState<string | null>(null)
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

    const payload = {
      trader_id: form.trader_id || null,
      amount,
      description: form.description,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      is_ttc: form.is_ttc,
      amount_ht: Math.round(amountHT * 100) / 100,
      tva_amount: Math.round(tvaAmount * 100) / 100,
    }

    if (editingId) {
      await supabase.from('revenues').update(payload).eq('id', editingId)
    } else {
      await supabase.from('revenues').insert(payload)
    }

    resetForm()
    setSubmitting(false)
    fetchData()
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({
      trader_id: '',
      amount: '',
      description: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'virement',
      is_ttc: true,
    })
  }

  function handleEdit(r: RevenueWithTrader) {
    setEditingId(r.id)
    setForm({
      trader_id: r.trader_id ?? '',
      amount: String(r.amount),
      description: r.description ?? '',
      payment_date: r.payment_date.split('T')[0],
      payment_method: (r.payment_method ?? 'virement') as PaymentMethod,
      is_ttc: r.is_ttc ?? true,
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce paiement ? Cette action est irréversible.')) return
    await supabase.from('revenues').delete().eq('id', id)
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
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        size="sm"
        title="Revenus"
        subtitle="Suivi des paiements de coaching"
        actions={
          <Button onClick={() => setShowForm(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau Paiement
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="CA Total"     value={fmtEur(total)} />
        <KpiCard label="CA ce Mois"   value={fmtEur(thisMonth)} />
        <KpiCard label="Transactions" value={fmtNumber(revenues.length)} />
        <KpiCard label="CA HT"        value={fmtEur(Math.round(totalHT))} />
      </div>

      {/* Add Payment Form */}
      {showForm && (
        <Card className="border border-green-500/20">
          <h3 className="text-sm font-semibold text-[#e8edf5] mb-4">{editingId ? 'Modifier le paiement' : 'Enregistrer un paiement'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-neutral)] mb-1.5">Trader</label>
              <select
                value={form.trader_id}
                onChange={e => setForm(f => ({ ...f, trader_id: e.target.value }))}
                className="w-full bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="">S&eacute;lectionner un trader</option>
                {traders.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-neutral)] mb-1.5">Mode de paiement</label>
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))}
                className="w-full bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              >
                <option value="virement">Virement bancaire</option>
                <option value="stripe_comptant">Stripe comptant</option>
                <option value="stripe_2x">Stripe 2&times;</option>
                <option value="stripe_3x">Stripe 3&times;</option>
                <option value="stripe_4x">Stripe 4&times;</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-neutral)] mb-1.5">Montant (&euro;)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="flex-1 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[var(--color-neutral)]"
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
                <p className="text-xs text-[var(--color-neutral)] mt-1.5">
                  {form.is_ttc
                    ? `HT: ${computedHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac \u00b7 TVA: ${computedTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac`
                    : `TTC: ${computedTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac \u00b7 TVA: ${computedTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20ac`
                  }
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-[var(--color-neutral)] mb-1.5">Date de paiement</label>
              <input
                type="date"
                required
                value={form.payment_date}
                onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[var(--color-neutral)] mb-1.5">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-sm text-[#e8edf5] focus:outline-none focus:border-green-500/50 placeholder-[var(--color-neutral)]"
                placeholder="ex: Coaching 1:1 - Mars 2025"
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <Button variant="secondary" type="button" onClick={resetForm}>Annuler</Button>
              <Button type="submit" loading={submitting}>{editingId ? 'Modifier' : 'Enregistrer'}</Button>
            </div>
          </form>
        </Card>
      )}

      {(() => {
        type R = typeof revenues[number]
        const cols: Column<R>[] = [
          { id: 'trader', header: 'Trader', sortable: true, sortValue: r => r.trader_name ?? '',
            accessor: r => <span style={{ color: 'var(--color-text-1)', fontWeight: 500 }}>{r.trader_name}</span> },
          { id: 'description', header: 'Description',
            accessor: r => r.description ?? '\u2014' },
          { id: 'mode', header: 'Mode',
            accessor: r => {
              const method = (r.payment_method ?? 'virement') as PaymentMethod
              return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PAYMENT_METHOD_COLORS[method] ?? 'bg-[var(--color-surface-3)] text-[#a0aec0] border-[rgba(255,255,255,0.07)]'}`}>
                  {PAYMENT_METHOD_LABELS[method] ?? method}
                </span>
              )
            } },
          { id: 'date', header: 'Date', sortable: true, sortValue: r => r.payment_date,
            accessor: r => (
              <span style={{ fontFamily: 'var(--font-data)', color: 'var(--color-text-2)' }}>
                {new Date(r.payment_date).toLocaleDateString('fr-FR')}
              </span>
            ) },
          { id: 'htttc', header: 'HT/TTC', align: 'center',
            accessor: r => <Badge tone={r.is_ttc ? 'profit' : 'warn'} size="md">{r.is_ttc ? 'TTC' : 'HT'}</Badge> },
          { id: 'amount', header: 'Montant', numeric: true, sortable: true, sortValue: r => r.amount,
            accessor: r => (
              <span style={{ color: 'var(--color-profit)', fontWeight: 600 }}>
                {fmtEur(r.amount, 0, { sign: true })}
              </span>
            ) },
          { id: 'invoice', header: 'Facture', align: 'center',
            accessor: r => (
              r.invoice_number && r.invoice_url ? (
                <button
                  onClick={e => { e.stopPropagation(); handleDownloadInvoice(r.invoice_url!) }}
                  className="text-xs font-medium underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--color-info, #60a5fa)' }}
                >
                  {r.invoice_number}
                </button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={generatingInvoice === r.id}
                  onClick={e => { e.stopPropagation(); handleGenerateInvoice(r.id) }}
                >
                  G\u00e9n\u00e9rer
                </Button>
              )
            ) },
          { id: 'actions', header: '', align: 'center',
            accessor: r => (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleEdit(r) }}
                  title="Modifier"
                  className="p-1.5 rounded-md border border-[rgba(255,255,255,0.07)] bg-[var(--color-surface-2)] text-[#a0aec0] hover:text-green-400 hover:border-green-500/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                  title="Supprimer"
                  className="p-1.5 rounded-md border border-[rgba(255,255,255,0.07)] bg-[var(--color-surface-2)] text-[#a0aec0] hover:text-red-400 hover:border-red-500/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                  </svg>
                </button>
              </div>
            ) },
        ]
        return (
          <DataTable
            columns={cols}
            rows={revenues}
            rowKey={r => r.id}
            defaultSort={{ columnId: 'date', dir: 'desc' }}
            empty={<EmptyState title="Aucun paiement enregistr\u00e9" description={<>Clique &laquo; Nouveau Paiement &raquo; pour enregistrer ta premi\u00e8re transaction.</>} />}
          />
        )
      })()}
    </div>
  )
}
