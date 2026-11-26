// ═══════════════════════════════════════════════════════════════
// Journal des e-mails (table email_broadcasts). Testé dans journal.test.ts.
//
// L'écriture se fait APRÈS l'envoi et ne doit jamais le compromettre :
// cette fonction ne lève jamais d'exception. Si l'écriture échoue
// (contrainte, réseau…), l'erreur part dans les logs serveur au lieu
// d'être ignorée. Le log ne contient ni destinataire ni contenu : route,
// mode, et code + message d'erreur Postgres/PostgREST seulement.
// ═══════════════════════════════════════════════════════════════

export interface JournalInsertResult {
  error: { code?: string; message?: string } | null
}

/** true si la ligne de journal est écrite, false sinon (erreur loggée). */
export async function recordEmailSend(
  route: string,
  mode: string,
  insert: () => PromiseLike<JournalInsertResult>,
): Promise<boolean> {
  try {
    const { error } = await insert()
    if (!error) return true
    console.error(
      `[email-journal] ${route} : écriture du journal refusée (mode ${mode})`,
      { code: error.code ?? null, message: error.message ?? null },
    )
  } catch (err) {
    console.error(
      `[email-journal] ${route} : écriture du journal en échec (mode ${mode})`,
      { message: err instanceof Error ? err.message : String(err) },
    )
  }
  return false
}
