-- ═══════════════════════════════════════════════════════════════
-- Terminal : calendrier économique, agenda admin, banques centrales
-- (lot D).
--
--   market_calendar_events        publications officielles et
--                                 adjudications (ingestion quotidienne :
--                                 FRED, BEA, TreasuryDirect)
--   market_agenda_items           agenda saisi par l'admin : résultats
--                                 d'entreprises, discours de la Fed
--   market_holiday_confirmations  confirmation par l'admin des horaires
--                                 CME des jours de fête (« à confirmer »
--                                 dans le code)
--
-- + les sources « ecb » (taux de la BCE) et « calendar » sont ajoutées
--   aux contraintes de market_series et market_ingest_journal.
--
-- Accès (DECISIONS.md) : lecture des 3 tables par les membres via
-- (SELECT public.has_dashboard_access()) ; AUCUNE règle d'écriture :
-- seul le service-role écrit (cron, routes admin vérifiées côté serveur).
--
-- Run this in the Supabase SQL Editor. Relançable. Aucun DELETE, aucun
-- DROP TABLE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.market_calendar_events (
  id             text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('release', 'auction')),
  title          text NOT NULL,
  detail         text,
  agency         text NOT NULL,
  scheduled_at   timestamptz,
  event_date     date NOT NULL,
  impact         text NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  time_official  boolean NOT NULL DEFAULT false,
  figure         jsonb,
  auction        jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_calendar_events_date_idx
  ON public.market_calendar_events (event_date);

CREATE TABLE IF NOT EXISTS public.market_agenda_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('earnings', 'speech')),
  event_date  date NOT NULL,
  -- Heure à New York (HH:MM) : discours.
  time_et     text CHECK (time_et IS NULL OR time_et ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Résultats : avant l'ouverture (bmo) ou après la clôture (amc).
  timing      text CHECK (timing IS NULL OR timing IN ('bmo', 'amc')),
  ticker      text CHECK (ticker IS NULL OR ticker ~ '^[A-Z.]{1,8}$'),
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_agenda_items_date_idx
  ON public.market_agenda_items (event_date);

CREATE TABLE IF NOT EXISTS public.market_holiday_confirmations (
  holiday_date   date PRIMARY KEY,
  cme_confirmed  boolean NOT NULL DEFAULT false,
  -- Plages Globex à New York si elles diffèrent du schéma habituel,
  -- ex. « 00:00-13:15 » ou « 00:00-13:00,18:00-24:00 » ; vide = fermé
  -- toute la journée ; NULL = schéma du code.
  globex_ranges  text CHECK (globex_ranges IS NULL OR globex_ranges ~ '^$|^([0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9])(,[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9])*$'),
  note           text CHECK (note IS NULL OR length(note) <= 200),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Nouvelles sources dans les tables du lot C.
ALTER TABLE public.market_series DROP CONSTRAINT IF EXISTS market_series_source_check;
ALTER TABLE public.market_series ADD CONSTRAINT market_series_source_check
  CHECK (source IN ('fred', 'ecb'));

ALTER TABLE public.market_ingest_journal DROP CONSTRAINT IF EXISTS market_ingest_journal_source_check;
ALTER TABLE public.market_ingest_journal ADD CONSTRAINT market_ingest_journal_source_check
  CHECK (source IN ('fred', 'cftc', 'ecb', 'calendar'));

ALTER TABLE public.market_calendar_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_agenda_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_holiday_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_calendar_events visible to members" ON public.market_calendar_events;
CREATE POLICY "market_calendar_events visible to members" ON public.market_calendar_events
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

DROP POLICY IF EXISTS "market_agenda_items visible to members" ON public.market_agenda_items;
CREATE POLICY "market_agenda_items visible to members" ON public.market_agenda_items
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

DROP POLICY IF EXISTS "market_holiday_confirmations visible to members" ON public.market_holiday_confirmations;
CREATE POLICY "market_holiday_confirmations visible to members" ON public.market_holiday_confirmations
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- ─── Vérification ───────────────────────────────────────────────
WITH tables(t) AS (
  VALUES ('market_calendar_events'), ('market_agenda_items'), ('market_holiday_confirmations')
),
etat AS (
  SELECT
    tb.t,
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tb.t) AS rls,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t) AS regles,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t
       AND p.cmd = 'SELECT' AND p.qual LIKE '%has_dashboard_access()%') AS lecture_membres,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t
       AND p.cmd <> 'SELECT') AS regles_ecriture
  FROM tables tb
),
contraintes AS (
  SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
   WHERE c.conname IN ('market_series_source_check', 'market_ingest_journal_source_check')
)
SELECT table_, rls_active, nb_regles, nb_regles_ecriture, verification FROM (
  SELECT 1 AS ordre, t AS table_,
         CASE WHEN rls THEN 'oui' ELSE 'NON' END AS rls_active,
         regles::text AS nb_regles, regles_ecriture::text AS nb_regles_ecriture,
         CASE WHEN rls AND regles = 1 AND lecture_membres = 1 AND regles_ecriture = 0 THEN 'OK' ELSE 'KO' END AS verification
    FROM etat
  UNION ALL
  SELECT 2, 'contrainte ' || conname, '—', '—', '—',
         CASE
           WHEN conname = 'market_series_source_check' AND def LIKE '%ecb%' THEN 'OK'
           WHEN conname = 'market_ingest_journal_source_check' AND def LIKE '%calendar%' AND def LIKE '%ecb%' THEN 'OK'
           ELSE 'KO'
         END
    FROM contraintes
) v
ORDER BY ordre, table_;
