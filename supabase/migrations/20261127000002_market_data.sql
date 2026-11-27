-- ═══════════════════════════════════════════════════════════════
-- Terminal : socle de données (lot C).
--
--   market_series               catalogue des séries FRED (code, libellé,
--                               unité, fréquence, organisme, licence)
--   market_series_observations  observations (série, date, valeur)
--   market_cot_reports          rapport COT de la CFTC (Traders in
--                               Financial Futures, futures seuls), par
--                               marché et par mardi de positions
--   market_ingest_journal       journal d'ingestion (source, déclencheur,
--                               début, fin, statut, lignes, erreur)
--
-- Accès (docs/design/terminal/DECISIONS.md) :
--   - lecture des 3 tables de données : membres ayant accès au dashboard,
--     via (SELECT public.has_dashboard_access()) ; jamais « tout compte
--     connecté » ni USING (true) ;
--   - journal : AUCUNE règle (exploitation admin, lu par la route admin
--     avec le service-role) ;
--   - AUCUNE règle d'écriture nulle part : seul le service-role (cron,
--     bouton admin, script d'historique) écrit, il contourne la RLS.
--
-- Run this in the Supabase SQL Editor. Relançable (IF NOT EXISTS,
-- DROP POLICY IF EXISTS). Aucun DELETE, aucun DROP TABLE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.market_series (
  code        text PRIMARY KEY,
  source      text NOT NULL CHECK (source IN ('fred')),
  label       text NOT NULL,
  unit        text NOT NULL,
  frequency   text NOT NULL CHECK (frequency IN ('D', 'W', 'M', 'Q')),
  provider    text NOT NULL,
  license     text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_series_observations (
  series_code text NOT NULL REFERENCES public.market_series(code) ON DELETE CASCADE,
  obs_date    date NOT NULL,
  value       double precision NOT NULL,
  PRIMARY KEY (series_code, obs_date)
);

CREATE TABLE IF NOT EXISTS public.market_cot_reports (
  market_code         text NOT NULL CHECK (market_code IN ('NQ', 'ES', 'YM', 'ZN')),
  report_date         date NOT NULL,
  cftc_contract_code  text NOT NULL,
  open_interest       bigint NOT NULL,
  asset_mgr_long      bigint NOT NULL,
  asset_mgr_short     bigint NOT NULL,
  lev_money_long      bigint NOT NULL,
  lev_money_short     bigint NOT NULL,
  dealer_long         bigint NOT NULL,
  dealer_short        bigint NOT NULL,
  -- Première réception du rapport (jamais réécrite par les upserts).
  received_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_code, report_date)
);

CREATE TABLE IF NOT EXISTS public.market_ingest_journal (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL CHECK (source IN ('fred', 'cftc')),
  trigger        text NOT NULL CHECK (trigger IN ('cron', 'admin', 'backfill')),
  status         text NOT NULL CHECK (status IN ('running', 'ok', 'partial', 'error')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  rows_upserted  integer NOT NULL DEFAULT 0,
  error          text
);

CREATE INDEX IF NOT EXISTS market_ingest_journal_source_started_idx
  ON public.market_ingest_journal (source, started_at DESC);

ALTER TABLE public.market_series              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_series_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_cot_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_ingest_journal      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_series visible to members" ON public.market_series;
CREATE POLICY "market_series visible to members" ON public.market_series
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

DROP POLICY IF EXISTS "market_series_observations visible to members" ON public.market_series_observations;
CREATE POLICY "market_series_observations visible to members" ON public.market_series_observations
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

DROP POLICY IF EXISTS "market_cot_reports visible to members" ON public.market_cot_reports;
CREATE POLICY "market_cot_reports visible to members" ON public.market_cot_reports
  FOR SELECT USING ((SELECT public.has_dashboard_access()));

-- ─── Vérification ───────────────────────────────────────────────
WITH tables(t, attendu) AS (
  VALUES
    ('market_series', 'lecture membres'),
    ('market_series_observations', 'lecture membres'),
    ('market_cot_reports', 'lecture membres'),
    ('market_ingest_journal', 'aucune règle')
),
etat AS (
  SELECT
    tb.t, tb.attendu,
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tb.t) AS rls,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t) AS regles,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t
       AND p.cmd = 'SELECT' AND p.qual LIKE '%has_dashboard_access()%') AS lecture_membres,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tb.t
       AND p.cmd <> 'SELECT') AS regles_ecriture
  FROM tables tb
)
SELECT
  t AS table_,
  CASE WHEN rls THEN 'oui' ELSE 'NON' END AS rls_active,
  regles AS nb_regles,
  regles_ecriture AS nb_regles_ecriture,
  CASE
    WHEN rls IS NOT TRUE THEN 'KO'
    WHEN regles_ecriture > 0 THEN 'KO'
    WHEN attendu = 'lecture membres' AND regles = 1 AND lecture_membres = 1 THEN 'OK'
    WHEN attendu = 'aucune règle' AND regles = 0 THEN 'OK'
    ELSE 'KO'
  END AS verification
FROM etat
ORDER BY t;
