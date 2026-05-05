-- Store per-email failure details
ALTER TABLE email_broadcasts ADD COLUMN IF NOT EXISTS failed_emails jsonb DEFAULT '[]'::jsonb;
