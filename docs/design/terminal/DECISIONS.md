# ATP Terminal · espace Marchés — DÉCISIONS

Référence de toutes les étapes du chantier. Arrêtées le 26/11/2026, après l'audit de l'étape 0 ([AUDIT.md](AUDIT.md)).
Quand une étape contredit ce fichier, c'est ce fichier qui gagne, ou on le met à jour d'abord.

## Principes

- **Coût data : 0 €.** Uniquement des sources gratuites **et** autorisées en usage commercial. Rien de payant, rien de scrapé.
- **Hébergement : Vercel Hobby**, donc crons 1×/jour (précision ±59 min). Pour les chiffres publiés en journée (calendrier), cache serveur court déclenché à la consultation, pas de cron.
- **Espace : `/dashboard/marches/*`**, jamais `/marches` (landing publique, dans `publicRoutes`, donc non gatée).
- **Pas de cotations en direct.** La barre du haut Marchés n'affiche que des horloges. Pas de récap de séance ni de mouvements de prix tant qu'on n'a pas de prix sous licence.
- **Focus NQ et YM.** Pas de forex.
- Toute la data passe par des API appelées côté serveur, aucune clé côté client.

## Périmètre par écran

### COT
NQ, YM, ES, ZN (rapport TFF de la CFTC).

