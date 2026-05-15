-- Payment tracking on closed prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS payment_installments int DEFAULT 1
  CHECK (payment_installments BETWEEN 1 AND 8);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS payment_schedule jsonb;
-- payment_schedule shape:
-- [{ num: 1, amount: 1000, due_date: "2026-05-15", paid_at: "2026-05-15T10:00:00Z"|null,
--    method: "stripe"|"virement"|"especes"|null, reference: "ATP-XXX"|null }]
