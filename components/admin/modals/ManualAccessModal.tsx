'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  accessLabel, manualAccessPatch, memberAccess, parisToday,
  type AccessProfile, type ManualAccessPatch,
} from '@/lib/access/member-access'
import { accessTone } from '@/components/admin/access-tone'

/**
 * admin › Traders › Accès : accorder ou retirer un accès manuel au
 * dashboard, avec une date de fin facultative (vide = sans fin, date
 * incluse). Écrit profiles.manual_access / manual_access_until avec la
 * session admin (le déclencheur protect_profile_privileged_columns
 * refuse ces colonnes à tout autre compte).
 */

export interface ManualAccessTrader extends AccessProfile {
  id: string
  full_name: string | null
}

interface Props {
  trader: ManualAccessTrader
  onClose: () => void
  onSaved: (id: string, patch: ManualAccessPatch) => void
}

export default function ManualAccessModal({ trader, onClose, onSaved }: Props) {
  const supabase = createClient()
  const today = parisToday()
  const status = memberAccess(trader, today)
  const hasManual = trader.manual_access === true
  const [until, setUntil] = useState(trader.manual_access_until?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(action: 'grant' | 'revoke') {
    setError(null)
    const result = manualAccessPatch(action, until, today)
    if (!result.ok) { setError(result.error); return }
    setSaving(true)
    const { data, error: dbError } = await supabase
      .from('profiles')
      .update(result.patch)
      .eq('id', trader.id)
      .select('id')
    setSaving(false)
    if (dbError || !data || data.length !== 1) {
      setError('Enregistrement impossible. Réessaie, ou vérifie que la migration de l’accès manuel est appliquée.')
      return
    }
    onSaved(trader.id, result.patch)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="sm"
      title="Accès au dashboard"
      description={trader.full_name ?? undefined}
      footer={
        <>
          {hasManual && (
            <Button variant="danger" size="sm" onClick={() => save('revoke')} disabled={saving}>
              Retirer l’accès manuel
            </Button>
          )}
          <Button size="sm" onClick={() => save('grant')} loading={saving}>
            {hasManual ? 'Mettre à jour' : 'Accorder l’accès manuel'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-2)' }}>
          Accès actuel :
          <Badge tone={accessTone(status.kind)} size="sm" bordered>{accessLabel(status)}</Badge>
        </div>

        {trader.whop_subscription_active === true && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-3, var(--text3))' }}>
            Abonnement Whop actif : un accès manuel ne sert que si l’abonnement s’arrête.
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-2)' }}>
            Date de fin (facultative, incluse)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={until}
              min={today}
              onChange={e => setUntil(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs font-mono outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {until && (
              <button
                type="button"
                onClick={() => setUntil('')}
                className="text-xs underline"
                style={{ color: 'var(--color-text-2)' }}
              >
                Sans fin
              </button>
            )}
          </div>
          <span className="block text-xs" style={{ color: 'var(--color-neutral)' }}>
            Vide = accès sans fin.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-xs" style={{ color: 'var(--color-loss)' }}>{error}</p>
        )}
      </div>
    </Modal>
  )
}
