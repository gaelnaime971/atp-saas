# Analyses des 4 familles — attente de tes décisions

Zéro modification de code dans cette passe. Uniquement des données pour te
permettre de trancher, avec pour chaque famille les découvertes qui n'étaient
pas visibles dans le dry-run précédent.

---

## Famille 1 — Gris + `#e8edf5` (à décider avant remplacement)

### Table CIELAB — luminance L*, chroma C, teinte h°

| Hex | L\* | C | h° | Teinte | Occ. dans le périmètre | Rôle actuel dans le code |
|---|---:|---:|---:|---|---:|---|
| `#f0f0f3` | 94.9 | 1.5 | 290° | neutre | — | `--color-text-1` (déjà) |
| `#e8edf5` | 93.6 | 4.4 | 267° | violet-bleuté | 102 | texte-clair au hover (Button ghost, sidebar nav hover) |
| `#a0aec0` | 70.6 | 10.9 | 264° | violet-bleuté | 59 | texte muté (Button ghost par défaut, sidebar inactif, propfirm badge) |
| `#9ca3af` | 66.8 | 7.1 | 270° | violet-bleuté | 13 | texte secondaire local (`/padel/page.tsx` uniquement) |
| `#a1a1aa` | 66.5 | 5.0 | 291° | violet | — | `--color-text-2` (déjà) |
| `#888888` | 56.7 | 0.0 | 158° | neutre pur | 14 | texte muté d'erreur/hint (VideoCall, trading-night, template email) |
| `#6b7280` | 47.9 | 8.6 | 273° | violet-bleuté | 28 | **sémantique** — état "SKIP" / score <50% (`Overview.tsx`, `AnalyseGraphique.tsx`) |
| `#5a6a82` | 44.4 | 15.3 | 270° | violet-bleuté | 199 | `--color-neutral` (déjà) |
| `#52525b` | 35.2 | 5.6 | 291° | violet | — | `--color-text-3` (déjà) |

### Écarts L\* entre voisins (ordonnés par luminance décroissante)

```
#f0f0f3 → #e8edf5   ΔL* = 1.3   ← sous seuil, teinte diffère (0 → 4.4 C)
#e8edf5 → #a0aec0   ΔL* = 23    ← grand saut (pas de gris entre 94 et 70)
#a0aec0 → #9ca3af   ΔL* =  3.8  ← perceptible
#9ca3af → #a1a1aa   ΔL* =  0.3  ← invisible, même luminance
#a1a1aa → #888888   ΔL* =  9.8  ← grand écart (66 → 57)
#888888 → #6b7280   ΔL* =  8.8  ← grand écart (57 → 48)
#6b7280 → #5a6a82   ΔL* =  3.5  ← perceptible
#5a6a82 → #52525b   ΔL* =  9.2  ← grand écart (44 → 35)
```

Le seuil de perception adjacente est environ **ΔL\* = 2.3** pour un œil moyen
(ISO CIE 15).

### Recommandation de fusion (ordonnée par sécurité)

**⭐ Sûr — sous seuil de perception, fusionne directement**

- `#9ca3af` (13 occ.) → **`--color-text-2`** — ΔL\* = 0.3, delta C = +2 (imperceptible).
  Impact : 13 lignes dans `/padel/page.tsx` deviennent cohérentes avec le reste.

**⚠ Visible, à valider explicitement**

- `#e8edf5` (102 occ.) → **`--color-text-1`** — ΔL\* = 1.3 mais delta chroma
  4.4 → 1.5 (perte de la nuance bleutée). Le rendu passe d'un blanc-bleuté à un
  blanc-neutre. Sur fond noir, l'œil verra que "quelque chose est plus froid".
  Alternative : créer `--color-text-bright: #e8edf5` (ajoute un token dédié pour
  le texte hover clair).

- `#a0aec0` (59 occ.) → **`--color-text-2`** — ΔL\* = 4.1 (perceptible : le texte
  devient plus foncé) et perd chroma (10.9 → 5.0, moins bleu). Les 59 endroits
  concernent surtout la sidebar admin et les Button ghost — endroits où la
  distinction texte / hover-texte est importante. La fusion écrasera cette
  distinction visuelle.

