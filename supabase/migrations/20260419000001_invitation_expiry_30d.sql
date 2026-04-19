-- Extend invitation expiry from 7 days to 30 days
ALTER TABLE invitations ALTER COLUMN expires_at SET DEFAULT now() + interval '30 days';
