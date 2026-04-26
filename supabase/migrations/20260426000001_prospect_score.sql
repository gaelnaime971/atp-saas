-- Prospect scoring
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score integer DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score_updated_at timestamptz DEFAULT now();
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reactivity text DEFAULT 'none' CHECK (reactivity IN ('none','24h','72h','question','link_click'));
