'use client'

/**
 * 3G — Cartes "moment" affichées sous l'orbe (hors mode compact).
 * Chaque carte est purement présentationnelle : les décisions
 * (quelle carte afficher) sont prises en amont par `pickMoment`
 * et transmises via la prop `kind`.
 */

import { useState } from 'react'
import type { MomentKind } from '@/lib/jarvis/moments'
import { stopTitleFor } from '@/lib/jarvis/moments'
import type { RuleKey } from '@/lib/jarvis/rules-engine'

interface MomentData {
  minutesToOpen: number | null
  routine: { filled: boolean; confidence: number | null }
  tradesCount: number
  rSum: number | null
  usdSum: number
  rules: {
    max_trades: number
    stop_after_losses: number
    target_r: number
  }
  announcedKeys: RuleKey[]
  triggeredMessage?: string | null
  consecutiveLosses?: number
}

interface Props {
  kind: MomentKind
  data: MomentData
  previewBadge?: boolean
  /** Déplie la carte "Ta session" quand on clique sur le résumé. */
  sessionExpanded?: boolean
  onToggleSession?: () => void
  trades?: Array<{ at: string; result_r: number | null; result_usd: number | null; instrument?: string; side?: 'long' | 'short' }>
}

function fmtR(x: number | null): string {
  if (x == null) return '0'
  const sign = x > 0 ? '+' : (x < 0 ? '-' : '')
  const abs = Math.abs(x)
  const body = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1).replace('.', ',')
  return x < 0 ? `-${body}` : `${sign}${body}`
}

export function MomentCard({ kind, data, previewBadge, sessionExpanded, onToggleSession, trades }: Props) {
  if (kind === 'none') return null

  if (kind === 'avant_open') {
    return (
      <div className="jv-moment jv-moment-preopen">
        {previewBadge && <PreviewBadge />}
        <div className="jv-moment-head">
          <span className="jv-moment-eyebrow">Préopen</span>
          <span className="jv-moment-counter">Open dans {data.minutesToOpen ?? '—'} min</span>
        </div>
        {data.routine.filled ? (
          <div className="jv-moment-body">
            <span className="jv-moment-check" aria-hidden="true">✓</span>
            Routine remplie
            {data.routine.confidence != null && <> · confiance {data.routine.confidence} sur 10</>}
          </div>
        ) : (
          <div className="jv-moment-body">
            <span className="jv-pulse-dot" aria-hidden="true" />
            Remplis ta routine
            {' · '}
            <a href="/jarvis/regles" className="jv-rules-link">Routine</a>
          </div>
        )}
        <style jsx>{STYLES}</style>
      </div>
    )
  }

  if (kind === 'stop') {
    const title = stopTitleFor(data.announcedKeys)
    const left = Math.max(0, data.rules.max_trades - data.tradesCount)
    return (
      <div className="jv-moment jv-moment-stop">
        {previewBadge && <PreviewBadge />}
        <div className="jv-moment-head jv-moment-head-left">
          <span className="jv-moment-lock" aria-hidden="true">🔒</span>
          <span className="jv-moment-title">{title}</span>
        </div>
        {data.triggeredMessage && (
          <div className="jv-moment-body jv-moment-rule">{data.triggeredMessage}</div>
        )}
        <div className="jv-moment-stats">
          <Stat label="Trades" value={`${data.tradesCount} / ${data.rules.max_trades}`} />
          <Stat label="Pertes d'affilée" value={String(data.consecutiveLosses ?? 0)} />
          <Stat label="Il te reste" value={`${left} trade${left > 1 ? 's' : ''}`} />
        </div>
        <style jsx>{STYLES}</style>
      </div>
    )
  }

  if (kind === 'mission') {
    const planRespecte = !data.announcedKeys.includes('trade_after_stop')
    return (
      <div className="jv-moment jv-moment-mission">
        {previewBadge && <PreviewBadge />}
        <div className="jv-moment-head">
          <span className="jv-moment-eyebrow">Mission accomplie</span>
        </div>
        {data.triggeredMessage && (
          <div className="jv-moment-body">{data.triggeredMessage}</div>
        )}
        <div className="jv-moment-stats">
          <Stat label="Résultat" value={`${fmtR(data.rSum)} R`} valueClass="jv-stat-positive" />
          <Stat label="Trades" value={String(data.tradesCount)} />
          <Stat label="Plan respecté" value={planRespecte ? 'Oui' : 'Non'} valueClass={planRespecte ? 'jv-stat-positive' : 'jv-stat-warn'} />
        </div>
        <style jsx>{STYLES}</style>
      </div>
    )
  }

  if (kind === 'session') {
    return (
      <div className="jv-moment jv-moment-session">
        {previewBadge && <PreviewBadge />}
        <button
          type="button" className="jv-session-summary"
          aria-expanded={sessionExpanded ? 'true' : 'false'}
          onClick={onToggleSession}
        >
          Session : {data.tradesCount} trade{data.tradesCount > 1 ? 's' : ''}
          {data.rSum != null && <>, {fmtR(data.rSum)} R</>}
          <span className="jv-chevron" aria-hidden="true">{sessionExpanded ? '▴' : '▾'}</span>
        </button>
        {sessionExpanded && trades && (
          <div className="jv-session-detail">
            {trades.map((t, i) => {
              const d = new Date(t.at)
              const hh = String(d.getHours()).padStart(2, '0')
              const mm = String(d.getMinutes()).padStart(2, '0')
              const r = t.result_r
              const rText = r != null ? `${fmtR(r)} R` : (t.result_usd != null ? `${t.result_usd > 0 ? '+' : ''}${t.result_usd} $` : '—')
              const posClass = (r != null ? r > 0 : (t.result_usd ?? 0) > 0) ? 'jv-stat-positive' : (r != null ? r < 0 : (t.result_usd ?? 0) < 0) ? 'jv-stat-warn' : ''
              return (
                <div className="jv-session-row" key={i}>
                  <span className="jv-session-time">{hh}:{mm}</span>
                  <span className="jv-session-mid">{t.instrument || '—'} {t.side || ''}</span>
                  <span className={`jv-session-r ${posClass}`}>{rText}</span>
                </div>
              )
            })}
            {data.rSum != null && (
              <div className="jv-session-row jv-session-total">
                <span className="jv-session-time">Total</span>
                <span />
                <span className="jv-session-r">{fmtR(data.rSum)} R</span>
              </div>
            )}
          </div>
        )}
        <style jsx>{STYLES}</style>
      </div>
    )
  }

  return null
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="jv-stat">
      <span className="jv-stat-label">{label}</span>
      <span className={`jv-stat-value ${valueClass || ''}`}>{value}</span>
    </div>
  )
}

