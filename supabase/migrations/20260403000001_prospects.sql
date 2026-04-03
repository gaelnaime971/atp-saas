-- Prospects table for lead capture
CREATE TABLE IF NOT EXISTS prospects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  prenom text NOT NULL,
  nom text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  experience text NOT NULL,
  objectif text NOT NULL,
  source text DEFAULT 'landing-capture',
  status text DEFAULT 'nouveau' CHECK (status IN ('nouveau','contacte','call_booke','close','disqualifie')),
  action text DEFAULT 'rien_fait' CHECK (action IN ('rien_fait','whatsapp_envoye','mail_envoye','whatsapp_et_mail','pas_qualifie')),
  notes text DEFAULT ''
);

-- Allow public inserts (capture form)
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on prospects"
  ON prospects FOR INSERT
  WITH CHECK (true);

-- Only admins can read/update
CREATE POLICY "Admin full access on prospects"
  ON prospects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
