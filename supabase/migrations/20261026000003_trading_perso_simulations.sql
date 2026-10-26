-- ═══════════════════════════════════════════════════════════════
-- TRADING PERSO — Simulations "capital + objectif → perf à faire".
--
-- Simple sandbox pour planifier : combien par jour / semaine pour
-- aller de X à Y en N jours de trading, avec paramétrage des jours
-- rouges / verts. N'affecte PAS les comptes financés.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trading_perso_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  -- Paramètres saisis
  starting_capital numeric NOT NULL,
  target_capital numeric NOT NULL,
  horizon_days int NOT NULL CHECK (horizon_days > 0),
  trading_days_per_week int NOT NULL DEFAULT 5
    CHECK (trading_days_per_week BETWEEN 1 AND 7),
  expected_loss_days_per_week int NOT NULL DEFAULT 1
    CHECK (expected_loss_days_per_week >= 0),
  avg_loss_per_red_day numeric NOT NULL DEFAULT 0,   -- en € POSITIF (= montant perdu)
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trading_perso_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on trading_perso_simulations"
  ON trading_perso_simulations FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_trading_perso_simulations_owner
  ON trading_perso_simulations (owner_id, created_at DESC);
