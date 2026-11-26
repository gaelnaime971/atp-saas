-- ═══════════════════════════════════════════════════════════════
-- Créneaux de coaching : suppression de 2 règles de lecture créées à la
-- main dans Supabase (absentes des migrations), repérées par la ligne
-- « lecture encore ouverte » du script 20261126000006 :
--   public.coaching_availability   · « View active availability »
--   public.coaching_date_overrides · « View overrides »
--
-- Elles laissaient tout compte connecté (ou tout le monde) lire ces
-- tables, en contournant has_dashboard_access(). Rien de public ne les
-- lit : seuls /api/coaching/slots (requireMember, session du membre →
-- règle « … visible to members ») et la page admin Coaching (règle
-- « Admin manages … ») y accèdent, et ces règles restent en place.
--
-- Run this in the Supabase SQL Editor. Relançable.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "View active availability" ON public.coaching_availability;
DROP POLICY IF EXISTS "View overrides" ON public.coaching_date_overrides;

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