- `#6b7280` (28 occ.) → **`--color-neutral`** — ΔL\* = 3.5 (le "SKIP"/"score<50"
  devient plus foncé). Mais surtout, `--color-neutral` a une chroma 15.3 (bleuté
  net) alors que `#6b7280` est à 8.6. Le SKIP badge deviendrait franchement plus
  bleuté — visible.

**❌ Aucune cible existante — décision requise**

- `#888888` (14 occ.) — ni text-2, ni text-3, ni neutral ne matchent (écarts >8
  L\* et changement de teinte de neutre pur à violet). Deux options :
  - créer `--color-text-mid: #888888` (préserve tel quel)
  - laisser en dur (14 occ. one-shot, acceptable)

### Ma reco personnelle

| Hex | Action suggérée | Justification |
|---|---|---|
| `#9ca3af` (13) | Fusion → `--color-text-2` | Imperceptible, gain de cohérence |
| `#e8edf5` (102) | **Créer `--color-text-bright`** | Delta perceptible sur texte hover, préserve la distinction |
| `#a0aec0` (59) | Reste en dur pour l'instant (traiter à l'étape 2 primitives) | Fusion écraserait la palette hover Button/Sidebar |
| `#6b7280` (28) | Reste en dur pour l'instant | Sémantique "SKIP" distincte, mérite peut-être son propre token à l'étape 2 |
| `#888888` (14) | Reste en dur | 14 occ. one-shot, pas de cible propre |

Tu valides ? Je fais un commit par décision.

---

## Famille 2 — Sémantiques légitimes

### `#a855f7` / `rgba(168,85,247,…)` — **le violet a DEUX sémantiques**

Répartition des 41 occurrences :

| Fichier | Occ. | Sémantique probable |
|---|---:|---|
| `TradingPerso.tsx` *(exclu)* | 38 | **Payout prop firm** — retraits, sections "Payouts reçus" |
| `Pipeline.tsx` *(exclu)* | 18 | À vérifier — probablement **statut prospect** (pas payout) |
| `Prospects.tsx` | 7 | Statut prospect (source, tag) |
| `AnalyseGraphique.tsx` | 4 | Série de chart (pas sémantique) |
| `PropFirm.tsx` | 2 | Section payout côté trader |
| Autres | 4 | Éparpillé |

Créer `--color-payout: #a855f7` **maintenant** est correct pour TradingPerso +
PropFirm. Mais les 18+7 occurrences de Pipeline+Prospects sont probablement du
"badge de statut violet" qui n'a rien à voir avec un payout. Une fusion aveugle
écraserait deux sémantiques différentes.

**Ma reco** : créer `--color-payout` maintenant mais NE PAS mapper via codemod.
Le remplacement se fera manuellement à l'étape 2 quand PropFirm sera migré
(TradingPerso + Pipeline restent exclus jusqu'à leur passe dédiée). Les usages
Pipeline/Prospects seront audités séparément — peut-être une renaming vers un
`--color-status-badge` distinct.

### `rgba(0,255,136,…)` — 76 occ., **NE VIT PAS DANS `RecapTradeLive`**

Les 76 occurrences sont concentrées à **55 dans `SessionLive.tsx`** (pas
RecapTradeLive). Sémantique dans SessionLive :

- Direction technique **HAUSSIÈRE** dans les analyses IA
- Biais **LONG** dans le "chart result"
- État de marché **open** (green pulse)

Ce n'est pas exactement "live" au sens dashboard temps-réel. C'est **"signal
technique positif"** — un cousin du profit mais SUR UN AUTRE PLAN (analyse
prospective vs P&L réalisé).

**Le triage sémantique** dans SessionLive.tsx utilise en réalité **une triade** :

| Couleur | Sémantique | Occ. dans SessionLive |
|---|---|---:|
| `rgba(0, 255, 136, …)` | LONG / HAUSSIER / OPEN | 55 |
| `rgba(255, 51, 85, …)` | SHORT / BAISSIER | 28 |
| `rgba(255, 170, 0, …)` | WAIT / NEUTRE / CLOSED | 12 |

**Ma reco** : créer **3 tokens de signal AI** plutôt qu'un seul `--color-live` :

