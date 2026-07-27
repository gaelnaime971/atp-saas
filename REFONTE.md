# Refonte visuelle ATP — carnet d'incohérences

Ce fichier collecte les écarts détectés pendant la refonte. Rien n'est corrigé à
l'étape 1 (règle : zéro changement visuel). Chaque item attend une décision.

---

## Étape 1 — Tokens

### Bordures : `--border` = 0.08 mais Card.tsx hardcode 0.07

`components/ui/Card.tsx` utilise `border-[rgba(255,255,255,0.07)]` alors que la
variable globale `--border` vaut `rgba(255,255,255,0.08)`. Écart d'alpha de 0.01
(≈ 1.3% en clair sur fond noir, sous le seuil de perception mais techniquement
un écart).

**Action envisagée en étape 5 (Card)** : aligner Card sur `--color-border-subtle`
(= 0.08). Écart perceptuel nul, mais je flag pour transparence.

### Bordures : `--color-border-strong` inventé

`--color-border-strong` (0.14) n'existe pas encore dans le codebase — aucun
composant n'utilise ce niveau aujourd'hui. Défini pour les futurs composants
(hover states, focus rings intérieurs). **Aucun élément actuel ne change.**

### Ombres : échelle définie, zéro composant l'applique

L'app est **flat** (quasi aucune ombre). Les tokens `--shadow-1/2/3` sont
définis pour permettre aux futures cards / modals d'avoir une élévation
cohérente sans re-inventer les valeurs. **Aucun élément actuel n'utilise ces
tokens.** À décider au fur et à mesure des chantiers.

### Neutrals dispersés

Le codebase mélange plusieurs gris "neutres" pour représenter la même intention
(zéro, absence de donnée, texte inactif) :
- `#5a6a82` (199 occ.) — retenu comme `--color-neutral`
- `#6b7280` (30 occ.) — gris Tailwind
- `#a0aec0` (55 occ.) — gris Chakra
- `#9ca3af` (13 occ.) — gris Tailwind
- `#8892a4` (8 occ.)
- `#4a5568` (9 occ.)

**Décision reportée à l'étape 4** : le codemod va lister ces occurrences dans
`REFONTE-couleurs.md`. Tu décides lequel devient officiellement `--color-neutral`
et lequel bascule vers `--color-text-2` ou `--color-text-3`.

---

## Étape 2 — Fonts

### Trois familles chargées, deux utilisées

- `Geist` et `Geist_Mono` chargées via `next/font/google` dans `app/layout.tsx`,
  exposées en variables `--font-geist-sans` et `--font-geist-mono`, **jamais
  utilisées** dans le codebase (aucune référence à ces CSS vars).
- `Outfit` et `DM Mono` chargées via `@import url()` Google CSS dans
  `globals.css`, **utilisées effectivement**.

**Action prévue en commit 2** : supprimer Geist, migrer Outfit + DM Mono vers
`next/font/google` (self-hosting, plus rapide, pas de FOUT).

### Poids 800 chargé, 900 en synthèse — décidé

- **800** : chargé (mars 2026). Le bold synthétique déformait les gros chiffres
  KPI où `font-extrabold` est utilisé (95 occurrences). Résultat : léger
  changement visuel volontaire sur les valeurs monétaires — elles deviennent
  franchement plus propres.
- **900** : laissé en synthèse pour l'instant (16 occurrences, moins critique).

### Bug latent — `--font-sans: var(--font-sans)`

`globals.css` L174 (avant commit 2) contenait une auto-référence circulaire.
Résultat : la classe Tailwind `font-sans` (192 usages dans le code) tombait
implicitement sur l'héritage du body (Outfit) via l'invalidation CSS. Corrigé
en commit 2 pour pointer explicitement sur `var(--font-outfit)`. **Aucun
changement visuel** (le body était déjà en Outfit).

---

## Étape 3 — Shadcn

### Deux systèmes de tokens cohabitent aujourd'hui dans globals.css

