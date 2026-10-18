-- ============================================================================
-- Socle quota IA — table + 2 fonctions atomiques + helper date Paris
-- ============================================================================
-- Alimente toutes les routes qui appellent Groq (coach-chat, coach-analysis,
-- chart, news, asset-analysis, stock-ai-*, jarvis à venir).
--
-- Grain : 1 row par (user_id, feature, usage_date) → agrégat journalier,
-- UPSERT trivial via ON CONFLICT.
--
-- Jour = Europe/Paris PARTOUT : _atp_today_paris() est la seule définition
-- utilisée par le DEFAULT de la table ET les 2 fonctions check/record. Ça
-- évite qu'un check à 23:58 UTC (00:58 Paris lendemain) touche une row
-- différente du record qui suit.
--
-- Sécurité : les 2 fonctions sont SECURITY DEFINER + search_path figé +
-- EXECUTE révoqué à anon/authenticated/PUBLIC et accordé uniquement à
-- service_role. Le client Supabase (RPC) ne peut PAS appeler ces fonctions
-- directement — tout passe par les API server-side côté Next.js.
-- ============================================================================

-- ─── 1. Helper date Paris ───────────────────────────────────────────────────
-- STABLE (pas IMMUTABLE) car dépend de now(). Appelable dans un DEFAULT de
-- colonne ET dans les 2 fonctions, pour cohérence absolue.
create or replace function public._atp_today_paris()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Paris')::date
$$;

-- ─── 2. Table ai_usage ──────────────────────────────────────────────────────
create table public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  feature         text not null,                 -- 'coach-chat', 'coach-analysis', 'jarvis'...
  usage_date      date not null default public._atp_today_paris(),

  -- Compteurs incrémentés atomiquement par check_and_count_ai_usage()
  calls_count     int not null default 0,

  -- Tokens + coût enregistrés APRÈS retour fournisseur par record_ai_tokens()
  tokens_in       bigint not null default 0,
  tokens_out      bigint not null default 0,
  cost_usd        numeric(10, 6) not null default 0,

  -- Prêts pour Jarvis vocal (unités spécifiques voix, non utilisés par le texte)
  audio_seconds   int not null default 0,
  tts_chars       bigint not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, feature, usage_date)
);

create index ai_usage_user_date_idx    on public.ai_usage (user_id, usage_date desc, feature);
create index ai_usage_feature_date_idx on public.ai_usage (feature, usage_date desc);

-- Trigger updated_at (pattern projet)
create or replace function update_ai_usage_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ai_usage_updated_at on public.ai_usage;
create trigger ai_usage_updated_at
  before update on public.ai_usage
  for each row execute function update_ai_usage_updated_at();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
-- Trader lit SES lignes, admin voit tout.
-- Aucune policy INSERT/UPDATE/DELETE côté client — tout passe par les
-- fonctions SECURITY DEFINER (service_role only).
alter table public.ai_usage enable row level security;

create policy "users_select_own_usage" on public.ai_usage
  for select using (auth.uid() = user_id);

create policy "admin_select_all_usage" on public.ai_usage
  for select using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

