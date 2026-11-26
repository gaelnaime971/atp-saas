-- ═══════════════════════════════════════════════════════════════
-- Factures : un trader ne lit que SES factures.
--
-- La règle « users can read invoices » (migration 20260325000001)
-- ouvrait le bucket invoices en lecture à tout compte connecté : liste
-- et téléchargement des factures de tous les traders. Remplacée par une
-- lecture limitée aux fichiers vers lesquels pointe une ligne revenues
-- du compte (revenues.invoice_url = nom de l'objet, à la racine du
-- bucket, cf. app/api/invoices/generate). « admin can manage invoices »
-- est inchangée.
--
-- Appliqué en prod dans le SQL Editor le 26/11/2026 (SQL identique).
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users can read invoices" ON storage.objects;
CREATE POLICY "traders read own invoices" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'invoices'
    AND EXISTS (SELECT 1 FROM public.revenues r
                 WHERE r.invoice_url = storage.objects.name
                   AND r.trader_id = auth.uid())
  );