Le système shadcn (--background, --card, --primary, --chart-1..5, --sidebar-*,
--radius, bloc .dark) n'est utilisé que par `/test` (labo). Il occupe environ
50% de `globals.css` alors que le reste du site ne s'en sert pas.

**Action prévue en commit 3** : déplacer tous les tokens shadcn dans
`app/(lab)/test/lab-tokens.css`, importé uniquement par le layout du /test.
globals.css devient ATP-only.

---

## Étape 4 — Codemod

Rapport détaillé dans `REFONTE-couleurs.md`. **Appliqué** sur 71 fichiers,
excluant TradingPerso.tsx, Pipeline.tsx et les deux versions de
RecapTradeLive.tsx + AnalyseIA.tsx (à traiter à l'étape 2 des primitives).

---

## Décisions actées (ne plus reporter)

### Scale de radius — DÉFINITIVE

La scale reste celle héritée de shadcn : base 0.625rem, multiples 0.6/0.8/1/1.4/…
Toucher 411 usages pour gagner 2px sur `rounded-lg` ne vaut pas le risque.
Les valeurs sont **hardcodées** dans le `@theme` ATP de globals.css et ne
dépendent plus de shadcn.

---

## Pages sans PageHeader — traitement à l'étape 5

Ces 7 pages n'ont pas été migrées sur `<PageHeader>` à l'étape 2 (elles n'ont
aucun titre top-level actuel — ajouter un titre serait injecter du contenu
nouveau, hors périmètre "aucun changement volontaire").

### Recevront un PageHeader à l'étape 5 (uniformisation)

Pages de premier niveau qui devraient en toute logique avoir un titre — ajout
sans risque :

- **PropFirm** trader
- **Coaching** trader
- **Coaching** admin
- **Prospects** admin
- **ContentManager** admin

### Ne recevront PAS de PageHeader

- **StockAnalysis** trader — la page est un placeholder / empty state tant
  qu'aucun ticker n'est cherché. Un titre cosmétique sur une coquille vide
  n'apporte rien. Restera sans header tant que la page reste ce qu'elle est.
- **AnalyseGraphique** trader — son "titre" (`🎯 Analyse multi-piliers`)
  vit à l'intérieur d'une `<Card>` qui contient AUSSI le picker de symbol
  et le CTA "Lancer l'analyse". C'est un titre de **section fonctionnelle**,
  pas de page. Restera dans sa Card, hors du système PageHeader.

### Cas particulier — SessionsHistory

Non migrée à l'étape 2 : son header droit porte deux mini-KPI (P&L Total,
Win Rate) qui n'ont leur place ni dans `title/subtitle` ni dans `actions`.

**Décision** : attendre `<KpiCard variant="compact">`. Une fois disponible,
SessionsHistory migre avec les mini-KPI dans le slot `actions` existant. Pas
de nouveau slot `metrics` (motif qui se répéterait rarement → sur-abstraction).

**Résolu** : SessionsHistory a bien été migrée à la vague KpiCard généralisation
(commit `feat(ui): KpiCard generalized...`).

---

## Primitive candidate à évaluer à la vague monolithes

### `EntityCard` — carte d'entité à sous-KPI imbriqués

Pattern répété dans plusieurs pages complexes :
- **PropFirm** trader : chaque compte de trading affiche un panneau avec 5
  sous-KPI en grille (Capital / Début coaching / Balance / P&L / Perf%)
- **TradingPerso** admin : structure similaire, chaque compte propfirm a son
  panneau avec grille de sous-KPI (challenge target, drawdown, streak, etc.)
- **Traders** admin (potentiellement) : chaque ligne de trader pourrait
  bénéficier du même traitement en vue "cards" alternative à la table

Le pattern est : **un wrapper par entité (compte, trader, propfirm) qui
contient un header + une grille de mini-KPI + optionnellement une liste
d'items / actions**. Ni une KpiCard seule, ni une DataTable — un panneau
avec structure interne.

**Décision** : ne PAS créer cette primitive dans la vague DataTable/EmptyState.
La faire émerger naturellement lors de la migration des monolithes
(TradingPerso en particulier) où le pattern est le plus dense. Choisir un
nom + une API à ce moment-là, avec le code réel sous les yeux.

