-- ═══════════════════════════════════════════════════════════════
-- Profils : empêcher qu'un utilisateur se donne lui-même des droits.
--
-- 1. handle_new_user() lisait le rôle dans raw_user_meta_data, que
--    l'utilisateur fournit lui-même à l'inscription. Inscription publique
--    ouverte + { role: 'admin' } = compte admin. Désormais : toujours
--    'trader'. /api/admin/setup pose ensuite 'admin' par un upsert en
--    clé service, les autres créations (invitation, Whop) sont 'trader'.
--
-- 2. La règle « users can update own profile » ne filtre aucune colonne :
--    un membre pouvait passer son role à 'admin' ou son
--    whop_subscription_active à true. Un déclencheur refuse désormais
--    toute modification des colonnes réservées par un utilisateur connecté
--    non admin. Clé service (routes serveur, cron, webhook) et SQL Editor
--    ne sont pas concernés. Aucune page membre n'écrit ces colonnes.
--
-- Run this in the Supabase SQL Editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'trader'  -- jamais lu depuis les métadonnées fournies par l'utilisateur
  );
  RETURN new;
END;
$$;

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
