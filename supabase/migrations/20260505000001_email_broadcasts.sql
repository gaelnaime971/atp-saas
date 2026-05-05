-- Email broadcast history
CREATE TABLE IF NOT EXISTS email_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  html text NOT NULL,
  recipient_mode text NOT NULL CHECK (recipient_mode IN ('source','manual','test')),
  recipient_count integer NOT NULL DEFAULT 0,
  sources text[] DEFAULT '{}',
  recipient_ids uuid[] DEFAULT '{}',
  sent integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  test_email text,
  test_mode boolean NOT NULL DEFAULT false
);

ALTER TABLE email_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on email_broadcasts"
  ON email_broadcasts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX idx_email_broadcasts_created_at ON email_broadcasts(created_at DESC);
