# ÉTAPE 0 — AUDIT (lecture seule)

## Préalable Playwright

`claude` n'est pas dans le PATH (`which claude` → not found), donc j'ai créé [.mcp.json](.mcp.json) à la racine — seule modification de cette étape, non commitée :

```json
{ "mcpServers": { "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] } } }
```

**Vérifier qu'il est actif, à la prochaine session :** tape `/mcp` — `playwright` doit apparaître dans la liste avec le statut connecté. Claude Code demande d'approuver un serveur project-scoped au premier chargement : il faut accepter, sinon il reste inerte. Les outils s'appellent alors `mcp__playwright__browser_navigate`, `browser_resize`, `browser_take_screenshot`, `browser_console_messages`. Le premier lancement télécharge le paquet via `npx` et peut réclamer `npx playwright install chromium`. Test de bout en bout : lui faire ouvrir `file:///Users/gaelnaime/DEV/ATP%20Dashboard%20coaching/docs/design/terminal/00-menu.html` et capturer en 1440 puis 390.

Ta règle « aucun scraping de site tiers, Playwright compris » reste respectée : il ne sert qu'au QA visuel de nos écrans et à l'ouverture des maquettes locales.

> ⚠️ `docs/design/terminal/` n'est **pas commité** (`?? docs/design/`). La source de vérité du design est hors contrôle de version — à inclure dans le commit 1.

---

## 1. Navigation

**Où c'est déclaré.** [lib/nav/trader-nav.tsx](lib/nav/trader-nav.tsx) exporte `TRADER_NAV` + `TRADER_FOOTER_ITEMS` ; [lib/nav/admin-nav.tsx](lib/nav/admin-nav.tsx) son pendant. Les types `NavItem` / `NavGroup` vivent ailleurs, dans [components/ui/AppSidebar.tsx](components/ui/AppSidebar.tsx) — et **aucun ne porte de `href`** : la nav est 100 % `id`-based (`onPageChange(id)`). Icônes = SVG JSX inline, pas lucide.

Groupes actuels : **Aujourd'hui** (Dashboard, Routine pré-marché, Saisie de session) · **Mon journal** (Bilan perso 2027, Sessions, Mon cahier, Ma progression, Achievements) · **Analyse** (Stats, Analyse IA, Analyse graphique, Backtest, Analyse d'action) · **Capital** (Prop Firm, Calculateur) · **Coaching** (Sessions coaching, Trades Live Coach, Formation). 18 items + 3 en footer = 21, exactement le cardinal du type `DashboardPage`.

**Comment une page est montée — réponse factuelle : `switch(activePage)`.** `find app/dashboard -type f` ne renvoie qu'**un seul fichier**, [app/dashboard/page.tsx](app/dashboard/page.tsx) : `useState<DashboardPage>('dashboard')` + un `switch` de 21 `case`. Pas de sous-route, pas de `layout.tsx`, pas de `searchParams`, et jotai est dans `package.json` avec zéro import. Conséquences : pas de deep-link, pas de bouton retour, reload = retour au Dashboard.

