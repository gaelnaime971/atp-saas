# Lancement de l'espace Marchés — lundi 30 novembre 2026

Check-list d'ouverture aux membres. Rappel : tant que `TERMINAL_ACCESS` n'est pas exactement `all`, l'espace Marchés est réservé aux admins (DECISIONS.md, « Interrupteur TERMINAL_ACCESS »). Recette complète faite le 27/11 (10 pages à 1440 et 390 px, ⌘K, sélecteur d'espace, onglets mobiles, Mon trading) : planches dans `~/Desktop/captures-terminal/lancement/`.

## Avant lundi (week-end)

- [ ] **Le cron a tourné.** Le premier passage quotidien en prod est le vendredi 27/11 à 22:30 UTC (23:30 à Paris), puis chaque soir. Admin › Paramètres › Config › carte « Données Terminal » : les 5 sources (FRED, CFTC, BCE, Calendrier, Actus officielles) doivent avoir une ligne « cron » récente au statut OK. En cas d'échec : bouton « Mettre à jour maintenant » de la même carte, puis regarder l'erreur affichée.
- [ ] **Agenda Terminal** (Admin › Terminal › Agenda Terminal) : confirmer les horaires CME des prochains jours de fête (24 et 25 décembre, 31 décembre, 1er janvier) dès que le CME les publie, et saisir les résultats d'entreprises annoncés depuis (voir « Résultats saisis » ci-dessous).

## Lundi : ouvrir l'espace

1. **Vercel › projet › Settings › Environment Variables** : ajouter `TERMINAL_ACCESS` avec la valeur exacte `all` (en minuscules, sans espace), environnement **Production** uniquement.
2. **Redéployer** : Vercel › Deployments › dernier déploiement de production › « Redeploy » (sans cache de build). Une variable n'est prise en compte qu'au déploiement suivant : le SPA `/dashboard` la lit **au build**, le proxy et le layout Marchés à l'exécution.
3. **Vérifier** (une fois le déploiement « Ready ») :
   - [ ] Connecté avec un **compte membre** (pas admin) : le sélecteur « Mon trading / Marchés » apparaît en haut du menu ; « Marchés » ouvre la Vue d'ensemble ; ⌘K propose les pages Marchés.
   - [ ] Les 10 pages s'ouvrent sans erreur : Vue d'ensemble, Sessions & horaires, Récap de séance, Calendrier éco, Banques centrales, Actus officielles, COT, Sentiment de risque, Macro US, Saisonnalité.
   - [ ] Sur mobile : la barre d'onglets Marchés (Vue d'ensemble, Horaires, Calendrier, COT, Menu).
   - [ ] Mon trading inchangé (Dashboard, Saisie de session, Stats), Analyse d'action toujours dans Mon trading › Outils.
   - [ ] Un compte **sans abonnement actif** est toujours renvoyé vers « abonnement inactif » (règle d'accès inchangée).
   - [ ] Vercel › Logs : pas d'erreur `[market read]`, `[market news]` ou `[market figure]` à l'ouverture des pages.

## Première semaine : surveiller

- **Cron quotidien** (22:30 UTC) : chaque matin, carte « Données Terminal » : 5 sources au statut OK. « Partiel » = une série ou un flux en panne (l'erreur est affichée) ; « Échec » = rien n'a été mis à jour.
- **Données en retard** : les pages affichent un badge « Mise à jour automatique en retard » ou « … en retard » quand une source a plus de 2 jours sans ingestion réussie, ou quand une série dépasse son délai normal (hebdomadaire, mensuel…). Rappels utiles :
  - COT : publié en principe le vendredi (décalé après un jour férié, ex. semaine de Thanksgiving) ;
  - Macro et Sentiment : séries hebdomadaires de la Fed (bilan, stress financier) publiées en milieu de semaine ;
  - Saisonnalité : données figées, mise à jour annuelle en janvier (DECISIONS.md, « Saisonnalité »).
- **Chiffres du calendrier** : un chiffre reste « en attente » quelques minutes après l'annonce (cache 60 s pendant 3 h), le temps que FRED le mette en ligne. Au-delà d'une heure, regarder les logs `[market figure]`.
- **Actus officielles** : rafraîchies à la consultation (au plus toutes les 90 s). Badge « flux indisponible » = un flux (Fed, BCE ou TreasuryDirect) n'a pas répondu ; les autres continuent.
- **Erreurs** : Vercel › Logs, filtrer sur `market` ; Supabase › Logs si les lectures échouent (`[market read]`).
- **Retours membres** : pages lentes (référence recette : 0,8 à 1,6 s par page, Récap jusqu'à 3,7 s à froid), heures dans le mauvais fuseau (le fuseau se règle dans Mon compte).

## Revenir en arrière

1. **Vercel › Settings › Environment Variables** : supprimer `TERMINAL_ACCESS` (ou lui donner une autre valeur que `all`).
2. **Redéployer** la production (même procédure que lundi). Sans redéploiement, le changement n'est pas appliqué.
3. Vérifier avec un compte membre : plus de sélecteur d'espace, rien de Marchés dans ⌘K, `/dashboard/marches` renvoie sur `/dashboard`. Les admins gardent l'accès ; les données et le cron continuent de tourner.

## Résultats saisis le 27/11/2026 (Agenda Terminal)

L'Agenda n'a pas de champ « note » : les sources sont gardées ici.

| Date (New York) | Société | Moment | Source officielle |
|---|---|---|---|
| 02/12/2026 | Salesforce (CRM) | après la clôture | [investor.salesforce.com](https://investor.salesforce.com/news/news-details/2026/Salesforce-Announces-Date-of-Third-Quarter-Fiscal-2027-Earnings-Release-and-Webcast/default.aspx) « December 2, 2026, after market close » |
| 09/12/2026 | Broadcom (AVGO) | après la clôture | [investors.broadcom.com](https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announce-fourth-quarter-and-fiscal-year-2026) « after the close », conférence 17:00 ET |
| 10/12/2026 | Costco (COST) | après la clôture | [investor.costco.com](https://investor.costco.com/events-and-presentations/events/event-details/2026/Q1-2027-Earnings-Call/default.aspx) conférence 14:00 PT |
| 14/01/2027 | JPMorgan (JPM) | avant l'ouverture | [jpmorganchase.com/ir](https://www.jpmorganchase.com/ir/news/2025/jpmc-announces-conference-calls-to-review-first-quarter-second-quarter-third-quarter-and-fourth-quarter-2026-earnings) conférence 8:30 ET |
| 19/01/2027 | Goldman Sachs (GS) | avant l'ouverture | [goldmansachs.com](https://www.goldmansachs.com/pressroom/press-releases/2025/conference-call-dates-to-announce-4q25-and-2026-earnings-results) résultats vers 7:30 ET |

**À venir** (pas encore annoncées sur les sites investisseurs au 27/11) : Apple, Microsoft, Amazon, Alphabet, Meta, Tesla, Netflix, AMD, UnitedHealth, Caterpillar, Visa, McDonald's, Boeing (en général annoncées 2 à 4 semaines avant, résultats fin janvier ou début février). Nvidia et Home Depot ont publié le 17/11 ; leurs prochains résultats tombent en février.
