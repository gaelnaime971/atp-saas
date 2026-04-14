-- Whop integration + admin observations on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whop_link text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whop_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_observations text;

-- Also add to invitations so the data flows through when a trader signs up
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS whop_link text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS whop_email text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS admin_observations text;
