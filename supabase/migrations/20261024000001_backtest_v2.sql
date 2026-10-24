-- ============================================================================
-- Backtest V2 — Fondations : critères personnalisés par trader + colonne
-- `criteria jsonb` sur `backtests`. L'UI actuelle ne change pas tant que
-- BACKTEST_V2_ENABLED n'est pas posé côté app.
--
-- Idempotente : rejouable sans effet secondaire (IF NOT EXISTS partout,
-- DROP POLICY IF EXISTS avant CREATE POLICY, ON CONFLICT DO NOTHING sur
-- les inserts de seed).
-- ============================================================================

-- ─── A.1  Colonne `criteria` sur backtests ─────────────────────────────────
-- Shape du JSONB (clé = categories.key, valeur dépend du selection):
--   { "zone":      [{"element":"OB","timeframe":"M5"}, ...],  // paired
--     "fibonacci": ["50","61.8"],                              // multi
--     "signal":    [{"element":"Hammer","timeframe":"M1"}],    // paired
--     "session":   "preopen",                                  // single
--     "my_setups": ["mon-super-setup"] }                       // multi

alter table public.backtests
  add column if not exists criteria jsonb not null default '{}'::jsonb;

-- ─── A.2  Catégories de critères (par trader) ──────────────────────────────
create table if not exists public.trader_criteria_categories (
  id          uuid primary key default gen_random_uuid(),
  trader_id   uuid not null references public.profiles(id) on delete cascade,
  key         text not null,                                     -- 'zone', 'fibonacci', 'signal', 'my_setups', 'session'...
  label       text not null,                                     -- 'Zones', 'Fibonacci', ...
  selection   text not null check (selection in ('single','multi','paired')),
  -- Liste d'unités de temps proposées, pour selection='paired'. '[]'::jsonb sinon.
  timeframes  jsonb not null default '[]'::jsonb,
  position    int  not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (trader_id, key)
);

create index if not exists idx_tcc_trader
  on public.trader_criteria_categories (trader_id, position);

alter table public.trader_criteria_categories enable row level security;

drop policy if exists "tcc own select" on public.trader_criteria_categories;
create policy "tcc own select"
  on public.trader_criteria_categories for select
  using (auth.uid() = trader_id);

drop policy if exists "tcc own write" on public.trader_criteria_categories;
create policy "tcc own write"
  on public.trader_criteria_categories for all
  using (auth.uid() = trader_id)
  with check (auth.uid() = trader_id);

-- ─── A.3  Options d'une catégorie ──────────────────────────────────────────
create table if not exists public.trader_criteria_options (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.trader_criteria_categories(id) on delete cascade,
  -- Valeur stable écrite dans backtests.criteria (jamais renommée pour ne pas
  -- casser l'historique). Les options ATP ont une valeur canonique ('OB',
  -- '50', 'Hammer'...) ; les options custom ont une valeur = nom libre.
  value        text not null,
  label        text not null,
  origin       text not null check (origin in ('atp','custom')),
  hidden       boolean not null default false,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (category_id, value)
);

create index if not exists idx_tco_category
  on public.trader_criteria_options (category_id, position);

alter table public.trader_criteria_options enable row level security;

-- Policies via sous-SELECT sur la catégorie (own-only transitif).
drop policy if exists "tco own select" on public.trader_criteria_options;
create policy "tco own select"
  on public.trader_criteria_options for select
  using (
    exists (
      select 1 from public.trader_criteria_categories c
      where c.id = category_id and c.trader_id = auth.uid()
    )
  );

drop policy if exists "tco own write" on public.trader_criteria_options;
create policy "tco own write"
  on public.trader_criteria_options for all
  using (
    exists (
      select 1 from public.trader_criteria_categories c
      where c.id = category_id and c.trader_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trader_criteria_categories c
      where c.id = category_id and c.trader_id = auth.uid()
    )
  );

