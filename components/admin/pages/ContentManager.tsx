'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PC: Record<string, string> = { insta: '#e1306c', x: '#aaa', discord: '#5865f2' }
const PL: Record<string, string> = { insta: 'INSTA', x: 'X', discord: 'DISCORD' }
const SC: Record<string, { lbl: string; cls: string }> = {
  todo: { lbl: '○ À FAIRE', cls: 'st-todo' },
  wip: { lbl: '◑ EN COURS', cls: 'st-wip' },
  pub: { lbl: '● PUBLIÉ', cls: 'st-pub' },
}
const DAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']
const WEEK_LABELS = ['PRÉ-SÉMINAIRE', 'SÉMINAIRE EN LIVE', 'EXPLOITATION SÉMINAIRE', 'CONTENU ÉDUCATIF', 'ACTIVATION COACHING']

// ─── PROMPTS DÉTAILLÉS ──────────────────────────────────────────────────────
const PROMPTS: Record<string, string> = {
  'carrousel-hedge': `Tu es un expert en copywriting pour réseaux sociaux.
Crée un carrousel Instagram de 8 slides pour le compte gael_omega, trader institutionnel.

SUJET : "5 choses que le hedge fund m'a appris que les traders retail ignorent"
HOOK SLIDE 1 : "J'ai tradé pour un hedge fund. Voici ce qu'aucun formateur ne vous dira."
TON : Professionnel, direct, crédible. Pas de hype. Parle comme un insider.
FORMAT : Titre accrocheur par slide + 2-3 lignes de contenu max.
BRANDING : Fond noir, texte blanc/vert #22c55e, police Orbitron pour les titres.
CTA LAST SLIDE : "Rejoins la communauté ATP → lien en bio"
Génère le texte complet de chaque slide.`,

  'thread-quitte-salle': `Tu es un expert en copywriting X/Twitter.
Écris un thread de 8 tweets pour le compte gael_omega, trader institutionnel basé en Guadeloupe.

SUJET : Pourquoi il a quitté la salle de marché après 8 ans
HOOK TWEET 1 : "J'ai tradé 8 ans pour des banques d'investissement et un hedge fund. Voilà pourquoi j'ai tout arrêté :"
TON : Storytelling personnel, honnête, sans bullshit. Pas de promesses.
STRUCTURE : 1 hook fort → 5-6 révélations/apprentissages → 1 CTA Discord ATP
Chaque tweet doit être autonome et donner envie de lire le suivant.
MAX 280 caractères par tweet.`,

  'post-resultats': `Tu es expert en copywriting trading pour réseaux sociaux.
Écris un post de résultats quotidien pour X (Twitter) et Discord.

CONTEXTE : Gaël Naime, trader institutionnel, partage ses résultats de session de trading après sa session quotidienne du lundi au vendredi.
FORMAT X : Post court percutant (max 200 caractères) avec les chiffres clés, emoji minimal.
FORMAT DISCORD : Version légèrement plus longue avec contexte marché si pertinent.
TON : Factuel, professionnel. Pas de hype. Montrer le travail, pas le rêve.
VARIABLES À REMPLIR : [P&L EN €], [INSTRUMENT : YM/NQ/ES], [NB TRADES], [WIN RATE SESSION], [OBSERVATION MARCHÉ]
Génère les 2 versions (X + Discord) avec les variables entre crochets à remplir.`,

  'recap-hebdo': `Tu es expert en copywriting trading.
Écris un récap hebdomadaire de résultats de trading pour Discord et X.

CONTEXTE : Récap du vendredi soir pour la communauté ATP. Gaël partage sa semaine de trading.
FORMAT DISCORD : Message structuré avec emoji, stats de la semaine, 1 leçon retenue.
FORMAT X : Thread de 3 tweets (récap chiffres + leçon + CTA)
TON : Transparent, éducatif, authentique. Montrer les bons ET les mauvais trades.
STRUCTURE DISCORD :
📊 RÉCAP SEMAINE [DATE]
• P&L semaine : [CHIFFRE]€
• Sessions : [NB] | Wins : [NB] | Losses : [NB]
• Win rate : [%]
• Meilleure session : [CHIFFRE]€ ([INSTRUMENT])
• Leçon de la semaine : [LEÇON]
Génère le template complet avec variables entre crochets.`,

  'reel-broll': `Tu es un expert en production vidéo courte et copywriting Instagram.
Écris le script et les indications de tournage pour un Reel B-roll lifestyle.

SUJET : Setup trading + lifestyle Guadeloupe
DURÉE CIBLE : 30-45 secondes
SÉQUENCES À FILMER (liste) :
1. Plan desk avec écrans (3 sec)
2. Main sur le clavier / plateforme de trading (3 sec)
3. Vue depuis la fenêtre / Guadeloupe (4 sec)
4. Café du matin (2 sec)
5. Plan visage concentré (2 sec)
TEXTE OVERLAY (à intégrer en CapCut) : Génère 3-4 textes percutants à afficher.
MUSIQUE : Style lo-fi/focus ou trap instrumental calme.
CAPTION INSTAGRAM : Hook + corps + hashtags pertinents (trading, finance, guadeloupe).`,

  'carrousel-methode': `Tu es expert en pédagogie trading et copywriting Instagram.
Crée un carrousel Instagram de 10 slides présentant la Méthode ATP en 7 piliers.

SUJET : "La méthode que j'ai mis 8 ans à construire — les 7 piliers ATP"
HOOK SLIDE 1 : "Ma méthode en 7 étapes. Celle que j'ai mis 8 ans à construire."
LES 7 PILIERS ATP :
1. Analyse multi-timeframes (Hebdo → M15)
2. Identification des Order Blocks
3. Fair Value Gap et déséquilibres
4. Confluence Fibonacci
5. Gestion du risque (SL fixe 25 pts)
6. Gestion de position et scaling
7. Psychologie et discipline (règle des 3 SL)
FORMAT : 1 slide par pilier + slide intro + slide CTA
TON : Professionnel, pédagogique, concis. Max 40 mots par slide.
CTA : "Programme ATP ULTRA → lien en bio"`,

  'thread-retail-instit': `Tu es expert en copywriting X/Twitter pour le trading.
Écris un thread de 10 tweets comparant trader retail vs institutionnel.

HOOK : "Pourquoi 95% des traders retail perdent. Ce que j'ai vu en 8 ans en salle de marché :"
STRUCTURE :
- Tweet 1 : Hook choc
- Tweets 2-8 : Comparaisons concrètes (mindset, risk management, analyse, patience, sizing...)
- Tweet 9 : La vraie leçon
- Tweet 10 : CTA Discord ATP
TON : Expert, sans condescendance. Éduquer, pas vendre.
COMPTE : gael_omega — trader institutionnel, fondateur Alpha Trading Pro.`,

  'alphatalk': `Tu es expert en montage vidéo et storytelling pour Instagram.
Écris les questions d'interview et la structure d'un Alpha Talk (interview 1v1 trader).

FORMAT : Interview assis face caméra, 20-40 minutes, à couper en extraits.
QUESTIONS À POSER (dans l'ordre) :
1. Présente-toi et ton parcours en trading avant ATP
2. Quel était ton plus grand blocage avant de rejoindre ?
3. Qu'est-ce qui a changé concrètement dans ta façon de trader ?
4. Donne-moi un exemple concret de trade que tu n'aurais pas pris avant
5. Comment tu décrirait l'impact psychologique du programme ?
6. Quels sont tes résultats depuis le début ?
7. Qu'est-ce que tu dirais à quelqu'un qui hésite ?
EXTRAITS INSTAGRAM (Reels) : Identifie les 3 moments les plus percutants à extraire en 60-90 sec.
CAPTION : Génère une caption avec hook pour accompagner l'extrait Reel.`,

  'seminaire-live': `Tu es expert en storytelling Instagram et content marketing.
Génère le plan de stories pour documenter le séminaire ATP en live (6 jours).

FORMAT : Stories quotidiennes (7-10 par jour), 15 secondes chacune.
OBJECTIF : Créer de la FOMO, montrer la transformation, humaniser Gaël.
PLAN PAR JOUR :
J1 (27 avril) : Arrivées, premier repas, setup
J2 (28 avril) : Première session trading live, réactions
J3 (29 avril) : Atelier psychologie Vanille, breakthroughs
J4 (30 avril) : Lifestyle Guadeloupe, moments off
J5 (1er mai) : Alpha Talks interviews
J6 (2 mai) : Clôture, émotions, au-revoirs
Pour chaque jour : liste des séquences à filmer + texte overlay suggéré.
HASHTAGS : Liste complète pour maximiser la portée.`,

  'activation-coaching': `Tu es expert en copywriting high-ticket et acquisition.
Écris le contenu d'activation coaching pour la dernière semaine (18-20 mai).

OBJECTIF : Annoncer 2 places disponibles en coaching ATP ULTRA (1600€) sans être pushy.
FORMAT INSTAGRAM : Carrousel 6 slides "Ce que le programme change concrètement"
FORMAT X : Thread 5 tweets annonçant l'ouverture des places
FORMAT DISCORD : Annonce sobre et directe pour la communauté existante
TON : Exclusif, rare, orienté résultats. Pas de promesses de gains. Preuve sociale (résultats élèves séminaire).
CTA : Call gratuit 30 min de qualification → Calendly
Génère les 3 versions complètes.`,
}

