-- ═══════════════════════════════════════════════════════════════
-- WHOP — JOURNAL DES RÉCONCILIATIONS D'ACCÈS
--
-- Table d'audit alimentée par :
--   • /api/admin/whop-sync-report?apply=1 (déclenchement admin manuel)
--   • /api/cron/whop-reconcile            (tâche quotidienne Vercel)
--
-- Chaque ligne décrit UN changement réellement appliqué à un profil :
-- passage whop_subscription_active true↔false, OU remplissage d'un
-- whop_user_id manquant. Les snapshots before/after sont stockés en
-- jsonb pour que l'admin puisse voir ce qui a bougé sans rejouer.
--
-- POURQUOI SANS POLICY : la table est strictement d'exploitation —
-- lecture/écriture via SUPABASE_SERVICE_ROLE_KEY uniquement. RLS est
-- activée mais sans policy → zéro accès pour anon/authenticated, les
-- traders ne peuvent pas lire leur propre historique d'ajustement
-- (c'est de l'information opérationnelle admin, pas user-facing).
-- Le service_role bypass la RLS, donc la route et le cron écrivent OK.
--
-- SÉCURITÉ DONNÉES :
--   • Aucun DROP, DELETE, truncate.
--   • CASCADE sur profile_id : si un profile est supprimé, son journal
--     disparaît (pas de référence orpheline). applied_by_user_id en
--     ON DELETE SET NULL → on garde la ligne même si l'admin est parti.
--   • Idempotent : CREATE TABLE IF NOT EXISTS, indexes IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whop_sync_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  -- NULL pour le cron (pas d'admin déclencheur), sinon l'admin qui a POST.
  applied_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('admin_manual','cron_daily')),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'set_subscription_active' | 'set_subscription_inactive' | 'link_whop_user_id'
  change_kind text NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text
);

ALTER TABLE public.whop_sync_journal ENABLE ROW LEVEL SECURITY;
-- Pas de policy : accès réservé service_role via API routes serveur.

-- Index pour reconstruire l'historique d'un profil (support admin).
CREATE INDEX IF NOT EXISTS idx_whop_sync_journal_profile_applied
  ON public.whop_sync_journal (profile_id, applied_at DESC);

-- Index pour lister les derniers batches (cron + manuels).
CREATE INDEX IF NOT EXISTS idx_whop_sync_journal_applied_at
  ON public.whop_sync_journal (applied_at DESC);
