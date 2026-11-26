# Journal sécurité

Failles trouvées et corrigées. Aucune donnée personnelle ici : seulement des dates, des routes, des tables et des références de commit.
« En prod » = commit poussé (déployé par Vercel) ou SQL appliqué dans le SQL Editor de Supabase.

## Résumé

| # | Découverte | Faille | Gravité | Correction | En prod |
|---|---|---|---|---|---|
| 1 | 26/11/2026 | Inscription publique ouverte + rôle lu dans les données d'inscription | Critique | SQL `20261126000003` + inscriptions fermées | 26/11/2026 |
| 2 | 26/11/2026 | Un membre pouvait modifier toutes les colonnes de son profil | Critique | SQL `20261126000003` | 26/11/2026 |
| 3 | 26/11/2026 | Routes d'envoi d'e-mails et d'import de prospects ouvertes à tous | Critique | `936be26` | 26/11/2026 |
| 4 | 26/11/2026 | Bucket des factures lisible par tout compte connecté | Élevée | SQL `20261126000005` (`dc4a38b`) | 26/11/2026 |
| 5 | 26/11/2026 | Codes d'invitation devinables, sans limite d'essais | Élevée | `b487d3c` + SQL `20261126000002` | 26/11/2026 |
| 6 | 26/11/2026 | Abonnement jamais vérifié après la connexion (pages et API) | Élevée | `023d4c8` + SQL `20261126000004` | 26/11/2026 |
| 7 | 26/11/2026 | Routes de données de marché ouvertes à tous | Moyenne | `dd0b850`, `ec8cd2c` | 26/11/2026 |
| 8 | 26/11/2026 | Création d'admin possible si la vérification échouait | Moyenne | `ec8cd2c` | 26/11/2026 |
| 9 | 26/11/2026 | Route de connexion admin révélant les comptes admin | Faible | `ec8cd2c` (route supprimée) | 26/11/2026 |
| 10 | 26/11/2026 | HTML non échappé dans les e-mails (alerte prospect, modèles) | Faible à moyenne | `936be26`, `ec8cd2c` | 26/11/2026 |
| 11 | 26/11/2026 | Envois réels d'e-mails absents du journal | Angle mort | `237ed16` + SQL `20261126000001` | 26/11/2026 |
| 12 | 26/11/2026 | Contenu partagé lisible dans la base par un ancien membre (et parfois sans session) | Moyenne | SQL `20261126000006` + `20261126000007` | 06 : 27/11/2026 · 07 : **pas encore** |

## Détail

### 1. Inscription publique + rôle choisi par l'inscrit
- **Exposé** : n'importe qui pouvait créer un compte avec la clé publique du site. Le déclencheur `handle_new_user` reprenait le rôle des données d'inscription, donc `role: 'admin'` donnait un compte admin.
- **Correction** :
  - le rôle est toujours `trader` à la création ;
  - les inscriptions publiques sont fermées dans Supabase (`disable_signup` vérifié à `true`).
- **Trace d'exploitation** : aucune. Un seul admin, et 0 compte créé hors des parcours Whop, invitation ou admin.

### 2. Profil modifiable sans restriction
- **Exposé** : un membre connecté pouvait, depuis la console du navigateur, passer son `role` à `admin` ou activer son abonnement.
- **Correction** : le déclencheur `protect_profile_privileged_columns` refuse aux non-admins les colonnes réservées (rôle, e-mail, champs Whop, plan, notes admin). Les colonnes d'accès manuel ont été ajoutées le même jour.

### 3. E-mails et import de prospects ouverts à tous
- **Exposé** : `/api/prospects/email-broadcast`, `send-closing-email`, `send-welcome-email`, `send-payment-reminder-email` et `import` ne vérifiaient pas la session. Concrètement :
  - envoi d'e-mails libres depuis le domaine ATP, vers n'importe qui ou vers toute la base prospects ;
  - insertion de faux prospects.
- **Correction** : ces 5 routes sont réservées à l'admin. `/api/prospects` (formulaires des landings) reste publique, avec un e-mail d'alerte échappé.
- **Trace d'exploitation** : aucune dans le journal des envois groupés ni dans les créations de prospects. Les envois réels des routes send-* n'étaient pas journalisés (voir 11).

### 4. Factures lisibles par tout compte connecté
- **Exposé** : la règle « users can read invoices » permettait à tout compte connecté de lister et télécharger toutes les factures PDF.
- **Correction** : un compte ne lit que les fichiers vers lesquels pointe une de ses lignes `revenues` ; la règle admin est inchangée.
- **Vérifié en prod** : un trader liste 0 facture, et le téléchargement comme le lien de partage d'une facture d'un autre sont refusés (3 sur 3).

