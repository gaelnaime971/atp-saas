-- ============================================================================
-- Jarvis 3F.1 : règles perso du trader + journal des événements de session
-- ============================================================================
-- Deux tables + 1 RPC. 100 % idempotent (if not exists / create or replace
-- / drop policy if exists), passe sans erreur même rejoué.
--
-- Les règles perso définissent les garde-fous du trader. Elles ne peuvent
-- QUE durcir la méthode ATP par défaut, jamais l'assouplir — contrôle
-- côté RPC public.update_trader_rules(payload).
--
-- Les événements de session sont la mémoire courte de Jarvis sur la
-- journée (trades déclarés, état Joker, règles déjà annoncées). Insertions
-- par les routes serveur en SECURITY DEFINER, lecture only côté client via
-- RLS "own rows".
-- ============================================================================

-- ─── 1. Table trader_personal_rules ────────────────────────────────────────
create table if not exists public.trader_personal_rules (
  user_id                      uuid primary key references public.profiles(id) on delete cascade,

  -- 0 (ou NULL après coup) = non renseigné → Jarvis compte les trades en
  -- $ et demande une fois le risque. Pas de blocage de la session.
  risk_per_trade_usd           numeric(10, 2) not null default 0 check (risk_per_trade_usd >= 0),

  -- Taille de compte en $ — utilisée pour borner risk_per_trade_usd à
  -- 0,4 % max par la RPC. 0 (ou NULL) = non renseigné.
  account_size_usd             numeric(12, 2) not null default 0 check (account_size_usd >= 0),

  max_trades                   int            not null default 3 check (max_trades between 1 and 5),
  stop_after_losses            int            not null default 3 check (stop_after_losses between 1 and 5),

  -- target_r : objectif de session. Durcir = s'arrêter PLUS TÔT = valeur
  -- plus BASSE. Entre 0,5 et 2 (défaut ATP). Viser +5 R serait assouplir.
  target_r                     numeric(4, 2)  not null default 2 check (target_r between 0.5 and 2),

  stop_after_first_win         boolean        not null default true,
  stop_after_loss_win          boolean        not null default true,
  same_config_hard_stop_after  int            not null default 2 check (same_config_hard_stop_after between 1 and 3),

  -- Durcir = exiger un ratio PLUS ÉLEVÉ. Défaut ATP 2.
  min_ratio                    numeric(4, 2)  not null default 2 check (min_ratio >= 2),

  updated_at                   timestamptz    not null default now()
);

comment on table public.trader_personal_rules is
'Garde-fous perso par trader (Jarvis 3F). Modifications uniquement via la RPC update_trader_rules qui applique « durcir, jamais assouplir ».';

alter table public.trader_personal_rules enable row level security;

drop policy if exists "trader_rules_select_own"   on public.trader_personal_rules;
drop policy if exists "trader_rules_update_own"   on public.trader_personal_rules;
drop policy if exists "trader_rules_insert_own"   on public.trader_personal_rules;
drop policy if exists "trader_rules_deny_delete"  on public.trader_personal_rules;

create policy "trader_rules_select_own" on public.trader_personal_rules
  for select using (auth.uid() = user_id);

-- Pas d'INSERT/UPDATE/DELETE direct depuis le client : tout passe par
-- la RPC SECURITY DEFINER qui valide « durcir, jamais assouplir ».

-- ─── 2. Table jarvis_session_events ────────────────────────────────────────
create table if not exists public.jarvis_session_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  session_date  date not null default public._atp_today_paris(),

  -- 'trade'          : trade déclaré par le trader (toujours 'declared')
  -- 'joker_state'    : étape de la machine Joker (armed/choch_m1/...)
  -- 'rule_triggered' : règle du moteur qui a été annoncée (anti-répétition)
  -- 'session_end'    : marqueur de fin de session (optionnel)
  type          text not null check (type in ('trade', 'joker_state', 'rule_triggered', 'session_end')),

  -- Pour 'trade' : { result_r?, result_usd?, instrument?, side?, config?, pending?, source: 'declared' }
  -- Pour 'joker_state'    : { step: 'armed' | 'choch_m1' | 'choch_m5' | 'ready' | 'cleared' }
  -- Pour 'rule_triggered' : { key: 'first_win' | ... }
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);

comment on table public.jarvis_session_events is
'Mémoire courte de Jarvis sur la journée (trades, état Joker, règles annoncées). Grain : 1 ligne par événement. INSERT via les routes serveur service_role.';

create index if not exists jarvis_session_events_user_date_idx
  on public.jarvis_session_events (user_id, session_date desc, created_at desc);

alter table public.jarvis_session_events enable row level security;

drop policy if exists "session_events_select_own" on public.jarvis_session_events;

