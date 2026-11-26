-- ═══════════════════════════════════════════════════════════════
-- Accès au dashboard appliqué AUSSI dans la base (RLS).
--
-- La règle d'accès (lib/access/member-access.ts) protège les pages
-- /dashboard (proxy.ts) et les routes /api (requireMember). Mais le SPA
-- lit aussi Supabase directement avec la session : les règles de lecture
-- « tout compte connecté » (ou « tout le monde ») laissaient un ancien
-- membre resté connecté lire le contenu partagé.
--
-- 1. public.has_dashboard_access() : MÊME règle que member-access.ts
--      admin → oui ; whop_subscription_active → oui ;
--      manual_access avec manual_access_until vide ou ≥ aujourd'hui
--      (jour de Paris, date incluse) → oui ; sinon (dont pas de profil,
--      pas de session) → non.
--    has_dashboard_access_for(uuid) porte la règle ; elle n'est PAS
--    exécutable par les comptes (pas de sondage de l'accès d'autrui),
--    seulement par has_dashboard_access() et le SQL Editor.
-- 2. Les règles de LECTURE ouvertes à tout compte connecté / à tous sont
--    remplacées par has_dashboard_access(), appelée via (SELECT …) pour
--    n'être évaluée qu'une fois par requête et non par ligne. Les règles « ses propres
--    lignes » et les règles admin ne changent pas : un ancien membre
--    garde l'accès à ses propres données.
-- 3. Tableau de vérification (dernier résultat affiché).
--
-- Run this in the Supabase SQL Editor. Relançable.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_dashboard_access_for(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT p.role = 'admin'
        OR p.whop_subscription_active IS TRUE
        OR (p.manual_access IS TRUE
            AND (p.manual_access_until IS NULL
                 OR p.manual_access_until >= (now() AT TIME ZONE 'Europe/Paris')::date))
      FROM public.profiles p
     WHERE p.id = uid
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.has_dashboard_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_dashboard_access_for(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.has_dashboard_access_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_dashboard_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_dashboard_access() TO anon, authenticated;

-- ─── Règles de lecture ──────────────────────────────────────────

-- resources (Formation, Ressources, Documents)
DROP POLICY IF EXISTS "resources visible to all authenticated" ON public.resources;
DROP POLICY IF EXISTS "resources visible to members" ON public.resources;
CREATE POLICY "resources visible to members" ON public.resources
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- live_trades (Récap trade live) — était ouvert à tous, sans session
DROP POLICY IF EXISTS "live_trades_select" ON public.live_trades;
DROP POLICY IF EXISTS "live_trades visible to members" ON public.live_trades;
CREATE POLICY "live_trades visible to members" ON public.live_trades
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- skill_items (Bilan de compétences) — était ouvert à tous, sans session
DROP POLICY IF EXISTS "skill_items_select" ON public.skill_items;
DROP POLICY IF EXISTS "skill_items visible to members" ON public.skill_items;
CREATE POLICY "skill_items visible to members" ON public.skill_items
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- app_settings — était ouvert à tous, sans session (lu par admin › Réglages)
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings visible to members" ON public.app_settings;
CREATE POLICY "app_settings visible to members" ON public.app_settings
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- coaching_availability / coaching_date_overrides (créneaux de coaching)
DROP POLICY IF EXISTS "Anyone authenticated can view active availability" ON public.coaching_availability;
DROP POLICY IF EXISTS "coaching_availability visible to members" ON public.coaching_availability;
CREATE POLICY "coaching_availability visible to members" ON public.coaching_availability
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

DROP POLICY IF EXISTS "Authenticated can view overrides" ON public.coaching_date_overrides;
DROP POLICY IF EXISTS "coaching_date_overrides visible to members" ON public.coaching_date_overrides;
CREATE POLICY "coaching_date_overrides visible to members" ON public.coaching_date_overrides
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- profiles : le profil du coach (bulle de messagerie). Le membre garde
-- la lecture de SON profil par sa propre règle, inchangée.
DROP POLICY IF EXISTS "authenticated users can view admin profiles" ON public.profiles;
DROP POLICY IF EXISTS "members can view admin profiles" ON public.profiles;
CREATE POLICY "members can view admin profiles" ON public.profiles
  FOR SELECT USING (role = 'admin' AND (SELECT public.has_dashboard_access()));

-- storage : bucket docs (documents de formation)
DROP POLICY IF EXISTS "authenticated users can read docs" ON storage.objects;
DROP POLICY IF EXISTS "members can read docs" ON storage.objects;
CREATE POLICY "members can read docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'docs' AND (SELECT public.has_dashboard_access()));

-- ─── Vérification ───────────────────────────────────────────────
WITH attendu(tbl, nouvelle, ancienne) AS (
  VALUES
    ('resources',               'resources visible to members',               'resources visible to all authenticated'),
    ('live_trades',             'live_trades visible to members',             'live_trades_select'),
    ('skill_items',             'skill_items visible to members',             'skill_items_select'),
    ('app_settings',            'app_settings visible to members',            'app_settings_select'),
    ('coaching_availability',   'coaching_availability visible to members',   'Anyone authenticated can view active availability'),
    ('coaching_date_overrides', 'coaching_date_overrides visible to members', 'Authenticated can view overrides'),
    ('profiles',                'members can view admin profiles',            'authenticated users can view admin profiles'),
    ('objects',                 'members can read docs',                      'authenticated users can read docs')
),
regles AS (
  SELECT 10 AS ordre, 'règle modifiée' AS section, a.tbl || ' · ' || a.nouvelle AS element,
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies p
                            WHERE p.tablename = a.tbl AND p.policyname = a.nouvelle
                              AND p.qual LIKE '%has_dashboard_access()%')
               AND NOT EXISTS (SELECT 1 FROM pg_policies p
                                WHERE p.tablename = a.tbl AND p.policyname = a.ancienne)
              THEN 'OK' ELSE 'KO' END AS valeur
    FROM attendu a
),
encore_ouvertes AS (
  -- Lecture encore ouverte à tout compte connecté / à tous (hors règles
  -- « ses propres lignes »). Attendu : aucune ligne → « aucune ».
  SELECT 20 AS ordre, 'lecture encore ouverte' AS section,
         coalesce(string_agg(p.schemaname || '.' || p.tablename || ' · ' || p.policyname, ' | '), 'aucune') AS element,
         count(*)::text AS valeur
    FROM pg_policies p
   WHERE p.schemaname IN ('public', 'storage')
     AND p.cmd IN ('SELECT', 'ALL')
     AND (p.qual = 'true'
          OR p.qual ILIKE '%auth.uid() IS NOT NULL%'
          OR p.qual ILIKE '%auth.role() = ''authenticated''%')
),
acces AS (
  SELECT
    CASE
      WHEN p.role = 'admin' THEN 'admin'
      WHEN p.whop_subscription_active THEN 'Whop'
      WHEN p.manual_access AND (p.manual_access_until IS NULL
           OR p.manual_access_until >= (now() AT TIME ZONE 'Europe/Paris')::date) THEN 'manuel'
      WHEN p.manual_access THEN 'manuel expiré'
      ELSE 'aucun'
    END AS type_acces,
    public.has_dashboard_access_for(p.id) AS fonction
  FROM public.profiles p
),
comptes AS (
  SELECT 30 + CASE type_acces WHEN 'admin' THEN 1 WHEN 'Whop' THEN 2 WHEN 'manuel' THEN 3
                              WHEN 'manuel expiré' THEN 4 ELSE 5 END AS ordre,
         'comptes · ' || type_acces AS section,
         count(*) || ' comptes · fonction vraie ' || count(*) FILTER (WHERE fonction)
           || ' · fausse ' || count(*) FILTER (WHERE NOT fonction) AS element,
         CASE WHEN bool_and(fonction = (type_acces IN ('admin', 'Whop', 'manuel')))
              THEN 'OK' ELSE 'KO' END AS valeur
    FROM acces
   GROUP BY type_acces
),
sans_session AS (
  SELECT 40 AS ordre, 'sans session' AS section, 'has_dashboard_access_for(NULL)' AS element,
         CASE WHEN public.has_dashboard_access_for(NULL) = false THEN 'OK' ELSE 'KO' END AS valeur
)
SELECT section, element, valeur FROM (
  SELECT * FROM regles
  UNION ALL SELECT * FROM encore_ouvertes
  UNION ALL SELECT * FROM comptes
  UNION ALL SELECT * FROM sans_session
) t
ORDER BY ordre, element;
