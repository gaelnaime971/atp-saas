-- ═══════════════════════════════════════════════════════════════
-- TRADING PERSO — propfirm accounts management (admin-only)
-- ═══════════════════════════════════════════════════════════════

-- 1. Propfirm accounts
CREATE TABLE IF NOT EXISTS propfirm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL, -- e.g., "FTMO 100k #1"
  propfirm text NOT NULL, -- FTMO, MFF, Apex, TopStep, FTUK, etc.
  account_size numeric NOT NULL, -- e.g., 100000
  starting_balance numeric NOT NULL,
  current_balance numeric NOT NULL,
  phase text NOT NULL DEFAULT 'p1' CHECK (phase IN ('p1', 'p2', 'funded', 'failed')),
  profit_target_pct numeric, -- e.g., 8 for phase 1
  profit_target_amount numeric, -- absolute target if provided
  max_daily_loss_pct numeric, -- e.g., 5
  max_total_dd_pct numeric, -- e.g., 10
  trailing_dd boolean DEFAULT false, -- funded accounts with trailing DD
  min_trading_days integer, -- e.g., 4 for challenge
  consistency_rule_pct numeric, -- e.g., 30 = single day cannot exceed 30% of total profit
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passed', 'failed', 'paused')),
  cost_eur numeric, -- challenge fee
  payout_split_pct numeric, -- for funded, % you keep
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE propfirm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_accounts"
  ON propfirm_accounts FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_propfirm_accounts_owner ON propfirm_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_propfirm_accounts_status ON propfirm_accounts(status);

-- 2. Daily P&L entries per account
CREATE TABLE IF NOT EXISTS propfirm_daily_pnl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES propfirm_accounts(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  pnl numeric NOT NULL DEFAULT 0,
  trades_count integer,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, date)
);

ALTER TABLE propfirm_daily_pnl ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_daily_pnl"
  ON propfirm_daily_pnl FOR ALL
  USING (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_daily_pnl.account_id
      AND a.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_daily_pnl.account_id
      AND a.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_propfirm_daily_pnl_account_date ON propfirm_daily_pnl(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_propfirm_daily_pnl_date ON propfirm_daily_pnl(date DESC);

-- 3. Weekly targets (per owner, week starting Monday)
CREATE TABLE IF NOT EXISTS propfirm_weekly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  week_start_date date NOT NULL, -- Monday
  target_eur numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, week_start_date)
);

ALTER TABLE propfirm_weekly_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_weekly_targets"
  ON propfirm_weekly_targets FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_propfirm_weekly_targets_owner_week ON propfirm_weekly_targets(owner_id, week_start_date DESC);

-- 4. Optional daily overrides on a weekly target
CREATE TABLE IF NOT EXISTS propfirm_daily_target_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_target_id uuid REFERENCES propfirm_weekly_targets(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  target_eur numeric NOT NULL, -- 0 means "don't trade this day"
  created_at timestamptz DEFAULT now(),
  UNIQUE(weekly_target_id, date)
);

ALTER TABLE propfirm_daily_target_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_daily_target_overrides"
  ON propfirm_daily_target_overrides FOR ALL
  USING (EXISTS (
    SELECT 1 FROM propfirm_weekly_targets t
    WHERE t.id = propfirm_daily_target_overrides.weekly_target_id
      AND t.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM propfirm_weekly_targets t
    WHERE t.id = propfirm_daily_target_overrides.weekly_target_id
      AND t.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_propfirm_daily_overrides_weekly ON propfirm_daily_target_overrides(weekly_target_id);
