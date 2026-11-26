import type { BadgeTone } from '@/components/ui/Badge'
import type { AccessKind } from '@/lib/access/member-access'

/** Couleur du badge « Accès » (admin › Traders). */
export function accessTone(kind: AccessKind): BadgeTone {
  switch (kind) {
    case 'admin': return 'accent'
    case 'whop': return 'profit'
    case 'manual': return 'info'
    case 'manual-expired': return 'warn'
    case 'none': return 'loss'
  }
}
