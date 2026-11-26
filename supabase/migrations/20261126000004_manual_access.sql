-- ═══════════════════════════════════════════════════════════════
-- Accès manuel au dashboard (admin › Traders).
--
-- Règle d'accès (lib/access/member-access.ts), toujours active :
--   admin → oui ; whop_subscription_active → oui ;
--   manual_access avec manual_access_until vide (sans fin) ou ≥ aujourd'hui
--   (jour de Paris, date de fin incluse) → oui ; sinon → non.
--
-- 1. Colonnes profiles.manual_access / manual_access_until.
-- 2. Initialisation, UNE SEULE FOIS (au moment où la colonne est créée) :
--    les comptes créés par invitation sans lien Whop (whop_user_id vide)
--    reçoivent un accès manuel sans fin, pour que personne ne perde son
--    accès le jour de la bascule. Relancer le script ne ré-accorde pas un
--    accès retiré entre-temps par l'admin.
-- 3. Le déclencheur protect_profile_privileged_columns protège aussi ces
--    deux colonnes : un membre ne peut pas s'accorder un accès lui-même.
-- 4. Tableau de vérification (dernier résultat affiché).
--
-- Run this in the Supabase SQL Editor. Relançable.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  first_run boolean;
BEGIN
  first_run := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'manual_access'
  );

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS manual_access boolean NOT NULL DEFAULT false;
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS manual_access_until date;

  IF first_run THEN
    UPDATE public.profiles p
       SET manual_access = true,
           manual_access_until = NULL
     WHERE coalesce(p.role, '') <> 'admin'
       AND p.whop_user_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.invitations i
          WHERE i.used_at IS NOT NULL
            AND lower(trim(i.email)) = lower(trim(p.email))
       );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.manual_access IS
  'Accès au dashboard accordé à la main par l''admin (en plus de Whop).';
COMMENT ON COLUMN public.profiles.manual_access_until IS
  'Dernier jour (inclus, heure de Paris) de l''accès manuel. NULL = sans fin.';

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Seul un utilisateur connecté via l'API (rôle « authenticated ») et non
  -- admin est contrôlé. Clé service et SQL Editor passent.
  IF coalesce(auth.role(), '') <> 'authenticated' OR public.is_admin() THEN
    RETURN new;
  END IF;

  IF new.role IS DISTINCT FROM old.role
     OR new.email IS DISTINCT FROM old.email
     OR new.whop_subscription_active IS DISTINCT FROM old.whop_subscription_active
     OR new.whop_user_id IS DISTINCT FROM old.whop_user_id
     OR new.whop_email IS DISTINCT FROM old.whop_email
     OR new.whop_link IS DISTINCT FROM old.whop_link
     OR new.plan_type IS DISTINCT FROM old.plan_type
     OR new.propfirm_name IS DISTINCT FROM old.propfirm_name
     OR new.admin_observations IS DISTINCT FROM old.admin_observations
     OR new.manual_access IS DISTINCT FROM old.manual_access
     OR new.manual_access_until IS DISTINCT FROM old.manual_access_until
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administrateur'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ─── Vérification ───────────────────────────────────────────────
WITH acces AS (
  SELECT
    CASE
      WHEN p.role = 'admin' THEN 'admin'
      WHEN p.whop_subscription_active THEN 'Whop'
      WHEN p.manual_access AND p.manual_access_until IS NULL THEN 'manuel sans fin'
      WHEN p.manual_access
       AND p.manual_access_until >= (now() AT TIME ZONE 'Europe/Paris')::date THEN 'manuel jusqu''à une date'
      WHEN p.manual_access THEN 'manuel expiré'
      ELSE 'aucun'
    END AS type_acces
  FROM public.profiles p
),
lignes AS (
  SELECT 1 AS ordre, 'comptes · admin' AS verification,
         count(*) FILTER (WHERE type_acces = 'admin')::text AS valeur FROM acces
  UNION ALL SELECT 2, 'comptes · Whop',
         count(*) FILTER (WHERE type_acces = 'Whop')::text FROM acces
  UNION ALL SELECT 3, 'comptes · manuel sans fin',
         count(*) FILTER (WHERE type_acces = 'manuel sans fin')::text FROM acces
  UNION ALL SELECT 4, 'comptes · manuel jusqu''à une date',
         count(*) FILTER (WHERE type_acces = 'manuel jusqu''à une date')::text FROM acces
  UNION ALL SELECT 5, 'comptes · manuel expiré',
         count(*) FILTER (WHERE type_acces = 'manuel expiré')::text FROM acces
  UNION ALL SELECT 6, 'comptes · aucun',
         count(*) FILTER (WHERE type_acces = 'aucun')::text FROM acces
  UNION ALL SELECT 7, 'comptes · total', count(*)::text FROM acces
  UNION ALL SELECT 8, 'perdraient l''accès avec la nouvelle règle',
         count(*) FILTER (WHERE type_acces IN ('aucun', 'manuel expiré'))::text FROM acces
  UNION ALL SELECT 9, 'déclencheur protège manual_access',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc
            WHERE proname = 'protect_profile_privileged_columns'
              AND prosrc LIKE '%manual_access_until%'
         ) AND EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgname = 'protect_profile_privileged_columns'
              AND tgrelid = 'public.profiles'::regclass
              AND NOT tgisinternal
         ) THEN 'OK' ELSE 'KO' END
)
SELECT verification, valeur FROM lignes ORDER BY ordre;
