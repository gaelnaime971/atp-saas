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
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE email_broadcasts
  DROP CONSTRAINT IF EXISTS email_broadcasts_recipient_mode_check;

ALTER TABLE email_broadcasts
  ADD CONSTRAINT email_broadcasts_recipient_mode_check
  CHECK (recipient_mode IN ('source', 'manual', 'test', 'closing', 'welcome', 'payment_reminder'));

COMMIT;
