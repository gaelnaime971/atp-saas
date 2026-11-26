-- ═══════════════════════════════════════════════════════════════
-- email_broadcasts : autoriser les modes des routes send-* dans le journal.
--
-- La contrainte d'origine (20260505000001) n'accepte que 'source',
-- 'manual' et 'test'. Les routes send-closing-email, send-welcome-email et
-- send-payment-reminder-email écrivent 'closing', 'welcome' et
-- 'payment_reminder' hors mode test : ces lignes étaient refusées par la
-- base (et l'erreur ignorée), donc leurs envois réels n'étaient jamais
-- journalisés. On élargit la contrainte, rien d'autre ne change.
--
-- Run this in the Supabase SQL Editor.
-- Idempotent : peut être rejoué sans effet de bord.
-- Appliqué en prod le 26/11/2026 (script combiné Sécurité 3 + 4, avec
-- 20261126000002 et 20261126000003).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Toute contrainte CHECK portant sur recipient_mode est retirée, quel que
-- soit son nom (nom vérifié dynamiquement), puis la nouvelle est posée.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.email_broadcasts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%recipient_mode%'
  LOOP
    RAISE NOTICE 'Contrainte remplacée : %', c.conname;
    EXECUTE format('ALTER TABLE public.email_broadcasts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.email_broadcasts
  ADD CONSTRAINT email_broadcasts_recipient_mode_check
  CHECK (recipient_mode IN ('source', 'manual', 'test', 'closing', 'welcome', 'payment_reminder'));

COMMIT;
