-- ═══════════════════════════════════════════════════════════════
-- invitations : limite d'essais sur le code (5 faux → 15 min de blocage).
--
-- Logique dans lib/invitations/attempts.ts, appliquée par
-- app/api/invitations/validate. failed_attempts ne fait que croître ;
-- chaque multiple de 5 pose locked_until = now() + 15 min.
-- Les invitations existantes démarrent à 0, sans blocage : elles restent
-- valables jusqu'à leur expiration.
--
-- À APPLIQUER AVANT de déployer le code qui lit ces colonnes.
-- Run this in the Supabase SQL Editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS locked_until timestamptz;