**Palette ⌘K : elle existe déjà et lit `lib/nav`.** [components/ui/CommandPalette.tsx](components/ui/CommandPalette.tsx) exporte `flattenNavForPalette(groups, footerItems, label)`, appelé en [app/dashboard/page.tsx:101](app/dashboard/page.tsx#L101). Le `groupLabel` est déjà rendu en badge à droite de chaque résultat — le « Marchés · Positionnement » de la maquette est à une concaténation près. A11y déjà en place (`role="dialog"`, focus trap, ↑↓/Enter/Escape). Le raccourci est dans le shell, dupliqué trader + admin.

**Barre du haut.** [components/ui/AppTopbar.tsx](components/ui/AppTopbar.tsx) = `{ title, actions }`, agnostique des données. Le cluster trader injecte `TopbarStats` (4 requêtes Supabase **depuis le navigateur**, 9 tuiles P&L/win rate/streak) et un `TopbarDate` rendu client-only avec un commentaire explicite sur le hydration mismatch React #418 — à reproduire pour toute horloge.

**`app/marches/` : tranché, ce n'est pas le futur espace.** C'est une landing publique marketing de septembre (widgets TradingView + iframe Bloomberg), déclarée dans `publicRoutes`. En revanche [components/marches/TradingViewWidget.tsx](components/marches/TradingViewWidget.tsx) est une primitive réutilisable — mais **pas dans l'espace membre** : des widgets tiers côté client contredisent ta règle « toute la data passe par des API appelées côté serveur, aucune clé côté client ».

**Admin.** Séparation totale par route, **zéro entrée conditionnelle par rôle** dans `lib/nav` (grep confirmé). Il n'existe donc aucun mécanisme de gating de nav à réutiliser.

**Mobile : rien n'existe.** Aucune barre d'onglets, aucun drawer, aucun `useMediaQuery`, zéro `md:hidden` dans tout le projet. `AppSidebar` est `position: fixed` en 240/68 px **sans media query**, et le shell applique `marginLeft: var(--app-sidebar-width)` inconditionnellement.

### Comment passer à 2 espaces sans rien casser — ma reco

**Hybride : on ne touche pas à l'existant, on ajoute de vraies routes.** « Mon trading » reste le SPA actuel à `/dashboard` (zéro risque sur 21 `case` + un `Record` exhaustif), et « Marchés » devient de vraies routes App Router sous **`/dashboard/marches/*`**, en Server Components.

Pourquoi ce découpage :
- le gate Whop couvre `/dashboard` et tout son sous-arbre automatiquement (§5) ;
- les pages Marchés sont en lecture quasi-pure depuis Supabase → Server Components, cacheables, aucune clé côté client ;
- les deep-links marchent, et ⌘K peut sauter d'un espace à l'autre — ce que la maquette montre explicitement ;
- aucune régression possible sur l'espace trading.

Trois changements additifs, non cassants :
1. `NavItem.href?: string` optionnel dans `AppSidebar` (les 21 items existants n'en ont pas → comportement inchangé), rendu en `<Link>` quand présent.
2. Un slot entre le bloc logo et `<nav>` pour le segmented control. L'espace actif se **dérive du pathname**, rien à persister — la maquette n'a elle-même aucun état.
3. `lib/nav/markets-nav.tsx` + extension de `flattenNavForPalette` pour préfixer le `groupLabel` par l'espace.

**Le piège admin.** [proxy.ts](proxy.ts) redirige tout admin sur `/dashboard*` vers `/admin/dashboard`. **En l'état, un admin ne peut pas ouvrir l'espace Marchés.** Il faut une exception explicite dans le proxy pour `/dashboard/marches` — sinon tu ne pourras pas voir tes propres écrans.

---

## 2. Réutilisable

**FRED : aucune intégration.** `grep -rniE "fred|stlouisfed|DGS10|T10Y2Y"` → 0 résultat en code. Les seules mentions sont dans les maquettes. Le VIX actuel vient de **Yahoo (`^VIX`)**, pas de FRED.

**`lib/chart-tokens.ts`** sert uniquement à Chart.js : un `<canvas>` ne parse pas les variables CSS, donc `chartTokens()` les résout en JS via `getComputedStyle`. Exports : `chartTokens()`, `verticalGradient()`, `barGradientByValue()`. **Inutile pour Recharts** (le SVG résout `var()` nativement) — c'est documenté dans [components/dashboard/AtpScoreCard.tsx](components/dashboard/AtpScoreCard.tsx).

**Tokens : la correspondance est quasi parfaite.** Les hex des maquettes *sont* tes tokens :

| Maquette | Token | Rôle |
|---|---|---|
| `#C9A574` | `--color-accent` | or = interaction ✅ exact |
| `#22C55E` | `--color-profit` | vert = positif ✅ exact |
| `#EF4444` | `--color-loss` | rouge = négatif ✅ exact |
| `#0C0C0E` / `#121214` / `#18181b`… | `--color-surface-0/1/2/3` (`#09090b`/`#111113`/`#18181b`/`#222225`) | léger écart, à accepter |

Bonus : `--color-series-1..6` existe déjà avec un commentaire explicite « zéro vert, zéro rouge » — c'est la palette pour tout breakdown catégoriel. Écart de police à assumer : maquettes en JetBrains Mono, `--font-data` = DM Mono. Le README dit « approximations de la DA », donc on prend les tokens.

**Primitives qui existent vraiment :** `PageHeader`, `KpiCard` (avec skeleton de chargement aux dimensions exactes, sparkline, tones), `DataTable` (tri, loading rows, empty), `EmptyState`, `Badge` (47 tones), `Card`, `Button`, `Modal`, `AppSidebar`, `AppTopbar`, `CommandPalette`, `AnimatedNumber` (GSAP).

**Ce qui n'existe pas — à ne pas inventer :** ❌ `Tabs`, ❌ `Tooltip`, ❌ `Skeleton` autonome (il n'est embarqué que dans `KpiCard` et `DataTable`), ❌ frise/timeline générique, ❌ jauge linéaire non couplée au domaine. `components/shadcn/` est un bac à sable importé **uniquement** par `app/(lab)/_test/page.tsx`, avec ses tokens oklch scopés dans `lab-tokens.css` : utiliser `shadcn/tabs` en prod demande d'abord de régler ce scoping.

### Recharts ou Chart.js — reco : **Recharts**, mais pas partout

Chart.js est l'historique (4 fichiers, courbes d'équity + barres P&L). Recharts est la direction prise (6 fichiers, tout le récent, dont le `(lab)/_test` validé), le SVG résout les tokens nativement — donc « jamais de hex en dur » est gratuit — et `.claude/skills/recharts/` est déjà dans le repo.