Candidats de nom pour plus tard : `<EntityCard>`, `<AccountPanel>`,
`<KpiPanel>`. À trancher au contact du code.

### `<Badge>` — statuts, plan ATP, type de session

Pattern répété dans :
- SessionsHistory : `<SmallBadge>` (type "Live"/"Paper") + badge plan
  colored par tier (>=8 profit, >=5 warn, <5 loss)
- **Statuts prop firm** dans les monoliths — badges "Active"/"Failed"/
  "Passed" colorés
- **Statuts prospect** dans Pipeline/Prospects — badges de progression
  ("Nouveau", "Qualifié", "RDV", "Signé", "Perdu") avec 5-6 couleurs
- Tags de sources, catégories, priorité

**Décision** : ne PAS créer `<Badge>` dans la vague DataTable. La faire
émerger à l'étape 5 (finitions) — elle absorbera d'un coup :
- Les 3 sous-composants locaux (SmallBadge dans SessionsHistory,
  Traders.tsx badges, etc.)
- Le `--color-payout` (violet TradingPerso) qui attend encore
- L'ambiguïté violet #a855f7 double-sémantique (payout vs. status
  prospect) — le Badge admet un `tone` prop et la primitive nous
  forcera à choisir un token distinct pour chaque sémantique.

API pressentie : `<Badge tone={KpiTone|StatusTone} size?={sm|md} />`.

### `WizardModal` — modal multi-étapes avec stepper header + footer stateful

Signalé en migrant Modal. La primitive `<Modal>` couvre le shell
(scrim, focus trap, escape, close) mais applique un `padding` uniforme
sur `children` qui casse le pattern wizard : stepper header à padding
plus court + fond distinct + border separator, et footer dont les
boutons dépendent de l'étape courante.

Sites hors modèle :
- **CsvSessionImport** (5 étapes upload → mapping → preview → dedup →
  importing) — moteur du besoin.
- **Formation video player** — layout media distinct (min 1200px, fond
  surface-0). Pas exactement un wizard, mais même verdict "shell
  standard ne convient pas".
- Potentiellement des flows dans **SessionLive** (à confirmer à la
  vague finale).

**Décision** : ne PAS créer `WizardModal` maintenant. Un seul site
justifierait uniquement une variante ad-hoc. Attendre la vague finale
(SessionLive) : si un second site partage exactement le pattern
stepper+body+footer stateful, extraire alors. Si Formation reste un
media player isolé, elle ne rentrera pas ici — plutôt un slot
`background?` ou une variante `VideoModal` séparée.

API pressentie : `<WizardModal open onClose steps={Step[]} current
onStep body footer />` où `body` et `footer` sont des fonctions
`(step) => ReactNode` pour éviter au parent la gymnastique de
switch/case sur le step courant.

**Confirmé infirmée dans l'audit des 4 monolithes** (AnalyseIA,
RecapTradeLive admin+trader, TradingPerso, Pipeline) : aucun wizard
multi-étapes avec stepper. `BulkAccountsModal` = tableau plat.
`AddToPipelineModal` = 2 tabs. `ProspectDetailModal` = formulaire long.
Seul motivant reste `CsvSessionImport`. Un seul site → variante
ad-hoc si nécessaire, pas de primitive.

## Règle générale — tokens sémantiques par intention métier

**Un token nomme une INTENTION, pas une couleur.** Deux notions métier
distinctes obtiennent deux tokens même si leurs valeurs actuelles sont
identiques. Le jour où on veut distinguer les deux à l'œil, on change
UNE variable dans `globals.css`, pas 40 fichiers.

Anti-pattern à éviter : `--color-tag-violet` unique partagé par payout
et statut prospect closé sous prétexte que "les deux = revenu". Faux :
un payout est de l'argent qui rentre, un statut closé est une étape de
tunnel de vente. Deux notions, deux tokens.

**Tokens déjà créés** (`app/globals.css`) :
- `--color-payout` — argent qui rentre (TradingPerso, PropFirm)
- `--color-status-closed` — statut prospect final "closé"