// ─── CONTENT DATA ───────────────────────────────────────────────────────────
interface ContentItem {
  platform: string
  type: string
  title: string
  hook: string
  notes: string
  prompt: string
  status?: string
}

interface ResolvedItem extends ContentItem {
  status: string
  deleted: boolean
  index: number
  isCustom: boolean
}

function getResultsForDay(dateStr: string): ContentItem[] {
  const d = new Date(dateStr)
  const dow = d.getDay()
  if (dow < 1 || dow > 5) return []
  const isFriday = dow === 5
  const items: ContentItem[] = [
    { platform: 'x', type: 'Post résultats', title: 'Résultats session du jour', hook: 'Session fermée. Voilà les chiffres.', notes: 'Remplir P&L, instrument, nb trades après la session', prompt: 'post-resultats' },
    { platform: 'discord', type: 'Post résultats', title: 'Récap session communauté ATP', hook: "Session du jour — voici ce qui s'est passé sur les marchés.", notes: 'Version Discord légèrement plus longue', prompt: 'post-resultats' },
  ]
  if (isFriday) {
    items.push({ platform: 'x', type: 'Récap hebdo', title: 'Récap hebdomadaire résultats', hook: '5 jours de trading. Voici le bilan.', notes: 'Récap de toute la semaine + leçon retenue', prompt: 'recap-hebdo' })
    items.push({ platform: 'discord', type: 'Récap hebdo', title: 'Récap hebdo communauté ATP', hook: 'Récap de la semaine — chiffres et leçons.', notes: 'Version Discord complète avec stats de la semaine', prompt: 'recap-hebdo' })
  }
  return items
}

