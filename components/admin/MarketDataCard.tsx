'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { browserTimeZone, formatDateKey, formatDayShort, formatTime, safeTimeZone } from '@/lib/time'
import type { MarketDataStatus } from '@/lib/market/admin-status'

/**
 * Admin › Paramètres › Config : carte « Données Terminal ».
 * Pour chaque source : dernière mise à jour, statut, lignes écrites,
 * donnée la plus récente ; bouton « Mettre à jour maintenant » (même
 * ingestion que le cron quotidien). Route admin uniquement.
 */

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: 'OK', tone: 'profit' },
  partial: { label: 'Partiel', tone: 'warn' },
  error: { label: 'Échec', tone: 'loss' },
  running: { label: 'En cours', tone: 'info' },
}

export default function MarketDataCard() {
  const [sources, setSources] = useState<MarketDataStatus[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)
  const [tz] = useState(() => safeTimeZone(browserTimeZone()))

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/market-data', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setSources((await res.json()).sources)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    // Chargement initial depuis la route admin (système externe).
    load()
  }, [load])

  async function refresh() {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/market-data', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      setSources((await res.json()).sources)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setRunning(false)
    }
  }

  const when = (iso: string | null | undefined) =>
    iso ? `${formatDayShort(Date.parse(iso), tz)} à ${formatTime(Date.parse(iso), tz)}` : '—'

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-1)', margin: 0 }}>Données Terminal</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: '4px 0 0 0' }}>
            Mise à jour automatique chaque soir après la clôture US. Le bouton lance la même mise à jour tout de suite.
          </p>
        </div>
        <Button onClick={refresh} loading={running} disabled={running}>Mettre à jour maintenant</Button>
      </div>

      {failed && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--color-loss)', margin: '0 0 8px 0' }}>
          Statut indisponible. Les tables sont-elles créées ?
        </p>
      )}

      {sources === null && !failed ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-3)', margin: 0 }}>Chargement…</p>
      ) : sources && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--color-text-3)', textAlign: 'left', fontFamily: 'var(--font-data)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <th style={{ fontWeight: 500, padding: '6px 0' }}>Source</th>
                <th style={{ fontWeight: 500 }}>Dernière mise à jour</th>
                <th style={{ fontWeight: 500 }}>Statut</th>
                <th style={{ fontWeight: 500, textAlign: 'right' }}>Lignes</th>
                <th style={{ fontWeight: 500, paddingLeft: 12 }}>Donnée la plus récente</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => {
                const st = s.last ? STATUS[s.last.status] ?? STATUS.error : null
                return (
                  <tr key={s.source} style={{ borderTop: '1px solid var(--color-border-subtle)', color: 'var(--color-text-1)' }}>
                    <td style={{ padding: '8px 0' }}>{s.label}</td>
                    <td style={{ fontFamily: 'var(--font-data)' }}>
                      {when(s.last?.finished_at ?? s.last?.started_at)}
                      {s.last && s.lastOk && s.lastOk.started_at !== s.last.started_at && (
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-3)' }}>dernier succès : {when(s.lastOk.finished_at)}</span>
                      )}
                    </td>
                    <td>
                      {st ? <Badge tone={st.tone} size="sm">{st.label}</Badge> : <span style={{ color: 'var(--color-text-3)' }}>jamais</span>}
                      {s.last?.error && (
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--color-text-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.last.error}>
                          {s.last.error}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-data)' }}>{s.last ? s.last.rows_upserted.toLocaleString('fr-FR') : '—'}</td>
                    <td style={{ paddingLeft: 12, fontFamily: 'var(--font-data)' }}>{s.latestData ? formatDateKey(s.latestData, { year: true }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
