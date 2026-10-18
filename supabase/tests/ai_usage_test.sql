-- ============================================================================
-- Script de test — à exécuter dans Supabase Dashboard → SQL Editor
-- APRÈS avoir run la migration 20261019000001_ai_usage.sql.
-- ============================================================================
-- 100% SQL pur (pas de \echo ni autre commande psql). L'affichage final est
-- UNE table avec 4 colonnes : test, attendu, obtenu, ok (true/false).
--
-- Prouve les 4 invariants du socle quota IA :
--   (a) limite 2 → allowed true, true, false, false — compteur reste à 2
--   (b) admin → toujours allowed, compteur incrémenté sans plafond
--   (c) authenticated et anon → EXECUTE refusé sur les 2 fonctions
--   (d) usage_date = date Europe/Paris (pas UTC)
--   (e) record_ai_tokens applique bien tokens + cost sur la row du jour
--
-- Feature de test '__test_a__' et '__test_b__' isolées de tout usage réel.
-- Nettoyage avant ET à la fin : zéro trace dans ai_usage à la sortie.
-- Relançable sans effet de bord.
-- ============================================================================

-- ─── 0. Table temporaire pour collecter tous les résultats ─────────────────
drop table if exists pg_temp.test_results;
create temp table test_results (
  seq     int generated always as identity,
  test    text,
  attendu text,
  obtenu  text,
  ok      boolean
);

-- ─── 1. Clean résidus d'un run précédent (idempotence) ────────────────────
delete from public.ai_usage where feature like '__test_%';

-- ─── 2. Tests (a), (b), (d), (e) via un bloc PL/pgSQL ─────────────────────
do $$
declare
  v_user_id uuid;
  v_r       record;
  v_calls   int;
  v_tok_in  bigint;
  v_tok_out bigint;
  v_cost    numeric;
  v_stored  date;
  v_paris   date := public._atp_today_paris();
begin
  -- Setup : prendre le 1er user existant (évite de créer un profile de test
  -- qui violerait la FK vers auth.users). Si zéro user → test impossible.
  select id into v_user_id
    from public.profiles
    order by created_at asc
    limit 1;

  if v_user_id is null then
    insert into test_results (test, attendu, obtenu, ok)
      values ('setup', 'au moins 1 user dans profiles',
              'aucun user — test impossible', false);
    return;
  end if;

  insert into test_results (test, attendu, obtenu, ok)
    values ('setup', 'user de test trouvé',
            'user_id=' || v_user_id::text, true);

  -- ─── (a) Limite 2 : true, true, false, false, compteur plafonne ─────
  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_a__', 2, false, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(a1) limite 2, appel 1',
            'allowed=true, calls_today=1',
            format('allowed=%s, calls_today=%s', v_r.allowed, v_r.calls_today),
            v_r.allowed = true and v_r.calls_today = 1);

  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_a__', 2, false, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(a2) limite 2, appel 2',
            'allowed=true, calls_today=2',
            format('allowed=%s, calls_today=%s', v_r.allowed, v_r.calls_today),
            v_r.allowed = true and v_r.calls_today = 2);

  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_a__', 2, false, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(a3) limite 2, appel 3 (dépasse)',
            'allowed=false, calls_today=2 (plafonné)',
            format('allowed=%s, calls_today=%s', v_r.allowed, v_r.calls_today),
            v_r.allowed = false and v_r.calls_today = 2);

  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_a__', 2, false, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(a4) limite 2, appel 4 (toujours plafonné)',
            'allowed=false, calls_today=2',
            format('allowed=%s, calls_today=%s', v_r.allowed, v_r.calls_today),
            v_r.allowed = false and v_r.calls_today = 2);

  select calls_count into v_calls
    from public.ai_usage
    where user_id = v_user_id and feature = '__test_a__' and usage_date = v_paris;
  insert into test_results (test, attendu, obtenu, ok)
    values ('(a5) row ai_usage finale',
            'calls_count=2',
            format('calls_count=%s', v_calls),
            v_calls = 2);

  -- ─── (b) Admin : toujours allowed, limite dépassée sans problème ────
  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_b__', 1, true, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(b1) admin appel 1 (limite serveur=1)',
            'allowed=true, calls_today=1, calls_limit=-1',
            format('allowed=%s, calls_today=%s, calls_limit=%s',
                   v_r.allowed, v_r.calls_today, v_r.calls_limit),
            v_r.allowed = true and v_r.calls_today = 1 and v_r.calls_limit = -1);

  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_b__', 1, true, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(b2) admin appel 2 (dépasse limite non-admin)',
            'allowed=true, calls_today=2, calls_limit=-1',
            format('allowed=%s, calls_today=%s, calls_limit=%s',
                   v_r.allowed, v_r.calls_today, v_r.calls_limit),
            v_r.allowed = true and v_r.calls_today = 2 and v_r.calls_limit = -1);

  select * into v_r
    from public.check_and_count_ai_usage(v_user_id, '__test_b__', 1, true, true);
  insert into test_results (test, attendu, obtenu, ok)
    values ('(b3) admin appel 3',
            'allowed=true, calls_today=3, calls_limit=-1',
            format('allowed=%s, calls_today=%s, calls_limit=%s',
                   v_r.allowed, v_r.calls_today, v_r.calls_limit),
            v_r.allowed = true and v_r.calls_today = 3 and v_r.calls_limit = -1);

  -- ─── (e) record_ai_tokens ajoute tokens + cost sur la row du jour ───
  perform public.record_ai_tokens(v_user_id, '__test_a__',
                                  1500, 400, 0.000525::numeric, 0, 0);
  select tokens_in, tokens_out, cost_usd
    into v_tok_in, v_tok_out, v_cost
    from public.ai_usage
    where user_id = v_user_id and feature = '__test_a__' and usage_date = v_paris;
  insert into test_results (test, attendu, obtenu, ok)
    values ('(e) record_ai_tokens applique tokens + cost',
            'tokens_in=1500, tokens_out=400, cost_usd=0.000525',
            format('tokens_in=%s, tokens_out=%s, cost_usd=%s',
                   v_tok_in, v_tok_out, v_cost),
            v_tok_in = 1500 and v_tok_out = 400 and v_cost = 0.000525);

  -- ─── (d) usage_date = date Paris, pas UTC ───────────────────────────
  select usage_date into v_stored
    from public.ai_usage
    where user_id = v_user_id and feature = '__test_a__' and usage_date = v_paris;
  insert into test_results (test, attendu, obtenu, ok)
    values ('(d) usage_date = date Paris',
            format('usage_date = %s (Paris)', v_paris),
            format('stored=%s, paris=%s, utc=%s',
                   v_stored, v_paris, (now() at time zone 'UTC')::date),
            v_stored = v_paris);

  -- ─── Cleanup final : zéro trace dans ai_usage ───────────────────────
  delete from public.ai_usage
    where user_id = v_user_id and feature like '__test_%';