Mais **la moitié des visuels des maquettes ne sont pas des graphiques** :

| Visuel | Outil | Pourquoi |
|---|---|---|
| Courbes COT 52 sem., sentiment 12 mois, proba Fed 30 j, trajectoire saisonnière | **Recharts** `LineChart`/`AreaChart` + `ReferenceLine` (seuils 50 %, 40/60) + `ReferenceArea` (bandes de zone) | vraies séries temporelles |
| Histogramme saisonnalité 12 mois signé | **Recharts** `BarChart` + `<Cell>` par barre + `ReferenceLine y={0}` | couleur par signe |
| Jauge demi-cercle sentiment | **SVG inline** | c'est un arc + une aiguille ; la géométrie exacte est décodée (`angle = 180 − 1,8 × valeur`, r=96, centre 120/118, seuils d'arc à 40 et 60). Recharts ajouterait du poids pour rien. Récupérer la logique de paliers d'`AtpScoreCard` |
| Horloge radiale 24 h | **SVG inline** | `θ = h/24 × 360°` depuis le haut, aiguille longueur 150 |
| Frise 24 h des sessions | **CSS pur** | `left = h/24 × 100 %`, `width = durée/24 × 100 %`, wrap en 2 segments au passage de minuit |
| Barres de centile, index COT, % années en hausse, barre empilée de probas | **CSS pur** | `width: <valeur>%`, rien de plus |

Alias à respecter pour éviter la collision avec `shadcn/tooltip` : `Tooltip as RTooltip`.

### Fuseaux horaires — le vrai trou

**Aucun helper centralisé.** [lib/format.ts](lib/format.ts) a `fmtDate`/`fmtDateShort` **sans option `timeZone`** (donc fuseau du navigateur) et pas de `fmtTime`. `lib/daily.ts` n'a rien à voir avec les dates — c'est le wrapper Daily.co (visio). La logique est dupliquée : `const TZ = 'America/Guadeloupe'` dans les deux `Coaching.tsx` (avec des `fmtDate` locaux qui **shadowent** ceux de `lib/format`, comportement différent), inline dans 2 routes API, et `Europe/Paris` inline dans 2 autres fichiers. La seule vraie primitive de conversion est `zonedTimeToUtc()` enterrée dans un composant de 80 ko, [components/jarvis/JarvisVoiceInterface.tsx:1781](components/jarvis/JarvisVoiceInterface.tsx#L1781).

Et **`profiles` n'a pas de colonne de fuseau** (le select du proxy ne lit que `role, email, whop_subscription_active`).

→ `lib/time.ts` + `profiles.timezone` sont un **prérequis** de 3 des 6 pages de la phase 1. Aucune dépendance date dans le projet (ni date-fns, ni luxon) : tout en `Intl` natif, ce qui suffit avec les zones IANA.

---

## 3. Backend

**60 routes** sous `app/api/`. Rien sous `markets`, `marches`, `fred`, `cftc`, `polymarket` → l'espace n'a aucun backend.

**Clients Supabase.** [lib/supabase/client.ts](lib/supabase/client.ts) → `createBrowserClient`, anon, pour les composants `'use client'`. [lib/supabase/server.ts](lib/supabase/server.ts) → `createServerClient` + cookies, anon, **RLS sous l'identité du membre**, pour Server Components et route handlers. **Il n'y a pas de fichier service-role** : le pattern est recopié à la main dans 6 modules (`lib/google.ts`, `lib/ai/quota.ts`, `lib/jarvis/session-write.ts`, le cron Whop…). → créer `lib/supabase/admin.ts`.

**Migrations.** Convention `YYYYMMDD######_snake_case.sql`, 50 fichiers. Cinq patterns RLS coexistent ; les deux qui t'intéressent :

- **Lecture tous / écriture admin** — [supabase/migrations/20260326000004_live_trades.sql](supabase/migrations/20260326000004_live_trades.sql) : `for select using (true)` + 3 policies `exists (select 1 from profiles where id = auth.uid() and role = 'admin')`.
- **Service-role seul** — [supabase/migrations/20261123000001_whop_sync_journal.sql](supabase/migrations/20261123000001_whop_sync_journal.sql) : RLS activée, **zéro policy**.

**Reco pour les tables de marché partagées :** lecture `using (auth.uid() is not null)` — précédent exact sur `resources` dans `initial_schema.sql:131` — et **aucune policy d'écriture du tout**, le service role bypassant la RLS. Attention : le `using (true)` de `live_trades` autorise aussi `anon`, ce qui serait faux pour un espace payant.

Tables globales déjà existantes : `live_trades`, `app_settings`, `skill_items`, `resources`, + `whop_sync_journal`.

**Planification : pg_cron NON configuré, pg_net NON configuré, `supabase/functions/` inexistant, `supabase/config.toml` inexistant**, aucune `create extension` dans aucune migration. Tout passe aujourd'hui par Vercel : **un seul cron**, `/api/cron/whop-reconcile` à `0 6 * * *`, avec un pattern à copier tel quel (Bearer `CRON_SECRET` + `timingSafeEqual` maison + 404 silencieux + service role + journal d'audit + logique pure déportée dans `lib/`).

