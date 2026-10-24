-- ============================================================================
-- Backtest V2 — Catalogue "Signal d'entrée" : ajout de l'unité "15s".
--
-- Ordre final des unités : ["15s","100T","M1","M5"].
--
--   1. UPDATE idempotent sur les catégories 'signal' déjà créées :
--      si '15s' n'est pas déjà dans timeframes, on le réordonne tout
--      proprement — pas de concat naïve, on reconstruit l'array
--      canonique en préservant les TFs custom ajoutées par le trader
--      (ex. si quelqu'un a ajouté 'M15' manuellement).
--   2. CREATE OR REPLACE sur seed_trader_criteria pour que tout
--      nouveau trader hérite directement du bon ordre.
--
-- Idempotente : rejouable sans effet secondaire.
-- ============================================================================

-- ─── 1. Rattrapage des catégories 'signal' déjà créées ─────────────────────
-- Logique : on prend les 4 TFs ATP dans l'ordre {15s, 100T, M1, M5} puis
-- on y ajoute toute TF déjà présente qui n'y figure pas (préservation
-- des customs). Idempotent — si tout est déjà dans l'ordre, le UPDATE
-- écrit la même valeur.
with cat as (
  select id, timeframes
    from public.trader_criteria_categories
   where key = 'signal'
),
canonical as (
  select cat.id,
         -- ATP d'abord dans l'ordre figé
         (
           select coalesce(jsonb_agg(tf), '[]'::jsonb)
             from unnest(array['15s','100T','M1','M5']) as t(tf)
         )
         ||
         -- Puis les TFs custom déjà présentes qui ne sont pas dans l'ATP
         (
           select coalesce(jsonb_agg(elem), '[]'::jsonb)
             from jsonb_array_elements_text(cat.timeframes) as elem
            where elem not in ('15s','100T','M1','M5')
         ) as new_tfs
    from cat
)
update public.trader_criteria_categories c
   set timeframes = canonical.new_tfs
  from canonical
 where c.id = canonical.id
   and c.timeframes <> canonical.new_tfs;

-- ─── 2. Update seed_trader_criteria pour les nouveaux traders ──────────────
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

  -- 2026-10-25 : '15s' en tête (ordre figé 15s, 100T, M1, M5).
  insert into trader_criteria_categories(trader_id, key, label, selection, timeframes, position)
  values (p_trader_id, 'signal', 'Signal d''entrée', 'paired',
          '["15s","100T","M1","M5"]'::jsonb, 2)
  on conflict (trader_id, key) do nothing;
  select id into v_signal from trader_criteria_categories
   where trader_id = p_trader_id and key = 'signal';
  insert into trader_criteria_options(category_id, value, label, origin, position) values
    (v_signal, 'Hammer',    'Hammer',    'atp', 0),
    (v_signal, 'Engulfing', 'Engulfing', 'atp', 1),
    (v_signal, 'Pin Bar',   'Pin Bar',   'atp', 2)
  on conflict (category_id, value) do nothing;

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