-- ─── 4. check_and_count_ai_usage — check + increment ATOMIQUE ───────────────
-- Pattern anti-race : INSERT ... ON CONFLICT DO UPDATE SET ... WHERE condition
-- → l'incrément est conditionnel sur `calls_count < limit` au niveau SQL.
-- Si N requêtes concurrentes arrivent, Postgres les sérialise sur la ligne,
-- la (N+1)e dont l'UPDATE est filtré par le WHERE → FOUND = false → refus.
-- Impossible qu'une 21e requête passe sur une limite 20.
create or replace function public.check_and_count_ai_usage(
  p_user_id   uuid,
  p_feature   text,
  p_limit     int,
  p_is_admin  boolean default false,
  p_enforce   boolean default true
) returns table (
  allowed     boolean,
  calls_today int,
  calls_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public._atp_today_paris();
  v_calls int;
begin
  -- CAS 1 : admin OU mode non-enforce (observe) → incrément INCONDITIONNEL,
  -- toujours allowed. Permet de voir le "vrai usage" sans plafonner le
  -- compteur (sinon on ne saurait pas si la limite est bien calibrée).
  if p_is_admin or not p_enforce then
    insert into public.ai_usage (user_id, feature, usage_date, calls_count)
      values (p_user_id, p_feature, v_today, 1)
      on conflict (user_id, feature, usage_date)
      do update set calls_count = ai_usage.calls_count + 1, updated_at = now()
      returning calls_count into v_calls;
    return query select true,
                        v_calls,
                        case when p_is_admin then -1 else p_limit end;
    return;
  end if;

  -- CAS 2 : non-admin + enforce + limite <= 0 → refus immédiat (sécurité :
  -- une feature mal configurée avec limite 0 bloque, ne laisse pas passer).
  if p_limit <= 0 then
    select coalesce(calls_count, 0) into v_calls
      from public.ai_usage
      where user_id = p_user_id and feature = p_feature and usage_date = v_today;
    return query select false, coalesce(v_calls, 0), p_limit;
    return;
  end if;

  -- CAS 3 : non-admin + enforce + limite > 0 → incrément CONDITIONNEL.
  insert into public.ai_usage (user_id, feature, usage_date, calls_count)
    values (p_user_id, p_feature, v_today, 1)
    on conflict (user_id, feature, usage_date)
    do update set calls_count = ai_usage.calls_count + 1, updated_at = now()
    where ai_usage.calls_count < p_limit
    returning calls_count into v_calls;

  if not found then
    -- UPDATE filtré par WHERE (quota plein) → relire pour le message user.
    select calls_count into v_calls
      from public.ai_usage
      where user_id = p_user_id and feature = p_feature and usage_date = v_today;
    return query select false, v_calls, p_limit;
    return;
  end if;

  return query select true, v_calls, p_limit;
end $$;

-- ─── 5. record_ai_tokens — enregistre les tokens APRÈS retour fournisseur ──
-- Appelé via Next.js after() → ne rallonge pas la réponse client.
create or replace function public.record_ai_tokens(
  p_user_id       uuid,
  p_feature       text,
  p_tokens_in     int default 0,
  p_tokens_out    int default 0,
  p_cost_usd      numeric default 0,
  p_audio_seconds int default 0,
  p_tts_chars     int default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set
    tokens_in     = tokens_in     + coalesce(p_tokens_in, 0),
    tokens_out    = tokens_out    + coalesce(p_tokens_out, 0),
    cost_usd      = cost_usd      + coalesce(p_cost_usd, 0),
    audio_seconds = audio_seconds + coalesce(p_audio_seconds, 0),
    tts_chars     = tts_chars     + coalesce(p_tts_chars, 0),
    updated_at    = now()
  where user_id = p_user_id
    and feature = p_feature
    and usage_date = public._atp_today_paris();
$$;

-- ─── 6. GRANTS stricts : service_role only ─────────────────────────────────
-- Sans ça, un trader connecté peut via supabase.rpc() appeler
-- check_and_count_ai_usage avec p_user_id d'un autre user ou p_is_admin=true.
revoke all on function public.check_and_count_ai_usage(uuid, text, int, boolean, boolean) from public, anon, authenticated;
grant execute on function public.check_and_count_ai_usage(uuid, text, int, boolean, boolean) to service_role;

revoke all on function public.record_ai_tokens(uuid, text, int, int, numeric, int, int) from public, anon, authenticated;
grant execute on function public.record_ai_tokens(uuid, text, int, int, numeric, int, int) to service_role;

-- _atp_today_paris reste exécutable par tous (helper pur, aucune donnée sensible)
grant execute on function public._atp_today_paris() to anon, authenticated, service_role;

-- Commentaires de doc en base
comment on table public.ai_usage is
  'Compteurs quotidiens d''usage IA par (user, feature) — alimentés par les 2 fonctions SECURITY DEFINER check_and_count_ai_usage et record_ai_tokens.';
comment on function public.check_and_count_ai_usage(uuid, text, int, boolean, boolean) is
  'Check + increment ATOMIQUE avant appel fournisseur IA. Retourne allowed=false si quota atteint. service_role only.';
comment on function public.record_ai_tokens(uuid, text, int, int, numeric, int, int) is
  'Enregistre tokens + coût APRÈS appel fournisseur IA (via next/after). service_role only.';
