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
  utilisées** dans le codebase (aucun `font-[family:var(--font-geist...)]`).
- `Outfit` et `DM Mono` chargées via `@import url()` Google CSS dans
  `globals.css`, **utilisées effectivement**.

**Action prévue en commit 2** : supprimer Geist, migrer Outfit + DM Mono vers
`next/font/google` (self-hosting, plus rapide, pas de FOUT).

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

Rapport détaillé attendu dans `REFONTE-couleurs.md`.
