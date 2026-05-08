-- Sales pipeline fields on prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS call_date timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_call_date timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS temperature text DEFAULT 'tiede' CHECK (temperature IN ('chaud','tiede','froid'));
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS trading_level text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS needs text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS availability text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS agreed_price numeric;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS program_type text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS is_beginner boolean DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS in_pipeline boolean DEFAULT false;

-- Chronological call notes / observations per prospect
CREATE TABLE IF NOT EXISTS prospect_call_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  call_date timestamptz,
  note text NOT NULL,
  outcome text
);

ALTER TABLE prospect_call_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on prospect_call_notes"
  ON prospect_call_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX idx_prospect_call_notes_prospect_id ON prospect_call_notes(prospect_id);
CREATE INDEX idx_prospect_call_notes_call_date ON prospect_call_notes(call_date DESC);
