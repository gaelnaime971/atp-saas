-- Désabonnement RGPD + conformité List-Unsubscribe (RFC 8058).
-- Un seul boolean nullable-defaulting-false ; le filtre devient
-- `WHERE unsubscribed = false` (ou `IS NOT TRUE`).
alter table public.prospects
  add column if not exists unsubscribed boolean not null default false;

-- Index partiel : accélère "récupère les destinataires encore abonnés"
-- sur gros volumes. Rows désabonnés ne sont pas indexés → coût ~0 au vacuum.
create index if not exists prospects_active_subscribers_idx
  on public.prospects (id)
  where unsubscribed = false;