```
--color-signal-long:  #00ff88   /* HAUSS / LONG / open */
--color-signal-short: #ff3355   /* BAISS / SHORT */
--color-signal-wait:  #ffaa00   /* WAIT / NEUTRE / closed */
```

Cette triade est *distincte* de la triade P&L (`profit`/`loss`/`warn`) — c'est
exactement ce que tu voulais éviter : "le vert doit vouloir dire *tu gagnes*,
rien d'autre".

### `#3b82f6` + `#60a5fa` — 63 occ., **majoritairement "info", quelques séries**

Répartition observée :

| Usage | Exemple | Compte |
|---|---|---|
| Badge "message vu" (chat) | `MessageBubble.tsx` icon | 2 |
| Statut CRM "Actif" (≤5j) | `CRM.tsx` | quelques |
| Badge propfirm | `Settings.tsx` | quelques |
| TopbarStats couleur | `TopbarStats.tsx` | 1 |
| Chart border/bg | `Progression.tsx` chart line | 2 |
| **Sémantique dans les autres pages** | multiple | ~50 |

Le pattern dominant est **info/état neutre positif** (pas gain financier, pas
alerte, mais "actif / vu / présent").

**Ma reco** :

```
--color-info:      #3b82f6                        /* blue-500 */
--color-info-soft: rgba(59, 130, 246, 0.10)
--color-info-bd:   rgba(59, 130, 246, 0.24)
```

Le `#60a5fa` est le variant clair (blue-400). Deux options :
- Fusionner vers `--color-info` (écart perceptible, +9 unités de L\*)
- Créer `--color-info-bright: #60a5fa`

Vu qu'il est presque toujours dans le même contexte que `#3b82f6` (badges),
suggestion **créer `--color-info-bright`** pour préserver la nuance.

Les 2 occurrences chart (`Progression.tsx`) seront basculées sur
`--color-series-*` à l'étape 2 (voir famille 3), pas sur `--color-info`.

### `rgba(255, 51, 85, …)` — voir famille 2 sous-section signal (28 occ., SHORT/BAISS)

---

## Famille 3 — Palette de séries charts

### Recensement

Les couleurs qui servent uniquement en `<Cell fill=...>` (Recharts) ou en
`backgroundColor` (Chart.js dataset) hors des fichiers exclus :

- **Palette hardcodée `TradingPerso.tsx`** (exclu, mais représentatif) :
  ```
  ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']
  ```
  8 couleurs pêchées dans Tailwind. Anti-pattern absolu vu ta règle : le vert et
  le rouge (P&L) sont dans la palette de séries, ils vont réintroduire la
  confusion.

- `StockAnalysis.tsx` : `#16a34a` / `#b91c1c` (nuances green/red pour ratings) →
  ce sont des **variantes sémantiques**, pas des séries.

- `Progression.tsx` (Chart.js) : `#60a5fa` (border) + `#a78bfa` (bg violet) —
  usage série.

- `Notebook.tsx` : palette de dessin utilisateur, **hors périmètre**.

### 6 valeurs proposées — dérivées or + neutres froids

