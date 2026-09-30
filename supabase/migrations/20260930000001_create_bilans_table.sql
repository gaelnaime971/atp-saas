-- ============================================================================
-- Table bilans — état persistant du "Bilan Trader 2027"
-- ============================================================================
-- Un bilan par membre à un instant t. Plusieurs bilans possibles dans le temps
-- (chaque nouveau reset crée une nouvelle ligne, l'ancien reste consultable
-- historiquement).
--
-- Colonnes JSONB découpées pour séparer les zones qui bougent à des rythmes
-- différents :
--   - profile   : données trader (name/capital/target/…) saisies une fois
--   - answers   : réponses aux 71 questions (mutations fréquentes)
--   - scores    : agrégats calculés par thème (produit par calcResults)
--   - checks    : cases plan cochées (pi-wi-ai → true)
--
-- Mapping S (state client) ↔ colonnes (appliqué côté hook, HTML inchangé) :
--   S.ans   → answers          S.hz          → horizon_weeks
--   S.res?.scores → scores     S.res?.alpha  → alpha_score
--   S.res?.arch?.n → archetype S.checks      → checks
--   S.completedAt (nouveau)    → completed_at
-- ============================================================================

create table if not exists public.bilans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  profile       jsonb not null default '{}',
  answers       jsonb not null default '{}',
  scores        jsonb not null default '{}',
  alpha_score   int,
  archetype     text,
  horizon_weeks int check (horizon_weeks in (4, 8, 12)),
  checks        jsonb not null default '{}'
);

-- Index — filtres fréquents côté hook (bilan en cours par user, historique par date).
create index if not exists bilans_user_id_idx      on public.bilans(user_id);
create index if not exists bilans_completed_at_idx on public.bilans(completed_at);

-- Auto-update updated_at à chaque UPDATE.
create or replace function update_bilans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists bilans_updated_at on public.bilans;
create trigger bilans_updated_at
  before update on public.bilans
  for each row execute function update_bilans_updated_at();

-- RLS — chaque membre ne voit/écrit QUE ses propres bilans.
alter table public.bilans enable row level security;

drop policy if exists "membre_own_bilans" on public.bilans;
create policy "membre_own_bilans" on public.bilans
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin peut LIRE tous les bilans (pas d'écriture — ils appartiennent aux membres).
-- Pattern identique aux policies admin déjà utilisées dans coaching_video_system.sql
-- et sales_pipeline.sql (profiles.role = 'admin').
drop policy if exists "admin_read_bilans" on public.bilans;
create policy "admin_read_bilans" on public.bilans
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );
