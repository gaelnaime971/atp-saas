-- ═══════════════════════════════════════════════════════════════
-- TRADING PERSO — Audit chronologique du cycle de vie d'un compte
-- (passage en financé, scale-up, reset, clôture, breach, note).
--
-- Les payouts restent dans leur propre table (propfirm_payouts) ;
-- cette table-ci couvre les ÉVÉNEMENTS DE STATUT du compte, pas
-- les flux de trésorerie.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS propfirm_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES propfirm_accounts(id) ON DELETE CASCADE NOT NULL,
  -- Type d'événement. Un `funded_start` marque le passage en financé
  -- (promotion depuis un challenge réussi). `scale_up` quand le
  -- propfirm augmente la taille du compte (ex. FTMO 100k → 200k).
  -- `reset` quand le trader achète un reset après violation. `closed`
  -- quand le compte est fermé proprement (profit retiré, fin de
  -- partenariat). `rule_breach` quand le compte casse une règle
  -- (max DD, consistency…). `note` pour une annotation libre.
  kind text NOT NULL CHECK (kind IN (
    'funded_start','scale_up','reset','closed','rule_breach','note'
  )),
  -- Date de l'événement (séparée de created_at : on peut saisir un
  -- événement avec date rétroactive).
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  -- Snapshot utile pour l'audit (le compte peut avoir changé depuis).
  -- Shape : { prev_balance?: number, new_balance?: number,
  --          prev_size?: number, new_size?: number,
  --          cost_eur?: number, reason?: string, ... }
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE propfirm_account_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on propfirm_account_events"
  ON propfirm_account_events FOR ALL
  USING (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_account_events.account_id
      AND a.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM propfirm_accounts a
    WHERE a.id = propfirm_account_events.account_id
      AND a.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_propfirm_account_events_account_date
  ON propfirm_account_events (account_id, event_date DESC, created_at DESC);