### Où planifier les ingestions

Tu m'as dit de demander, donc : **quel est ton plan Vercel ?** C'est la seule inconnue qui change la réponse. Le repo n'en contient aucune preuve, mais les quatre indices observables (1 cron, fréquence journalière, `maxDuration` jamais > 60, une seule région) sont compatibles avec Hobby.

- **Hobby** : 100 crons par projet désormais, mais **tous limités à 1×/jour**, avec une précision de ±59 min.
- **Pro** : jusqu'à la minute.

**Reco : rester sur les crons Vercel, pas Supabase Cron.** Raison : la phase 1 tient entièrement en cadence quotidienne, et Supabase Cron demanderait d'initialiser une infra qui n'existe pas du tout (extensions, `config.toml`, Edge Functions) pour un besoin que tu n'as pas encore. Le détail par source :

| Ingestion | Cadence réelle nécessaire | Tient en Hobby ? |
|---|---|---|
| COT (CFTC) | 1×/jour en polling (voir §7 : le calendrier change) | ✅ |
| FRED (sentiment + macro) | 1×/jour | ✅ |
| Saisonnalité | 1×/mois + backfill one-shot | ✅ |
| Taux directeurs / dates de réunion | quasi-statique, table seedée | ✅ pas de cron |
| Probabilités BC « toutes les 15 min » | sub-journalier ❌ | …mais c'est précisément la source bloquée juridiquement (§7). En la retirant, la contrainte disparaît |

Garde Supabase Cron en réserve pour la phase 2 (squawk, calendrier), où le sub-journalier devient réel.

---

## 4. Variables d'environnement (noms uniquement)

36 référencées via `process.env`, aucune valeur lue, aucun fichier d'env ouvert.