### 5. Codes d'invitation devinables
- **Exposé** :
  - codes de 6 chiffres tirés avec `Math.random` ;
  - aucune limite d'essais, et des messages différents selon le cas.
  Avec l'e-mail d'un invité en attente, on pouvait trouver son code et créer le compte à sa place.
- **Correction** :
  - tirage cryptographique ;
  - 5 essais faux bloquent 15 minutes, avec un compteur en base sûr même en cas d'essais simultanés ;
  - un seul message de refus ;
  - invitation consommée avant la création du compte ;
  - jokers `%` et `_` neutralisés dans la recherche par e-mail.

### 6. Abonnement non vérifié après la connexion
- **Exposé** : le filtre d'abonnement dépendait de `WHOP_GATE_ENABLED`, absente en prod. Un membre qui résiliait gardait :
  - le dashboard ;
  - les routes IA payantes, jusqu'à environ 420 appels Groq par jour.
- **Correction** : une règle unique (admin, abonnement Whop actif, ou accès manuel), toujours active :
  - sur les pages `/dashboard` (proxy) ;
  - sur les 22 routes membres (`requireMember()`, 403).
  Les comptes invités sans Whop ont reçu un accès manuel sans fin ; 3 anciens abonnés ont perdu l'accès.

### 7. Données de marché ouvertes à tous
- **Exposé** : `/api/stock/{data,search,tipranks}` et `/api/asset-analysis/{correlations,macro,news,sentiment}` servaient de relais public vers Yahoo, Finnhub, ForexFactory, CNN et TipRanks.
- **Correction** :
  - routes réservées aux membres ;
  - route TipRanks supprimée (scraping d'une API privée), ainsi que ses champs dans `ai-verdict`.

### 8. Création d'admin si la vérification échouait
- **Exposé** : `/api/admin/setup` ouvrait la création d'un admin si la lecture « un admin existe-t-il ? » échouait.
- **Correction** : 404 dès qu'un admin existe ou si la vérification échoue.

### 9. Route de connexion admin
- **Exposé** : `/api/admin/login` révélait si un e-mail appartenait à un admin, et n'était appelée par aucune page.
- **Correction** : route supprimée. La page `/admin/login` vérifie le rôle après la connexion, déconnecte un compte non admin et affiche un message unique.

### 10. HTML non échappé dans les e-mails
- **Exposé** : le nom saisi dans le formulaire public était inséré tel quel dans l'e-mail d'alerte envoyé à l'admin. Les modèles send-* n'échappaient pas non plus leurs variables.
- **Correction** : toutes les variables sont échappées, et le sujet tient sur une ligne.

### 11. Journal des e-mails incomplet
- **Exposé** : la contrainte de la table `email_broadcasts` refusait les modes des envois réels (`closing`, `welcome`, `payment_reminder`), et l'échec était ignoré. Aucun envoi réel de ces routes n'était tracé.
- **Correction** : les 6 modes sont autorisés, et un échec d'écriture du journal est loggé (sans destinataire ni contenu).

### 12. Contenu partagé lisible directement dans la base
- **Exposé** : les règles de lecture « tout compte connecté » ou « tout le monde » permettaient de lire directement, avec la clé publique, des tables et un bucket partagés :
  - `resources`, `live_trades`, `skill_items`, `app_settings` ;
  - les créneaux de coaching et le profil du coach ;
  - le bucket `docs`.
  Ces lectures étaient possibles pour un ancien membre resté connecté, et même sans session pour `live_trades`, `skill_items` et `app_settings`.
- **Correction** : la fonction `has_dashboard_access()`, même règle que le code, remplace ces règles. Les règles « ses propres lignes » sont inchangées.
- **Règles créées à la main** : la vérification du script 06 a trouvé 2 autres lectures ouvertes, absentes du repo (« View active availability », « View overrides » sur les créneaux de coaching). Elles sont supprimées par `20261126000007`. Rien de public ne lit ces tables.
- **En prod** : 06 appliqué le 27/11/2026 ; 07 pas encore.

## Points ouverts
- `/api/padel/{parse,submit}` : relais public, limité aux URL Google Forms. Risque faible, non corrigé.
- Les 3 factures orphelines du bucket (créées les 24 et 25/03/2026) ne sont rattachées à aucune ligne `revenues`. À rattacher ou supprimer à la main.
