// ═══════════════════════════════════════════════════════════════
// Interrupteur de l'espace Marchés (ATP Terminal).
//
// Variable serveur TERMINAL_ACCESS :
//   - « all »                      → tous les membres voient Marchés ;
//   - absente / toute autre valeur → seuls les admins le voient.
// Comparaison STRICTE (même logique que WHOP_GATE_ENABLED) : "ALL",
// "true", "1" ne l'ouvrent pas. Rien de configuré = espace masqué.
//
// Appliqué côté serveur à 2 endroits : proxy.ts (chaque requête) et le
// layout app/dashboard/marches. Voir docs/design/terminal/DECISIONS.md.
// ═══════════════════════════════════════════════════════════════

/** Qui regarde l'espace Marchés : masqué, membre, ou admin. */
export type TerminalViewer = 'hidden' | 'member' | 'admin'

export function terminalOpenToMembers(access: string | undefined): boolean {
  return access === 'all'
}

export function terminalViewer(opts: { isAdmin: boolean; access: string | undefined }): TerminalViewer {
  if (opts.isAdmin) return 'admin'
  return terminalOpenToMembers(opts.access) ? 'member' : 'hidden'
}

export function canSeeTerminal(opts: { isAdmin: boolean; access: string | undefined }): boolean {
  return terminalViewer(opts) !== 'hidden'
}
