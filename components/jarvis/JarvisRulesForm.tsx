'use client'

import { useEffect, useState } from 'react'

interface Rules {
  account_size_usd: number
  risk_per_trade_usd: number
  max_trades: number
  stop_after_losses: number
  target_r: number
  stop_after_first_win: boolean
  stop_after_loss_win: boolean
  same_config_hard_stop_after: number
  min_ratio: number
}

const DEFAULTS: Rules = {
  account_size_usd: 0,
  risk_per_trade_usd: 0,
  max_trades: 3,
  stop_after_losses: 3,
  target_r: 2,
  stop_after_first_win: true,
  stop_after_loss_win: true,
  same_config_hard_stop_after: 2,
  min_ratio: 2,
}

const LIMITS = {
  max_trades:                  { max: 3, label: 'tu peux baisser jusqu\'à 1, mais pas monter au-dessus de 3' },
  stop_after_losses:           { max: 3, label: 'tu peux baisser jusqu\'à 1, mais pas monter au-dessus de 3' },
  target_r:                    { min: 0.5, max: 2, label: 'tu peux descendre jusqu\'à 0,5 R pour couper plus tôt, mais pas monter au-dessus de 2' },
  same_config_hard_stop_after: { max: 2, label: 'tu peux baisser jusqu\'à 1, mais pas monter au-dessus de 2' },
  min_ratio:                   { min: 2, label: 'tu peux monter au-dessus de 2 pour être plus strict, mais pas descendre en-dessous' },
}

