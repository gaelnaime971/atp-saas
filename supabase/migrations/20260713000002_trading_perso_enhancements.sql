-- ═══════════════════════════════════════════════════════════════
-- TRADING PERSO — enhancements: annual target + payouts tracking
-- ═══════════════════════════════════════════════════════════════

-- 1. Annual business-plan target
CREATE TABLE IF NOT EXISTS propfirm_annual_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year int NOT NULL,
  target_eur numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, year)
);

ALTER TABLE propfirm_annual_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_annual_targets"
  ON propfirm_annual_targets FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_propfirm_annual_targets_owner_year
  ON propfirm_annual_targets(owner_id, year DESC);

-- 2. Payouts received from funded accounts
CREATE TABLE IF NOT EXISTS propfirm_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES propfirm_accounts(id) ON DELETE CASCADE NOT NULL,
  payout_date date NOT NULL,
  amount_eur numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE propfirm_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_payouts"
  ON propfirm_payouts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_payouts.account_id
      AND a.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_payouts.account_id
      AND a.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_propfirm_payouts_account
  ON propfirm_payouts(account_id, payout_date DESC);
