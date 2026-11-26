// ═══════════════════════════════════════════════════════════════
// Connexion admin (/admin/login). Logique testée dans admin-login.test.ts.
//
// 1. Connexion Supabase (email + mot de passe), comme avant.
// 2. Rôle vérifié APRÈS la connexion, sur l'utilisateur connecté.
// 3. Pas admin (ou rôle illisible) → déconnexion immédiate.
// Tous les échecs renvoient le MÊME message : on ne révèle ni si
// l'e-mail existe, ni s'il appartient à un admin.
// ═══════════════════════════════════════════════════════════════

export const ADMIN_LOGIN_ERROR = 'Identifiants invalides'

/** Les 3 opérations nécessaires, branchées sur le client Supabase par la page. */
export interface AdminLoginPorts {
  /** Connexion Supabase ; renvoie l'id de l'utilisateur ou null si refusée. */
  signIn(email: string, password: string): Promise<string | null>
  /** Rôle lu dans profiles pour l'utilisateur connecté (null si illisible). */
  readRole(userId: string): Promise<string | null>
  signOut(): Promise<unknown>
}

export async function adminLogin(
  ports: AdminLoginPorts,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await ports.signIn(email, password)
  if (!userId) return { ok: false, error: ADMIN_LOGIN_ERROR }

  const role = await ports.readRole(userId)
  if (role !== 'admin') {
    await ports.signOut()
    return { ok: false, error: ADMIN_LOGIN_ERROR }
  }
  return { ok: true }
}