const PRE: Record<string, ContentItem[]> = {
  "2026-04-20": [
    { platform: 'insta', type: 'Story', title: 'Repositionnement compte — nouvelle bio', hook: 'Mon compte change. Trader institutionnel. La suite va changer.', notes: 'Filmer écran montrant la nouvelle bio', prompt: 'reel-broll' },
    { platform: 'x', type: 'Thread', title: "Pourquoi j'ai quitté la salle de marché", hook: "J'ai tradé 8 ans pour des banques d'investissement. Voilà pourquoi j'ai tout arrêté :", notes: 'Thread storytelling personnel — clé pour le lancement', prompt: 'thread-quitte-salle' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Annonce : contenu quotidien à venir', hook: 'Nouveauté — je vais documenter le séminaire en live. Restez connectés.', notes: "Message sobre, créer de l'anticipation", prompt: 'post-resultats' },
  ],
  "2026-04-21": [
    { platform: 'insta', type: 'Carrousel', title: "5 choses que le hedge fund m'a appris", hook: "J'ai tradé pour un hedge fund. Voici ce qu'aucun formateur ne vous dira.", notes: '8 slides. Template Canva noir/vert', prompt: 'carrousel-hedge' },
    { platform: 'x', type: 'Post', title: 'Règle n°1 des traders institutionnels', hook: 'Un institutionnel ne trade JAMAIS sans ce process. Lequel ?', notes: 'Post court avec réponse dans les commentaires → engagement', prompt: 'thread-retail-instit' },
  ],
  "2026-04-22": [
    { platform: 'insta', type: 'Reel', title: 'B-roll setup trading — lifestyle Guadeloupe', hook: 'Mon setup au quotidien depuis la Guadeloupe.', notes: 'Filmer matin : desk, écrans, café, vue fenêtre. Musique lo-fi.', prompt: 'reel-broll' },
    { platform: 'discord', type: 'Live', title: 'Live trading quotidien + annonce séminaire', hook: "Session ouverte — je vous montre mon analyse avant l'open US.", notes: 'Mentionner le séminaire en fin de live', prompt: 'post-resultats' },
  ],
  "2026-04-23": [
    { platform: 'x', type: 'Thread', title: 'Retail vs Institutionnel : la vraie différence', hook: "Pourquoi 95% des traders retail perdent. Ce que j'ai vu en 8 ans en salle de marché :", notes: 'Thread éducatif — fort potentiel viral', prompt: 'thread-retail-instit' },
    { platform: 'insta', type: 'Carrousel', title: 'Méthode ATP — Les 7 piliers', hook: "Ma méthode en 7 étapes. Celle que j'ai mis 8 ans à construire.", notes: '10 slides. 1 pilier par slide + intro + CTA', prompt: 'carrousel-methode' },
  ],
  "2026-04-24": [
    { platform: 'insta', type: 'Story', title: 'Countdown séminaire J-3', hook: 'Dans 3 jours. 8 traders. 1 semaine. Guadeloupe.', notes: 'Texte sur fond noir + countdown timer', prompt: 'seminaire-live' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Récap semaine + teaser séminaire', hook: 'Récap de la semaine. Ce weekend ça change tout.', notes: "Créer de l'anticipation pour le séminaire", prompt: 'post-resultats' },
  ],
  "2026-04-25": [
    { platform: 'insta', type: 'Story', title: 'Teaser séminaire — J-2', hook: 'Ils arrivent demain. 8 traders. Une semaine. Guadeloupe.', notes: "Stories d'anticipation, flou sur les détails", prompt: 'seminaire-live' },
  ],
  "2026-04-26": [
    { platform: 'insta', type: 'Story', title: 'Accueil des traders — début séminaire', hook: 'La semaine commence. 8 traders. 1 villa. On part.', notes: "Filmer les arrivées à l'aéroport ou à la villa", prompt: 'seminaire-live' },
    { platform: 'x', type: 'Post', title: 'Début séminaire Guadeloupe', hook: "Ça commence aujourd'hui. 8 traders sur l'île. Je documente tout.", notes: 'Lancer le live-tweet du séminaire', prompt: 'post-resultats' },
  ],
  "2026-04-27": [
    { platform: 'insta', type: 'Story', title: 'J1 — Morning routine des traders', hook: '6h30. Les traders sont debout. La session commence.', notes: 'Filmer : réveil, café, installation, analyse pré-marché', prompt: 'seminaire-live' },
    { platform: 'discord', type: 'Annonce Discord', title: 'J1 séminaire — recap live', hook: "Jour 1 terminé. Voilà ce qu'on a fait.", notes: 'Recap sobre, créer de la curiosité', prompt: 'post-resultats' },
  ],
  "2026-04-28": [
    { platform: 'insta', type: 'Reel', title: 'J2 — Session de trading en live', hook: 'Un trader qui passe de perdant à profitable. En direct.', notes: 'Filmer les écrans + réactions des traders. Montage dynamique.', prompt: 'reel-broll' },
    { platform: 'x', type: 'Thread', title: "Ce que j'observe en coaching live", hook: "Jour 2. Les 3 erreurs que font tous les traders quand je les regarde trader en live :", notes: "Thread éducatif tiré de l'observation réelle", prompt: 'thread-retail-instit' },
  ],
  "2026-04-29": [
    { platform: 'insta', type: 'Story', title: 'J3 — Atelier psychologie avec Vanille', hook: 'La psychologie change tout. Vanille leur montre pourquoi.', notes: "Filmer l'atelier, réactions, prises de notes", prompt: 'seminaire-live' },
    { platform: 'insta', type: 'Carrousel', title: 'Avant/après mindset — 3 jours de coaching', hook: "3 jours de coaching. Voici le changement que j'observe.", notes: 'Avant/après concret, citations anonymes des traders', prompt: 'carrousel-hedge' },
  ],
  "2026-04-30": [
    { platform: 'insta', type: 'Reel', title: 'J4 — B-roll sunset Guadeloupe', hook: 'On trade depuis la Guadeloupe. Et ça marche.', notes: 'Coucher de soleil, plage, villa, moments de détente', prompt: 'reel-broll' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Mi-séminaire recap + résultats', hook: 'Jour 4. Voilà les résultats des sessions de la semaine.', notes: 'Partager les stats anonymisées des traders du séminaire', prompt: 'post-resultats' },
  ],
  "2026-05-01": [
    { platform: 'insta', type: 'Alpha Talk', title: "J5 — Alpha Talk interview trader #1", hook: '"Il perdait depuis 2 ans. Voilà ce qui a changé en 5 jours."', notes: "Interview 1v1 assis, 20-30 min. Extraire 90 sec pour Reel.", prompt: 'alphatalk' },
    { platform: 'x', type: 'Thread', title: 'Alpha Talk : témoignage trader séminaire', hook: '"Je ne savais pas que mon vrai problème était psychologique." — récit d\'un trader du séminaire', notes: "Thread racontant l'histoire d'un trader (anonymisé si besoin)", prompt: 'alphatalk' },
  ],
  "2026-05-02": [
    { platform: 'insta', type: 'Reel', title: 'J6 — Clôture séminaire', hook: "6 jours. 8 traders. Ce qui s'est passé ici ne se décrit pas.", notes: 'Montage émotionnel des 6 jours. Au-revoirs. Moments forts.', prompt: 'seminaire-live' },
    { platform: 'insta', type: 'Story', title: 'Fin séminaire — remerciements', hook: "C'était la semaine la plus intense de l'année. Merci à eux.", notes: 'Stories de clôture, teaser prochain séminaire', prompt: 'seminaire-live' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Bilan séminaire + annonce prochaine cohorte', hook: "Le séminaire est terminé. Pour la prochaine édition, voilà le process.", notes: 'Créer de la FOMO pour la prochaine édition', prompt: 'activation-coaching' },
  ],
  "2026-05-04": [
    { platform: 'insta', type: 'Carrousel', title: 'Les 5 leçons du séminaire 2026', hook: "1 semaine. 8 traders. Voici les 5 vérités que j'ai (re)confirmées.", notes: 'Carrousel post-séminaire — fort pour la preuve sociale', prompt: 'carrousel-hedge' },
    { platform: 'x', type: 'Thread', title: "Bilan séminaire — ce que j'ai appris", hook: "6 jours de coaching intensif. Voici ce que j'ai appris en observant 8 traders trader en live.", notes: 'Thread de synthèse — éducatif et engageant', prompt: 'thread-retail-instit' },
  ],
  "2026-05-05": [
    { platform: 'insta', type: 'Reel', title: "Alpha Talk #1 — extrait interview", hook: '"J\'ai tout perdu avant de comprendre." Son histoire en 90 secondes.', notes: "Extraire le moment le plus fort de l'interview J5", prompt: 'alphatalk' },
    { platform: 'discord', type: 'Live', title: 'Live débrief post-séminaire', hook: 'Je reviens sur les 6 jours. Questions ouvertes.', notes: 'Live communauté — transparence sur le bilan', prompt: 'post-resultats' },
  ],
  "2026-05-06": [
    { platform: 'insta', type: 'Carrousel', title: "L'erreur que faisaient tous les 8 traders", hook: 'Sur 8 traders, 8 faisaient la même erreur. La voilà.', notes: 'Carrousel éducatif — très partageable', prompt: 'carrousel-methode' },
    { platform: 'x', type: 'Post', title: 'Résultats post-séminaire J+3', hook: "J+3 après le séminaire. Les traders m'envoient leurs résultats.", notes: 'Partager résultats anonymisés avec leur accord', prompt: 'post-resultats' },
  ],
  "2026-05-07": [
    { platform: 'insta', type: 'Reel', title: "Alpha Talk #2 — extrait interview", hook: '"En 6 jours j\'ai compris ce que 3 ans de YouTube n\'ont pas pu m\'apprendre."', notes: "Deuxième extrait d'Alpha Talk — outro fort", prompt: 'alphatalk' },
  ],
  "2026-05-08": [
    { platform: 'insta', type: 'Carrousel', title: 'Order Block expliqué simplement', hook: "L'outil n°1 que j'utilise sur YM et NQ. Expliqué en 5 slides.", notes: 'Carrousel éducatif sur l\'OB — pilier ATP', prompt: 'carrousel-methode' },
    { platform: 'x', type: 'Thread', title: "Mon process d'analyse en 3 minutes", hook: "Mon process d'analyse du YM avant l'open US. En 3 étapes. Thread ↓", notes: "Thread éducatif rapide — fort potentiel d'engagement", prompt: 'thread-retail-instit' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Plan de marché semaine + analyse graphe', hook: 'Plan de marché de la semaine. Je partage mon analyse.', notes: 'Post hebdo d\'analyse pour la communauté', prompt: 'post-resultats' },
  ],
  "2026-05-11": [
    { platform: 'insta', type: 'Carrousel', title: 'Les 3 règles ATP non-négociables', hook: "Ces 3 règles m'ont sauvé des milliers d'euros de pertes.", notes: 'Règles : SL fixe, 3 SL = pause, pas de revenge trading', prompt: 'carrousel-methode' },
    { platform: 'x', type: 'Thread', title: 'Pourquoi le SL fixe est non-négociable', hook: "95% des traders perdent parce qu'ils n'ont pas de règle de SL. Voilà la mienne.", notes: 'Thread éducatif sur la gestion du risque', prompt: 'thread-retail-instit' },
  ],
  "2026-05-12": [
    { platform: 'insta', type: 'Reel', title: 'Setup desk Guadeloupe — mon quotidien', hook: 'Je trade depuis la Guadeloupe. Voilà mon setup au quotidien.', notes: 'B-roll lifestyle : desk, vue, équipement', prompt: 'reel-broll' },
    { platform: 'discord', type: 'Live', title: 'Live trading session ouverte', hook: 'Session ouverte. Je trade en direct. Questions en live.', notes: 'Live habituel + on mentionne les résultats post-séminaire', prompt: 'post-resultats' },
  ],
  "2026-05-13": [
    { platform: 'insta', type: 'Alpha Talk', title: 'Alpha Talk #3 — J+2 semaines résultats', hook: '"2 semaines après le séminaire. Son bilan en chiffres."', notes: 'Extrait court focalisé sur les résultats concrets', prompt: 'alphatalk' },
    { platform: 'x', type: 'Post', title: 'Résultats de la semaine — synthèse', hook: "Résultats de la semaine sur YM. Voilà ce qui s'est passé.", notes: 'Post résultats hebdo', prompt: 'recap-hebdo' },
  ],
  "2026-05-14": [
    { platform: 'insta', type: 'Story', title: 'Sondage — votre plus grand blocage', hook: 'Question : votre plus grand blocage en trading en ce moment ?', notes: 'Sondage pour engagement + données pour prochain contenu', prompt: 'seminaire-live' },
    { platform: 'x', type: 'Thread', title: 'La psychologie du trader — ce que personne ne dit', hook: "Le vrai problème n'est pas la stratégie. C'est ce qui se passe dans votre tête.", notes: 'Thread psychologie — collaborer avec Vanille pour le contenu', prompt: 'thread-quitte-salle' },
  ],
  "2026-05-15": [
    { platform: 'insta', type: 'Carrousel', title: 'Comment je gère une série de pertes', hook: '3 pertes consécutives. Voilà exactement ce que je fais.', notes: 'Carrousel très concret — règle des 3 SL ATP', prompt: 'carrousel-methode' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Récap semaine + teaser places coaching', hook: "Récap de la semaine. Et une annonce pour ceux qui veulent aller plus loin.", notes: 'Préparer l\'annonce des places coaching semaine suivante', prompt: 'activation-coaching' },
  ],
  "2026-05-18": [
    { platform: 'insta', type: 'Carrousel', title: 'ATP ULTRA — ce que le programme change', hook: 'En quelques semaines avec moi, voilà ce qui change concrètement.', notes: 'Inclure résultats anonymisés des élèves du séminaire', prompt: 'activation-coaching' },
    { platform: 'x', type: 'Thread', title: '2 places coaching disponibles en mai', hook: "2 places disponibles. Voilà à qui ça s'adresse et ce que ça comprend.", notes: 'Thread de présentation du coaching — pas de prix, CTA call', prompt: 'activation-coaching' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Ouverture 2 places coaching ATP ULTRA', hook: '2 places coaching disponibles ce mois-ci. Voilà le process pour candidater.', notes: 'Annonce sobre pour la communauté existante', prompt: 'activation-coaching' },
  ],
  "2026-05-19": [
    { platform: 'insta', type: 'Story', title: 'Dernière chance — 2 places coaching', hook: "2 places. Call gratuit 30 min pour voir si c'est fait pour toi. Lien en bio.", notes: 'Stories de relance — urgence sans pression', prompt: 'activation-coaching' },
    { platform: 'x', type: 'Post', title: 'Call gratuit disponible', hook: "Si tu veux qu'on parle de ton trading, le call de 30 min est disponible. Lien en bio.", notes: 'Post simple, CTA clair', prompt: 'activation-coaching' },
  ],
  "2026-05-20": [
    { platform: 'insta', type: 'Reel', title: '1 mois de contenu — bilan', hook: "1 mois de publication quotidienne. Voilà ce que j'ai observé.", notes: 'Bilan personnel — authenticité maximale', prompt: 'reel-broll' },
    { platform: 'discord', type: 'Annonce Discord', title: 'Bilan du mois + teaser juin', hook: "Un mois s'est écoulé. Voilà ce qui vient en juin.", notes: 'Annoncer les prochains lives, événements, contenu de juin', prompt: 'post-resultats' },
  ],
}

// Inject daily results
function injectDailyResults() {
  const start = new Date(2026, 3, 20)
  const end = new Date(2026, 4, 20)
  const cur = new Date(start)
  while (cur <= end) {
    const dk = fmtDate(cur)
    const results = getResultsForDay(dk)
    if (results.length) {
      if (!PRE[dk]) PRE[dk] = []
      // Only inject if not already present (avoid duplication on re-render)
      const hasResults = PRE[dk].some(it => it.type === 'Post résultats')
      if (!hasResults) {
        PRE[dk].push(...results)
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
}
injectDailyResults()

// ─── SETUP DATA ─────────────────────────────────────────────────────────────
const SETUP_CARDS = [
  {
    title: 'INSTAGRAM — PROFIL',
    emoji: '📸',
    color: '#e1306c',
    items: [
      'Changer la bio → "Trader institutionnel | Guadeloupe | Coach ATP"',
      'Ajouter lien /offre ou Linktree dans la bio',
      'Passer en compte professionnel (créateur)',
      'Supprimer ou archiver les posts perso non cohérents',
      'Créer highlight "MÉTHODE ATP" (vide pour l\'instant)',
      'Créer highlight "RÉSULTATS"',
      'Créer highlight "SÉMINAIRE 2026"',
      'Photo de profil : photo pro (pas lifestyle)',
    ],
  },
  {
    title: 'X / TWITTER — PROFIL',
    emoji: '✕',
    color: '#ccc',
    items: [
      'Mettre à jour la bio X → crédibilité institutionnelle',
      'Ajouter lien vers /offre dans la bio',
      'Photo de profil identique Instagram',
      'Bannière X → branding ATP (vert + terminal)',
      'Épingler un thread de présentation',
    ],
  },
  {
    title: 'DISCORD + PRODUCTION',
    emoji: '💬',
    color: '#5865f2',
    items: [
      'Créer canal #contenu-live dans le Discord ATP',
      'Préparer templates Canva carrousels (fond noir, vert ATP)',
      'Préparer presets CapCut (couleurs, musique, transitions)',
      'Acheter/tester micro DJI Mic ou Rode pour séminaire',
      'Charger iPhone 100% + libérer stockage avant séminaire',
      'Shot list séminaire imprimée (guide existant)',
    ],
  },
]

// ─── HELPERS ────────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDisp(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
function isToday(d: Date): boolean {
  const t = new Date()
  return d.toDateString() === t.toDateString()
}
function isPast(d: Date): boolean {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return d < t
}

function getWeeks(): Date[][] {
  const start = new Date(2026, 3, 20)
  const end = new Date(2026, 4, 20)
  const weeks: Date[][] = []
  const cur = new Date(start)
  const dow = cur.getDay()
  cur.setDate(cur.getDate() + (dow === 0 ? -6 : 1 - dow))
  while (cur <= end) {
    const w: Date[] = []
    for (let i = 0; i < 7; i++) {
      w.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(w)
  }
  return weeks
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const V = {
  g: '#22c55e', g2: '#16a34a', g3: 'rgba(34,197,94,0.1)', g4: 'rgba(34,197,94,0.06)',
  bg: '#0a0a0a', bg2: '#111', bg3: '#161616', bg4: '#1a1a1a',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(34,197,94,0.25)',
  text: '#e5e5e5', muted: '#666', dim: '#2a2a2a',
  amber: '#f59e0b', red: '#ef4444', discord: '#5865f2',
  mono: "'JetBrains Mono', monospace", orb: "'Orbitron', sans-serif",
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
export default function ContentManager() {
  const [state, setState] = useState<Record<string, any>>({})
  const [filter, setFilter] = useState('all')
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({ 0: true, 1: true })
  const [openPromptId, setOpenPromptId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [setupState, setSetupState] = useState<Record<string, boolean>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalDk, setModalDk] = useState<string | null>(null)
  const [modalEi, setModalEi] = useState<number | null>(null)
  const [mPlatform, setMPlatform] = useState('insta')
  const [mType, setMType] = useState('Carrousel')
  const [mStatus, setMStatus] = useState('todo')
  const [mTitle, setMTitle] = useState('')
  const [mHook, setMHook] = useState('')
  const [mNotes, setMNotes] = useState('')
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('atp_cm3')
      if (saved) setState(JSON.parse(saved))
    } catch { /* ignore */ }

    const setupLoaded: Record<string, boolean> = {}
    SETUP_CARDS.forEach(card => {
      card.items.forEach(item => {
        const key = 's_' + item.slice(0, 28)
        if (localStorage.getItem(key) === '1') {
          setupLoaded[key] = true
        }
      })
    })
    setSetupState(setupLoaded)
  }, [])

  // Save to localStorage
  const save = useCallback((newState: Record<string, any>) => {
    setState(newState)
    localStorage.setItem('atp_cm3', JSON.stringify(newState))
  }, [])

  // Get items for a date key
  const getItems = useCallback((dk: string): ResolvedItem[] => {
    const pre = PRE[dk] || []
    const custom = state[dk]?.c || []
    const ov = state[dk]?.o || {}
    const del = state[dk]?.del || {}
    return [...pre, ...custom].map((item: ContentItem, i: number) => ({
      ...item,
      status: ov[i]?.status ?? item.status ?? 'todo',
      title: ov[i]?.title ?? item.title,
      hook: ov[i]?.hook ?? item.hook,
      notes: ov[i]?.notes ?? item.notes ?? '',
      type: ov[i]?.type ?? item.type,
      platform: ov[i]?.platform ?? item.platform,
      prompt: ov[i]?.prompt ?? item.prompt ?? '',
      deleted: del[i] ?? false,
      index: i,
      isCustom: i >= pre.length,
    })).filter((it: ResolvedItem) => !it.deleted)
  }, [state])

  // Filter check
  const shouldShow = useCallback((it: ResolvedItem): boolean => {
    if (filter === 'all') return true
    if (filter === 'insta') return it.platform === 'insta'
    if (filter === 'x') return it.platform === 'x'
    if (filter === 'discord') return it.platform === 'discord'
    if (filter === 'todo') return it.status === 'todo'
    if (filter === 'wip') return it.status === 'wip'
    if (filter === 'pub') return it.status === 'pub'
    return true
  }, [filter])

  // Stats
  const computeStats = useCallback(() => {
    let tot = 0, pub = 0, wip = 0, si = 0, sx = 0, sd = 0
    const allKeys = new Set([...Object.keys(PRE), ...Object.keys(state)])
    allKeys.forEach(dk => {
      getItems(dk).forEach(it => {
        if (!shouldShow(it)) return
        tot++
        if (it.status === 'pub') {
          pub++
          if (it.platform === 'insta') si++
          if (it.platform === 'x') sx++
          if (it.platform === 'discord') sd++
        }
        if (it.status === 'wip') wip++
      })
    })
    const pct = tot > 0 ? Math.round(pub / tot * 100) : 0
    return { tot, pub, wip, si, sx, sd, pct }
  }, [state, getItems, shouldShow])

  const stats = computeStats()
  const weeks = getWeeks()
  const S = new Date(2026, 3, 20)
  const E = new Date(2026, 4, 20)

  // Status cycle
  function cycleStatus(dk: string, i: number) {
    const items = getItems(dk)
    const it = items.find(x => x.index === i)
    if (!it) return
    const order = ['todo', 'wip', 'pub']
    const next = order[(order.indexOf(it.status) + 1) % 3]
    const newState = { ...state }
    if (!newState[dk]) newState[dk] = {}
    if (!newState[dk].o) newState[dk].o = {}
    newState[dk] = { ...newState[dk], o: { ...newState[dk].o, [i]: { ...(newState[dk].o[i] || {}), status: next } } }
    save(newState)
  }

  // Delete
  function delItem(dk: string, i: number) {
    if (!confirm('Supprimer ce contenu ?')) return
    const pre = PRE[dk] || []
    const newState = { ...state }
    if (!newState[dk]) newState[dk] = {}
    if (i >= pre.length) {
      const c = [...(newState[dk].c || [])]
      const ci = i - pre.length
      c.splice(ci, 1)
      const newO: Record<string, any> = {}
      Object.keys(newState[dk].o || {}).forEach(k => {
        const ki = parseInt(k)
        if (ki < i) newO[k] = newState[dk].o[k]
        else if (ki > i) newO[ki - 1] = newState[dk].o[k]
      })
      newState[dk] = { ...newState[dk], c, o: newO }
    } else {
      newState[dk] = { ...newState[dk], del: { ...(newState[dk].del || {}), [i]: true } }
    }
    save(newState)
  }

  // Prompt toggle
  function togglePrompt(dk: string, i: number) {
    const id = `${dk}-${i}`
    setOpenPromptId(prev => prev === id ? null : id)
  }

  // Copy prompt
  function copyPrompt(key: string) {
    const text = PROMPTS[key] || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(key)
      setTimeout(() => setCopyFeedback(null), 2000)
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyFeedback(key)
      setTimeout(() => setCopyFeedback(null), 2000)
    })
  }

  // Setup toggle
  function toggleSetup(key: string) {
    const next = !setupState[key]
    setSetupState(prev => ({ ...prev, [key]: next }))
    localStorage.setItem(key, next ? '1' : '0')
  }

  // Modal open for add
  function openAdd(dk: string) {
    setModalMode('add')
    setModalDk(dk)
    setModalEi(null)
    setMPlatform('insta')
    setMType('Carrousel')
    setMStatus('todo')
    setMTitle('')
    setMHook('')
    setMNotes('')
    setModalOpen(true)
  }

  // Modal open for edit
  function openEdit(dk: string, i: number) {
    const it = getItems(dk).find(x => x.index === i)
    if (!it) return
    setModalMode('edit')
    setModalDk(dk)
    setModalEi(i)
    setMPlatform(it.platform)
    setMType(it.type)
    setMStatus(it.status)
    setMTitle(it.title)
    setMHook(it.hook || '')
    setMNotes(it.notes || '')
    setModalOpen(true)
  }

  // Modal save
  function saveModal() {
    if (!mTitle.trim()) {
      titleInputRef.current?.focus()
      return
    }
    if (!modalDk) return
    const newState = { ...state }
    if (modalMode === 'edit' && modalEi !== null) {
      if (!newState[modalDk]) newState[modalDk] = {}
      if (!newState[modalDk].o) newState[modalDk].o = {}
      newState[modalDk] = {
        ...newState[modalDk],
        o: {
          ...newState[modalDk].o,
          [modalEi]: {
            ...(newState[modalDk].o[modalEi] || {}),
            platform: mPlatform,
            type: mType,
            status: mStatus,
            title: mTitle.trim(),
            hook: mHook.trim(),
            notes: mNotes.trim(),
          },
        },
      }
    } else {
      if (!newState[modalDk]) newState[modalDk] = {}
      if (!newState[modalDk].c) newState[modalDk].c = []
      newState[modalDk] = {
        ...newState[modalDk],
        c: [...newState[modalDk].c, { platform: mPlatform, type: mType, status: mStatus, title: mTitle.trim(), hook: mHook.trim(), notes: mNotes.trim() }],
      }
    }
    save(newState)
    setModalOpen(false)
  }

  // Get prompt text for an item
  function getPromptText(it: ResolvedItem): string {
    const promptKey = it.prompt || 'post-resultats'
    return PROMPTS[promptKey] || `Crée du contenu pour le sujet : ${it.title}\nHook : ${it.hook}\nFormat : ${it.type}\nPlateforme : ${PL[it.platform] || it.platform}\nTon : Professionnel, direct, basé sur la crédibilité institutionnelle de Gaël Naime (ex hedge fund, 8 ans en salle de marché).`
  }

  // Filter button data
  const filterButtons = [
    { key: 'all', label: 'TOUT', cls: '' },
    { key: 'insta', label: '📸 INSTAGRAM', cls: 'fi' },
    { key: 'x', label: '✕ X', cls: 'fx' },
    { key: 'discord', label: '💬 DISCORD', cls: 'fd' },
    { key: 'todo', label: '○ À FAIRE', cls: '' },
    { key: 'wip', label: '◑ EN COURS', cls: 'fw' },
    { key: 'pub', label: '● PUBLIÉS', cls: '' },
  ]

  function getFilterBtnStyle(btn: { key: string; cls: string }): React.CSSProperties {
    const base: React.CSSProperties = {
      padding: '5px 11px',
      borderRadius: 4,
      fontFamily: V.mono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      cursor: 'pointer',
      transition: 'all .12s',
      border: `1px solid ${V.border}`,
      background: V.bg2,
      color: V.muted,
    }
    if (filter === btn.key) {
      if (btn.cls === 'fi') return { ...base, background: 'rgba(225,48,108,0.1)', borderColor: 'rgba(225,48,108,0.3)', color: '#e1306c' }
      if (btn.cls === 'fx') return { ...base, background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.2)', color: '#ccc' }
      if (btn.cls === 'fd') return { ...base, background: 'rgba(88,101,242,0.1)', borderColor: 'rgba(88,101,242,0.3)', color: V.discord }
      if (btn.cls === 'fw') return { ...base, background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: V.amber }
      if (btn.key === 'pub') return { ...base, borderColor: V.border2, color: V.g, background: V.g4 }
      return { ...base, borderColor: V.border2, color: V.g, background: V.g4 }
    }
    if (btn.key === 'pub') return { ...base, color: V.g }
    return base
  }

  function getStatusStyle(status: string): React.CSSProperties {
    const base: React.CSSProperties = {
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 7, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: 3, marginTop: 4, cursor: 'pointer', transition: 'all .12s',
    }
    if (status === 'wip') return { ...base, background: 'rgba(245,158,11,0.1)', color: V.amber, border: '1px solid rgba(245,158,11,0.25)' }
    if (status === 'pub') return { ...base, background: 'rgba(34,197,94,0.1)', color: V.g, border: '1px solid rgba(34,197,94,0.25)' }
    return { ...base, background: 'rgba(255,255,255,0.05)', color: V.muted, border: `1px solid ${V.dim}` }
  }

  return (
    <div style={{ fontFamily: V.mono, color: V.text, minHeight: '100vh' }}>
      {/* HEADER STATS ROW */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ padding: '4px 12px', background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4, fontSize: 10 }}>
          PUBLIÉS <span style={{ color: V.g, fontWeight: 700, marginLeft: 4 }}>{stats.pub}</span>
        </div>
        <div style={{ padding: '4px 12px', background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4, fontSize: 10 }}>
          EN COURS <span style={{ color: V.amber, fontWeight: 700, marginLeft: 4 }}>{stats.wip}</span>
        </div>
        <div style={{ padding: '4px 12px', background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4, fontSize: 10 }}>
          TOTAL <span style={{ color: V.g, fontWeight: 700, marginLeft: 4 }}>{stats.tot}</span>
        </div>
        <div style={{ padding: '4px 12px', background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4, fontSize: 10 }}>
          AVANCEMENT <span style={{ color: V.g, fontWeight: 700, marginLeft: 4 }}>{stats.pct}%</span>
        </div>
      </div>

      {/* GLOBAL PROGRESS */}
      <div style={{ background: V.bg2, border: `1px solid ${V.border}`, borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontFamily: V.orb, fontSize: 18, fontWeight: 900, color: V.g }}>{stats.pub}</div>
          <div style={{ fontSize: 7, letterSpacing: '0.12em', color: V.muted, marginTop: 2 }}>PUBLIÉS</div>
        </div>
        <div style={{ width: 1, height: 36, background: V.border }} />
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontFamily: V.orb, fontSize: 18, fontWeight: 900, color: '#e1306c' }}>{stats.si}</div>
          <div style={{ fontSize: 7, letterSpacing: '0.12em', color: V.muted, marginTop: 2 }}>INSTAGRAM</div>
        </div>
        <div style={{ width: 1, height: 36, background: V.border }} />
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontFamily: V.orb, fontSize: 18, fontWeight: 900, color: '#aaa' }}>{stats.sx}</div>
          <div style={{ fontSize: 7, letterSpacing: '0.12em', color: V.muted, marginTop: 2 }}>X / TWITTER</div>
        </div>
        <div style={{ width: 1, height: 36, background: V.border }} />
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontFamily: V.orb, fontSize: 18, fontWeight: 900, color: V.discord }}>{stats.sd}</div>
          <div style={{ fontSize: 7, letterSpacing: '0.12em', color: V.muted, marginTop: 2 }}>DISCORD</div>
        </div>
        <div style={{ width: 1, height: 36, background: V.border }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: V.muted, marginBottom: 5 }}>
            <span>PROGRESSION GLOBALE</span>
            <span>{stats.pct}%</span>
          </div>
          <div style={{ height: 5, background: V.dim, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: `linear-gradient(90deg,${V.g2},${V.g})`, borderRadius: 3, transition: 'width .5s', width: `${stats.pct}%` }} />
          </div>
        </div>
      </div>

      {/* SETUP SECTION */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: V.muted, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: V.g }}>▸</span> SETUP AVANT LANCEMENT — À FAIRE AVANT LE 20 AVRIL
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {SETUP_CARDS.map((card, ci) => (
            <div key={ci} style={{ background: V.bg2, border: `1px solid ${V.border}`, borderRadius: 6, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10, color: card.color }}>
                {card.emoji} {card.title}
              </div>
              {card.items.map((item, ii) => {
                const sKey = 's_' + item.slice(0, 28)
                const done = !!setupState[sKey]
                return (
                  <div
                    key={ii}
                    onClick={() => toggleSetup(sKey)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: ii < card.items.length - 1 ? `1px solid ${V.dim}` : 'none', cursor: 'pointer' }}
                  >
                    <div style={{
                      width: 13, height: 13, borderRadius: 3,
                      border: `1px solid ${done ? V.g : V.dim}`,
                      background: done ? V.g : 'transparent',
                      flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: done ? '#000' : 'transparent',
                      transition: 'all .12s',
                    }}>
                      {done ? '✓' : ''}
                    </div>
                    <span style={{
                      fontSize: 10, lineHeight: 1.4,
                      color: done ? V.muted : V.text,
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {item}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* PLANNING SECTION */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: V.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: V.g }}>▸</span> PLANNING CONTENU — 20 AVRIL → 20 MAI
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: V.muted }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#e1306c' }} /> Instagram
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: V.muted }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#aaa' }} /> X
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: V.muted }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: V.discord }} /> Discord
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              style={getFilterBtnStyle(btn)}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* WEEKS */}
        {weeks.map((week, wi) => {
          const inRange = week.filter(d => d >= S && d <= E)
          if (!inRange.length) return null

          let wTot = 0, wPub = 0, wWip = 0
          week.forEach(d => {
            getItems(fmtDate(d)).forEach(it => {
              if (!shouldShow(it)) return
              wTot++
              if (it.status === 'pub') wPub++
              if (it.status === 'wip') wWip++
            })
          })
          const wPct = wTot > 0 ? Math.round(wPub / wTot * 100) : 0
          const isOpen = openWeeks[wi] ?? false

          return (
            <div key={wi} style={{ background: V.bg2, border: `1px solid ${V.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
              {/* Week header */}
              <div
                onClick={() => setOpenWeeks(prev => ({ ...prev, [wi]: !isOpen }))}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 16px', background: V.bg3, borderBottom: `1px solid ${V.border}`,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: V.text }}>
                    S{wi + 1} — {WEEK_LABELS[wi] || 'SEMAINE ' + (wi + 1)}
                  </div>
                  <div style={{ fontSize: 9, color: V.muted, marginTop: 2 }}>
                    {fmtDisp(week[0])} → {fmtDisp(week[6])}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {wWip > 0 && <div style={{ fontSize: 8, color: V.amber }}>◑ {wWip} EN COURS</div>}
                  <div style={{ width: 70, height: 3, background: V.dim, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: V.g, borderRadius: 2, transition: 'width .4s', width: `${wPct}%` }} />
                  </div>
                  <div style={{ fontSize: 9, color: V.muted }}>{wPub}/{wTot}</div>
                  <div style={{ fontSize: 11, color: V.muted, transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</div>
                </div>
              </div>

              {/* Days grid */}
              {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {week.map((day, di) => {
                    const dk = fmtDate(day)
                    const inR = day >= S && day <= E
                    const items = getItems(dk).filter(shouldShow)

                    return (
                      <div key={di} style={{
                        borderRight: di < 6 ? `1px solid ${V.border}` : 'none',
                        minHeight: 100,
                        opacity: inR ? 1 : 0.2,
                        pointerEvents: inR ? 'auto' : 'none',
                      }}>
                        {/* Day header */}
                        <div style={{ padding: '7px 8px', borderBottom: `1px solid ${V.border}`, background: 'rgba(0,0,0,0.25)', textAlign: 'center' }}>
                          <div style={{ fontSize: 8, letterSpacing: '0.1em', color: V.muted }}>{DAYS[di]}</div>
                          <div style={{
                            fontSize: 10, fontWeight: 700, marginTop: 1,
                            color: isToday(day) ? V.g : isPast(day) ? V.dim : V.text,
                          }}>
                            {fmtDisp(day)}
                          </div>
                        </div>

                        {/* Day items */}
                        <div style={{ padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {items.map(it => {
                            const pc = PC[it.platform] || '#aaa'
                            const pl = PL[it.platform] || it.platform
                            const sc = SC[it.status] || SC.todo
                            const hasPub = it.status === 'pub'
                            const itemId = `${dk}-${it.index}`
                            const isHovered = hoveredItem === itemId
                            const isPromptOpen = openPromptId === itemId
                            const promptKey = it.prompt || 'post-resultats'

                            return (
                              <div
                                key={it.index}
                                onMouseEnter={() => setHoveredItem(itemId)}
                                onMouseLeave={() => setHoveredItem(null)}
                                style={{
                                  padding: '6px 7px', borderRadius: 4, borderLeft: `3px solid ${pc}`,
                                  background: 'rgba(255,255,255,0.03)', position: 'relative',
                                  transition: 'filter .12s',
                                  filter: isHovered ? 'brightness(1.15)' : 'none',
                                }}
                              >
                                {/* Action buttons */}
                                <div style={{
                                  position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2,
                                  opacity: isHovered ? 1 : 0, transition: 'opacity .15s',
                                }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); togglePrompt(dk, it.index) }}
                                    title="Voir prompt Claude"
                                    style={{
                                      width: 16, height: 16, borderRadius: 2, border: `1px solid ${V.dim}`,
                                      background: V.bg3, cursor: 'pointer', display: 'flex', alignItems: 'center',
                                      justifyContent: 'center', fontSize: 8, color: V.muted, transition: 'all .12s',
                                      padding: 0,
                                    }}
                                  >
                                    ⌘
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(dk, it.index) }}
                                    title="Modifier"
                                    style={{
                                      width: 16, height: 16, borderRadius: 2, border: `1px solid ${V.dim}`,
                                      background: V.bg3, cursor: 'pointer', display: 'flex', alignItems: 'center',
                                      justifyContent: 'center', fontSize: 8, color: V.muted, transition: 'all .12s',
                                      padding: 0,
                                    }}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); delItem(dk, it.index) }}
                                    title="Supprimer"
                                    style={{
                                      width: 16, height: 16, borderRadius: 2, border: `1px solid ${V.dim}`,
                                      background: V.bg3, cursor: 'pointer', display: 'flex', alignItems: 'center',
                                      justifyContent: 'center', fontSize: 8, color: V.muted, transition: 'all .12s',
                                      padding: 0,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>

                                {/* Platform + type */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                  <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.06em', color: pc }}>{pl}</span>
                                  <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.06)', color: V.muted }}>{it.type}</span>
                                </div>

                                {/* Title */}
                                <div style={{
                                  fontSize: 9, color: V.text, lineHeight: 1.4, paddingRight: 28,
                                  textDecoration: hasPub ? 'line-through' : 'none',
                                  opacity: hasPub ? 0.5 : 1,
                                }}>
                                  {it.title}
                                </div>

                                {/* Hook */}
                                {it.hook && (
                                  <div style={{ fontSize: 8, color: V.muted, fontStyle: 'italic', marginTop: 2, lineHeight: 1.35 }}>
                                    &quot;{it.hook}&quot;
                                  </div>
                                )}

                                {/* Notes */}
                                {it.notes && (
                                  <div style={{ fontSize: 8, color: '#555', marginTop: 2, lineHeight: 1.35 }}>
                                    📝 {it.notes}
                                  </div>
                                )}

                                {/* Status badge */}
                                <div
                                  onClick={(e) => { e.stopPropagation(); cycleStatus(dk, it.index) }}
                                  style={getStatusStyle(it.status)}
                                >
                                  {sc.lbl}
                                </div>

                                {/* Prompt block */}
                                {isPromptOpen && (
                                  <div style={{
                                    marginTop: 6, padding: '6px 8px',
                                    background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)',
                                    borderRadius: 3,
                                  }}>
                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 8, color: '#8be5a0', lineHeight: 1.6 }}>
                                      {getPromptText(it)}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyPrompt(promptKey) }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5,
                                        padding: '3px 8px', borderRadius: 3, background: V.g3,
                                        border: `1px solid ${V.border2}`, color: V.g, fontFamily: V.mono,
                                        fontSize: 8, cursor: 'pointer', transition: 'all .12s',
                                      }}
                                    >
                                      {copyFeedback === promptKey ? '✓ COPIÉ !' : '📋 COPIER LE PROMPT CLAUDE'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Add button */}
                          {inR && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openAdd(dk) }}
                              style={{
                                width: '100%', padding: 4, border: `1px dashed ${V.dim}`, borderRadius: 3,
                                background: 'transparent', color: V.muted, fontSize: 9, cursor: 'pointer',
                                transition: 'all .12s', marginTop: 2, fontFamily: V.mono,
                              }}
                            >
                              + Ajouter
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODAL OVERLAY */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: V.bg2, border: `1px solid ${V.border2}`, borderRadius: 8,
            padding: 22, width: 440, maxWidth: '92vw',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: V.text }}>
              {modalMode === 'edit' ? '✎ MODIFIER' : '+ AJOUTER UN CONTENU'}
            </div>

            {/* Platform */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>PLATEFORME</label>
              <select
                value={mPlatform}
                onChange={e => setMPlatform(e.target.value)}
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                }}
              >
                <option value="insta" style={{ background: V.bg2 }}>📸 Instagram</option>
                <option value="x" style={{ background: V.bg2 }}>✕ X / Twitter</option>
                <option value="discord" style={{ background: V.bg2 }}>💬 Discord</option>
              </select>
            </div>

            {/* Format */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>FORMAT</label>
              <select
                value={mType}
                onChange={e => setMType(e.target.value)}
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                }}
              >
                {['Carrousel', 'Reel', 'Story', 'Thread', 'Post résultats', 'Récap hebdo', 'Annonce Discord', 'Live', 'Alpha Talk', 'B-roll'].map(opt => (
                  <option key={opt} value={opt} style={{ background: V.bg2 }}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>STATUT</label>
              <select
                value={mStatus}
                onChange={e => setMStatus(e.target.value)}
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                }}
              >
                <option value="todo" style={{ background: V.bg2 }}>○ À faire</option>
                <option value="wip" style={{ background: V.bg2 }}>◑ En cours</option>
                <option value="pub" style={{ background: V.bg2 }}>● Publié</option>
              </select>
            </div>

            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>TITRE / SUJET</label>
              <input
                ref={titleInputRef}
                value={mTitle}
                onChange={e => setMTitle(e.target.value)}
                placeholder="Titre du contenu"
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                }}
              />
            </div>

            {/* Hook */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>HOOK (ACCROCHE)</label>
              <textarea
                value={mHook}
                onChange={e => setMHook(e.target.value)}
                placeholder="L'accroche qui donne envie de lire..."
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                  resize: 'vertical', minHeight: 54,
                }}
              />
            </div>

            {/* Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <label style={{ fontSize: 8, letterSpacing: '0.12em', color: V.muted }}>NOTES DE PRODUCTION</label>
              <textarea
                value={mNotes}
                onChange={e => setMNotes(e.target.value)}
                placeholder="Indications de tournage, montage, references..."
                style={{
                  background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  padding: '6px 9px', fontFamily: V.mono, fontSize: 10, color: V.text, outline: 'none', width: '100%',
                  resize: 'vertical', minHeight: 44,
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1, padding: 7, background: V.bg3, border: `1px solid ${V.border}`, borderRadius: 4,
                  color: V.muted, fontFamily: V.mono, fontSize: 10, cursor: 'pointer',
                }}
              >
                ANNULER
              </button>
              <button
                onClick={saveModal}
                style={{
                  flex: 2, padding: 7, background: V.g, border: 'none', borderRadius: 4,
                  color: '#000', fontFamily: V.mono, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em',
                }}
              >
                {modalMode === 'edit' ? 'ENREGISTRER ▸' : 'AJOUTER ▸'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