### Macro US (phase 1)
Taux 2 et 10 ans, taux réel 10 ans, inflation attendue, liquidité de la Fed (bilan − compte du Trésor − reverse repo), inscriptions au chômage, GDPNow (Fed d'Atlanta).
Uniquement des séries produites par la Fed, le Trésor ou le DOL.

### Sentiment de risque
7 composantes publiques :
1. stress financier (`STLFSI4`)
2. risque de marché (`NFCIRISK`)
3. crédit (`NFCICREDIT`)
4. taux réel 10 ans
5. liquidité de la Fed
6. courbe 10 ans − 2 ans
7. positionnement des institutionnels sur ES et NQ (CFTC)

Exclus : VIX, S&P via FRED, spread ICE, Coinbase.

### Calendrier (phase 1, version gratuite)
- Publications officielles US (BLS, BEA, Census, DOL, Fed, Trésor) avec heure, impact et chiffre publié, **sans consensus**.
- FOMC et discours des gouverneurs.
- Adjudications à 10 et 30 ans.
- Résultats des plus grosses pondérations du Nasdaq-100 et du Dow, **saisis par l'admin**.
- Fenêtres ATP ±15 min.

### Banques centrales
Fed, BCE, BoJ, avec taux et dates officiels.
Probabilités : **la Fed seule**, via le Market Probability Tracker de la Fed d'Atlanta (gratuit, source citée), format à vérifier dans son étape.
Exclus : Polymarket, FedWatch.

### Saisonnalité
- S&P 500 (Shiller, source citée) comme repère des indices US.
- Cycle présidentiel (2026 = année de mi-mandat).
- Saisonnalité du trader tirée de son journal (mois, jour, heure).

Exclus : forex, or, pétrole, VIX. NQ/ES plus tard, avec une licence CME.

### Sessions & horaires
En plus des sessions : échéances trimestrielles, roll NQ/YM, OPEX mensuelles, fériés et clôtures anticipées.

## Mentions à afficher
FRED, Fed d'Atlanta, Shiller, CFTC. La mention FRED exacte : « This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis », avec lien vers leurs conditions.

## Plus tard (hors phase 1)
- Actus et squawk (sources officielles).
- Lecture IA du ton de la Fed.
- Jarvis branché sur les tables via `lib/jarvis/market-context.ts`.
- Cotations sous licence.

## Décisions d'implémentation (étape 1, menu)

- **Deux espaces, deux mécanismes.** « Mon trading » reste le SPA de `/dashboard` (un `switch` sur `activePage`). « Marchés » est fait de vraies routes App Router sous `/dashboard/marches/*`, avec leur propre layout.
- **L'espace actif se dérive de l'URL**, rien n'est persisté : `/dashboard/marches/*` = Marchés ; dans le SPA, Marchés si la page active appartient à l'espace Marchés (aucune depuis le lot E2).
- **Passage d'un espace à l'autre : `/dashboard?page=<id>`.** Le SPA lit ce paramètre au montage, ouvre la page si l'id est connu, puis retire le paramètre de l'URL (`history.replaceState`) pour qu'un rechargement ultérieur ne rouvre pas une page périmée. Un id inconnu est ignoré, le Dashboard s'ouvre comme avant.
- ~~**Analyse d'action est passée dans Marchés › Analyse.**~~ Annulé au lot E2 : elle reste dans Mon trading › Outils (voir « Analyse d'action hors du Terminal »).
- **Éléments « bientôt »** (Récap de séance, Actus & Squawk) : visibles dans le menu, non cliquables, sans page, absents de ⌘K.
- **Horloges Marchés** : « Ton heure » (fuseau du membre, voir « Fuseau horaire »), Londres, New York, Tokyo. Rendues côté client uniquement (piège d'hydratation #418).
- **Admin** : exception dans `proxy.ts` pour `/dashboard/marches` (et ses sous-pages). Le reste de `/dashboard` redirige toujours un admin vers `/admin/dashboard`.
- **Gate Whop** : inchangé. `/dashboard/marches/*` est couvert par le `startsWith('/dashboard')` existant.

## Interrupteur TERMINAL_ACCESS (étape 1 bis)

Variable **serveur** (jamais `NEXT_PUBLIC_`), pour pouvoir pousser en prod sans montrer un espace Marchés vide aux membres.

| Valeur | Qui voit Marchés |
|---|---|
| absente, vide, ou toute valeur autre que `all` (`ALL`, `true`, `1`… compris) | les admins seulement |
| `all` (exactement) | tous les membres + les admins |

- **Défaut sûr : rien à configurer en prod**, l'espace reste réservé aux admins. Pour l'ouvrir : `TERMINAL_ACCESS=all` sur Vercel, puis redéployer (Vercel n'applique un changement de variable qu'au déploiement suivant).
- **Contrôle côté serveur, à 2 niveaux** : `proxy.ts` (chaque requête, y compris les navigations client) puis le layout `app/dashboard/marches/layout.tsx`. Un membre qui tape `/dashboard/marches/*` alors que l'espace est masqué est renvoyé sur `/dashboard`. Fail-closed : profil illisible → traité comme membre.
- **Règle** : `lib/terminal/access.ts` (`terminalViewer`, `canSeeTerminal`), testée dans `lib/terminal/access.test.ts`.
- **SPA `/dashboard`** : il ne peut pas lire une variable serveur ; `app/dashboard/layout.tsx` la lit **au build** et la transmet par contexte (`components/terminal/TerminalAccess.tsx`). `/dashboard` reste donc pré-généré (statique). C'est sans risque : Vercel n'applique un changement de variable qu'au déploiement suivant, qui refait le build. Le contrôle d'accès, lui, se fait à l'exécution (proxy + layout Marchés). En local, après un changement de `TERMINAL_ACCESS`, il faut relancer `next build` pour `next start` ; `next dev` relit la variable tout seul.
- **Membre, espace masqué** : pas de sélecteur Mon trading / Marchés, rien de Marchés dans ⌘K, Le menu Mon trading réorganisé reste pour tout le monde, Analyse d'action en dernière position d'Outils.
- **Membre, `all`** : comportement de l'étape 1 ; Analyse d'action reste dans Mon trading › Outils (lot E2).
- **Admin dans Marchés** : « Retour admin » (vers `/admin/dashboard`) à la place du sélecteur, pas d'Analyse d'action, pas de liens Mon compte / Contrat / Documents, ⌘K limité à Marchés, pas de bulle de messagerie coach. Tous ces liens le renvoyaient vers `/admin/dashboard`.
- **Menu admin** : groupe « Terminal » avec le lien « Terminal Marchés » vers `/dashboard/marches`.
- Pas de `.env.example` dans le repo (`.env*` est ignoré par git) : la variable est documentée ici.

## Accès membres : une seule règle, toujours active

Arrêté le 26/11/2026. Avant, aucune page ni route ne vérifiait l'abonnement après la connexion : le filtre de `proxy.ts` dépendait de `WHOP_GATE_ENABLED`, absente en prod.

**Règle** (`lib/access/member-access.ts`, testée dans `member-access.test.ts`) :

| Compte | Accès au dashboard |
|---|---|
| admin | oui |
| `whop_subscription_active` (tenu à jour par le webhook et le cron) | oui |
| accès manuel (`manual_access`), sans date de fin | oui |
| accès manuel avec date de fin (`manual_access_until`, jour de Paris, **incluse**) | oui jusqu'à cette date |
| tout le reste, profil illisible compris | non (fail-closed) |

- **`WHOP_GATE_ENABLED` et `WHOP_BYPASS_EMAILS` sont supprimées** (inutilisées en prod) : plus d'interrupteur, plus de liste d'e-mails. Un compte qui doit passer sans Whop reçoit un accès manuel.
- **Pages** : `proxy.ts` applique la règle à toutes les pages `/dashboard` (espace Marchés compris). Sans accès → `/whop/abonnement-inactif` (« Ton abonnement n'est plus actif », bouton de réabonnement Whop `NEXT_PUBLIC_WHOP_CHECKOUT_URL`, à défaut le lien de la page d'accueil, et bouton de déconnexion). Préfixe `/whop` public : pas de boucle.
- **API** : `requireMember()` (`lib/ai/quota.ts`, à côté de `requireUser()`) sur toutes les routes membres : 401 sans session, 403 `{ error: 'subscription_inactive' }` sans accès, avant tout appel externe. Hors périmètre : Jarvis (sa liste d'autorisation), admin, cron, webhook, routes publiques et d'authentification, `backtest/is-tester` (simple indicateur d'affichage). `lib/api/member-routes.test.ts` oblige à classer toute nouvelle route.
- **Admin › Traders** : colonne « Accès » (Whop, Manuel jusqu'au …, Manuel sans fin, Manuel expiré, Aucun) et bouton « Gérer » pour accorder ou retirer un accès manuel, date de fin facultative. Seul un admin peut écrire ces colonnes (déclencheur `protect_profile_privileged_columns`).
- **Migration** `20261126000004_manual_access.sql` : à appliquer **avant** de déployer. À la création des colonnes, et une seule fois, les comptes créés par invitation sans lien Whop reçoivent un accès manuel sans fin. Tant qu'elle n'est pas appliquée, le code relit les seules colonnes historiques (admin + Whop gardent l'accès, les comptes invités le perdent).
- **Côté base** : `public.has_dashboard_access()` (migration `20261126000006`) applique la même règle dans les règles RLS. Les lectures autrefois ouvertes à tout compte connecté ou à tous (`resources`, `live_trades`, `skill_items`, `app_settings`, créneaux de coaching, profil du coach, bucket `docs`) passent par elle. Les règles « ses propres lignes » ne changent pas : un ancien membre garde l'accès à ses propres données. Toute modification de la règle se fait aux deux endroits (TypeScript et SQL) ; `lib/api/migrations-security.test.ts` vérifie qu'il ne reste aucune lecture « tout compte connecté » dans les migrations.
- **Futures tables du Terminal** (COT, macro, calendrier, banques centrales…) : leurs règles de lecture utilisent `(SELECT public.has_dashboard_access())`, jamais « tout compte connecté » (`auth.uid() IS NOT NULL`, `auth.role() = 'authenticated'`) ni `USING (true)`.

## Fuseau horaire (lot A, partie 1)

Arrêté le 27/11/2026.

- **Référence unique : `lib/time.ts`** (Intl natif, aucune dépendance). Toute heure affichée dans Marchés passe par lui.
- **Fuseau du membre** : `profiles.timezone` (IANA), sinon le navigateur, sinon `Europe/Paris`.
  - Profil vide (NULL ou blanc) → navigateur.
  - Profil rempli mais invalide → `Europe/Paris`, jamais d'exception. Tous les formats passent par `safeTimeZone()`.
- **Première visite** : `MemberTimeZoneProvider` (monté dans `app/dashboard/layout.tsx`, donc Mon trading et Marchés) enregistre le fuseau du navigateur si le profil est vide et le fuseau valide, sans écraser une valeur posée entre-temps. Une valeur invalide en base n'est pas réécrite.
- **Serveur** : `getMemberTimeZone()` (`lib/time-server.ts`) pour les Server Components. Il ne connaît pas le navigateur : profil valide, sinon Paris.
- **Heures de marché** : définies dans le fuseau de leur place (`America/New_York`, `America/Chicago`, `Europe/London`, `Asia/Tokyo`) pour une date de cette place, puis converties (`zonedTimeToUtc`, `marketTimeIn`). Les changements d'heure viennent de la base IANA : États-Unis et Europe ne changent pas le même jour, la Guadeloupe jamais.
- **Formats** : `14:30`, « mer. 25 nov. », « UTC−4 » (signe moins typographique).
- **Mon compte › Fuseau horaire** (ancre `#fuseau`, liste `components/ui/Listbox` aux couleurs de l'app, motif ARIA listbox) : Paris, Guadeloupe, Martinique, Guyane, La Réunion, Bruxelles, Genève (`Europe/Zurich`), Montréal (`America/Toronto`) en tête, puis toute la liste du moteur, avec recherche sans accents et décalage actuel.
- **Barre Marchés** : un clic sur « Ton heure » mène au réglage (membre seulement : l'admin n'a pas Mon compte). Si le membre est à Londres, New York ou Tokyo, cette place n'est pas affichée en double (`lib/terminal/clocks.ts`).
- **Colonne** : migration `20261127000001_profiles_timezone.sql` (appliquée le 27/11/2026). Non protégée par `protect_profile_privileged_columns` : le membre la règle lui-même.
- **Pas encore fait** : la dédup des `TZ` locaux (`America/Guadeloupe` dans les deux `Coaching.tsx`, `Europe/Paris` inline ailleurs) reste à faire, hors Marchés.

## Sessions & horaires (lot A, partie 2)

Arrêté le 27/11/2026. Page `/dashboard/marches/sessions`, d'après la maquette 03, tout en heure du membre.

- **Calcul pur, sans réseau** : `lib/terminal/sessions.ts`. Chaque horaire est défini dans le fuseau de sa place pour une date de cette place, puis converti (`lib/time.ts`).
  - Sessions : Asie (Tokyo 09:00–18:00), Europe (Londres 08:00–17:00), US (New York 08:00–17:00), heures locales, du lundi au vendredi.
  - Cash US : 09:30–16:00 ET, fermé les jours fériés NYSE, 13:00 ET les jours de clôture anticipée.
  - NQ et YM sur CME Globex : dimanche 18:00 → vendredi 17:00 ET, pause quotidienne 17:00–18:00 ET. État : ouvert, pause (coupure d'une heure) ou fermé.
  - Rendez-vous fixes de la journée US : 8:30, 9:30, 10:00, 16:00 (13:00 si clôture anticipée), 17:00 ET, avec la fenêtre ATP ±15 min.
  - Échéances trimestrielles (3e vendredi de mars, juin, septembre, décembre, la veille si la bourse est fermée), roll conseillé 8 jours avant, OPEX mensuelles (3e vendredi). Les quatre prochaines de chaque.
  - Changements d'heure vus du membre : chaque date où l'ouverture du cash US change d'heure chez lui.
  - « Jours spéciaux à venir » : fériés, clôtures anticipées et changements d'heure sur un même horizon (les 4 prochains mois, `upcomingSpecialDays`), dans l'ordre chronologique, sans limite de nombre.
- **Fériés et clôtures anticipées** : table statique `lib/terminal/market-holidays.ts`, 2026-2027, source en commentaire.
  - Cash US : calendrier officiel NYSE, relevé le 27/11/2026. Confirmé.
  - CME Globex : les horaires des fêtes ne sont publiés qu'environ deux semaines avant chaque fête. La table suit le schéma habituel des futures indices US, marqué `cmeConfirmed: false` et signalé « à confirmer » à l'écran. À vérifier sur cmegroup.com avant chaque fête, puis passer `cmeConfirmed` à `true`.
  - Tokyo et Londres : seuls les week-ends sont pris en compte, pas leurs fériés locaux.
  - À prolonger chaque année (fin de table : 31/12/2027).
- **Barre du haut** : pastille ouvert/fermé sur Londres, New York (session US, fériés NYSE compris) et Tokyo.
- **Rendu** : côté client après hydratation (`useMinuteNow`), mis à jour chaque minute. Le serveur passe le fuseau du profil (`getMemberTimeZone()`) en attendant celui du navigateur.
- **Pas repris de la maquette** : Sydney, et « Tes meilleures heures » (données d'exemple, à brancher sur le journal plus tard).

## Mobile et tablette (lot B)

Arrêté le 27/11/2026. Concerne tout le dashboard : Mon trading, Marchés et admin, via un shell commun `components/ui/AppShell.tsx` (règles pures et testées : `lib/ui/shell.ts`).

- **Moins de 768 px** :
  - pas de rail ; barre du haut compacte : bouton menu, titre de la page, actions en icônes (Assistant Trader en Mon trading ; « Ton heure » et la pastille NQ/YM en Marchés ; « Nouveau trader » en admin) ;
  - le bouton menu ouvre le menu complet dans un tiroir (même `AppSidebar`, variante `drawer`) : sélecteur d'espace, recherche, groupes, pied de menu. Il se ferme avec Échap, en touchant le fond, en choisissant une page, ou en passant en tablette ou bureau ;
  - barre d'onglets en bas, 4 raccourcis + « Menu » (`TRADING_TABS`, `MARKETS_TABS`, `ADMIN_TABS` dans `lib/nav`). Admin : Accueil (vue globale), Prospects, Pipeline, Traders ;
  - bulle et panneau de messagerie au-dessus de la barre d'onglets (`--app-tabbar-offset`, `--app-chat-gap` dans `app/globals.css`) ;
  - zones de toucher d'au moins 44 px ; marges de sécurité iPhone avec `env(safe-area-inset-*)` et `viewportFit: 'cover'` (layouts `/dashboard` et `/admin/dashboard` seulement) ;
  - pas de défilement horizontal de page : grilles sur une colonne, la frise 24 h et les tableaux défilent dans leur carte.
    Grilles des pages : `minmax(min(Npx, 100%), 1fr)` au lieu de `minmax(Npx, 1fr)` (identique dès que la place suffit), et colonnes fixes passées en classes responsives (`grid-cols-1 md:grid-cols-2`, `lg:grid-cols-4`…), au même nombre de colonnes qu'avant à partir de 1024 ou 1280 px.
    Admin : Vue globale et Traders tiennent en 390 px ; **Prospects et Pipeline débordent encore** (tableaux et kanban denses), à reprendre à part.
- **De 768 à 1279 px** : rail replié en icônes par défaut, nom au survol (et au focus clavier). Le choix « déplier » sur tablette est mémorisé à part de celui du bureau. Le pied de menu (compte, déconnexion) passe aussi en icônes. Barre Marchés : les horloges qui ne tiennent pas se masquent, en commençant par la dernière (« Ton heure » reste).
- **À partir de 1280 px** : inchangé, sauf la barre du haut : le titre ne touche plus les actions (écart fixe), et les statistiques membre qui ne tiennent pas se masquent (une seule rangée visible).
- **Finitions (lot C, partie 0)** : rail replié = symbole du logo seul ; grilles du Dashboard sans case isolée sur tablette (chiffres en 2×2, cartes Insight en pleine largeur jusqu'à 1023 px) ; dans le tiroir mobile, le pied de menu est une ligne compacte qui se déplie ; Saisie de session propose le dernier instrument du membre, sinon NQ (`lib/session/instrument.ts`).
- **Mise en page en CSS** (classes `md:` de Tailwind, pas de flash au chargement) ; le JS (`useViewportKind`) ne sert qu'aux comportements (repli par défaut, fermeture du tiroir).

## Socle de données (lot C, partie 1)

Arrêté le 27/11/2026.

- **Tables** (migration `20261127000002_market_data.sql`) : `market_series` (catalogue FRED), `market_series_observations` (série, date, valeur), `market_cot_reports` (COT par marché et par mardi), `market_ingest_journal` (source, déclencheur, début, fin, statut, lignes, erreur).
  - Lecture des 3 tables de données : `(SELECT public.has_dashboard_access())`. Journal : aucune règle (lu par la route admin avec le service-role). Aucune règle d'écriture : seul le service-role écrit.
- **Client service-role** : `lib/supabase/admin.ts`, côté serveur uniquement (lève une erreur dans le navigateur).
- **Ingestion** (`lib/market/ingest.ts`, testée) : incrémentale (depuis la dernière date en base, moins un recouvrement de 14 jours pour FRED et 21 pour le COT, pour capter les révisions) et idempotente (upsert sur série + date, marché + date). Une série en erreur n'arrête pas les autres (statut « partiel »).
- **Historique initial**, une seule fois, en local : `npx vite-node --config vitest.config.ts scripts/terminal-backfill.ts` (10 ans pour FRED, depuis 2010 pour le COT). `--dry-run` : appels réels, rien n'est écrit en base.
- **Cron unique** `/api/cron/market-data` à `30 22 * * *` UTC (17:30 ou 18:30 à New York, après la clôture et après la publication du COT de 15:30 ET). Plan Hobby : 1 exécution par jour au plus, à ±59 min ([doc Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Protégé comme `whop-reconcile` (Bearer `CRON_SECRET`, 404 sinon), `lib/api/cron-auth.ts`. Classé hors périmètre dans `member-routes.test.ts`.
- **Admin › Paramètres › Config** : carte « Données Terminal » (dernière mise à jour, statut, lignes, donnée la plus récente) et bouton « Mettre à jour maintenant » (`/api/admin/market-data`, admin uniquement).
- **Lecture des pages** (`lib/market/read.ts`) : côté serveur, service-role, cache PARTAGÉ de 15 min invalidé par le cron et le bouton admin (tag `market-data`), toujours après `requireMarketsViewer()` (`lib/terminal/viewer-server.ts`, accès membre compris, partagé avec le layout). Chaque page affiche la date de ses données, avec un avertissement si elles sont en retard (`lib/market/freshness.ts`).
- **Licences FRED** relevées le 27/11/2026 dans les métadonnées de chaque série : toutes « public domain » ou « copyrighted: citation required » (séries produites par la Fed), aucun copyright de tiers. Aucune série écartée.
- **Mentions** : texte exact exigé par les conditions de l'API FRED (« This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis. »), lien vers ces conditions et phrase d'acceptation ; organismes producteurs cités ; CFTC citée. **À faire côté CGU** : les conditions FRED demandent que les conditions d'utilisation de l'application disent que l'utiliser vaut acceptation des conditions de l'API FRED.

## COT (lot C, partie 2)

Arrêté le 27/11/2026. Page `/dashboard/marches/cot` (`?m=NQ|ES|YM|ZN`), d'après la maquette 07.

- **Source** : API publique de la CFTC, rapport Traders in Financial Futures (dataset `udgc-27he`), sans clé.
- **Choix : futures seuls** (`futonly_or_combined = 'FutOnly'`), partout (page, sentiment). C'est la lecture habituelle du COT, et la série est continue depuis 2006 pour les 4 marchés.
- **Codes de contrat**, relevés dans les données de la CFTC (stables malgré le renommage des marchés en 2022) : NQ `209742` (E-mini Nasdaq-100), ES `13874A` (E-mini S&P 500), YM `124603` (E-mini Dow $5), ZN `043602` (T-Note 10 ans).
- **Catégories** : institutionnels (asset managers), spéculateurs (leveraged funds), banques (dealers).
- **Calculs** (`lib/market/cot.ts`, testés) : nette = longs − shorts ; % de l'OI = nette / open interest ; variation = nette − nette du rapport précédent ; **percentile sur 3 ans de la nette en % de l'OI** (l'open interest varie trop en 3 ans pour comparer des contrats bruts). Lecture **relative aux 3 ans** (juste aussi pour une nette vendeuse) : ≥ 90 « Proche du plus haut sur 3 ans », ≥ 80 « Plus acheteurs que d'habitude », ≤ 20 « Plus vendeurs que d'habitude », ≤ 10 « Proche du plus bas sur 3 ans », sinon « Dans la norme » ; badge « extrême » à 90 et plus, ou à 10 et moins (lot D).
- **Dates** : positions du mardi ; publication affichée = le vendredi suivant (règle habituelle). La date de première réception est stockée (`received_at`).
- **Pas repris de la maquette** : RTY, GC, CL, 6E (hors périmètre NQ/YM/ES/ZN), « Lecture Jarvis ».

## Macro US (lot C, partie 3)

Arrêté le 27/11/2026. Page `/dashboard/marches/macro`, sans maquette : langage des maquettes 07 et 08 (cartes, chiffres en police data, mini-graphiques).

- **Séries FRED** : DGS2, DGS10, courbe 10 ans − 2 ans (calculée : DGS10 − DGS2 à la même date, `yieldCurve`, depuis le lot D ; la série T10Y2Y n'est plus utilisée), DFII10, T10YIE, liquidité de la Fed, ICSA, UNRATE, GDPNOW. Par série : dernière valeur, date (ou mois, ou trimestre), variation par rapport à la publication précédente (en points de base pour les taux), mini-graphique sur 1 an, source. Libellés : « Au mar. 24 nov. 2026 », « En octobre 2026 » (mensuel), « Estimation pour le T4 2026 » (GDPNow, avec « Estimation finale du T3 2026 : x,x % » à la place d'une variation).
- **Liquidité de la Fed** (`lib/market/macro.ts`, testée) = WALCL − WTREGEN − RRPONTSYD, en **milliards de dollars**, une valeur par mercredi du bilan. WALCL et WTREGEN sont en millions (÷ 1 000) et hebdomadaires ; RRPONTSYD est en milliards et quotidien (valeur du mercredi, ou la dernière connue avant). Une date sans l'une des trois valeurs est ignorée.

## Sentiment de risque ATP (lot C, partie 4)

Arrêté le 27/11/2026. Page `/dashboard/marches/sentiment`, d'après la maquette 08. Nom : « Sentiment de risque ATP » (pas de « Fear & Greed »).

- **7 composantes** (`lib/market/sentiment.ts`, testé) : stress financier (STLFSI4), risque de marché (NFCIRISK), conditions de crédit (NFCICREDIT), taux réel 10 ans (DFII10), liquidité de la Fed (calcul de la page Macro), courbe 10 ans − 2 ans (DGS10 − DGS2, même calcul que la page Macro), positionnement des asset managers sur ES et NQ (COT, nette en % de l'OI, moyenne des deux percentiles).
- **Calcul** : percentile sur 3 ans de la valeur du jour, **orienté** pour que haut = appétit (stress, risque, crédit et taux réel inversés : 100 − percentile) ; score = moyenne simple des composantes disponibles ; zones : aversion sous 40, neutre de 40 à 60, appétit au-dessus de 60. Contribution de chaque composante = son percentile orienté / nombre de composantes.
- **Historique** : un point par semaine sur 1 an, chaque point calculé avec les seules données connues à sa date (dernière valeur ≤ date).
- **Composante écartée ou sans donnée** : le score se calcule sans elle et la page le dit. Aucune écartée à ce jour (licences vérifiées, partie 1).
- **Différences avec la maquette** : les composantes de la maquette (VIX, S&P 500, spread haut rendement, AUD/JPY, dollar, bitcoin) sont remplacées par les séries publiques de la Fed et de la CFTC (arbitrage de l'étape 0). Pas de « Lecture Jarvis ».

## Calendrier économique (lot D, partie 1)

Arrêté le 27/11/2026. Page `/dashboard/marches/calendrier` (`?vue=jour|semaine&du=AAAA-MM-JJ&impact=fort,moyen,faible&type=publications,fed,adjudications,resultats,feries`), d'après la maquette 04, en heure du membre.

- **Sources** (fichiers et API officiels uniquement, aucun HTML analysé, aucun consensus) :
  | Événements | Source | Conditions |
  |---|---|---|
  | Dates des publications BLS, BEA, Census, DOL, Fed | API FRED `releases/dates` (calendrier officiel des agences) | conditions de l'API FRED, déjà respectées (mention, lien) |
  | Heures des publications du BEA | fichier iCalendar officiel du BEA | gouvernement fédéral US, domaine public |
  | Chiffre publié | API FRED `series/observations` (champ `realtime_start` = date de mise en ligne) | séries « public domain » (vérifié pour chacune) |
  | Adjudications à 10 et 30 ans (et réouvertures), résultat | API TreasuryDirect (`upcoming`, `auctioned`) | Trésor américain, domaine public |
  | FOMC (décision, conférence, minutes) | table officielle de la Fed (`lib/market/central-banks.ts`) | domaine public |
  | Fériés et clôtures anticipées | table de la page Sessions + confirmations de l'admin | — |
  | Résultats d'entreprises, discours de la Fed | saisis par l'admin (Agenda Terminal) | — |
  - Écartés : fichier iCalendar du BLS (refusé aux clients automatiques, HTTP 403) ; le Census n'en publie pas ; aucune source officielle des discours **à venir** des gouverneurs (le flux RSS de la Fed ne couvre que les discours prononcés) → saisie admin ; ISM, Conference Board, Université du Michigan (sous licence) ; consensus (sous licence).
- **Heures** : celles du fichier du BEA quand il les donne ; sinon l'heure habituelle de l'agence (BLS et Census 8:30 ou 10:00 ET, Fed G.17 9:15 ET), signalée « heure habituelle ». Adjudications : heure de clôture des offres compétitives (13:00 ET). Fed : décision 14:00, conférence 14:30, minutes 14:00 ET.
- **Impact « fort »** (ce qui fait bouger NQ et YM) : IPC, rapport sur l'emploi (NFP), PCE (revenus et dépenses), PIB, ventes au détail, décision de la Fed et conférence de presse. **Moyen** : PPI, inscriptions au chômage, JOLTS, coût de l'emploi, minutes de la Fed, discours de la Fed, adjudications à 10 et 30 ans, résultats des grosses capitalisations. **Faible** : production industrielle, mises en chantier, ventes de logements neufs, balance commerciale, prix à l'importation, dépenses de construction.
- **Chiffre publié** : affiché dès que FRED l'a mis en ligne (date de mise en ligne ≥ date de la publication), avec le précédent, sans consensus. Lu à la consultation, sans cron : rien avant l'annonce, cache partagé de 60 s pendant les 3 h qui suivent, puis 1 h (`lib/market/calendar/figure.ts`). Taux des adjudications : cache de 5 min.
- **Ingestion** : source « calendar » dans le cron quotidien (fenêtre de 90 jours passés à 180 jours à venir) ; une publication déplacée par l'agence disparaît de la table (upsert puis suppression des absents de la fenêtre). Dédoublonnage par clé `release:<id>:<date>` : l'heure officielle du BEA l'emporte sur l'heure habituelle.
- **Fenêtres ATP** : ±15 min autour des événements à fort impact, fusionnées quand elles se touchent (décision 14:00 + conférence 14:30 → 13:45–14:45 ET).
- **Page Sessions & horaires** : les créneaux 8:30 et 10:00 des « rendez-vous de la journée US » affichent les vraies publications du jour, ou « Aucune publication ».
- **Résultats : liste de départ (pondérations du Nasdaq-100 et du Dow)** : Apple, Microsoft, Nvidia, Amazon, Alphabet, Meta, Broadcom, Tesla, Costco, Netflix, AMD, Goldman Sachs, UnitedHealth, Home Depot, Caterpillar, Visa, JPMorgan, Salesforce, McDonald's, Boeing.

## Agenda Terminal (admin, lot D, partie 2)

Page admin « Agenda Terminal » (groupe Terminal), route `/api/admin/terminal-agenda` (admin uniquement, 404 sinon ; saisies validées par `lib/market/agenda-admin.ts`, testé ; écriture par le service-role ; cache partagé des pages Terminal invalidé après chaque écriture).

- **Résultats d'entreprises** : date (New York), ticker, avant l'ouverture ou après la clôture (heure indicative 8:00 ou 16:05 ET dans le calendrier), nom proposé d'après la liste de départ. Impact moyen.
- **Discours de la Fed** : date, heure de New York facultative, intitulé. Saisie manuelle faute de source officielle des discours à venir.
- **Horaires CME des jours de fête** : pour chaque jour de la table, plages Globex (schéma du code par défaut, corrigeables) et confirmation. Table `market_holiday_confirmations`, appliquée par `applyConfirmations` aux pages Sessions & horaires et Calendrier : « à confirmer » disparaît, les plages corrigées remplacent celles du code.

## Banques centrales (lot D, partie 3)

Page `/dashboard/marches/banques-centrales`, d'après la maquette 05, en heure du membre.

- **Contenu** : pour la Fed, la BCE et la BoJ, taux directeur actuel, dernier changement (date d'effet), issue de la dernière réunion (hausse, baisse, maintien), prochaine réunion (J−n, heure de la décision chez le membre, projections, « date à confirmer »), graphique en escalier sur 3 ans, réunions des 12 prochains mois. Bandeau « Prochaine décision » avec compte à rebours, heures de la décision et de la conférence, fenêtre ATP (±15 min, fusionnée).
- **Sources** :
  | Donnée | Source | Conditions |
  |---|---|---|
  | Fourchette des fed funds | FRED `DFEDTARL`, `DFEDTARU` (Board of Governors) | domaine public, mention FRED |
  | Taux de dépôt et de refinancement de la BCE | API de données de la BCE (`FM/D.U2.EUR.4F.KR.DFR.LEV`, `MRR_FR`) | réutilisation libre, y compris commerciale, source citée, données non modifiées, mention de la gratuité (`ECB_NOTICE`) |
  | Décisions de la BoJ | communiqués de politique monétaire de la BoJ, table `BOJ_DECISIONS` (recoupée avec la série officielle du taux de base des prêts) | conditions de l'API de la BoJ publiées en japonais seulement → table saisie depuis les communiqués, pas d'appel automatique |
  | Calendriers des réunions | pages officielles de la Fed, de la BCE et de la BoJ (tables de `lib/market/central-banks.ts`, à prolonger chaque année) | — |
- **FOMC 2027** (retouche du lot E) : dates exactes de la page officielle de la Fed (« Last Update: November 18, 2026 ») : 8 réunions, la dernière les 16-17 novembre, aucune en décembre ; celle des 26-27 octobre est annotée « Monetary Policy Strategy Meeting » ; réunion annoncée les 25-26 janvier 2028. Toutes « à confirmer » (la Fed confirme chaque date à la réunion précédente). Table statique, à relire chaque année sur la page de la Fed.
- **Mobile** : « Les 3 suivies » passe en une carte par banque sous 768 px.
- **Heures** : Fed 14:00 (décision) et 14:30 (conférence) à New York ; BCE 14:15 et 14:45 à Francfort ; BoJ sans heure fixe (fin de réunion, matinée à Tokyo), signalé sur la page.
- **Probabilités** : Fed seulement, **lien** vers le Market Probability Tracker de la Fed d'Atlanta, sans ses chiffres : ses conditions n'autorisent la reprise que sans but commercial. Pas de CME FedWatch ni de Polymarket. Aucune probabilité pour la BCE et la BoJ (pas de source officielle gratuite).

## Saisonnalité (lot E, partie 1)

Page `/dashboard/marches/saisonnalite`, d'après la maquette 09, en heure du membre (mois en cours encadré).

- **Repère des indices US : S&P 500 de Robert J. Shiller** ([shillerdata.com](https://shillerdata.com/), fichier `ie_data.xls`, feuille « Data »). Le fichier ne porte qu'un avertissement (pas de garantie, pas de conseil), aucune restriction d'usage ; source citée en bas de page. Les prix de Shiller sont des **moyennes mensuelles des clôtures quotidiennes** : un rendement mensuel est la variation d'une moyenne à la suivante (d'où de petits écarts avec des rendements de fin de mois).
- **Rien que des statistiques** : moyenne, médiane, part des années en hausse, volatilité (écart type), meilleure et pire année, trajectoire cumulée en %. **Jamais les niveaux de l'indice** : le repo ne garde que les rendements mensuels calculés (`lib/market/seasonality/sp500-returns.ts`, depuis 1950, mois partiel exclu).
- **Fenêtres** : par mois, les 20 dernières années complètes (2006–2025 aujourd'hui) ; cycle présidentiel depuis 1950 (19 années par position du cycle). L'année en cours (2026, jusqu'au dernier mois complet) n'entre pas dans les moyennes : elle est affichée à côté (colonne et trajectoire).
- **Cycle présidentiel** : 1 = lendemain d'élection (2025), 2 = mi-mandat (2026), 3 = veille d'élection (2027), 4 = élection (2028). Rendement de l'année civile (12 mois composés) par position, position du membre mise en avant, et moyenne mois par mois des années de même position.
- **Lecture** : 3 phrases rédigées par des règles (`seasonalityReading`, testé) : régularité du mois en cours (rang parmi les 12), année en cours contre une année moyenne, position dans le cycle ; puis « vent de fond, jamais un signal d'entrée ». Pas d'IA.
- **Ta saisonnalité** (journal `trading_sessions` du membre, ses seules lignes) : P&L ($) et taux de réussite par mois et par jour de la semaine, à partir de **20 sessions** ; par heure, à partir de **20 trades horodatés** (seules les sessions saisies en Session live ont l'heure de chaque trade, dans le fuseau de l'appareil au moment de la saisie). En dessous du seuil : message avec le minimum et le nombre actuel.
- **Exclus** : forex, or, pétrole, VIX ; NQ et ES plus tard, avec une licence CME.
- **Mise à jour annuelle (en janvier)** : télécharger `ie_data.xls` sur shillerdata.com, exporter la feuille « Data » en CSV sans la modifier, puis `npx vite-node --config vitest.config.ts scripts/seasonality-shiller.ts -- <CSV> <dernier mois complet AAAA-MM> <date du téléchargement AAAA-MM-JJ>`. Le script réécrit `sp500-returns.ts` ; vérifier le diff, lancer les tests (`lib/market/seasonality`), committer. Les fenêtres avancent toutes seules (`seasonalityWindow`).

## Vue d'ensemble (lot E, partie 2)

Page `/dashboard/marches`, d'après la maquette 01, dans le fuseau du membre. Rassemble l'essentiel des autres pages, **avec leurs propres calculs** (aucune donnée ni règle propre à cette page) ; chaque bloc renvoie vers sa page.

- **Briefing du jour** (`lib/market/overview/briefing.ts`, testé) : un titre et 6 lignes rédigés par des règles, sans IA ni appel payant.
  - Titre, première règle qui s'applique : Wall Street fermée aujourd'hui → clôture anticipée aujourd'hui (heure du membre) → une annonce à fort impact aujourd'hui (heure et fenêtre ATP) → plusieurs (« journée chargée ») → veille de fermeture → veille de clôture anticipée → « pas d'annonce à fort impact aujourd'hui ». Jours fériés en date de New York, « aujourd'hui » en date du membre.
  - Lignes : agenda (3 prochaines annonces fortes sur 7 jours, avec fenêtre ATP), taux (prochaine décision Fed / BCE / BoJ), sentiment (score et il y a une semaine), positionnement (positions extrêmes du COT, percentile ≤ 10 ou ≥ 90 sur 3 ans), saisonnalité du mois, prochain roll.
- **Blocs** : sentiment (score, jauge, 1 semaine et 1 mois), annonces fortes à venir avec fenêtres ATP, prochaine décision de chaque banque centrale (taux, J−n, heure), état des sessions et de NQ/YM au chargement de la page avec prochain changement, prochain roll (vers le contrat suivant), échéance et OPEX, COT (institutionnels et spéculateurs sur NQ, ES, YM, ZN, extrêmes en couleur), Macro (taux 10 ans, taux réel 10 ans, liquidité de la Fed), saisonnalité du mois (S&P 500 et année du cycle).
- **Pas de cotations ni de mouvements de prix** ; pas de squawk, de Jarvis ni de probabilités de marché (exclus ou pour plus tard). Le score de sentiment est partagé avec sa page (`buildSentimentInputs`, mêmes composantes écartées).

## Analyse d'action hors du Terminal (lot E2, partie 0)

Arrêté le 27/11/2026. **Analyse d'action reste dans Mon trading › Outils, même quand `TERMINAL_ACCESS` est à « all ».** Elle utilise des données Yahoo, non autorisées en usage commercial ; le Terminal ne garde que des sources officielles et autorisées.

- Retirée de Marchés › Analyse (`lib/nav/markets-nav.tsx`), toujours en fin d'Outils (`lib/nav/trader-nav.tsx`) ; ⌘K la range dans Mon trading › Outils.
- Aucune page du SPA n'est plus rangée dans Marchés (`MARKETS_SPA_PAGES` vide) : le mécanisme reste, sans usage.