-- ============================================================================
-- B.1  seed_trader_criteria(uid) — catalogue ATP + reprise des customs
-- Idempotente : rejouable sans écraser les customisations déjà faites par
-- le trader (ON CONFLICT DO NOTHING partout).
-- ============================================================================
create or replace function public.seed_trader_criteria(p_trader_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_zone      uuid;
  v_fibo      uuid;
  v_signal    uuid;
  v_mysetups  uuid;
begin
  -- ─── Zones (paired) × TF ──────────────────────────────────────────────
  insert into trader_criteria_categories(trader_id, key, label, selection, timeframes, position)
  values (p_trader_id, 'zone', 'Zones', 'paired',
          '["M1","M5","M15","H1","H4"]'::jsonb, 0)
  on conflict (trader_id, key) do nothing;

  select id into v_zone from trader_criteria_categories
   where trader_id = p_trader_id and key = 'zone';

  insert into trader_criteria_options(category_id, value, label, origin, position) values
    (v_zone, 'OB',    'Order Block', 'atp', 0),
    (v_zone, 'FVG',   'FVG',         'atp', 1),
    (v_zone, 'CHoCH', 'CHoCH',       'atp', 2),
    (v_zone, 'BOS',   'BOS',         'atp', 3)
  on conflict (category_id, value) do nothing;

  -- ─── Fibonacci (multi) ────────────────────────────────────────────────
  insert into trader_criteria_categories(trader_id, key, label, selection, timeframes, position)
  values (p_trader_id, 'fibonacci', 'Fibonacci', 'multi', '[]'::jsonb, 1)
  on conflict (trader_id, key) do nothing;

  select id into v_fibo from trader_criteria_categories
   where trader_id = p_trader_id and key = 'fibonacci';

  insert into trader_criteria_options(category_id, value, label, origin, position) values
    (v_fibo, '38.2', '38,2 %', 'atp', 0),
    (v_fibo, '50',   '50 %',   'atp', 1),
    (v_fibo, '61.8', '61,8 %', 'atp', 2),
    (v_fibo, '78.6', '78,6 %', 'atp', 3)
  on conflict (category_id, value) do nothing;

  -- ─── Signal d'entrée (paired) × TF ────────────────────────────────────
  insert into trader_criteria_categories(trader_id, key, label, selection, timeframes, position)
  values (p_trader_id, 'signal', 'Signal d''entrée', 'paired',
          '["100T","M1","M5"]'::jsonb, 2)
  on conflict (trader_id, key) do nothing;

  select id into v_signal from trader_criteria_categories
   where trader_id = p_trader_id and key = 'signal';

  insert into trader_criteria_options(category_id, value, label, origin, position) values
    (v_signal, 'Hammer',    'Hammer',    'atp', 0),
    (v_signal, 'Engulfing', 'Engulfing', 'atp', 1),
    (v_signal, 'Pin Bar',   'Pin Bar',   'atp', 2)
  on conflict (category_id, value) do nothing;

  -- ─── Mes setups (multi) — reprise des user_custom_setups existants ────
  insert into trader_criteria_categories(trader_id, key, label, selection, timeframes, position)
  values (p_trader_id, 'my_setups', 'Mes setups', 'multi', '[]'::jsonb, 3)
  on conflict (trader_id, key) do nothing;

  select id into v_mysetups from trader_criteria_categories
   where trader_id = p_trader_id and key = 'my_setups';

  insert into trader_criteria_options(category_id, value, label, origin, position)
  select v_mysetups, setup_name, setup_name, 'custom',
         (row_number() over (order by created_at)) - 1
    from user_custom_setups
   where trader_id = p_trader_id
  on conflict (category_id, value) do nothing;
end
$$;

grant execute on function public.seed_trader_criteria(uuid) to authenticated;

-- ============================================================================
-- B.2  seed_backtest_criteria_template(uid, key) — modèles ajoutables
-- en un clic. 5 valeurs reconnues : 'session' | 'context' | 'management'
-- | 'news' | 'mindset'. Toute autre valeur → erreur. Idempotente.
-- ============================================================================
create or replace function public.seed_backtest_criteria_template(
  p_trader_id uuid,
  p_template_key text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_cat_id uuid;
  v_pos    int;
  v_label  text;
  v_select text;
  v_opts   text[][];
  r        text[];
  v_i      int;
begin
  -- Garde-fou : ne jamais seeder pour quelqu'un d'autre.
  if p_trader_id is distinct from auth.uid() then
    raise exception 'forbidden: can only seed template for own account';
  end if;

  if p_template_key = 'session' then
    v_label := 'Moment de la séance';
    v_select := 'single';
    v_opts := array[
      array['preopen','Préopen'],
      array['open','Open'],
      array['afternoon','Après-midi']
    ];
  elsif p_template_key = 'context' then
    v_label := 'Contexte';
    v_select := 'single';
    v_opts := array[
      array['trend','Tendance'],
      array['range','Range']
    ];
  elsif p_template_key = 'management' then
    v_label := 'Gestion';
    v_select := 'single';
    v_opts := array[
      array['americain','Ricain'],
      array['hybride','Hybride']
    ];
  elsif p_template_key = 'news' then
    v_label := 'Jour de news';
    v_select := 'single';
    v_opts := array[
      array['yes','Oui'],
      array['no','Non']
    ];
  elsif p_template_key = 'mindset' then
    v_label := 'État d''esprit';
    v_select := 'single';
    v_opts := array[
      array['calm','Calme'],
      array['impatient','Impatient'],
      array['tired','Fatigué']
    ];
  else
    raise exception 'unknown template: %', p_template_key;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from trader_criteria_categories
   where trader_id = p_trader_id;

  insert into trader_criteria_categories(trader_id, key, label, selection, position)
  values (p_trader_id, p_template_key, v_label, v_select, v_pos)
  on conflict (trader_id, key) do nothing;

  select id into v_cat_id from trader_criteria_categories
   where trader_id = p_trader_id and key = p_template_key;

  v_i := 0;
  foreach r slice 1 in array v_opts loop
    insert into trader_criteria_options(category_id, value, label, origin, position)
    values (v_cat_id, r[1], r[2], 'atp', v_i)
    on conflict (category_id, value) do nothing;
    v_i := v_i + 1;
  end loop;

  return v_cat_id;
end
$$;

grant execute on function public.seed_backtest_criteria_template(uuid, text) to authenticated;

-- ============================================================================
-- C.  backfill_backtest_criteria() — à exécuter manuellement
--
-- Parse `setup_types` et `signals` des backtests existants et remplit
-- `criteria`. Idempotente : skippe les lignes déjà peuplées (criteria !=
-- '{}'). Les setups non reconnus (= pas dans {OB,FVG,CHoCH,BOS} ∪
-- fibonacci ∪ signaux ATP) atterrissent dans "Mes setups". Les lignes
-- partiellement non reconnues sont journalisées dans backfill_backtest_log.
--
-- Retour : agrégat (scanned, converted, unknown_items).
-- ============================================================================
create table if not exists public.backfill_backtest_log (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null,
  backtest_id uuid not null,
  unknown_values text[] not null default '{}',
  ran_at timestamptz not null default now()
);

alter table public.backfill_backtest_log enable row level security;
-- Pas de policy côté client → table lue uniquement en service_role / admin SQL.

create or replace function public.backfill_backtest_criteria()
returns table(scanned int, converted int, unknown_items int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bt            record;
  v_criteria      jsonb;
  v_zone          jsonb;
  v_fibonacci     jsonb;
  v_signal        jsonb;
  v_my_setups     jsonb;
  v_unknown       text[];
  v_item          text;
  v_zone_cat_id   uuid;
  v_fibo_cat_id   uuid;
  v_signal_cat_id uuid;
  v_my_cat_id     uuid;
  v_element       text;
  v_timeframe     text;
  v_scanned       int := 0;
  v_converted     int := 0;
  v_unknown_sum   int := 0;
  v_zone_atp      text[] := array['OB','FVG','CHoCH','BOS'];
  v_fibo_atp      text[] := array['38.2','50','61.8','78.6'];
  v_signal_atp    text[] := array['Hammer','Engulfing','Pin Bar'];
  v_tfs           text[] := array['M1','M5','M15','H1','H4','100T'];
  v_fibo_norm     text;
  v_tf_match      text;
  v_elem_match    text;
begin
  for v_bt in
    select id, trader_id, setup_types, signals, has_confluence, criteria
      from backtests
     order by trader_id, created_at
  loop
    v_scanned := v_scanned + 1;
    -- Skip si déjà peuplé (idempotence stricte).
    if v_bt.criteria is not null and v_bt.criteria <> '{}'::jsonb then
      continue;
    end if;

    -- S'assurer que le trader a son seed (sinon on crée les 4 catégories).
    perform seed_trader_criteria(v_bt.trader_id);

    select id into v_zone_cat_id   from trader_criteria_categories where trader_id = v_bt.trader_id and key = 'zone';
    select id into v_fibo_cat_id   from trader_criteria_categories where trader_id = v_bt.trader_id and key = 'fibonacci';
    select id into v_signal_cat_id from trader_criteria_categories where trader_id = v_bt.trader_id and key = 'signal';
    select id into v_my_cat_id     from trader_criteria_categories where trader_id = v_bt.trader_id and key = 'my_setups';

    v_zone := '[]'::jsonb;
    v_fibonacci := '[]'::jsonb;
    v_signal := '[]'::jsonb;
    v_my_setups := '[]'::jsonb;
    v_unknown := '{}';

    -- ─── setup_types ──────────────────────────────────────────────────
    foreach v_item in array coalesce(v_bt.setup_types, '{}') loop
      v_item := trim(v_item);
      if v_item = '' then continue; end if;
      -- Fibonacci (38.2%, 50%, 61.8%, 78.6%) ou juste la valeur sans %
      v_fibo_norm := regexp_replace(v_item, '\s*%\s*$', '');
      v_fibo_norm := replace(v_fibo_norm, ',', '.');
      if v_fibo_norm = any(v_fibo_atp) then
        v_fibonacci := v_fibonacci || to_jsonb(v_fibo_norm);
        continue;
      end if;
      -- Zone paired : "<element> <tf>" ou "<element>-<tf>" ou "<element><tf>"
      v_elem_match := null;
      v_tf_match := null;
      foreach v_tf_match in array v_tfs loop
        if v_item ~* ('\s' || v_tf_match || '\s*$') or v_item ~* ('-' || v_tf_match || '\s*$') or v_item ~* ('^' || v_tf_match || '\s') then
          foreach v_elem_match in array v_zone_atp loop
            if v_item ~* ('(^|\s|-)' || v_elem_match || '($|\s|-)') then
              v_zone := v_zone || jsonb_build_object('element', v_elem_match, 'timeframe', v_tf_match);
              exit;
            end if;
          end loop;
          if v_elem_match is not null and v_item ~* ('(^|\s|-)' || v_elem_match || '($|\s|-)') then
            exit;
          end if;
        end if;
        v_elem_match := null;
      end loop;
      -- Zone sans TF ni Fibonacci → va dans "Mes setups"
      if v_elem_match is null then
        v_my_setups := v_my_setups || to_jsonb(v_item);
        v_unknown := array_append(v_unknown, v_item);
        -- Crée l'option custom si absente
        insert into trader_criteria_options(category_id, value, label, origin, position)
        select v_my_cat_id, v_item, v_item, 'custom',
               coalesce((select max(position) + 1 from trader_criteria_options where category_id = v_my_cat_id), 0)
        on conflict (category_id, value) do nothing;
      end if;
    end loop;

    -- ─── signals ──────────────────────────────────────────────────────
    foreach v_item in array coalesce(v_bt.signals, '{}') loop
      v_item := trim(v_item);
      if v_item = '' then continue; end if;
      v_elem_match := null;
      v_tf_match := null;
      foreach v_elem_match in array v_signal_atp loop
        if v_item ~* ('(^|\s)' || v_elem_match || '(\s|$)') then
          foreach v_tf_match in array v_tfs loop
            if v_item ~* ('(^|\s|-)' || v_tf_match || '($|\s|-)') then
              v_signal := v_signal || jsonb_build_object('element', v_elem_match, 'timeframe', v_tf_match);
              exit;
            end if;
          end loop;
          exit;
        end if;
        v_elem_match := null;
      end loop;
      if v_elem_match is null then
        v_my_setups := v_my_setups || to_jsonb(v_item);
        v_unknown := array_append(v_unknown, v_item);
      end if;
    end loop;

    -- ─── Compose le JSONB final (clés présentes seulement si non vides) ──
    v_criteria := '{}'::jsonb;
    if jsonb_array_length(v_zone) > 0 then
      v_criteria := v_criteria || jsonb_build_object('zone', v_zone);
    end if;
    if jsonb_array_length(v_fibonacci) > 0 then
      v_criteria := v_criteria || jsonb_build_object('fibonacci', v_fibonacci);
    end if;
    if jsonb_array_length(v_signal) > 0 then
      v_criteria := v_criteria || jsonb_build_object('signal', v_signal);
    end if;
    if jsonb_array_length(v_my_setups) > 0 then
      v_criteria := v_criteria || jsonb_build_object('my_setups', v_my_setups);
    end if;

    update backtests set criteria = v_criteria where id = v_bt.id;
    v_converted := v_converted + 1;

    if array_length(v_unknown, 1) > 0 then
      insert into backfill_backtest_log(trader_id, backtest_id, unknown_values)
      values (v_bt.trader_id, v_bt.id, v_unknown);
      v_unknown_sum := v_unknown_sum + array_length(v_unknown, 1);
    end if;
  end loop;

  return query select v_scanned, v_converted, v_unknown_sum;
end
$$;

-- Exécution réservée service_role (route admin). PAS appelé automatiquement.
revoke all on function public.backfill_backtest_criteria() from public;
revoke all on function public.backfill_backtest_criteria() from authenticated;
