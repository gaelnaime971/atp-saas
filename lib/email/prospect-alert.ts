// ═══════════════════════════════════════════════════════════════
// E-mail d'alerte « Nouveau prospect » envoyé à l'admin par
// /api/prospects (route PUBLIQUE, formulaires des landings).
//
// Tous les champs viennent d'un formulaire public : ils sont échappés
// avant d'entrer dans le HTML (sinon un visiteur pourrait injecter liens,
// images ou faux contenu dans l'e-mail reçu par l'admin), et le sujet est
// ramené à une seule ligne. Logique pure, testée dans prospect-alert.test.ts.
// ═══════════════════════════════════════════════════════════════

/** Échappe & < > " ' pour un texte inséré dans du HTML (contenu ou attribut). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Texte brut sur une ligne (sujet d'e-mail) : pas de retour à la ligne. */
function oneLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

const EXP_LABELS: Record<string, string> = {
  debutant: 'Débutant (< 6 mois)',
  intermediaire: '6 mois à 2 ans',
  confirme: '+ de 2 ans',
}
const OBJ_LABELS: Record<string, string> = {
  methode: 'Méthode structurée',
  propfirm: 'Prop firm',
  consistance: 'Consistance',
  vivre: 'Vivre du trading',
}

export interface ProspectAlertFields {
  prenom: unknown
  nom: unknown
  email: unknown
  whatsapp: unknown
  experience: unknown
  objectif: unknown
  source?: unknown
}

export function buildProspectAlertEmail(f: ProspectAlertFields, receivedAt: Date = new Date()): { subject: string; html: string } {
  const exp = EXP_LABELS[String(f.experience)] ?? f.experience
  const obj = OBJ_LABELS[String(f.objectif)] ?? f.objectif
  // wa.me n'accepte que des chiffres : tout le reste est retiré.
  const waDigits = String(f.whatsapp ?? '').replace(/\D/g, '')
  const e = escapeHtml

  return {
    subject: `🔔 Nouveau prospect : ${oneLine(f.prenom)} ${oneLine(f.nom)}`,
    html: `
              <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#111;color:#fff;border-radius:12px;">
                <h2 style="color:var(--color-profit);margin:0 0 16px;">Nouveau prospect ATP</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#888;width:120px;">Nom</td><td style="padding:8px 0;font-weight:bold;">${e(f.prenom)} ${e(f.nom)}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;">${e(f.email)}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">WhatsApp</td><td style="padding:8px 0;font-weight:bold;color:#25d366;">${e(f.whatsapp)}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Expérience</td><td style="padding:8px 0;">${e(exp)}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Objectif</td><td style="padding:8px 0;">${e(obj)}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;">Source</td><td style="padding:8px 0;">${e(f.source || 'methode-atp')}</td></tr>
                </table>
                <div style="margin-top:20px;">
                  <a href="https://wa.me/${waDigits}" style="display:inline-block;padding:10px 20px;background:#25d366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:8px;">Contacter sur WhatsApp →</a>
                </div>
                <p style="margin-top:16px;font-size:12px;color:#555;">Reçu le ${e(receivedAt.toLocaleString('fr-FR', { timeZone: 'America/Guadeloupe' }))}</p>
              </div>
            `,
  }
}