Ordonnées de la plus marquée (série 1, l'importante par défaut) à la plus
discrète (série 6, série additionnelle) :

| Token | Hex | L\* | Rôle |
|---|---|---:|---|
| `--color-series-1` | `#C9A574` | 71 | Or brand (série principale) |
| `--color-series-2` | `#7BA5C4` | 66 | Bleu-acier (contraste froid) |
| `--color-series-3` | `#B08956` | 60 | Or ambré (nuance brand sombre) |
| `--color-series-4` | `#8E9AB5` | 63 | Gris-bleu clair (neutre chargé) |
| `--color-series-5` | `#5A6A82` | 44 | Gris-bleu profond (= --color-neutral) |
| `--color-series-6` | `#A9B4C7` | 73 | Gris-bleu très clair (discret) |

Distinguabilité contrôlée :
- **Aucun** vert, rouge ou orange saturé dans la palette → jamais de confusion
  avec la sémantique P&L
- Alternance chaud/froid (or/bleu) pour discrimination sur graphiques en pie
  ou stacked bar
- Écarts L\* min. 3 unités entre voisines → différenciables même en niveaux de
  gris (accessibilité daltoniens)

Elles vivraient dans un fichier config unique proposé : `lib/chart-tokens.ts` :

```ts
export const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
] as const
```

Consommé par Recharts (`<Cell fill={SERIES[i % SERIES.length]} />`) et par
Chart.js (dataset `backgroundColor`).

**Question ouverte** : veux-tu 6 séries ou 5 ? (Les stats de trading ont
souvent 4-5 dimensions max — 6 est déjà large.)

---

## Famille 4 — Alphas techniques (>5 occurrences)

### Blanc `rgba(255, 255, 255, α)`

Distribution des alphas (hors fichiers exclus) :

| Alpha | Occ. | Métier probable |
|---|---:|---|
| 0.07 | 79 | Bordure card (l'écart de 0.01 vs `--color-border-subtle` a été noté sur Card.tsx) |
| 0.05 | 34 | Hover subtle bg |
| 0.06 | 22 | Bordure alternative (proche 0.07/0.08) |
| 0.02 | 21 | Bg très discret (élévation micro) |
| 0.04 | 16 | Hover très subtil |
| 0.15 | 8 | Bordure/état accentué |
| 0.10 | 7 (+ 3 forme `0.1`) | Fait le métier de `--color-border-strong` (0.14) |
| 0.08 | 7 | = `--color-border-subtle` (7 occ. ratées par le codemod car pas `--border`) |
| 0.12 | 3 | *sous seuil* |
| 0.03 | 4 | *sous seuil* |

Les 79 occurrences de `0.07` et les 22 occurrences de `0.06` sont des bordures
de card / modal réimplémentées à la main. Elles seront absorbées à l'étape 2
quand les 12 modals + 32 cards passeront sur les primitives.

### Noir `rgba(0, 0, 0, α)`

| Alpha | Occ. | Métier probable |
|---|---:|---|
| 0.7 | 16 | **Scrim modal** (l'overlay derrière une modale ouverte) |
| 0.4 | 14 | Shadow subtile |
| 0.6 | 11 | Scrim alt |
| 0.5 | 5 | Shadow medium |

### Tokens suggérés

```
--color-scrim:      rgba(0, 0, 0, 0.7)      /* fond de modal */
--color-hover:      rgba(255, 255, 255, 0.05)  /* hover état par défaut */
--color-elevate-1:  rgba(255, 255, 255, 0.02)  /* micro-élévation subtile */
```

Le reste : garde en dur, ce sont des variations mineures qui seront
naturellement unifiées à l'étape 2 quand tous les Card/Modal passeront sur les
primitives centralisées.

---

## Récap des tokens à créer

Si tu valides mes recos :

```css
/* Famille 1 */
--color-text-bright: #e8edf5;      /* nouveau, 102 occ. à mapper */

/* Famille 2 */
--color-payout:      #a855f7;      /* nouveau, TradingPerso only pour l'instant */
--color-payout-rgb:  168, 85, 247;
--color-signal-long:  #00ff88;     /* triade AI dans SessionLive.tsx */
--color-signal-short: #ff3355;
--color-signal-wait:  #ffaa00;
--color-info:        #3b82f6;
--color-info-rgb:    59, 130, 246;
--color-info-bright: #60a5fa;

/* Famille 3 */
--color-series-1: #C9A574;
--color-series-2: #7BA5C4;
--color-series-3: #B08956;
--color-series-4: #8E9AB5;
--color-series-5: #5A6A82;   /* alias sur --color-neutral */
--color-series-6: #A9B4C7;

/* Famille 4 */
--color-scrim:     rgba(0, 0, 0, 0.7);
--color-hover:     rgba(255, 255, 255, 0.05);
--color-elevate-1: rgba(255, 255, 255, 0.02);
```

### Ordre de commit suggéré une fois validé

1. **Famille 4** (tokens alpha) + **Famille 3** (palette séries) — 100% additif,
   zéro remplacement, aucun risque visuel
2. **Famille 2 sûre** (`--color-payout`, `--color-info`, triade `--color-signal-*`)
   — création tokens + codemod restrictif fichier par fichier
3. **Famille 1** (gris) — cas par cas selon tes décisions

Aucune de ces passes n'est encore exécutée. Dis-moi lesquelles tu valides
et dans quel ordre tu veux enchaîner, avant que je passe à l'étape 2
(primitives).
