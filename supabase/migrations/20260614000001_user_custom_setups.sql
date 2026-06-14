-- Trader-defined custom setup types for backtest
CREATE TABLE IF NOT EXISTS user_custom_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  setup_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trader_id, setup_name)
);

ALTER TABLE user_custom_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own custom setups"
  ON user_custom_setups FOR ALL
  USING (auth.uid() = trader_id)
  WITH CHECK (auth.uid() = trader_id);

CREATE INDEX IF NOT EXISTS idx_user_custom_setups_trader ON user_custom_setups(trader_id);
