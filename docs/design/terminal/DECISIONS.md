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
- **Horloges Marchés** : « Ton heure » (fuseau du navigateur en attendant `profiles.timezone` à l'étape 2), Londres, New York, Tokyo. Rendues côté client uniquement (piège d'hydratation #418). Pas de pastille ouvert/fermé : elle dépend des fériés et des clôtures anticipées, elle arrive avec Sessions & horaires.
- **Admin** : exception dans `proxy.ts` pour `/dashboard/marches` (et ses sous-pages). Le reste de `/dashboard` redirige toujours un admin vers `/admin/dashboard`, y compris le bouton « Mon trading » et Analyse d'action.
- **Gate Whop** : inchangé. `/dashboard/marches/*` est couvert par le `startsWith('/dashboard')` existant.
