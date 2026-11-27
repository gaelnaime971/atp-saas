-- ═══════════════════════════════════════════════════════════════
-- Terminal : actus officielles (lot E2).
--
--   market_news   communiqués, discours et témoignages de la Fed,
--                 communiqués et discours de la BCE (flux RSS
--                 officiels), résultats d'adjudications du Trésor
--                 (TreasuryDirect). Une ligne par texte : clé = source
--                 + adresse canonique (aucun doublon). Rafraîchie à la
--                 consultation (au plus toutes les 90 s) et par le cron
--                 quotidien. Les lignes « flash » des agences US sont
--                 calculées, pas stockées.
--
-- + la source « news » est ajoutée à la contrainte de
--   market_ingest_journal.
--
-- Accès (DECISIONS.md) : lecture via (SELECT public.has_dashboard_access()) ;
-- AUCUNE règle d'écriture : seul le service-role écrit.
--
-- Run this in the Supabase SQL Editor. Relançable. Aucun DELETE, aucun
-- DROP TABLE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.market_news (
  id             text PRIMARY KEY CHECK (length(id) BETWEEN 5 AND 600),
  source         text NOT NULL CHECK (source IN ('fed', 'ecb', 'treasury')),
  kind           text NOT NULL CHECK (kind IN ('monetary', 'press', 'speech', 'testimony', 'auction')),
  title          text NOT NULL CHECK (length(title) BETWEEN 1 AND 400),
  summary        text CHECK (summary IS NULL OR length(summary) <= 2000),
  url            text NOT NULL CHECK (url ~ '^https://'),
  category       text CHECK (category IS NULL OR length(category) <= 200),
  impact         text NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  published_at   timestamptz NOT NULL,
  -- Première fois que la ligne a été vue (jamais réécrite par l'upsert).
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_news_published_idx
  ON public.market_news (published_at DESC);

ALTER TABLE public.market_ingest_journal DROP CONSTRAINT IF EXISTS market_ingest_journal_source_check;
ALTER TABLE public.market_ingest_journal ADD CONSTRAINT market_ingest_journal_source_check
  CHECK (source IN ('fred', 'cftc', 'ecb', 'calendar', 'news'));

ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_news visible to members" ON public.market_news;
CREATE POLICY "market_news visible to members" ON public.market_news
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- ─── Vérification ───────────────────────────────────────────────
WITH etat AS (
  SELECT
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'market_news') AS rls,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'market_news') AS regles,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'market_news'
       AND p.cmd = 'SELECT' AND p.qual LIKE '%has_dashboard_access()%') AS lecture_membres,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'market_news'
       AND p.cmd <> 'SELECT') AS regles_ecriture
),
contrainte AS (
  SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
   WHERE c.conname = 'market_ingest_journal_source_check'
)
SELECT element, rls_active, nb_regles, nb_regles_ecriture, verification FROM (
  SELECT 1 AS ordre, 'market_news' AS element,
         CASE WHEN rls THEN 'oui' ELSE 'NON' END AS rls_active,
         regles::text AS nb_regles, regles_ecriture::text AS nb_regles_ecriture,
         CASE WHEN rls AND regles = 1 AND lecture_membres = 1 AND regles_ecriture = 0 THEN 'OK' ELSE 'KO' END AS verification
    FROM etat
  UNION ALL
  SELECT 2, 'contrainte market_ingest_journal_source_check', '—', '—', '—',
         CASE WHEN def LIKE '%''news''%' AND def LIKE '%''calendar''%' AND def LIKE '%''ecb''%' THEN 'OK' ELSE 'KO' END
    FROM contrainte
) v
ORDER BY ordre;
