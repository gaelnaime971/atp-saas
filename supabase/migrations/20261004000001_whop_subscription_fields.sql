-- ============================================================================
-- Whop OAuth — champs profiles pour l'auth via abonnement Whop
-- ============================================================================
-- Deux nouveaux champs sur public.profiles :
--
--   whop_user_id : identifiant OAuth Whop du trader. UNIQUE pour empêcher
--     deux profiles distincts d'être liés au même compte Whop. NULL tant que
--     le trader ne s'est pas (encore) connecté via Whop OAuth — matching
--     par email au premier callback (étape 3).
--
--   whop_subscription_active : flag maintenu en temps réel par les webhooks
--     Whop (membership_went_valid / membership_went_invalid, étape 5) et
--     revérifié à chaque callback OAuth (double sécurité). Lu par le
--     middleware proxy.ts (étape 6) pour autoriser l'accès /dashboard.
--     Seul le plan 89€ (WHOP_PLAN_IDS, env var étape 2) le passera à TRUE ;
--     un abonné 49€ qui se connecte via Whop restera à FALSE → redirect vers
--     /subscription-expired avec lien upgrade.
--
-- GRÂCE PÉRIODE au déploiement : tous les traders existants passent à TRUE
-- pour éviter de les enfermer dehors du jour au lendemain. Les webhooks +
-- premier login Whop confirmeront ensuite le vrai statut, et la logique
-- middleware n'étant appliquée qu'à l'étape 6, la coexistence est totale
-- jusque-là (le flag est stocké mais non lu).
--
-- Les admins restent à FALSE par défaut (sans impact — ils accèderont via
-- la whitelist WHOP_BYPASS_EMAILS côté middleware, pas via ce flag).
--
-- SÉCURITÉ DONNÉES :
--   • Aucun DROP, aucun DELETE, aucun truncate.
--   • Colonnes ajoutées via "if not exists" → idempotent, re-runnable.
--   • UPDATE ciblée sur role='trader' ET whop_subscription_active=false
--     uniquement → aucun TRUE existant n'est écrasé.
--   • Toutes les colonnes existantes (whop_link, whop_email, is_active,
--     role, email, full_name, etc.) sont intactes.
-- ============================================================================

-- 1. Identifiant OAuth Whop du trader.
--    UNIQUE : empêche deux profiles distincts d'être liés au même compte Whop.
--    PostgreSQL autorise plusieurs NULL dans un UNIQUE (comportement standard).
--    Le btree index implicite créé par UNIQUE accélère les lookups O(log n)
--    côté callback OAuth (SELECT ... WHERE whop_user_id = $1).
alter table public.profiles
  add column if not exists whop_user_id text unique;

-- 2. Flag d'abonnement actif, DEFAULT FALSE.
--    Les nouvelles lignes créées via /invite restent à FALSE par défaut
--    jusqu'au premier login Whop vérifiant leur abonnement.
alter table public.profiles
  add column if not exists whop_subscription_active boolean not null default false;

-- 3. Grâce période — traders existants à TRUE pour éviter le blackout au
--    déploiement. Ciblé strictement sur role='trader' (les admins restent
--    à FALSE, ils accèdent via whitelist) ET sur les lignes encore à FALSE
--    (idempotent — un re-run n'écrase pas des valeurs TRUE déjà posées).
update public.profiles
  set whop_subscription_active = true
  where role = 'trader'
    and whop_subscription_active = false;
