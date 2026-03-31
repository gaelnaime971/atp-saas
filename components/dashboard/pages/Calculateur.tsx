'use client'

import { useState, useMemo } from 'react'
import Card from '@/components/ui/Card'

interface ContractSpec {
  tickValue: number
  tickSize: number
  margin: number
  type: 'Micro' | 'Mini'
}

const CONTRACTS: Record<string, ContractSpec> = {
  MYM: { tickValue: 0.5, tickSize: 1, margin: 50, type: 'Micro' },
  YM: { tickValue: 5, tickSize: 1, margin: 500, type: 'Mini' },
  MES: { tickValue: 5, tickSize: 0.25, margin: 50, type: 'Micro' },
  ES: { tickValue: 50, tickSize: 0.25, margin: 500, type: 'Mini' },
  MNQ: { tickValue: 2, tickSize: 0.25, margin: 100, type: 'Micro' },
  NQ: { tickValue: 20, tickSize: 0.25, margin: 1000, type: 'Mini' },
}

const CONTRACT_NAMES: Record<string, string> = {
  MYM: 'Micro Dow',
  YM: 'Mini Dow',
  MES: 'Micro S&P',
  ES: 'Mini S&P',
  MNQ: 'Micro NQ',
  NQ: 'Mini NQ',
}

export default function Calculateur() {
  const [selectedContract, setSelectedContract] = useState('MYM')
  const [accountSize, setAccountSize] = useState(50000)
  const [riskPct, setRiskPct] = useState(1)
  const [slPoints, setSlPoints] = useState(20)
  const [fxRate, setFxRate] = useState(0.92)

  const spec = CONTRACTS[selectedContract]

  const results = useMemo(() => {
    const maxRiskEur = (accountSize * riskPct) / 100
    const slValue1 = slPoints * spec.tickValue // USD
    const nbContracts = slValue1 > 0 ? Math.floor(maxRiskEur / (slValue1 * fxRate)) : 0
    const realRisk = nbContracts * slValue1 * fxRate
    const totalMargin = nbContracts * spec.margin

    const tp = [1, 2, 3].map(n => nbContracts * slPoints * n * spec.tickValue * fxRate)

    return { maxRiskEur, slValue1, nbContracts, realRisk, totalMargin, tp }
  }, [accountSize, riskPct, slPoints, fxRate, spec])

  const formatEur = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

  const formatUsd = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Left: Paramètres ── */}
      <Card>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text)' }}>
          Paramètres
        </h2>

        {/* Contract selection grid 2x3 */}
        <div className="mb-5">
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
            Contrat
          </label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(CONTRACTS).map(([key, s]) => {
              const active = selectedContract === key
              return (
                <button
                  key={key}
                  onClick={() => setSelectedContract(key)}
                  className="rounded-xl px-3 py-3 text-left transition-all"
                  style={{
                    background: active ? 'rgba(74,222,128,0.06)' : 'var(--bg3, #18181b)',
                    border: active ? '2px solid var(--green)' : '2px solid var(--border)',
                  }}
                >
                  <p
                    className="text-sm font-bold"
                    style={{ color: active ? 'var(--green)' : 'var(--text)' }}
                  >
                    {key}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>
                    {CONTRACT_NAMES[key]}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                    {s.tickValue}$/pt
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Inputs grid 2x2 */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <NumericInput
            label="Taille du compte (€)"
            value={accountSize}
            onChange={setAccountSize}
          />
          <NumericInput
            label="Risque max/trade (%)"
            value={riskPct}
            onChange={setRiskPct}
            step={0.1}
          />
          <NumericInput
            label="SL en points"
            value={slPoints}
            onChange={setSlPoints}
          />
          <NumericInput
            label="Taux USD/EUR"
            value={fxRate}
            onChange={setFxRate}
            step={0.01}
          />
        </div>

        {/* Specs box */}
        <div
          className="rounded-lg p-4"
          style={{ background: 'var(--bg3, #18181b)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
            Spécifications — {selectedContract}
          </p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6">
            <SpecRow label="Valeur du point" value={`${spec.tickValue} $`} />
            <SpecRow label="Tick size" value={String(spec.tickSize)} />
            <SpecRow label="Marge/contrat" value={formatUsd(spec.margin)} />
            <SpecRow label="Type" value={spec.type} />
          </div>
        </div>
      </Card>

      {/* ── Right: Résultats ── */}
      <Card>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text)' }}>
          Résultats
        </h2>

        {/* Big number */}
        <div
          className="rounded-xl p-6 text-center mb-5"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>
            Nombre de contrats recommandé
          </p>
          <p className="text-5xl font-black" style={{ color: 'var(--green)' }}>
            {results.nbContracts}
          </p>
        </div>

        {/* Stats */}
        <div className="space-y-3 mb-5">
          <StatRow label="Risque max autorisé" value={formatEur(results.maxRiskEur)} />
          <StatRow label="Valeur du SL (1 contrat)" value={formatUsd(results.slValue1)} />
          <StatRow
            label={`Valeur du SL (${results.nbContracts} contrats)`}
            value={formatUsd(results.slValue1 * results.nbContracts)}
          />
          <StatRow label="Risque réel utilisé" value={formatEur(results.realRisk)} />
          <StatRow label="Marge totale requise" value={formatUsd(results.totalMargin)} />
        </div>

        {/* Simulation TP */}
        <div className="mb-5">
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>
            Simulation Take Profit
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((n, i) => (
              <div
                key={n}
                className="rounded-lg p-3 text-center"
                style={{
                  background: 'rgba(74,222,128,0.06)',
                  border: '1px solid rgba(74,222,128,0.12)',
                }}
              >
                <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>
                  {n}R
                </p>
                <p className="text-sm font-bold" style={{ color: 'var(--green)' }}>
                  {formatEur(results.tp[i])}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ATP reference */}
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: 'var(--bg3, #18181b)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text3)' }}>
            Calculs basés sur les paramètres de la méthode ATP.
          </p>
        </div>
      </Card>
    </div>
  )
}

/* ── Helpers ── */

function NumericInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          background: 'var(--bg3, #18181b)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
        }}
      />
    </div>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: 'var(--text3)' }}>
        {label}
      </span>
      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded-lg"
      style={{ background: 'var(--bg3, #18181b)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text3)' }}>
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}
