'use client'

/**
 * Trading perso — simulateur "capital + objectif → perf à faire".
 *
 * Pure sandbox : zéro effet sur les comptes financés. Les simulations
 * sont sauvegardées dans trading_perso_simulations (CRUD own-only),
 * nommables, re-chargeables, supprimables.
 *
 * Flux :
 *   1. L'utilisateur saisit capital + objectif + horizon + rouges/verts.
 *   2. Les KPI (par jour / semaine / jour vert) se recalculent en live.
 *   3. Table de projection semaine par semaine.
 *   4. Bouton "Enregistrer" nomme la simulation et l'ajoute à la liste.
 *   5. Liste repliable : chaque entrée a un bouton Charger + Supprimer.
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  simulate, validateSimInput, isSimValid, formatSimEur,
  FEASIBILITY_LABEL, FEASIBILITY_COLOR,
  type SimulateInput, type SimulateOutput,
} from '@/lib/propfirm/simulate'

// ─── Types DB ───────────────────────────────────────────────────────────────

interface SimRow {
  id: string
  owner_id: string
  name: string
  starting_capital: number
  target_capital: number
  horizon_days: number
  trading_days_per_week: number
  expected_loss_days_per_week: number
  avg_loss_per_red_day: number
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--bg2) 0%, rgba(59,130,246,0.03) 100%)',
  border: '1px solid var(--border)', borderRadius: 12, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 14,
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const input: React.CSSProperties = {
  width: '100%', height: 38, boxSizing: 'border-box',
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '0 12px', fontSize: 13, fontFamily: 'inherit',
}
const inputMono: React.CSSProperties = {
  ...input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const kpiBox: React.CSSProperties = {
  padding: '12px 14px', background: 'var(--bg3)', borderRadius: 10,
  display: 'flex', flexDirection: 'column', gap: 4,
}
const errText: React.CSSProperties = { color: '#ef4444', fontSize: 11, marginTop: 2 }

// ─── Composant principal ────────────────────────────────────────────────────

export default function SimulatorPanel() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [sims, setSims] = useState<SimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)

  // Draft (saisie en cours — pas encore nommée ni sauvée)
  const [startingCapital, setStartingCapital] = useState<number>(100_000)
  const [targetCapital, setTargetCapital] = useState<number>(110_000)
  const [horizonDays, setHorizonDays] = useState<number>(20)
  const [tradingDaysPerWeek, setTradingDaysPerWeek] = useState<number>(5)
  const [lossDaysPerWeek, setLossDaysPerWeek] = useState<number>(1)
  const [avgLossPerRedDay, setAvgLossPerRedDay] = useState<number>(150)
  const [simName, setSimName] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)

  // ─── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data, error } = await supabase
        .from('trading_perso_simulations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) {
        if (error.code === '42P01') { setTableMissing(true); setSims([]) }
      } else if (data) setSims(data as SimRow[])
      setLoading(false)
    })()
  }, [supabase])

  // ─── Draft + simulation ────────────────────────────────────────────────
  const draft: SimulateInput = {
    startingCapital, targetCapital, horizonDays,
    tradingDaysPerWeek, lossDaysPerWeek, avgLossPerRedDay,
  }
  const errors = validateSimInput(draft)
  const valid = isSimValid(errors)
  const out: SimulateOutput | null = valid ? simulate(draft) : null

  // ─── Save / Delete ─────────────────────────────────────────────────────
  async function save() {
    if (!userId) return
    if (!valid) { setToast('Corrige les erreurs d\'abord.'); setTimeout(() => setToast(null), 2500); return }
    const name = simName.trim() || `Simulation du ${new Date().toLocaleDateString('fr-FR')}`
    setSaving(true)
    const payload = {
      owner_id: userId,
      name,
      starting_capital: startingCapital,
      target_capital: targetCapital,
      horizon_days: horizonDays,
      trading_days_per_week: tradingDaysPerWeek,
      expected_loss_days_per_week: lossDaysPerWeek,
      avg_loss_per_red_day: avgLossPerRedDay,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    let err
    if (currentId) {
      ({ error: err } = await supabase.from('trading_perso_simulations')
        .update(payload).eq('id', currentId))
    } else {
      ({ error: err } = await supabase.from('trading_perso_simulations').insert(payload))
    }
    setSaving(false)
    if (err) {
      if (err.code === '42P01') { setTableMissing(true); setToast('Table absente — applique la migration.') }
      else setToast('Erreur : ' + err.message)
      setTimeout(() => setToast(null), 3000)
      return
    }
    setToast(currentId ? '✓ Simulation mise à jour.' : '✓ Simulation enregistrée.')
    setTimeout(() => setToast(null), 2500)
    await refetch()
  }

  async function refetch() {
    if (!userId) return
    const { data } = await supabase
      .from('trading_perso_simulations')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    if (data) setSims(data as SimRow[])
  }

  function loadSim(s: SimRow) {
    setStartingCapital(Number(s.starting_capital))
    setTargetCapital(Number(s.target_capital))
    setHorizonDays(Number(s.horizon_days))
    setTradingDaysPerWeek(Number(s.trading_days_per_week))
    setLossDaysPerWeek(Number(s.expected_loss_days_per_week))
    setAvgLossPerRedDay(Number(s.avg_loss_per_red_day))
    setSimName(s.name)
    setNotes(s.notes ?? '')
    setCurrentId(s.id)
    setToast(`Chargé : ${s.name}`)
    setTimeout(() => setToast(null), 2500)
  }

  function newSim() {
    setCurrentId(null)
    setSimName('')
    setNotes('')
    setToast('Nouvelle simulation.')
    setTimeout(() => setToast(null), 2000)
  }

  async function deleteSim(id: string) {
    if (!confirm('Supprimer cette simulation ?')) return
    const { error } = await supabase.from('trading_perso_simulations').delete().eq('id', id)
    if (error) { alert('Erreur : ' + error.message); return }
    if (currentId === id) newSim()
    await refetch()
  }

  return (
    <section style={sectionStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🧮</span>
          <div>
            <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Simulateur · capital → objectif
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Simule la perf à faire par jour / semaine selon tes scénarios. N'affecte PAS tes comptes.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {currentId && (
            <button type="button" onClick={newSim}
              style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Nouvelle simulation
            </button>
          )}
        </div>
      </div>

      {tableMissing && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12 }}>
          ❌ Table <code>trading_perso_simulations</code> introuvable. Applique la migration
          <code> 20261026000003_trading_perso_simulations.sql</code> pour sauvegarder tes simulations.
        </div>
      )}

      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Field label="Capital de départ (€)" error={errors.starting_capital}>
          <input type="number" step="any" value={startingCapital}
            onChange={(e) => setStartingCapital(Number(e.target.value))} style={inputMono} />
        </Field>
        <Field label="Objectif à atteindre (€)" error={errors.target_capital}>
          <input type="number" step="any" value={targetCapital}
            onChange={(e) => setTargetCapital(Number(e.target.value))} style={inputMono} />
        </Field>
        <Field label="Horizon (jours tradés)" error={errors.horizon_days}>
          <input type="number" step="1" min={1} value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))} style={inputMono} />
        </Field>
        <Field label="Jours tradés / semaine" error={errors.trading_days_per_week}>
          <input type="number" step="1" min={1} max={7} value={tradingDaysPerWeek}
            onChange={(e) => setTradingDaysPerWeek(Number(e.target.value))} style={inputMono} />
        </Field>
        <Field label="Jours rouges / semaine" error={errors.loss_days_per_week}>
          <input type="number" step="1" min={0} max={tradingDaysPerWeek} value={lossDaysPerWeek}
            onChange={(e) => setLossDaysPerWeek(Number(e.target.value))} style={inputMono} />
        </Field>
        <Field label="Perte moy. / jour rouge (€)" error={errors.avg_loss}>
          <input type="number" step="any" min={0} value={avgLossPerRedDay}
            onChange={(e) => setAvgLossPerRedDay(Number(e.target.value))} style={inputMono} />
        </Field>
      </div>

      {/* KPI results */}
      {out && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div style={kpiBox}>
            <span style={labelStyle}>Profit à faire</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e', fontFamily: 'ui-monospace' }}>
              {formatSimEur(out.totalProfitNeeded)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>sur {horizonDays} jours tradés</span>
          </div>
          <div style={kpiBox}>
            <span style={labelStyle}>Moyenne / jour tradé</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'ui-monospace' }}>
              {formatSimEur(out.requiredDailyAvg)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>tous jours confondus</span>
          </div>
          <div style={kpiBox}>
            <span style={labelStyle}>Par semaine</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'ui-monospace' }}>
              {formatSimEur(out.requiredWeeklyAvg)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>sur {out.totalWeeks} semaine{out.totalWeeks > 1 ? 's' : ''}</span>
          </div>
          <div style={{ ...kpiBox, background: 'rgba(var(--color-accent-rgb), 0.08)', border: '1px solid rgba(var(--color-accent-rgb), 0.3)' }}>
            <span style={labelStyle}>Par jour vert</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-accent)', fontFamily: 'ui-monospace' }}>
              {out.requiredPerGreenDay == null ? '—' : formatSimEur(out.requiredPerGreenDay)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>pour compenser les rouges</span>
          </div>
          <div style={{ ...kpiBox, background: `linear-gradient(135deg, ${FEASIBILITY_COLOR[out.feasible]}11 0%, transparent 100%)`, border: `1px solid ${FEASIBILITY_COLOR[out.feasible]}44` }}>
            <span style={labelStyle}>Faisabilité</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: FEASIBILITY_COLOR[out.feasible] }}>
              {FEASIBILITY_LABEL[out.feasible]}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>heuristique % du capital</span>
          </div>
        </div>
      )}

      {/* Projection table */}
      {out && (
        <details open style={{ background: 'var(--bg2)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
            Projection semaine par semaine
          </summary>
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ ...labelStyle, padding: '6px 10px' }}>Semaine</th>
                  <th style={{ ...labelStyle, padding: '6px 10px', textAlign: 'right' }}>Jours</th>
                  <th style={{ ...labelStyle, padding: '6px 10px', textAlign: 'right' }}>Rouges</th>
                  <th style={{ ...labelStyle, padding: '6px 10px', textAlign: 'right' }}>Verts</th>
                  <th style={{ ...labelStyle, padding: '6px 10px', textAlign: 'right' }}>Net semaine</th>
                  <th style={{ ...labelStyle, padding: '6px 10px', textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {out.weeklyProjection.map((w) => (
                  <tr key={w.week} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600 }}>S{w.week}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13 }}>{w.tradingDays}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13, color: '#ef4444' }}>{w.redDays}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13, color: '#22c55e' }}>{w.greenDays}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13, fontWeight: 700, color: w.weeklyNet >= 0 ? '#22c55e' : '#ef4444' }}>
                      {formatSimEur(w.weeklyNet)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'ui-monospace', fontSize: 13, fontWeight: 700 }}>
                      {Math.round(w.balance).toLocaleString('fr-FR')} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Save row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={simName} onChange={(e) => setSimName(e.target.value)}
          placeholder="Nom (ex: Scénario prudent, 110k en 1 mois)"
          style={{ ...input, maxWidth: 320 }} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (optionnel)"
          style={{ ...input, flex: 1, minWidth: 180 }} />
        <button type="button" onClick={save} disabled={saving || !valid}
          style={{
            height: 38, padding: '0 16px', borderRadius: 8, border: 'none',
            background: !valid ? 'var(--bg3)' : 'var(--color-accent)',
            color: !valid ? 'var(--text3)' : '#09090b',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            cursor: saving || !valid ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Enregistrement…' : currentId ? 'Mettre à jour' : 'Enregistrer'}
        </button>
        {toast && (
          <span style={{ fontSize: 12, color: toast.startsWith('✓') ? '#22c55e' : toast.startsWith('Chargé') ? '#3b82f6' : '#f59e0b' }}>
            {toast}
          </span>
        )}
      </div>

      {/* Saved sims list */}
      {!loading && sims.length > 0 && (
        <details style={{ background: 'var(--bg2)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
            Mes simulations ({sims.length})
          </summary>
          <ul style={{ listStyle: 'none', padding: '10px 0 0', margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sims.map((s) => (
              <li key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '8px 10px', borderRadius: 8,
                background: currentId === s.id ? 'rgba(var(--color-accent-rgb), 0.10)' : 'var(--bg3)',
                border: '1px solid ' + (currentId === s.id ? 'var(--color-accent)' : 'var(--border)'),
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'ui-monospace', marginTop: 2 }}>
                    {Math.round(Number(s.starting_capital)).toLocaleString('fr-FR')} → {Math.round(Number(s.target_capital)).toLocaleString('fr-FR')} € en {s.horizon_days}j
                    {' · '}{s.expected_loss_days_per_week} rouge{s.expected_loss_days_per_week > 1 ? 's' : ''} / {s.trading_days_per_week}
                  </div>
                </div>
                <button type="button" onClick={() => loadSim(s)}
                  style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Charger
                </button>
                <button type="button" onClick={() => deleteSim(s.id)}
                  aria-label="Supprimer"
                  style={{ height: 30, width: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

// ─── Field helper ──────────────────────────────────────────────────────────

function Field({ label: lbl, error, children }: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{lbl}</span>
      {children}
      {error && <div style={errText}>{error}</div>}
    </div>
  )
}
