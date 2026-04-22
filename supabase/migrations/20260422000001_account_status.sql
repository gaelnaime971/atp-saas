-- Account status for prop firm tracking
ALTER TABLE trader_accounts ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active' CHECK (account_status IN ('active','challenge_en_cours','funded','crame','ferme'));
