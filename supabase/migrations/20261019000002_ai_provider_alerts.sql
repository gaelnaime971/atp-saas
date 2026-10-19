-- ============================================================================
-- Anti-spam alertes email "IA en panne durable" (étape 1E)
-- ============================================================================
-- Alimente lib/ai/provider-alerts.ts côté Next.js. 1 ligne par (type de
-- panne, modèle) ; une alerte peut repartir seulement si la précédente a
-- plus de X heures.
--
-- Idempotent : passe sans erreur même si déjà appliqué (create/or replace
-- partout, if not exists sur la table).
--
-- Sécurité : la RPC est SECURITY DEFINER + search_path figé + EXECUTE
-- révoqué à anon/authenticated/PUBLIC et accordé uniquement à service_role.
-- Table en RLS deny-all, aucun client ne peut la toucher directement.
-- ============================================================================

-- ─── 1. Table ai_provider_alerts ───────────────────────────────────────────
create table if not exists public.ai_provider_alerts (
  kind         text        not null,
  -- '' pour alertes non liées à un modèle précis (auth, billing)
  model        text        not null default '',
  last_sent_at timestamptz not null default now(),
  primary key (kind, model)
);

comment on table public.ai_provider_alerts is
'Anti-spam alertes email admin "IA en panne durable" (étape 1E). 1 ligne par (type de panne, modèle). Mise à jour atomique via maybe_send_ai_alert().';

-- ─── 2. RLS deny-all ───────────────────────────────────────────────────────
alter table public.ai_provider_alerts enable row level security;

drop policy if exists "deny all"               on public.ai_provider_alerts;
drop policy if exists "ai_alerts_deny_client"  on public.ai_provider_alerts;
create policy "ai_alerts_deny_client" on public.ai_provider_alerts for all using (false);

-- ─── 3. RPC atomique maybe_send_ai_alert ───────────────────────────────────
-- Returns true si l'alerte "a le droit" d'être envoyée maintenant (soit
-- première fois pour ce (kind, model), soit la fenêtre anti-spam est
-- écoulée). Returns false si trop récente — l'appelant ne doit alors
-- RIEN envoyer.
--
-- Atomique : INSERT ... ON CONFLICT DO UPDATE WHERE last_sent_at < (now -
-- window). GET DIAGNOSTICS row_count distingue :
--   - 1 = insert OK (nouvelle combo) ou update OK (fenêtre écoulée) → true
--   - 0 = conflit sans update (fenêtre pas écoulée) → false
create or replace function public.maybe_send_ai_alert(
  p_kind         text,
  p_model        text,
  p_window_hours int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now();
  v_window   interval    := make_interval(hours => p_window_hours);
  v_affected int;
begin
  insert into public.ai_provider_alerts (kind, model, last_sent_at)
  values (p_kind, coalesce(p_model, ''), v_now)
  on conflict (kind, model) do update
    set last_sent_at = v_now
    where ai_provider_alerts.last_sent_at < (v_now - v_window);

  get diagnostics v_affected = row_count;
  return v_affected > 0;
end $$;

revoke execute on function public.maybe_send_ai_alert(text, text, int) from public;
revoke execute on function public.maybe_send_ai_alert(text, text, int) from anon;
revoke execute on function public.maybe_send_ai_alert(text, text, int) from authenticated;
grant  execute on function public.maybe_send_ai_alert(text, text, int) to service_role;