- **Supabase (3)** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Whop (7)** : `WHOP_API_KEY`, `WHOP_API_VERSION_DATE`, `WHOP_PRODUCT_ID`, `WHOP_COMPANY_ID`, `WHOP_GATE_ENABLED`, `WHOP_BYPASS_EMAILS`, `NEXT_PUBLIC_WHOP_CHECKOUT_URL`
- **IA / voix (10)** : `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `JARVIS_BRAIN_MODEL`, `JARVIS_BRAIN_MODEL_LIVE`, `JARVIS_ENABLED`, `JARVIS_ALLOWED_EMAILS`, `JARVIS_TESTERS`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `AI_QUOTA_MODE`
- **Email (3)** : `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL`
- **Marché (1)** : `FINNHUB_API_KEY` — **la seule clé de marché du projet**. Yahoo, TipRanks, ForexFactory, CNN : tous sans clé.
- **Cron / secrets (2)** : `CRON_SECRET`, `UNSUBSCRIBE_SECRET`
- **Google / visio (3)** : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DAILY_API_KEY`
- **Flags (2)** : `BACKTEST_V2_ENABLED`, `BACKTEST_V2_TESTERS`
- **Plateforme (5)** : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BUILD_ID`, `NODE_ENV`, `VERCEL_GIT_COMMIT_SHA`

**À créer pour la phase 1 :** `FRED_API_KEY` (gratuite, compte St. Louis Fed), `EIA_API_KEY` (gratuite, US gov). Optionnel : `CFTC_APP_TOKEN` (jeton Socrata, relève juste la limite de débit par IP ; l'API marche sans). CFTC, Banque mondiale et Coinbase ne demandent aucune clé.

Deux remarques : `.env.example` n'existe pas (c'est `.env.local.example`, **8 clés contre 36 référencées** — très en retard, et `WHOP_GATE_ENABLED` n'y figure pas) ; et `DATABASE_URL` / `DIRECT_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` y sont alors qu'elles ne sont référencées nulle part (vestiges Prisma).

---

## 5. Gate Whop — confirmé, avec trois réserves

Le matcher de [proxy.ts](proxy.ts) attrape tout sauf les assets statiques. Le code de décision :

```ts
const gateEnabled = process.env.WHOP_GATE_ENABLED === 'true'
if (gateEnabled && pathname.startsWith('/dashboard')) {
  const isBypassed = isAdmin || bypassEmails.includes(email)
  if (!isBypassed && profile && profile.whop_subscription_active !== true) {
    return NextResponse.redirect(new URL('/whop/subscription-required', request.url))
  }
}
```

**Oui : une page `/dashboard/marches/*` comme un onglet rendu dans `/dashboard` sont couverts automatiquement, sans rien ajouter.** Le test est un `startsWith('/dashboard')`, donc tout le sous-arbre hérite.

Les trois réserves :

1. **Ne jamais mettre l'espace sous `/marches`.** C'est dans `publicRoutes` et le test est un `startsWith` → `/marches/**` serait entièrement public et non gaté.
2. **`/api/*` n'est pas gaté** : `isApiRoute` sort avant. Chaque route de lecture marché devra faire son propre contrôle (pattern `requireUser()` de `lib/ai/quota.ts:71-84`) et/ou s'appuyer sur la RLS via `lib/supabase/server.ts`.
3. **L'admin est redirigé hors de `/dashboard`** → exception à ajouter dans le proxy (cf. §1).

**État du gate :** `=== 'true'` strict, donc OFF par défaut, et la variable n'est pas dans `.env.local.example`. Je n'ai pas ouvert `.env.local`, je ne peux donc pas dire s'il est actif — à vérifier via `vercel env ls`. Note aussi le **fail-open assumé** : si `profile` est `null` (glitch DB), la condition `&& profile` est fausse et on laisse passer, avec un commentaire qui l'explicite.

---

## 6. Jarvis — je ne touche à rien

**Contexte** : deux étages dans [lib/jarvis/brain.ts](lib/jarvis/brain.ts). `prepareContext()` (ligne 274) fait l'I/O — un `Promise.all` de 6 requêtes sur le client SSR, **user-scoped**, avec caches mémoire par user et TTL. `buildContextMessage()` (ligne 480) sérialise en system message, sans I/O.

**Outils / function-calling : il n'y en a aucun.** `grep -rniE "tools:|tool_choice|function_call"` → 0 résultat. Architecture 100 % prompt-stuffing, doctrine « le CODE fait foi ».

**Point d'extension — un précédent exact existe déjà** : [lib/jarvis/market-context.ts](lib/jarvis/market-context.ts). `buildMarketBlock()` (ligne 127) produit le bloc marché, `getMarketBlock()` (ligne 178) l'enveloppe d'un cache module-level de 5 min **partagé entre tous les utilisateurs** (légitime : données publiques), `needsMarketContext()` (ligne 198) est un déclencheur lexical. Deux call sites symétriques seulement : `chat/route.ts:125-127,140` et `voice/route.ts:285-287,300`.

→ **Le jour où on branche les tables du Terminal, on étend `buildMarketBlock()` pour qu'il lise Supabase au lieu de fetcher Yahoo/ForexFactory/CNN en synchrone. Zéro ligne à changer dans `brain.ts` ni dans les routes.** Budget documenté : < 400 tokens. À ne **pas** faire : ajouter une 7ᵉ requête dans `prepareContext`, qui est inconditionnel et user-scoped alors que les données de marché sont globales.

---

## 7. Plan de la phase 1

### Une correction de périmètre d'abord

Les maquettes affichent sur **les 9 pages** un bandeau ticker LIVE à 10 instruments (NQ, ES, YM, RTY, GC, CL, VIX, US10Y, EUR/USD, USD/JPY). Or le README classe « graphiques et heatmaps (cotations sous licence) » en phase 3. **Les cotations temps réel sont de la data licenciée** : en phase 1, la topbar Marchés ne porte que les 4 horloges, pas le ticker. Même logique sur « Vue d'ensemble » : ses blocs *Prochaines publications* et *Squawk* dépendent de sources de phase 2 et resteront en `EmptyState`.

### Les sources, vérifiées une par une

**COT — CFTC, propre et gratuit.** Datasets confirmés en interrogeant l'API :

| Rapport | Dataset ID | Pour |
|---|---|---|
| TFF_All | `udgc-27he` | NQ, ES, YM, RTY, 6E, ZN |
| Disaggregated_All | `rxbv-e226` | GC, CL |

Les deux contiennent futures-only **et** combined dans la même table : filtrer sur `futonly_or_combined`. Champs confirmés : `report_date_as_yyyy_mm_dd`, `contract_market_name`, `cftc_contract_market_code`, `open_interest_all`, `lev_money_positions_long`/`_short` (Spéculateurs), `asset_mgr_positions_long`/`_short` (Institutionnels), `dealer_positions_long_all`/`_short_all` (Banques), `m_money_positions_long_all`/`_short_all` (Managed money), et les `change_in_*` hebdo. Attention : la coquille `swap__positions_short_all` (double underscore) est réelle dans le schéma. Sans clé ; Socrata limite par IP.

**⚠️ Le calendrier de publication change.** La page officielle dit encore « vendredi 15:30 ET, données du mardi précédent, décalage de 1-2 jours les jours fériés ». Mais le **communiqué 9316-26 du 27/10/2026** annonce le passage à **deux publications par semaine d'ici fin 2026** : mercredi = données du lundi, vendredi = données du mercredi, les deux à 15:30 ET. → **ne pas planifier sur vendredi** : polling quotidien, upsert sur nouveau `report_date`, et stocker le `published_at` réel plutôt que `report_date + 3 jours` (la maquette montre déjà le décalage Thanksgiving).

Formules à décider côté code, elles ne sont nulle part dans les maquettes (zéro JS) : `net = long − short`, `% OI = net / open_interest_all` (vérifié : −18 400/285 400 = −6,4 %), et l'index COT = `100 × (net − min₃ₐₙₛ) / (max₃ₐₙₛ − min₃ₐₙₛ)` sur 156 semaines, avec les seuils lus dans le dégradé de la jauge : **≤ 20 extrême vendeur, 20-80 neutre, ≥ 80 extrême acheteur**.

**FRED — gratuit, mais avec une obligation et un piège.** Clé gratuite. **Mention obligatoire à afficher visiblement** : « This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis », plus un lien vers leurs conditions. Le piège : les séries **appartenant à des tiers** portent le mot « Copyright » et un propriétaire nommé dans leurs *notes*, et leurs conditions disent d'obtenir la permission du propriétaire pour tout usage autre que personnel. À distinguer du simple tag « Copyrighted: Citation Required » que portent les séries produites par la Fed (vérifié sur `NFCI` et `STLFSI4` : aucun propriétaire tiers dans les notes).

Les 7 composantes du sentiment, triées par risque — le score est la **moyenne simple des 7 centiles sur 1 an** (vérifié exactement : 42+58+31+36+52+61+28 = 308, 308/7 = 44), seuils < 40 aversion / 40-60 neutre / > 60 appétit :

| # | Composante | Série | Licence |
|---|---|---|---|
| 4 | AUD/JPY 20 j | `DEXUSAL` + `DEXJPUS` | ✅ Fed, domaine public |
| 5 | Dollar large 20 j | `DTWEXBGS` | ✅ Fed |
| 6 | Courbe 10a−2a | `T10Y2Y` | ✅ Fed/Treasury |
| 7 | Momentum BTC 20 j | Coinbase | ⚠️ conditions introuvables, à vérifier |
| 1 | Volatilité VIX | `VIXCLS` | ⚠️ copyright **Cboe** dans les notes |
| 2 | Tendance actions (S&P vs MM125) | `SP500` | ⚠️ copyright **S&P** + historique limité à 10 ans sur FRED |
| 3 | Crédit (HY spread 20 j) | `BAMLH0A0HYM2` | ⚠️ copyright **ICE Data Indices** |

Substituts 100 % domaine public si tu veux lever toute ambiguïté : `NFCI` et ses sous-indices `NFCIRISK` / `NFCICREDIT` (Chicago Fed) et `STLFSI4` (St. Louis Fed) couvrent volatilité et crédit — mais en **hebdomadaire**, et ça change la liste des composantes de la maquette. C'est une des arbitrations ci-dessous.

**Polymarket — bloqué.** La maquette 05 dit « source prévue Polymarket (API publique) ». Leurs conditions d'utilisation interdisent l'accès aux données via une API et interdisent de revendre ou redistribuer les données sans accord écrit ; leur page institutionnelle étend la restriction à toute donnée Polymarket « sous forme brute, dérivée, agrégée ou anonymisée ». **Pour un produit d'abonnement payant, c'est non sans licence écrite.**

Trois voies : (a) **Atlanta Fed Market Probability Tracker** — publication gratuite de la Fed, quotidienne, probabilités implicites par le marché pour des fourchettes du taux fed funds moyen à 3 mois, dérivées des options SOFR du CME ; couvre **la Fed seule** ; la page expose « MPT Source Code » et « MPT Historical Data » + un flux RSS, mais elle est rendue en JS et je n'ai pas pu lire les URLs exactes — à vérifier en étape 1 ; (b) écrire à Polymarket pour une licence ; (c) **livrer la page sans les probabilités.**

**Reco : (c) maintenant, (a) pour la Fed dès le format de fichier vérifié.** Les taux directeurs, la dernière décision, la prochaine réunion et le compteur `J−N` sont des faits officiels publics et font déjà une page utile — et la maquette précise que les taux et dates sont réels au 25/11/2026 alors que les probabilités sont « exemple ». Bénéfice collatéral : ça supprime le « mises à jour toutes les 15 minutes » et la phase 1 tient sur un cron quotidien.

**Saisonnalité — la maquette a déjà anticipé le problème.** Elle porte une chip verrouillée `NQ · ES · licence à prévoir`. C'était juste :

| Instrument | Source (telle que nommée en pied de maquette) | Licence |
|---|---|---|
| Pétrole WTI | EIA, API v2 (`petroleum/pri/spt`, série `RWTC`) | ✅ US gov, domaine public |
| EUR/USD, USD/JPY, GBP/USD, AUD/USD | FRED H.10 : `DEXUSEU`, `DEXJPUS`, `DEXUSUK`, `DEXUSAL` | ✅ Fed, domaine public |
| Or | Banque mondiale, « Pink Sheet » | ✅ **CC BY 4.0** — usage commercial et redistribution permis avec attribution |
| S&P 500 | Shiller, `ie_data.xls` | ⚠️ **aucune licence publiée**. Et ce sont des **moyennes mensuelles**, pas des clôtures de fin de mois |
| VIX | Cboe, téléchargement gratuit depuis 1990 | ⚠️ gratuit en usage personnel/recherche, mais leurs Market Data Policies (en vigueur au 01/09/2026) encadrent la redistribution des données d'indice historiques |
| **NQ / ES** | — | ❌ CME exige une **Historical Distribution License** pour toute entité qui distribue de l'information historique |

Pour NQ/ES plus tard : acheter une licence historique (CME DataMine, ou Databento qui précise qu'une licence est requise pour redistribuer) et ne stocker que les **agrégats mensuels dérivés** — à faire confirmer par le concédant, aucune source ne tranche le statut des statistiques dérivées.

Métriques confirmées : moyenne, médiane, `n/20 ans` **et** pourcentage (stocker le compte brut, pas seulement le %), volatilité = écart-type des rendements mensuels non annualisé, meilleur/pire `année · %`. La trajectoire cumulée est **composée**, pas additive (vérifié : additif donnerait +6,87 % fin septembre, le SVG encode +7,064 %, le composé donne +7,061 %). Les 240 rendements bruts par instrument ne sont pas dans les maquettes — il faut le backfill et recalculer les agrégats.

### Tables Supabase

Toutes en `select using (auth.uid() is not null)` + **aucune policy d'écriture**.

| Table | Colonnes clés |
|---|---|
| `market_instruments` | `code` (NQ…), `label`, `cftc_contract_code`, `cftc_report` (tff\|disaggregated), `cot_category`, `display_order` |
| `market_series` | `id`, `source` (fred\|eia\|worldbank\|shiller\|cboe\|coinbase), `source_code`, `label`, `unit`, `license`, `attribution`, `inverted` |
| `market_series_observations` | `series_id`, `obs_date`, `value` — PK composite, le lac brut d'où tout se recalcule |
| `market_cot_reports` | `instrument_code`, `report_date`, `published_at`, `category`, `long`, `short`, `net`, `net_change_1w`, `open_interest`, `oi_change_1w`, `pct_of_oi`, `futonly_or_combined` |
| `market_cot_index` | `instrument_code`, `report_date`, `index_3y`, `index_4w_ago`, `index_13w_ago`, `label`, `is_extreme` — vue matérialisée |
| `market_risk_sentiment` | `as_of_date`, `score`, `label`, + par composante : `raw_value`, `percentile_1y`, `unit` (jsonb de 7 entrées) |
| `market_seasonality` | `instrument_code`, `month`, `avg_pct`, `median_pct`, `up_years`, `total_years`, `vol_pct`, `best_year`, `best_pct`, `worst_year`, `worst_pct`, `current_year_pct` |
| `market_central_banks` | `bank_code`, `label`, `currency`, `policy_rate_display` (texte : « 3,75–4,00 % », « 2,50 % (dépôt) »), `rate_low`, `rate_high`, `last_decision_date`, `last_decision_text`, `next_meeting_date`, `bias` |
| `market_cb_probabilities` | `bank_code`, `meeting_date`, `as_of_date`, `prob_cut`, `prob_hold`, `prob_hike` — créée, alimentée plus tard |
| `market_ingest_journal` | calqué sur `whop_sync_journal` : `source`, `ran_at`, `rows_upserted`, `status`, `error` |

**Sessions & horaires : aucune table.** Sessions, fenêtres et DST en code pur avec les zones IANA (`Europe/Paris`, `Europe/London`, `America/New_York`, `Asia/Tokyo`, `Australia/Sydney`) via `Intl` — c'est ce que tu demandes et c'est juste : les décalages se calculent, ils ne se stockent pas. Les « jours spéciaux » (fériés, clôtures anticipées, la bascule DST US/Europe décalée de deux semaines en mars 2027) partent en config TS commitée, migrables en table plus tard.

### Découpage en commits

| # | Commit | Contenu | Data |
|---|---|---|---|
| 1 | **Menu à 2 espaces** | `NavItem.href?`, slot sélecteur, `lib/nav/markets-nav.tsx`, ⌘K « espace · groupe », topbar par espace (horloges, **sans ticker**), exception admin dans le proxy, les 9 pages en `EmptyState` sous `/dashboard/marches/*`, + commit de `docs/design/terminal/` | aucune |
| 2 | **Couche fuseau** | `lib/time.ts`, `profiles.timezone`, sélecteur, dédup des `TZ` locaux | aucune |
| 3 | **Sessions & horaires** | horloge radiale SVG, frise CSS, 4 cartes de session, jours spéciaux | aucune — première vraie page, valide le shell et la couche fuseau |
| 4 | **Socle données marché** | `lib/supabase/admin.ts`, migrations `market_series*` + `market_ingest_journal`, squelette de cron + `CRON_SECRET` | aucune |
| 5 | **COT** | ingestion CFTC (polling), tables, index 3 ans, page | CFTC |
| 6 | **Saisonnalité** | backfill 20 ans (WTI, 4 paires FX, or), agrégats, page | EIA + FRED + Banque mondiale |
| 7 | **Sentiment de risque** | ingestion FRED + composite 7 composantes, page | FRED (+ Coinbase) |
| 8 | **Banques centrales** | taux et dates seedés, page sans probabilités | aucune API |
| 9 | **Vue d'ensemble** | assemble les précédentes ; publications et squawk en `EmptyState` | — |

Ordre justifié : le menu d'abord comme tu le demandes ; la couche fuseau ensuite parce que 3 des 6 pages en dépendent ; puis la page sans ingestion, qui valide tout le shell à moindre risque ; puis le socle, puis une page par source.

### Barre d'onglets mobile

À noter : elle n'est **pas** dans la maquette au sens technique. Le seul breakpoint déclaré dans tout le jeu de maquettes est `@media(max-width:600px)` sur une classe `.hm` utilisée uniquement pour masquer des colonnes de tableau dans la saisonnalité. La barre d'onglets est rendue en dur, à titre d'illustration. Comme rien n'existe côté code non plus (§1), c'est un chantier à part entière — je l'ai laissé hors du commit 1 volontairement : le fourrer dedans ferait sauter la réversibilité.

---

## À arbitrer avant l'étape 1

1. **Ton plan Vercel** — Hobby ou Pro ? Seule inconnue qui change le design de planification.
2. **Namespace** — tu valides `/dashboard/marches/*` ? Sinon il faut renommer la landing publique `/marches`, qui est indexée.
3. **Sentiment de risque** — (A) garder les 7 composantes de la maquette avec la mention FRED affichée, en retenant la lecture « usage permis avec attribution » ; ou (B) remplacer VIX / S&P 500 / spread HY par les indices Fed (`NFCI`, sous-indices, `STLFSI4`) → zéro ambiguïté juridique, mais cadence hebdomadaire et contenu de page modifié. Je recommande (A), en sachant que (B) existe.
4. **Saisonnalité S&P 500** — c'est l'instrument par défaut de la maquette, et Shiller ne publie aucune licence. On garde Shiller avec la citation déjà prévue en pied de page, ou on retire le S&P de la phase 1 ?
5. **VIX en saisonnalité** — on le garde (Cboe, redistribution encadrée) ou on le sort de la phase 1 ?
6. **Banques centrales** — tu valides de livrer sans les probabilités, avec l'Atlanta Fed en option pour la Fed seule ensuite ?

Je n'ai rien codé. `.mcp.json` est le seul fichier créé, non commité.