export default function JarvisRulesForm({ email }: { email: string }) {
  const [rules, setRules] = useState<Rules>(DEFAULTS)
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jarvis/rules').then(r => r.json()).then(d => {
      if (d?.rules) {
        const merged: Rules = { ...DEFAULTS, ...d.rules }
        // Normalise numéros (Supabase renvoie des strings pour numeric)
        merged.account_size_usd = Number(merged.account_size_usd)
        merged.risk_per_trade_usd = Number(merged.risk_per_trade_usd)
        merged.target_r = Number(merged.target_r)
        merged.min_ratio = Number(merged.min_ratio)
        setRules(merged)
        setExists(Boolean(d.exists))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => {
    setRules(r => ({ ...r, [key]: value }))
    setError(null); setFieldError(null)
  }

  const save = async () => {
    setSaving(true); setError(null); setFieldError(null)
    try {
      const r = await fetch('/api/jarvis/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      const d = await r.json()
      if (!r.ok) {
        const msg: string = d.error || 'Erreur serveur'
        setError(msg)
        // Détecte le champ concerné par heuristique sur le message FR
        const field = (/max_trades|stop_after_losses|target_r|min_ratio|same_config_hard_stop_after|risk_per_trade_usd|stop_after_first_win|stop_after_loss_win/.exec(msg) || [])[0]
        if (field) setFieldError(field)
        setSaving(false)
        return
      }
      if (d.rules) setRules({ ...DEFAULTS, ...d.rules })
      setExists(true)
      setSavedAt(Date.now())
    } catch { setError('Connexion impossible') } finally { setSaving(false) }
  }

  const pctOfAccount = rules.account_size_usd > 0
    ? (rules.risk_per_trade_usd / rules.account_size_usd) * 100
    : null
  const riskCapUsd = rules.account_size_usd > 0 ? rules.account_size_usd * 0.004 : null
  const riskOverCap = riskCapUsd != null && rules.risk_per_trade_usd > riskCapUsd

  return (
    <div className="jr-root">
      <header className="jr-header">
        <a href="/jarvis" className="jr-back">← Jarvis</a>
        <h1 className="jr-title">Mes règles</h1>
        <div className="jr-sub">
          Compte : <code>{email}</code>
          {exists ? ' · (règles personnalisées)' : ' · (défauts ATP)'}
        </div>
        <p className="jr-note">
          Tu peux <strong>durcir</strong> la méthode ATP (être plus strict avec toi-même),
          mais <strong>pas l'assouplir</strong>. Les deux interrupteurs
          « stop après 1er gagnant » et « stop après perdant+gagnant »
          sont verrouillés sur Oui.
        </p>
      </header>

      {loading ? <div className="jr-loading">Chargement…</div> : (
      <form onSubmit={e => { e.preventDefault(); save() }} className="jr-form">

        <section className="jr-section">
          <h2>Risque</h2>

          <div className="jr-field">
            <label htmlFor="account">Taille du compte ($)</label>
            <input id="account" type="number" min={0} step={100}
              value={rules.account_size_usd || ''}
              onChange={e => set('account_size_usd', Number(e.target.value) || 0)} />
            <div className="jr-hint">
              Sert à calculer le % de risque et la limite 0,4 %.
            </div>
          </div>

          <div className={`jr-field ${fieldError === 'risk_per_trade_usd' ? 'is-error' : ''}`}>
            <label htmlFor="risk">Risque par trade ($)</label>
            <input id="risk" type="number" min={0} step={10}
              value={rules.risk_per_trade_usd || ''}
              onChange={e => set('risk_per_trade_usd', Number(e.target.value) || 0)} />
            <div className="jr-hint">
              {rules.account_size_usd > 0 ? (
                <>
                  {pctOfAccount != null && (
                    <>
                      {pctOfAccount.toFixed(2)} % du compte ·
                      {' '}limite 0,4 % = {riskCapUsd!.toFixed(0)} $
                      {riskOverCap && <span className="jr-over"> · dépasse la limite</span>}
                    </>
                  )}
                </>
              ) : 'Renseigne la taille du compte pour voir le % et la limite.'}
            </div>
          </div>
        </section>

        <section className="jr-section">
          <h2>Session</h2>

          <div className={`jr-field ${fieldError === 'max_trades' ? 'is-error' : ''}`}>
            <label htmlFor="maxt">Max trades / session</label>
            <input id="maxt" type="number" min={1} max={3} step={1}
              value={rules.max_trades}
              onChange={e => set('max_trades', Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
            <div className="jr-hint">défaut ATP : 3 · {LIMITS.max_trades.label}</div>
          </div>

          <div className={`jr-field ${fieldError === 'stop_after_losses' ? 'is-error' : ''}`}>
            <label htmlFor="sal">Stop après N pertes d'affilée</label>
            <input id="sal" type="number" min={1} max={3} step={1}
              value={rules.stop_after_losses}
              onChange={e => set('stop_after_losses', Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
            <div className="jr-hint">défaut ATP : 3 · {LIMITS.stop_after_losses.label}</div>
          </div>

          <div className="jr-field is-locked">
            <label>Stop après le 1er trade gagnant</label>
            <div className="jr-locked">Oui — verrouillé par la méthode ATP</div>
          </div>

          <div className="jr-field is-locked">
            <label>Stop après « perdant puis gagnant »</label>
            <div className="jr-locked">Oui — verrouillé par la méthode ATP</div>
          </div>
        </section>

        <section className="jr-section">
          <h2>Discipline</h2>

          <div className={`jr-field ${fieldError === 'target_r' ? 'is-error' : ''}`}>
            <label htmlFor="tr">Objectif en R (coupe à ce niveau)</label>
            <input id="tr" type="number" min={0.5} max={2} step={0.1}
              value={rules.target_r}
              onChange={e => set('target_r', Math.max(0.5, Math.min(2, Number(e.target.value) || 2)))} />
            <div className="jr-hint">défaut ATP : 2 · {LIMITS.target_r.label}</div>
          </div>

          <div className={`jr-field ${fieldError === 'same_config_hard_stop_after' ? 'is-error' : ''}`}>
            <label htmlFor="sc">Frein à main après N échecs sur la même config</label>
            <input id="sc" type="number" min={1} max={2} step={1}
              value={rules.same_config_hard_stop_after}
              onChange={e => set('same_config_hard_stop_after', Math.max(1, Math.min(3, Number(e.target.value) || 2)))} />
            <div className="jr-hint">défaut ATP : 2 · {LIMITS.same_config_hard_stop_after.label}</div>
          </div>

          <div className={`jr-field ${fieldError === 'min_ratio' ? 'is-error' : ''}`}>
            <label htmlFor="mr">Ratio minimum</label>
            <input id="mr" type="number" min={2} step={0.1}
              value={rules.min_ratio}
              onChange={e => set('min_ratio', Math.max(2, Number(e.target.value) || 2))} />
            <div className="jr-hint">défaut ATP : 2 · {LIMITS.min_ratio.label}</div>
          </div>
        </section>

        {error && <div className="jr-error">{error}</div>}

        <div className="jr-actions">
          <button type="submit" disabled={saving} className="jr-save">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {savedAt && <span className="jr-saved">Enregistré ✓</span>}
        </div>
      </form>
      )}

      <style jsx>{`
        .jr-root {
          min-height: 100vh;
          background: #060807; color: #E9EEEA;
          font-family: var(--font-manrope), system-ui, sans-serif;
          padding: 24px 16px 60px;
        }
        .jr-header {
          max-width: 560px; margin: 0 auto 16px;
        }
        .jr-back {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 12px; color: #9FB0A6;
          text-decoration: none;
        }
        .jr-title {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 22px; font-weight: 600;
          color: #E9EEEA; letter-spacing: 0.04em;
          margin: 8px 0 4px;
        }
        .jr-sub { font-size: 12px; color: #9FB0A6; }
        .jr-sub code { background: rgba(159, 176, 166, 0.08); padding: 1px 6px; border-radius: 4px; }
        .jr-note {
          font-size: 13px; color: #9FB0A6; line-height: 1.5;
          margin: 14px 0 0;
          padding: 10px 12px;
          background: rgba(221, 185, 119, 0.06);
          border-left: 3px solid #DDB977;
          border-radius: 4px;
        }
        .jr-loading { text-align: center; padding: 40px; color: #9FB0A6; }
        .jr-form { max-width: 560px; margin: 0 auto; }
        .jr-section {
          background: rgba(159, 176, 166, 0.04);
          border: 1px solid rgba(159, 176, 166, 0.12);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 14px;
        }
        .jr-section h2 {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 13px; font-weight: 500;
          color: #DDB977; letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 12px;
        }
        .jr-field { margin-bottom: 14px; }
        .jr-field:last-child { margin-bottom: 0; }
        .jr-field label {
          display: block; font-size: 13px; color: #E9EEEA;
          margin-bottom: 4px;
        }
        .jr-field input {
          width: 100%; padding: 9px 11px;
          background: rgba(159, 176, 166, 0.06);
          border: 1px solid rgba(159, 176, 166, 0.22);
          border-radius: 6px;
          color: #E9EEEA; font-family: inherit; font-size: 14px;
        }
        .jr-field input:focus {
          outline: none;
          border-color: #45D486;
          box-shadow: 0 0 0 3px rgba(69, 212, 134, 0.14);
        }
        .jr-field.is-error input {
          border-color: #DD5555;
          box-shadow: 0 0 0 3px rgba(221, 85, 85, 0.14);
        }
        .jr-hint {
          font-size: 11px; color: #6B7A72;
          margin-top: 4px; line-height: 1.4;
        }
        .jr-over { color: #DD5555; margin-left: 4px; }
        .jr-field.is-locked { background: rgba(69, 212, 134, 0.05); padding: 8px 10px; border-radius: 6px; }
        .jr-locked {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          font-size: 12px; color: #45D486;
          padding: 4px 0;
        }
        .jr-error {
          padding: 10px 12px;
          background: rgba(221, 85, 85, 0.08);
          border: 1px solid rgba(221, 85, 85, 0.35);
          border-radius: 8px;
          color: #DD5555; font-size: 13px;
          margin-bottom: 14px;
        }
        .jr-actions { display: flex; align-items: center; gap: 14px; }
        .jr-save {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          padding: 11px 24px; font-size: 13px; font-weight: 600;
          background: linear-gradient(180deg, #4CDC8E, #37B06C);
          color: #0B100E; border: none; border-radius: 999px;
          cursor: pointer; letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .jr-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .jr-saved {
          font-family: var(--font-oxanium), system-ui, sans-serif;
          color: #45D486; font-size: 12px; letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  )
}