function PreviewBadge() {
  return <span className="jv-preview-badge" aria-label="Aperçu">Aperçu</span>
}

const STYLES = `
  .jv-moment {
    width: 100%; max-width: 340px;
    border: 1px solid #2A3A31; border-radius: 10px;
    padding: 12px 14px; margin-top: 8px;
    background: rgba(26, 38, 32, 0.35);
    color: #E9EEEA; font-size: 13px; line-height: 1.5;
    font-family: var(--font-manrope), system-ui, sans-serif;
    position: relative;
  }
  .jv-moment-head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 8px; margin-bottom: 6px;
  }
  .jv-moment-head-left {
    justify-content: flex-start; align-items: center;
  }
  .jv-moment-lock { font-size: 16px; line-height: 1; color: #F2994A; }
  .jv-moment-rule {
    color: #E9EEEA; font-weight: 500;
    margin: 4px 0 2px; font-size: 13px;
  }
  .jv-moment-eyebrow {
    font-family: var(--font-oxanium), system-ui, sans-serif;
    font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
    color: #9FB0A6;
  }
  .jv-moment-title { font-weight: 700; color: #E9EEEA; font-size: 14px; }
  .jv-moment-counter {
    font-family: var(--font-oxanium), system-ui, sans-serif;
    font-size: 13px; color: #45D486; font-weight: 700;
  }
  .jv-moment-body { color: #B5C3BA; font-size: 13px; margin-bottom: 4px; }
  .jv-moment-check { color: #45D486; margin-right: 6px; font-weight: 700; }
  .jv-pulse-dot {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: #DDB977; margin-right: 7px; vertical-align: middle;
    animation: jvPulseGold 1.8s ease-in-out infinite;
  }
  @keyframes jvPulseGold {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(1.3); }
  }
  .jv-moment-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 8px; margin-top: 10px;
  }
  .jv-stat { display: flex; flex-direction: column; gap: 2px; }
  .jv-stat-label {
    font-family: var(--font-oxanium), system-ui, sans-serif;
    font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #6B7A72;
  }
  .jv-stat-value {
    font-family: var(--font-oxanium), system-ui, sans-serif;
    font-size: 14px; font-weight: 700; color: #E9EEEA;
  }
  .jv-stat-positive { color: #45D486; }
  .jv-stat-warn { color: #F2994A; }
  .jv-moment-stop {
    border-color: #F2994A;
    background: rgba(242, 153, 74, 0.08);
    animation: jvBorderPulseAmber 1.6s ease-in-out infinite;
  }
  @keyframes jvBorderPulseAmber {
    0%, 100% { border-color: #F2994A; }
    50%      { border-color: #4A3220; }
  }
  .jv-moment-mission {
    border-color: #DDB977;
    background: rgba(221, 185, 119, 0.08);
  }
  .jv-moment-preopen {
    border-color: #45D486;
    background: rgba(69, 212, 134, 0.06);
  }
  .jv-session-summary {
    width: 100%; display: flex; align-items: center;
    justify-content: space-between; gap: 8px;
    background: none; border: none; padding: 0;
    color: #DDB977; font-size: 13px; cursor: pointer;
    font-family: var(--font-manrope), system-ui, sans-serif;
  }
  .jv-chevron { color: #9FB0A6; }
  .jv-session-detail { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .jv-session-row {
    display: grid; grid-template-columns: 50px 1fr auto;
    gap: 8px; font-size: 12px; color: #B5C3BA;
    font-family: ui-monospace, monospace;
  }
  .jv-session-time { color: #9FB0A6; }
  .jv-session-r { font-weight: 700; color: #E9EEEA; }
  .jv-session-total { border-top: 1px solid #2A3A31; padding-top: 4px; margin-top: 4px; }
  .jv-rules-link { color: #DDB977; text-decoration: none; border-bottom: 1px dashed #DDB977; }
  .jv-preview-badge {
    position: absolute; top: -8px; right: 12px;
    background: #DDB977; color: #060807;
    font-family: var(--font-oxanium), system-ui, sans-serif;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    padding: 2px 8px; border-radius: 4px;
    text-transform: uppercase;
  }
  @media (prefers-reduced-motion: reduce) {
    .jv-pulse-dot, .jv-moment-stop { animation: none !important; }
  }
`

/** Helper hook pour que le parent gère l'expansion de la carte session. */
export function useSessionExpanded(initial = false) {
  const [expanded, setExpanded] = useState(initial)
  return { expanded, toggle: () => setExpanded(x => !x) }
}
