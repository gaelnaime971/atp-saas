-- ============================================================================
-- Backtest V2 — Patch backfill pour "Pin Bar" sans unité.
--
-- L'ancien catalogue (components/dashboard/pages/Backtest.tsx) a
-- "Pin Bar" tel quel, SANS unité. La version précédente de
-- backfill_backtest_criteria() exigeait un match TF pour reconnaître
-- un signal → "Pin Bar" nu finissait dans "Mes setups" (perte de
-- sens côté stats). Ce patch :
--
--   - reconnaît "Pin Bar" sans TF → paire { element: 'Pin Bar',
--     timeframe: '' } (sentinelle "non précisée", on n'invente
--     PAS de donnée) ;
--   - Hammer et Engulfing continuent d'exiger une TF (sinon fallback
--     "Mes setups") ;
--   - rejoue l'injection "Pin Bar" idempotemment : si la paire existe
--     déjà, l'INSERT du log est skippé.
--
-- Les stats par unité de temps regrouperont ces lignes dans "Non
-- précisée" (gérée côté code, timeframe === '' → libellé spécial).
--
-- Idempotente : CREATE OR REPLACE unique, aucune donnée touchée en
-- dehors de l'appel manuel à la fonction.
-- ============================================================================

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
  v_scanned       int := 0;
  v_converted     int := 0;
  v_unknown_sum   int := 0;
  v_zone_atp      text[] := array['OB','FVG','CHoCH','BOS'];
  v_fibo_atp      text[] := array['38.2','50','61.8','78.6'];
  v_signal_atp    text[] := array['Hammer','Engulfing'];
  v_signal_notf   text[] := array['Pin Bar'];
  -- Sentinelle "non précisée" : chaîne vide. L'UI remplace en libellé
  -- "Non précisée" dans les stats par unité de temps.
  v_signal_notf_tf text := '';
  v_tfs           text[] := array['M1','M5','M15','H1','H4','100T'];
  v_fibo_norm     text;
  v_tf_match      text;
  v_elem_match    text;
  v_item_norm     text;
begin
  for v_bt in
    select id, trader_id, setup_types, signals, has_confluence, criteria
      from backtests
     order by trader_id, created_at
  loop
    v_scanned := v_scanned + 1;
    if v_bt.criteria is not null and v_bt.criteria <> '{}'::jsonb then
      continue;
    end if;

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

      -- Fibonacci : "38.2%", "50%", "61.8%", "78.6%" (ancien format)
      -- ou valeur sans % (tolérant), virgule FR normalisée en point.
      v_fibo_norm := regexp_replace(v_item, '\s*%\s*$', '');
      v_fibo_norm := replace(v_fibo_norm, ',', '.');
      if v_fibo_norm = any(v_fibo_atp) then
        v_fibonacci := v_fibonacci || to_jsonb(v_fibo_norm);
        continue;
      end if;

      -- Zone paired
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

      if v_elem_match is null then
        v_my_setups := v_my_setups || to_jsonb(v_item);
        v_unknown := array_append(v_unknown, v_item);
        insert into trader_criteria_options(category_id, value, label, origin, position)
        select v_my_cat_id, v_item, v_item, 'custom',
               coalesce((select max(position) + 1 from trader_criteria_options where category_id = v_my_cat_id), 0)
        on conflict (category_id, value) do nothing;
      end if;
    end loop;

    -- ─── signals ──────────────────────────────────────────────────────
    -- Patch 2026-10-25 : "Pin Bar" sans TF reconnu avec TF par défaut 'M5'.
    foreach v_item in array coalesce(v_bt.signals, '{}') loop
      v_item := trim(v_item);
      if v_item = '' then continue; end if;

      -- 1) Signaux SANS unité (Pin Bar) : match sur l'élément seul,
      --    on affecte TF par défaut.
      v_elem_match := null;
      v_item_norm := regexp_replace(v_item, '\s+', ' ', 'g');
      foreach v_elem_match in array v_signal_notf loop
        if v_item_norm ~* ('^' || v_elem_match || '($|\s)') then
          v_signal := v_signal || jsonb_build_object('element', v_elem_match, 'timeframe', v_signal_notf_tf);
          exit;
        end if;
        v_elem_match := null;
      end loop;
      if v_elem_match is not null then continue; end if;

      -- 2) Signaux AVEC unité (Hammer, Engulfing)
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

revoke all on function public.backfill_backtest_criteria() from public;
revoke all on function public.backfill_backtest_criteria() from authenticated;