### Tokens Pipeline à créer (au moment du refactor Pipeline)

Pipeline utilise ~30 couleurs hardcodées `#xxxxxx` pour ses statuts,
températures, programmes, sources, méthodes de paiement, outcomes.
Chacun mérite son propre token sémantique. **Ne pas les créer à
l'avance** — un token sans usage pollue `globals.css` ; les créer au
moment du refactor Pipeline garantit qu'ils remplacent des sites réels.

Inventaire depuis [Pipeline.tsx:59-137](components/admin/pages/Pipeline.tsx#L59) :

**Statuts prospect (STATUS_COLUMNS)** :
- `--color-status-nouveau` : `#3b82f6`
- `--color-status-contacte` : `#f59e0b`
- `--color-status-call-booke` : `#22c55e`
- `--color-status-closed` : `#a855f7` *(déjà créé)*
- `--color-status-disqualifie` : `#ef4444`

**Température (TEMPERATURE_OPTIONS)** :
- `--color-temp-chaud` : `#ef4444`
- `--color-temp-tiede` : `#f59e0b`
- `--color-temp-froid` : `#3b82f6`

**Programme (PROGRAM_TYPES)** :
- `--color-program-ultra` : `#22c55e`
- `--color-program-coaching` : `#3b82f6`
- `--color-program-seminaire` : `#a855f7`
- `--color-program-autre` : `#6b7280`

**Sources (SOURCE_LABELS)** — 12 sources, chacune sa teinte identitaire
(Trading Night violet, Whop+2K rose, Instagram rose Instagram, X/Twitter
gris, etc.). Un token par source.

**Méthodes de paiement (PAYMENT_METHOD_OPTIONS)** :
- `--color-pay-stripe` : `#635bff` (brand Stripe)
- `--color-pay-virement` : `#22c55e`
- `--color-pay-especes` : `#f59e0b`
- `--color-pay-mixed` : `#a855f7`

**Outcomes (OUTCOME_OPTIONS)** — mapping partiel : "pas répondu" gris,
"rappel" amber, "intéressé"/"très intéressé" vert (2 alphas différentes),
"objection" violet, "pas intéressé" rouge, "closé" vert.

Total : ~25 tokens à créer lors du refactor Pipeline. C'est le prix de
la règle métier — mais c'est aussi ce qui rendra Pipeline
mécaniquement modifiable après.

## `EmailComposerModal` — signalé par l'audit Pipeline

Les 3 modals email de Pipeline (`ClosingEmailModal`, `WelcomeEmailModal`,
`PaymentReminderEmailModal`) partagent une structure quasi-identique :
recipient + form + preview. Motivant confirmé mais les 3 modals appellent
des API différentes avec des payloads distincts, donc extraire une
primitive nécessite un travail d'abstraction non trivial.

**Décision** : ne pas créer maintenant. Documenter comme candidate.
Attendre le refactor Pipeline pour évaluer si l'abstraction est
justifiée ou si les 3 modals gagnent juste à hériter d'un même layout
via `<Modal>` + composition manuelle.

## `SegmentedControl` — signalé par l'audit RecapTradeLive admin

Pattern de sélecteur segmenté période (jour / semaine / mois / custom)
récurrent, actuellement implémenté inline en boutons stylés. Répété
dans RecapTradeLive admin ([L513](components/admin/pages/RecapTradeLive.tsx#L513))
et vraisemblablement ailleurs (Stats, Sessions, PropFirm — à confirmer
en migrant).

**Décision** : ne pas créer maintenant. Documenter comme candidate.
Extraire quand on aura 3+ sites migrés qui l'utilisent — critère
d'extraction cohérent avec la démarche primitive-par-preuve.

## `ToggleBadge` — primitive candidate confirmée par le refactor Pipeline

Le refactor Pipeline (Phases 1-4) a laissé **8 sites toggle interactifs
inline** — ce sont des chips de sélection statut/température/prospect,
structurellement des `<button>` d'un groupe avec état actif/inactif.
La primitive `<Badge>` est intentionnellement read-only ; mélanger
"badge affichage" et "chip sélection" dans une même primitive brouille
l'API et complique les usages.

Sites recensés dans Pipeline uniquement :
- Status filter bar ([Pipeline.tsx:391](components/admin/pages/Pipeline.tsx#L391))
- Température filter ([L438](components/admin/pages/Pipeline.tsx#L438))
- Move-to-status dropdown dans PipelineCard ([L826](components/admin/pages/Pipeline.tsx#L826))
- Status selector dans ProspectDetailModal ([L1573](components/admin/pages/Pipeline.tsx#L1573))
- Température selector dans ProspectDetailModal ([L1598](components/admin/pages/Pipeline.tsx#L1598))
- Température dans AddToPipelineModal ([L2188](components/admin/pages/Pipeline.tsx#L2188))
- Payment method segmented dans ProspectDetailModal ([L2542](components/admin/pages/Pipeline.tsx#L2542))
- Payment method segmented dans PaymentReminderEmailModal ([L3334](components/admin/pages/Pipeline.tsx#L3334))

Recensés ailleurs :
- PropFirm status selector dashboard trader ([PropFirm.tsx:363](components/dashboard/pages/PropFirm.tsx#L363))
- Notebook toolbar toggles Gomme/Clear ([Notebook.tsx:1100-1113](components/dashboard/pages/Notebook.tsx#L1100))

Total : ~10 sites. **Justifie une extraction**.

API pressentie :
```tsx
<ToggleBadge
  tone={BadgeTone}       // couleur active
  size={BadgeSize}       // sm | md | lg
  active={boolean}       // état visuel
  onClick={() => void}   // handler
  icon={ReactNode}
>
  {children}
</ToggleBadge>
```

Rendu :
- Inactif : bg surface-2 + border-subtle + text-3
- Actif : bg tone-rgb 0.10 + border tone-rgb 0.20 + color tone
- Hover inactif : bg surface-3

**Décision** : ne pas créer maintenant. La primitive est claire mais
demande son propre commit dédié (pas de mélange avec le refactor pur en
cours). Priorité : commencer le REFRESH visuel demandé par le user,
puis extraire ToggleBadge dans un commit dédié quand il apportera
autant que Badge apporte aujourd'hui.

## `EmailComposerModal` — infirmée après Phase 2 Pipeline

Après migration des 3 modals email vers la primitive Modal (Phase 2),
la structure "recipient + form + preview" est **effectivement
identique** mais chaque modal :
- Appelle une API distincte (`/send-closing-email`,
  `/send-welcome-email`, `/send-payment-reminder-email`)
- Utilise une template HTML distincte (`renderClosingTemplateClient`,
  `renderWelcomeTemplateClient`, `renderReminderTemplate`)
- A ses propres flags (`ClosingEmailModal` : stripe/virement/note ;
  `PaymentReminderEmailModal` : + `alreadyPaidNotice`)
- A ses propres states métier (Reminder a un éditeur HTML swap,
  Closing a des options de lien Stripe, Welcome a un montant "payé")

**Décision** : ne PAS créer `EmailComposerModal`. Le layout 2-cols est
déjà partagé via `<Modal noPadding size="full">` + un pattern `<div grid
gridTemplateColumns="380px 1fr">` — c'est suffisant. Extraire un
composant serait de la duplication d'API sans vraie factorisation.

## `ProgressBar` — signalé par l'audit Pipeline

Pattern répété : height 8px, background surface-2, radius 4, contenu
width % + background couleur + `transition: width 0.6s ease`. Sites :
- Pipeline PipelineCard payment progress ([L716](components/admin/pages/Pipeline.tsx#L716))
- Pipeline PaymentSection ([L1280](components/admin/pages/Pipeline.tsx#L1280))
- TradingPerso AccountCard Progress-to-target + DD gauge
- TradingPerso ChallengeCard DD gauge

**Décision** : primitive `<ProgressBar value tone />` extractable après
le refresh visuel — sites tous préservés inline pour l'instant, cohérents.
