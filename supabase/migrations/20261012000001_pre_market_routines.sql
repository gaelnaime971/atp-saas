-- Routine pré-marché branchée en base — fini le localStorage perdu au vidage
-- de cache. Alimente le nouvel axe ATP Score "Préparation" (régularité pure,
-- règle "C intelligent" : ne jamais noter la positivité des réponses pour
-- préserver l'honnêteté du trader) et le payload IA Mental.
--
-- Impact zéro sur données existantes : table nouvelle, aucune colonne touchée
-- sur une table existante, aucun DROP, aucune suppression.

-- ─── Table ─────────────────────────────────────────────────────────
create table public.pre_market_routines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  routine_date    date not null,

  -- Confidence : NULL tant que le trader n'a pas touché le slider.
  -- Le slider affiche "5" côté UI par défaut, mais tant qu'aucune
  -- interaction, on garde la vraie absence de donnée en base
  -- (sinon toute ouverture de la page créerait une row fantôme à 5/10
  -- qui polluerait les moyennes IA Mental).
  confidence      smallint check (confidence between 1 and 10),

  mental_note     text default '',
  bias            text check (bias in ('haussier', 'baissier', 'neutre', 'none', '')),
  news            text default '',
  support         text default '',
  resistance      text default '',

  -- 13 checks de la routine en jsonb : { "Je suis reposé": true, ... }.
  -- jsonb plutôt qu'une colonne par check pour pouvoir ajouter/retirer
  -- des items demain sans migration schema.
  checks          jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Clé fonctionnelle : 1 routine max par user par jour.
  -- Permet UPSERT trivial via onConflict: 'user_id,routine_date'.
  unique (user_id, routine_date)
);

-- Index couvrant pour le load initial "SELECT * WHERE user_id = me
-- AND routine_date = today" et pour les SELECTs IA Mental "30 derniers
-- jours triés desc".
create index pre_market_routines_user_date_idx
  on public.pre_market_routines (user_id, routine_date desc);

-- ─── Trigger updated_at ────────────────────────────────────────────
-- Pattern déjà utilisé par la table bilans (migration 20260930000001).
-- Fonction dédiée à la table pour isoler des évolutions futures.
create or replace function update_pre_market_routines_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists pre_market_routines_updated_at on public.pre_market_routines;
create trigger pre_market_routines_updated_at
  before update on public.pre_market_routines
  for each row execute function update_pre_market_routines_updated_at();

-- ─── RLS : chaque trader ne voit QUE ses propres routines ─────────
-- Pas de DELETE policy : historique immuable, les routines passées
-- alimentent les corrélations futures (phase 2) et l'IA Mental qui
-- peut regarder sur plusieurs mois.
alter table public.pre_market_routines enable row level security;

create policy "users_select_own_routines"
  on public.pre_market_routines
  for select
  using (auth.uid() = user_id);

create policy "users_insert_own_routines"
  on public.pre_market_routines
  for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_routines"
  on public.pre_market_routines
  for update
  using (auth.uid() = user_id);

-- Commentaires de doc en base (visibles dans Supabase Studio)
comment on table public.pre_market_routines is
  'Routine pré-marché quotidienne (anciennement localStorage). Alimente l''axe ATP Score "Préparation" et le payload IA Mental.';
comment on column public.pre_market_routines.checks is
  'JSON {label: boolean} des 13 checks de la routine (État Mental, Macro, Technique, Risque).';
comment on column public.pre_market_routines.confidence is
  'Score 1-10 déclaré par le trader. NULL = jamais renseigné (évite les rows fantômes à 5/10).';
