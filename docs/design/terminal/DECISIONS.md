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
- Barre d'onglets mobile.

## Décisions d'implémentation (étape 1, menu)

- **Deux espaces, deux mécanismes.** « Mon trading » reste le SPA de `/dashboard` (un `switch` sur `activePage`). « Marchés » est fait de vraies routes App Router sous `/dashboard/marches/*`, avec leur propre layout.
- **L'espace actif se dérive de l'URL**, rien n'est persisté : `/dashboard/marches/*` = Marchés ; dans le SPA, Marchés si la page active appartient à l'espace Marchés (aujourd'hui : Analyse d'action).
- **Passage d'un espace à l'autre : `/dashboard?page=<id>`.** Le SPA lit ce paramètre au montage, ouvre la page si l'id est connu, puis retire le paramètre de l'URL (`history.replaceState`) pour qu'un rechargement ultérieur ne rouvre pas une page périmée. Un id inconnu est ignoré, le Dashboard s'ouvre comme avant.
- **Analyse d'action est passée dans Marchés › Analyse.** C'était simple : elle reste un écran du SPA (`/dashboard?page=stock-analysis`), et quand elle est ouverte le SPA affiche le menu et la barre du haut de l'espace Marchés.
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
- **Membre, espace masqué** : pas de sélecteur Mon trading / Marchés, rien de Marchés dans ⌘K, Analyse d'action revient dans Mon trading › Outils (dernière position). Le menu Mon trading réorganisé reste pour tout le monde.
- **Membre, `all`** : comportement de l'étape 1 (Analyse d'action dans Marchés › Analyse).
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