end $$;

-- ─── 3. Tests (c) permissions — indépendants du user, pur has_function_privilege
insert into test_results (test, attendu, obtenu, ok) values
  ('(c1) check_and_count_ai_usage.EXECUTE pour authenticated',
   'false',
   has_function_privilege('authenticated',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE')::text,
   has_function_privilege('authenticated',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE') = false),

  ('(c2) check_and_count_ai_usage.EXECUTE pour anon',
   'false',
   has_function_privilege('anon',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE')::text,
   has_function_privilege('anon',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE') = false),

  ('(c3) check_and_count_ai_usage.EXECUTE pour service_role',
   'true',
   has_function_privilege('service_role',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE')::text,
   has_function_privilege('service_role',
     'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)',
     'EXECUTE') = true),

  ('(c4) record_ai_tokens.EXECUTE pour authenticated',
   'false',
   has_function_privilege('authenticated',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE')::text,
   has_function_privilege('authenticated',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE') = false),

  ('(c5) record_ai_tokens.EXECUTE pour anon',
   'false',
   has_function_privilege('anon',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE')::text,
   has_function_privilege('anon',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE') = false),

  ('(c6) record_ai_tokens.EXECUTE pour service_role',
   'true',
   has_function_privilege('service_role',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE')::text,
   has_function_privilege('service_role',
     'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)',
     'EXECUTE') = true),

  ('(c7) _atp_today_paris.EXECUTE pour authenticated (helper pur)',
   'true',
   has_function_privilege('authenticated',
     'public._atp_today_paris()', 'EXECUTE')::text,
   has_function_privilege('authenticated',
     'public._atp_today_paris()', 'EXECUTE') = true),

  ('(c8) _atp_today_paris.EXECUTE pour anon (helper pur)',
   'true',
   has_function_privilege('anon',
     'public._atp_today_paris()', 'EXECUTE')::text,
   has_function_privilege('anon',
     'public._atp_today_paris()', 'EXECUTE') = true);

-- ─── 4. Résumé synthèse ────────────────────────────────────────────────────
insert into test_results (test, attendu, obtenu, ok)
  select
    '>>> RÉSUMÉ GLOBAL',
    'tous les tests ok=true',
    format('%s/%s passés', count(*) filter (where ok), count(*)),
    count(*) filter (where ok) = count(*)
  from test_results
  where test not like '>>>%';

-- ─── 5. Vérif anti-pollution : zéro row __test_ dans ai_usage ──────────────
insert into test_results (test, attendu, obtenu, ok)
  select
    '>>> ANTI-POLLUTION ai_usage',
    'zéro row __test_* en base',
    format('%s rows restantes', count(*)),
    count(*) = 0
  from public.ai_usage
  where feature like '__test_%';

-- ─── 6. AFFICHAGE FINAL (unique SELECT que le SQL Editor rend tabulairement)
select
  seq      as "#",
  test     as "test",
  attendu  as "attendu",
  obtenu   as "obtenu",
  case when ok then '✓ OK' else '✗ FAIL' end as "résultat"
from test_results
order by seq;
