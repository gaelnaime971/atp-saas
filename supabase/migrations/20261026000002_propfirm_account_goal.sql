-- ═══════════════════════════════════════════════════════════════
-- TRADING PERSO — Objectif par compte funded.
--
-- Un seul objectif "actif" par compte (si on veut l'historique
-- complet, les anciens apparaîtront dans propfirm_account_events
-- comme kind='note' au fil des mises à jour).
--
-- Champs :
--   goal_amount_eur : montant du profit à atteindre, en €
--   goal_basis      : 'since_last_payout' (défaut) | 'since_start'
--   goal_deadline   : date limite optionnelle
--   goal_notes      : texte libre
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE propfirm_accounts
  ADD COLUMN IF NOT EXISTS goal_amount_eur numeric,
  ADD COLUMN IF NOT EXISTS goal_basis text,
  ADD COLUMN IF NOT EXISTS goal_deadline date,
  ADD COLUMN IF NOT EXISTS goal_notes text;

-- CHECK sur la base (nullable) : si goal_basis est posé, il doit être
-- une des 2 valeurs connues. Un DROP CONSTRAINT IF EXISTS + ADD
-- CONSTRAINT garantit l'idempotence (on peut rejouer la migration).
ALTER TABLE propfirm_accounts
  DROP CONSTRAINT IF EXISTS propfirm_accounts_goal_basis_check;

ALTER TABLE propfirm_accounts
  ADD CONSTRAINT propfirm_accounts_goal_basis_check
  CHECK (goal_basis IS NULL OR goal_basis IN ('since_last_payout','since_start'));
