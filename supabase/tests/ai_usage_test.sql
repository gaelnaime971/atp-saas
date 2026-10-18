-- ============================================================================
-- Script de test — à exécuter dans Supabase Dashboard → SQL Editor
-- APRÈS avoir run la migration 20261019000001_ai_usage.sql.
-- ============================================================================
-- Prouve les 4 invariants du socle quota IA :
--   (a) limite 2 → allowed true, true, false — le compteur reste à 2
--   (b) admin → toujours allowed, compteur incrémenté sans plafond
--   (c) authenticated et anon → EXECUTE refusé sur les 2 fonctions
--   (d) usage_date = date de Paris (pas UTC)
--
-- Le test crée un user bidon dans auth.users puis clean à la fin — il peut
-- être relancé sans effet de bord.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- Setup : un user de test (bypasse les contraintes profiles via RLS off)
-- ───────────────────────────────────────────────────────────────────────────
begin;

-- Génère un uuid stable pour tout le test
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Clean résidus d'un test précédent
  delete from public.ai_usage where user_id = v_user_id;

  -- Un profile minimal (role trader) — bypasse la FK auth.users via la cascade
  insert into public.profiles (id, email, role, full_name)
    values (v_user_id, '[email protected]', 'trader', 'Test')
    on conflict (id) do update set role = 'trader';
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (a) Limite 2 : true, true, false — compteur plafonne à 2
-- ───────────────────────────────────────────────────────────────────────────
\echo '=== TEST (a) — limite 2 : true, true, false, compteur reste à 2 ==='

select 'appel 1' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-a', 2, false, true
);
-- Attendu : allowed=true, calls_today=1, calls_limit=2

select 'appel 2' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-a', 2, false, true
);
-- Attendu : allowed=true, calls_today=2, calls_limit=2

select 'appel 3' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-a', 2, false, true
);
-- Attendu : allowed=false, calls_today=2 (plafonné), calls_limit=2

select 'appel 4' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-a', 2, false, true
);
-- Attendu : allowed=false, calls_today=2 (toujours plafonné)

select 'row finale' as step, calls_count, usage_date
  from public.ai_usage
  where user_id = '00000000-0000-0000-0000-000000000001'::uuid
    and feature = 'test-feature-a';
-- Attendu : calls_count=2, usage_date = (now() at time zone 'Europe/Paris')::date

-- ───────────────────────────────────────────────────────────────────────────
-- (b) Admin : toujours allowed, compteur incrémenté sans plafond
-- ───────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== TEST (b) — admin : toujours true, compteur incrémenté ==='

select 'admin appel 1' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-b', 1, true, true
);
-- Attendu : allowed=true, calls_today=1, calls_limit=-1 (illimité)

select 'admin appel 2' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-b', 1, true, true
);
-- Attendu : allowed=true, calls_today=2, calls_limit=-1 (dépasse limite 1 mais admin)

select 'admin appel 3' as step, * from public.check_and_count_ai_usage(
  '00000000-0000-0000-0000-000000000001'::uuid, 'test-feature-b', 1, true, true
);
-- Attendu : allowed=true, calls_today=3, calls_limit=-1

-- ───────────────────────────────────────────────────────────────────────────
-- (c) Permissions : authenticated/anon refusés, service_role autorisé
-- ───────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== TEST (c) — permissions EXECUTE sur les 2 fonctions ==='

select
  'check_and_count_ai_usage'                                        as function_name,
  has_function_privilege('authenticated', 'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)', 'EXECUTE') as auth_execute,
  has_function_privilege('anon',          'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)', 'EXECUTE') as anon_execute,
  has_function_privilege('service_role',  'public.check_and_count_ai_usage(uuid, text, int, boolean, boolean)', 'EXECUTE') as svc_execute;
-- Attendu : auth_execute=false, anon_execute=false, svc_execute=true

select
  'record_ai_tokens'                                                 as function_name,
  has_function_privilege('authenticated', 'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)', 'EXECUTE') as auth_execute,
  has_function_privilege('anon',          'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)', 'EXECUTE') as anon_execute,
  has_function_privilege('service_role',  'public.record_ai_tokens(uuid, text, int, int, numeric, int, int)', 'EXECUTE') as svc_execute;
-- Attendu : auth_execute=false, anon_execute=false, svc_execute=true

-- Bonus : _atp_today_paris doit rester accessible à tous (helper pur)
select
  '_atp_today_paris'                                                 as function_name,
  has_function_privilege('authenticated', 'public._atp_today_paris()', 'EXECUTE') as auth_execute,
  has_function_privilege('anon',          'public._atp_today_paris()', 'EXECUTE') as anon_execute,
  has_function_privilege('service_role',  'public._atp_today_paris()', 'EXECUTE') as svc_execute;
-- Attendu : les 3 à true

-- ───────────────────────────────────────────────────────────────────────────
-- (d) usage_date = date de Paris (pas UTC)
-- ───────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== TEST (d) — usage_date reflète Europe/Paris ==='

select
  usage_date                                                   as stored_date,
  public._atp_today_paris()                                    as helper_paris,
  (now() at time zone 'Europe/Paris')::date                    as inline_paris,
  (now() at time zone 'UTC')::date                             as inline_utc,
  usage_date = (now() at time zone 'Europe/Paris')::date       as matches_paris,
  usage_date = (now() at time zone 'UTC')::date                as matches_utc
from public.ai_usage
where user_id = '00000000-0000-0000-0000-000000000001'::uuid
order by usage_date desc
limit 1;
-- Attendu :
--   matches_paris=true
--   matches_utc=true quand les 2 dates coïncident (jour), false entre 00h00
--   et 01h00/02h00 Paris où UTC est encore la veille → la différence prouve
--   que c'est bien Paris qui est stocké, pas UTC (surtout tester ce cas en
--   début de nuit si tu veux la preuve absolue).

-- ───────────────────────────────────────────────────────────────────────────
-- (e) Bonus : record_ai_tokens ajoute bien tokens/cost sur la row du jour
-- ───────────────────────────────────────────────────────────────────────────
\echo ''
\echo '=== TEST (e) BONUS — record_ai_tokens met à jour tokens + cost ==='

select public.record_ai_tokens(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'test-feature-a',
  1500, 400, 0.000525, 0, 0
);
select 'après record' as step, tokens_in, tokens_out, cost_usd
  from public.ai_usage
  where user_id = '00000000-0000-0000-0000-000000000001'::uuid
    and feature = 'test-feature-a';
-- Attendu : tokens_in=1500, tokens_out=400, cost_usd=0.000525

-- ───────────────────────────────────────────────────────────────────────────
-- Cleanup
-- ───────────────────────────────────────────────────────────────────────────
rollback;
\echo ''
\echo '✓ Tests terminés. ROLLBACK → aucune row persistée dans ai_usage.'