create policy "session_events_select_own" on public.jarvis_session_events
  for select using (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE/DELETE côté client : les routes serveur
-- (service_role) écrivent et effacent (bouton reset testeur).

-- ─── 3. RPC update_trader_rules : « durcir, jamais assouplir » ─────────────
create or replace function public.update_trader_rules(payload jsonb)
returns public.trader_personal_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_current       public.trader_personal_rules;
  v_new           public.trader_personal_rules;
  v_risk_cap_usd  numeric;
  v_risk_usd      numeric;
  v_account_usd   numeric;
begin
  if v_user_id is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;

  -- Charge la ligne existante OU les défauts (nouveau trader)
  select * into v_current from public.trader_personal_rules where user_id = v_user_id;
  if not found then
    v_current.user_id                      := v_user_id;
    v_current.risk_per_trade_usd           := 0;
    v_current.account_size_usd             := 0;
    v_current.max_trades                   := 3;
    v_current.stop_after_losses            := 3;
    v_current.target_r                     := 2;
    v_current.stop_after_first_win         := true;
    v_current.stop_after_loss_win          := true;
    v_current.same_config_hard_stop_after  := 2;
    v_current.min_ratio                    := 2;
  end if;

  -- Nouvelle valeur = payload ∘ ligne actuelle (champs non envoyés = inchangés)
  v_new := v_current;
  if payload ? 'risk_per_trade_usd'          then v_new.risk_per_trade_usd          := (payload->>'risk_per_trade_usd')::numeric; end if;
  if payload ? 'account_size_usd'            then v_new.account_size_usd            := (payload->>'account_size_usd')::numeric;   end if;
  if payload ? 'max_trades'                  then v_new.max_trades                  := (payload->>'max_trades')::int;              end if;
  if payload ? 'stop_after_losses'           then v_new.stop_after_losses           := (payload->>'stop_after_losses')::int;       end if;
  if payload ? 'target_r'                    then v_new.target_r                    := (payload->>'target_r')::numeric;             end if;
  if payload ? 'stop_after_first_win'        then v_new.stop_after_first_win        := (payload->>'stop_after_first_win')::boolean; end if;
  if payload ? 'stop_after_loss_win'         then v_new.stop_after_loss_win         := (payload->>'stop_after_loss_win')::boolean;  end if;
  if payload ? 'same_config_hard_stop_after' then v_new.same_config_hard_stop_after := (payload->>'same_config_hard_stop_after')::int; end if;
  if payload ? 'min_ratio'                   then v_new.min_ratio                   := (payload->>'min_ratio')::numeric;             end if;

  -- ─── VALIDATIONS « durcir, jamais assouplir » ────────────────────────────
  -- (Défauts ATP : max_trades 3, stop_after_losses 3, target_r 2,
  --  stop_after_first_win true, stop_after_loss_win true,
  --  same_config_hard_stop_after 2, min_ratio 2.)
  if v_new.max_trades > 3 then
    raise exception 'max_trades ne peut dépasser 3 (défaut ATP, durcir = baisser)' using errcode = '22023';
  end if;
  if v_new.stop_after_losses > 3 then
    raise exception 'stop_after_losses ne peut dépasser 3 (défaut ATP, durcir = baisser)' using errcode = '22023';
  end if;
  if v_new.same_config_hard_stop_after > 2 then
    raise exception 'same_config_hard_stop_after ne peut dépasser 2 (défaut ATP, durcir = baisser)' using errcode = '22023';
  end if;

  -- target_r : durcir = s'arrêter plus tôt = valeur plus BASSE. Entre 0,5 et 2.
  if v_new.target_r > 2 then
    raise exception 'target_r ne peut dépasser 2 (défaut ATP, durcir = baisser pour couper plus tôt)' using errcode = '22023';
  end if;
  if v_new.target_r < 0.5 then
    raise exception 'target_r doit rester ≥ 0,5 R' using errcode = '22023';
  end if;

  if v_new.min_ratio < 2 then
    raise exception 'min_ratio ne peut descendre sous 2 (défaut ATP, durcir = monter)' using errcode = '22023';
  end if;

  if v_new.stop_after_first_win = false and v_current.stop_after_first_win = true then
    raise exception 'stop_after_first_win ne peut être désactivé (règle ATP)' using errcode = '22023';
  end if;
  if v_new.stop_after_loss_win = false and v_current.stop_after_loss_win = true then
    raise exception 'stop_after_loss_win ne peut être désactivé (règle ATP)' using errcode = '22023';
  end if;

  -- risk_per_trade_usd ≤ 0,4 % × account_size_usd (si les deux renseignés)
  v_risk_usd    := v_new.risk_per_trade_usd;
  v_account_usd := v_new.account_size_usd;
  if v_risk_usd > 0 and v_account_usd > 0 then
    v_risk_cap_usd := v_account_usd * 0.004; -- 0,4 %
    if v_risk_usd > v_risk_cap_usd then
      raise exception 'risk_per_trade_usd (% .2f $) dépasse 0,4 %% du capital (% .2f $)',
        v_risk_usd, v_risk_cap_usd using errcode = '22023';
    end if;
  end if;

  v_new.updated_at := now();

  -- Upsert
  insert into public.trader_personal_rules as t (
    user_id, risk_per_trade_usd, account_size_usd, max_trades, stop_after_losses,
    target_r, stop_after_first_win, stop_after_loss_win,
    same_config_hard_stop_after, min_ratio, updated_at
  ) values (
    v_user_id, v_new.risk_per_trade_usd, v_new.account_size_usd, v_new.max_trades, v_new.stop_after_losses,
    v_new.target_r, v_new.stop_after_first_win, v_new.stop_after_loss_win,
    v_new.same_config_hard_stop_after, v_new.min_ratio, v_new.updated_at
  )
  on conflict (user_id) do update set
    risk_per_trade_usd          = excluded.risk_per_trade_usd,
    account_size_usd            = excluded.account_size_usd,
    max_trades                  = excluded.max_trades,
    stop_after_losses           = excluded.stop_after_losses,
    target_r                    = excluded.target_r,
    stop_after_first_win        = excluded.stop_after_first_win,
    stop_after_loss_win         = excluded.stop_after_loss_win,
    same_config_hard_stop_after = excluded.same_config_hard_stop_after,
    min_ratio                   = excluded.min_ratio,
    updated_at                  = excluded.updated_at
  returning * into v_new;

  return v_new;
end
$$;

revoke execute on function public.update_trader_rules(jsonb) from public;
revoke execute on function public.update_trader_rules(jsonb) from anon;
grant  execute on function public.update_trader_rules(jsonb) to authenticated;
