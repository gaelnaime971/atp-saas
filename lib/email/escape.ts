/**
 * Échappe & < > " ' pour un texte inséré dans du HTML d'e-mail (contenu
 * ou attribut, ex. href). À appliquer à toute variable venue d'un
 * formulaire ou d'une saisie, même admin.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
