-- E-learning platform: extend resources, add progress tracking
ALTER TABLE resources ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS order_idx integer DEFAULT 0;

-- Track video viewing progress per trader
CREATE TABLE IF NOT EXISTS course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  resource_id uuid REFERENCES resources(id) ON DELETE CASCADE NOT NULL,
  watched_seconds integer DEFAULT 0,
  last_position_seconds integer DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(trader_id, resource_id)
);

ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
  ON course_progress FOR SELECT USING (auth.uid() = trader_id);

CREATE POLICY "Users can upsert own progress"
  ON course_progress FOR INSERT WITH CHECK (auth.uid() = trader_id);

CREATE POLICY "Users can update own progress"
  ON course_progress FOR UPDATE USING (auth.uid() = trader_id);

CREATE POLICY "Admin can view all progress"
  ON course_progress FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE INDEX idx_course_progress_trader ON course_progress(trader_id);
CREATE INDEX idx_course_progress_resource ON course_progress(resource_id);
