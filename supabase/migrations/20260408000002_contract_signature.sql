-- Contract signature fields on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_signed_name text;
