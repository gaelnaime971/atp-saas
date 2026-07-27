'use client'

import Card from '@/components/ui/Card'
import { fmtUsd, fmtPct, fmtNumber, toneForPnl, TONE_COLOR_VAR } from '@/lib/format'
import type { TraderAccount } from '@/lib/types'

/**
 * Prop Firm Summary — snapshot statique des comptes du trader.
 *
 * Complète l'ATP Score : à gauche "comment tu trades" (score qualitatif),
 * à droite "combien tu pèses" (capital, comptes, retour global). Pas de
 * chart, tout en typographie mono pour la densité chiffre.
 *
 * Filtre : reçoit uniquement les comptes affichés (déjà filtrés par la
 * sélection de comptes du header), et le totalPnl / totalCapital
 * correspondants. Pas de fetch propre.
 */

interface Props {
  accounts: TraderAccount[]
  totalCapital: number
  totalPnl: number
}

export default function PropFirmSummary({ accounts, totalCapital, totalPnl }: Props) {
  const fundedCount = accounts.filter(a => a.account_type === 'funded').length
  const roii = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : null

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Header />
      {accounts.length === 0 ? (
        <EmptyBody />
      ) : (
        <Body
          totalCapital={totalCapital}
          totalPnl={totalPnl}
          totalCount={accounts.length}
          fundedCount={fundedCount}
          roii={roii}
        />
      )}
    </Card>
  )
}

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 18 }}>💼</span>
      <div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-text-3)',
        }}>
          Prop Firm
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)',
          marginTop: 2,
        }}>
          Résumé comptes
        </div>
      </div>
    </div>
  )
}

function EmptyBody() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '16px 12px', gap: 6,
    }}>
      <div style={{ fontSize: 26, opacity: 0.4 }}>💼</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.4, maxWidth: '28ch' }}>
        Ajoute tes comptes prop firm pour voir ton capital sous gestion.
      </div>
    </div>
  )
}

function Body({
  totalCapital, totalPnl, totalCount, fundedCount, roii,
}: {
  totalCapital: number
  totalPnl: number
  totalCount: number
  fundedCount: number
  roii: number | null
}) {
  const pnlColor = TONE_COLOR_VAR[toneForPnl(totalPnl)]
  const roiiColor = roii == null ? 'var(--color-text-1)' : TONE_COLOR_VAR[toneForPnl(roii)]

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', gap: 12, minHeight: 0,
    }}>
      {/* Capital total en gros — la donnée pivot du bloc */}
      <div>
        <Label>Capital sous gestion</Label>
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: 26, fontWeight: 700, color: 'var(--color-text-1)',
          lineHeight: 1.1, letterSpacing: '-0.02em', marginTop: 2,
        }}>
          {fmtUsd(totalCapital, 0)}
        </div>
      </div>

      {/* Trois pastilles en ligne : Comptes / Net P&L / ROII */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <MiniStat
          label="Comptes"
          value={fmtNumber(totalCount)}
          sub={fundedCount > 0 ? `${fundedCount} financé${fundedCount > 1 ? 's' : ''}` : undefined}
        />
        <MiniStat
          label="Net P&L"
          value={fmtUsd(totalPnl, 0, { sign: true })}
          color={pnlColor}
        />
        <MiniStat
          label="ROII"
          value={roii == null ? '—' : fmtPct(roii, 1, { sign: true })}
          color={roiiColor}
        />
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-text-3)',
    }}>
      {children}
    </div>
  )
}

function MiniStat({
  label, value, sub, color = 'var(--color-text-1)',
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div style={{
      padding: '8px 10px',
      background: 'var(--color-surface-2)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--color-border-subtle)',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--color-text-3)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: 15, fontWeight: 700, color,
        marginTop: 2, letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10, color: 'var(--color-text-3)',
          marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}
