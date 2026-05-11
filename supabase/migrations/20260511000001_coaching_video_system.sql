-- Coaching booking + video call system
-- Extend coaching_sessions with Daily.co video + Google sync metadata
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS daily_room_url text;
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS daily_room_name text;
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS meeting_status text DEFAULT 'scheduled' CHECK (meeting_status IN ('scheduled','in_progress','completed','cancelled','no_show'));
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60;
ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS recording_url text;

-- Admin's recurring weekly availability
CREATE TABLE IF NOT EXISTS coaching_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_duration_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  timezone text DEFAULT 'America/Guadeloupe',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coaching_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active availability"
  ON coaching_availability FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin manages availability"
  ON coaching_availability FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Admin date overrides (block specific dates / add ad-hoc slots)
CREATE TABLE IF NOT EXISTS coaching_date_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('blocked', 'extra_slot')),
  start_time time,
  end_time time,
  slot_duration_minutes integer DEFAULT 60,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coaching_date_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view overrides"
  ON coaching_date_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin manages overrides"
  ON coaching_date_overrides FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Admin Google Calendar OAuth tokens
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  admin_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  calendar_id text DEFAULT 'primary',
  connected_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages own google tokens"
  ON google_calendar_tokens FOR ALL
  USING (auth.uid() = admin_id)
  WITH CHECK (auth.uid() = admin_id);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_scheduled ON coaching_sessions(scheduled_at) WHERE meeting_status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_trader_date ON coaching_sessions(trader_id, scheduled_at DESC);
