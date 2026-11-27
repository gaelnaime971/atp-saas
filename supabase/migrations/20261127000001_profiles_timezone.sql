-- ═══════════════════════════════════════════════════════════════
-- Fuseau horaire du membre (lib/time.ts).
-- NULL = fuseau du navigateur ; le dashboard l'enregistre à la première
-- visite s'il est valide. Valeur invalide → affichage en Europe/Paris.
-- Colonne non protégée : le membre la règle lui-même (Mon compte).
--
-- Appliqué en prod dans le SQL Editor le 27/11/2026 (SQL identique).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text;
COMMENT ON COLUMN public.profiles.timezone IS 'Fuseau horaire IANA du membre (ex. Europe/Paris). NULL = fuseau du navigateur.';
