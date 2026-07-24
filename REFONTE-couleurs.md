# Codemod couleurs — rapport (APPLIQUÉ)

Généré par `node scripts/codemod-colors.mjs --apply`.

## Résumé

- Fichiers scannés : **131**
- Fichiers avec au moins un match mappable : **70**
- Occurrences hex mappables : **755**
- Occurrences rgba() mappables : **405**
- Formes de couleurs NON mappées (rencontrées mais sans correspondance) : **121**

## Fichiers exclus

- `app/(lab)/**` — lab shadcn isolé
- `components/shadcn/**` — primitives shadcn isolées
- `components/admin/pages/TradingPerso.tsx` — **à confirmer avant** (2919 lignes, 401 inline styles)

## Correspondances utilisées

### Hex → var()

- `#111113` → `var(--color-surface-1)`
- `#222225` → `var(--color-surface-3)`
- `#09090b` → `var(--color-surface-0)`
- `#18181b` → `var(--color-surface-2)`
- `#f0f0f3` → `var(--color-text-1)`
- `#a1a1aa` → `var(--color-text-2)`
- `#52525b` → `var(--color-text-3)`
- `#22c55e` → `var(--color-profit)`
- `#ef4444` → `var(--color-loss)`
- `#f59e0b` → `var(--color-warn)`
- `#5a6a82` → `var(--color-neutral)`
- `#c9a574` → `var(--color-accent)`

### rgba(R,G,B,A) → rgba(var(--…-rgb), A)

- `rgba(34,197,94, α)` → `rgba(var(--color-profit-rgb), α)`
- `rgba(239,68,68, α)` → `rgba(var(--color-loss-rgb), α)`
- `rgba(245,158,11, α)` → `rgba(var(--color-warn-rgb), α)`
- `rgba(90,106,130, α)` → `rgba(var(--color-neutral-rgb), α)`
- `rgba(201,165,116, α)` → `rgba(var(--color-accent-rgb), α)`

## Détail par fichier

### `components/dashboard/pages/AnalyseGraphique.tsx`

- Hex à remplacer : 70
- rgba à remplacer : 33

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#22c55e → var(--color-profit)
```

### `components/admin/pages/Prospects.tsx`

- Hex à remplacer : 48
- rgba à remplacer : 40

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#ef4444 → var(--color-loss)
```

### `components/admin/modals/TraderProfileModal.tsx`

- Hex à remplacer : 63
- rgba à remplacer : 14

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `components/dashboard/pages/PreMarket.tsx`

- Hex à remplacer : 26
- rgba à remplacer : 16

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#f59e0b → var(--color-warn)
```

### `components/dashboard/pages/Backtest.tsx`

- Hex à remplacer : 24
- rgba à remplacer : 14

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#22c55e → var(--color-profit)
```

### `components/admin/pages/Settings.tsx`

- Hex à remplacer : 27
- rgba à remplacer : 10

Exemples :
```
#18181b → var(--color-surface-2)
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/PropFirm.tsx`

- Hex à remplacer : 22
- rgba à remplacer : 14

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#22c55e → var(--color-profit)
```

### `components/admin/pages/Traders.tsx`

- Hex à remplacer : 31
- rgba à remplacer : 4

Exemples :
```
#5a6a82 → var(--color-neutral)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `components/dashboard/CsvSessionImport.tsx`

- Hex à remplacer : 20
- rgba à remplacer : 12

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `components/dashboard/pages/Session.tsx`

- Hex à remplacer : 21
- rgba à remplacer : 11

Exemples :
```
#18181b → var(--color-surface-2)
#ef4444 → var(--color-loss)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/Revenus.tsx`

- Hex à remplacer : 30
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/StockAnalysis.tsx`

- Hex à remplacer : 6
- rgba à remplacer : 23

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#f59e0b → var(--color-warn)
```

### `components/dashboard/pages/SessionsHistory.tsx`

- Hex à remplacer : 21
- rgba à remplacer : 7

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
```

### `components/dashboard/pages/Progression.tsx`

- Hex à remplacer : 19
- rgba à remplacer : 8

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/CRM.tsx`

- Hex à remplacer : 22
- rgba à remplacer : 3

Exemples :
```
#ef4444 → var(--color-loss)
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
```

### `app/trading-night-guadeloupe/page.tsx`

- Hex à remplacer : 4
- rgba à remplacer : 19

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#ef4444 → var(--color-loss)
```

### `components/admin/pages/Overview.tsx`

- Hex à remplacer : 17
- rgba à remplacer : 6

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/Sessions.tsx`

- Hex à remplacer : 14
- rgba à remplacer : 7

Exemples :
```
#18181b → var(--color-surface-2)
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
```

### `components/admin/pages/Tasks.tsx`

- Hex à remplacer : 18
- rgba à remplacer : 3

Exemples :
```
#f59e0b → var(--color-warn)
#22c55e → var(--color-profit)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/Dashboard.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 18

Exemples :
```
#09090b → var(--color-surface-0)
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
```

### `components/dashboard/pages/Stats.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 18

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/Coaching.tsx`

- Hex à remplacer : 6
- rgba à remplacer : 14

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
```

### `components/dashboard/pages/Coaching.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 15

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
```

### `components/admin/pages/Results.tsx`

- Hex à remplacer : 19
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/TopbarStats.tsx`

- Hex à remplacer : 18
- rgba à remplacer : 0

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/Classement.tsx`

- Hex à remplacer : 18
- rgba à remplacer : 0

Exemples :
```
#f59e0b → var(--color-warn)
#22c55e → var(--color-profit)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/Contrat.tsx`

- Hex à remplacer : 9
- rgba à remplacer : 8

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
```

### `components/admin/TopbarStats.tsx`

- Hex à remplacer : 14
- rgba à remplacer : 2

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#5a6a82 → var(--color-neutral)
```

### `app/padel/page.tsx`

- Hex à remplacer : 11
- rgba à remplacer : 4

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/Broadcast.tsx`

- Hex à remplacer : 15
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#18181b → var(--color-surface-2)
```

### `components/admin/pages/ContentManager.tsx`

- Hex à remplacer : 4
- rgba à remplacer : 11

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
```

### `components/admin/pages/Reports.tsx`

- Hex à remplacer : 15
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#18181b → var(--color-surface-2)
#18181b → var(--color-surface-2)
```

### `components/admin/pages/Notes.tsx`

- Hex à remplacer : 12
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#18181b → var(--color-surface-2)
```

### `app/methode-atp/page.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 9

Exemples :
```
#22c55e → var(--color-profit)
rgba(34,197,94,0.07) → rgba(var(--color-profit-rgb), 0.07)
rgba(34,197,94,0.08) → rgba(var(--color-profit-rgb), 0.08)
```

### `app/paiement/page.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 8

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
rgba(34,197,94,0.06) → rgba(var(--color-profit-rgb), 0.06)
```

### `components/dashboard/pages/Checklist.tsx`

- Hex à remplacer : 8
- rgba à remplacer : 2

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `components/dashboard/pages/Notebook.tsx`

- Hex à remplacer : 6
- rgba à remplacer : 4

Exemples :
```
#ef4444 → var(--color-loss)
#ef4444 → var(--color-loss)
#22c55e → var(--color-profit)
```

### `components/admin/pages/Bibliotheque.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 4

Exemples :
```
#f59e0b → var(--color-warn)
#ef4444 → var(--color-loss)
#09090b → var(--color-surface-0)
```

### `components/dashboard/pages/Formation.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 6

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#22c55e → var(--color-profit)
```

### `components/dashboard/pages/SavedSetups.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 6

Exemples :
```
#22c55e → var(--color-profit)
#ef4444 → var(--color-loss)
#22c55e → var(--color-profit)
```

### `emails/InviteEmail.tsx`

- Hex à remplacer : 7
- rgba à remplacer : 1

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `components/admin/AdminSidebar.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 2

Exemples :
```
#111113 → var(--color-surface-1)
#ef4444 → var(--color-loss)
#5a6a82 → var(--color-neutral)
```

### `components/admin/pages/Calendar.tsx`

- Hex à remplacer : 7
- rgba à remplacer : 0

Exemples :
```
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
#5a6a82 → var(--color-neutral)
```

### `components/dashboard/pages/Ressources.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 2

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
#18181b → var(--color-surface-2)
```

### `app/api/coaching/book/route.ts`

- Hex à remplacer : 3
- rgba à remplacer : 2

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
```

### `app/page.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 2

Exemples :
```
#09090b → var(--color-surface-0)
#22c55e → var(--color-profit)
#09090b → var(--color-surface-0)
```

### `components/coaching/VideoCall.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 3

Exemples :
```
#22c55e → var(--color-profit)
#22c55e → var(--color-profit)
rgba(34,197,94,0.85) → rgba(var(--color-profit-rgb), 0.85)
```

### `components/dashboard/pages/Calculateur.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 0

Exemples :
```
#18181b → var(--color-surface-2)
#18181b → var(--color-surface-2)
#18181b → var(--color-surface-2)
```

### `components/dashboard/pages/Compte.tsx`

- Hex à remplacer : 5
- rgba à remplacer : 0

Exemples :
```
#18181b → var(--color-surface-2)
#22c55e → var(--color-profit)
#222225 → var(--color-surface-3)
```

### `app/admin/setup/page.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 2

Exemples :
```
#ef4444 → var(--color-loss)
#09090b → var(--color-surface-0)
rgba(34,197,94,0.05) → rgba(var(--color-profit-rgb), 0.05)
```

### `app/invite/page.tsx`

- Hex à remplacer : 4
- rgba à remplacer : 0

Exemples :
```
#09090b → var(--color-surface-0)
#09090b → var(--color-surface-0)
#ef4444 → var(--color-loss)
```

### `components/admin/modals/NewTraderModal.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 3

Exemples :
```
#09090b → var(--color-surface-0)
rgba(34,197,94,0.25) → rgba(var(--color-profit-rgb), 0.25)
rgba(34,197,94,0.2) → rgba(var(--color-profit-rgb), 0.2)
```

### `components/admin/pages/BilanCompetences.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 1

Exemples :
```
#09090b → var(--color-surface-0)
#09090b → var(--color-surface-0)
#ef4444 → var(--color-loss)
```

### `components/dashboard/WelcomeModal.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 3

Exemples :
```
#09090b → var(--color-surface-0)
rgba(34,197,94,0.1) → rgba(var(--color-profit-rgb), 0.1)
rgba(34,197,94,0.3) → rgba(var(--color-profit-rgb), 0.3)
```

### `components/chat/ChatBubble.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 1

Exemples :
```
#09090b → var(--color-surface-0)
#ef4444 → var(--color-loss)
rgba(34,197,94,0.35) → rgba(var(--color-profit-rgb), 0.35)
```

### `components/dashboard/pages/Documents.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 1

Exemples :
```
#22c55e → var(--color-profit)
#f59e0b → var(--color-warn)
rgba(34,197,94,0.12) → rgba(var(--color-profit-rgb), 0.12)
```

### `components/dashboard/pages/Journal.tsx`

- Hex à remplacer : 3
- rgba à remplacer : 0

Exemples :
```
#18181b → var(--color-surface-2)
#18181b → var(--color-surface-2)
#18181b → var(--color-surface-2)
```

### `app/admin/login/page.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 1

Exemples :
```
#09090b → var(--color-surface-0)
rgba(34,197,94,0.5) → rgba(var(--color-profit-rgb), 0.5)
```

### `app/dashboard/page.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 1

Exemples :
```
#22c55e → var(--color-profit)
rgba(34,197,94,0.3) → rgba(var(--color-profit-rgb), 0.3)
```

### `app/login/page.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 1

Exemples :
```
#09090b → var(--color-surface-0)
rgba(34,197,94,0.5) → rgba(var(--color-profit-rgb), 0.5)
```

### `components/chat/AdminChatWidget.tsx`

- Hex à remplacer : 0
- rgba à remplacer : 2

Exemples :
```
rgba(34,197,94,0.25) → rgba(var(--color-profit-rgb), 0.25)
rgba(34,197,94,0.1) → rgba(var(--color-profit-rgb), 0.1)
```

### `components/chat/ChatPanel.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 0

Exemples :
```
#09090b → var(--color-surface-0)
#09090b → var(--color-surface-0)
```

### `components/ui/Avatar.tsx`

- Hex à remplacer : 0
- rgba à remplacer : 2

Exemples :
```
rgba(34,197,94,0.25) → rgba(var(--color-profit-rgb), 0.25)
rgba(34,197,94,0.1) → rgba(var(--color-profit-rgb), 0.1)
```

### `components/ui/AvatarUpload.tsx`

- Hex à remplacer : 0
- rgba à remplacer : 2

Exemples :
```
rgba(34,197,94,0.3) → rgba(var(--color-profit-rgb), 0.3)
rgba(34,197,94,0.1) → rgba(var(--color-profit-rgb), 0.1)
```

### `emails/BroadcastEmail.tsx`

- Hex à remplacer : 2
- rgba à remplacer : 0

Exemples :
```
#22c55e → var(--color-profit)
#5a6a82 → var(--color-neutral)
```

### `app/api/invoices/generate/route.ts`

- Hex à remplacer : 1
- rgba à remplacer : 0

Exemples :
```
#22c55e → var(--color-profit)
```

### `app/api/prospects/route.ts`

- Hex à remplacer : 1
- rgba à remplacer : 0

Exemples :
```
#22c55e → var(--color-profit)
```

### `components/chat/MessageBubble.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 0

Exemples :
```
#09090b → var(--color-surface-0)
```

### `components/dashboard/pages/BilanCompetences.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 0

Exemples :
```
#09090b → var(--color-surface-0)
```

### `components/ui/Button.tsx`

- Hex à remplacer : 1
- rgba à remplacer : 0

Exemples :
```
#222225 → var(--color-surface-3)
```

## Couleurs NON mappées (attendent ta décision)

Ces formes existent dans le code, aucune correspondance dans le codemod.
Décide : chacune devient un token sémantique (à ajouter dans globals.css)
ou reste en hex (couleur "one-shot" acceptée).

| Couleur | Occurrences |
|---|---|
| `rgba(255,255,255,…)` | 190 |
| `#e8edf5` | 90 |
| `rgba(0,255,136,…)` | 76 |
| `#a0aec0` | 54 |
| `rgba(0,0,0,…)` | 52 |
| `#60a5fa` | 29 |
| `rgba(255,51,85,…)` | 28 |
| `#6b7280` | 20 |
| `#3b82f6` | 17 |
| `#0a0a0a` | 15 |
| `rgba(96,165,250,…)` | 15 |
| `#888888` | 14 |
| `rgba(255,170,0,…)` | 12 |
| `#16a34a` | 11 |
| `rgba(201,168,107,…)` | 11 |
| `#a855f7` | 11 |
| `rgba(74,222,128,…)` | 11 |
| `#4a5568` | 11 |
| `#1f2937` | 9 |
| `#666666` | 9 |
| `#a78bfa` | 9 |
| `#555555` | 8 |
| `#8892a4` | 8 |
| `#00ff88` | 8 |
| `#cccccc` | 7 |
| `#444444` | 7 |
| `#9ca3af` | 7 |
| `#fca5a5` | 7 |
| `rgba(168,85,247,…)` | 7 |
| `#050505` | 6 |
| `#e1306c` | 6 |
| `rgba(107,114,128,…)` | 6 |
| `#161b27` | 6 |
| `#777777` | 5 |
| `#e5e7eb` | 5 |
| `#aaaaaa` | 5 |
| `#ec4899` | 5 |
| `#111111` | 4 |
| `#0e0e0e` | 4 |
| `#dddddd` | 4 |
| `rgba(59,130,246,…)` | 4 |
| `#fbbf24` | 4 |
| `#4ade80` | 4 |
| `#6b7688` | 4 |
| `#0f1117` | 4 |
| `#25d366` | 3 |
| `#5865f2` | 3 |
| `rgba(225,48,108,…)` | 3 |
| `#f87171` | 3 |
| `#facc15` | 3 |
| `#34d399` | 3 |
| `#ff3355` | 3 |
| `#ffaa00` | 3 |
| `#050905` | 3 |
| `#b91c1c` | 3 |
| `#bbbbbb` | 2 |
| `#94a3b8` | 2 |
| `rgba(184,112,112,…)` | 2 |
| `#5b1414` | 2 |
| `#4b5563` | 2 |
| `rgba(88,101,242,…)` | 2 |
| `#06b6d4` | 2 |
| `#8b5cf6` | 2 |
| `#84cc16` | 2 |
| `#dc2626` | 2 |
| `rgba(251,191,36,…)` | 2 |
| `#f472b6` | 2 |
| `#fb7185` | 2 |
| `rgba(148,163,184,…)` | 2 |
| `#374151` | 2 |
| `#3a6b42` | 2 |
| `#0a140a` | 2 |
| `rgba(208,240,216,…)` | 2 |
| `#eeeeee` | 1 |
| `#1a1a2e` | 1 |
| `#060b18` | 1 |
| `#0b1220` | 1 |
| `#0f172a` | 1 |
| `#131f35` | 1 |
| `#f8fafc` | 1 |
| `#cbd5e1` | 1 |
| `#64748b` | 1 |
| `#475569` | 1 |
| `#c9a86b` | 1 |
| `#d4b67c` | 1 |
| `#7ba88a` | 1 |
| `#b87070` | 1 |
| `#1a140a` | 1 |
| `rgba(30,58,138,…)` | 1 |
| `rgba(123,168,138,…)` | 1 |
| `rgba(6,11,24,…)` | 1 |
| `#0c0c0c` | 1 |
| `#0f0f0f` | 1 |
| `rgba(10,12,15,…)` | 1 |
| `#040a04` | 1 |
| `#161616` | 1 |
| `#1a1a1a` | 1 |
| `#e5e5e5` | 1 |
| `#2a2a2a` | 1 |
| `#8be5a0` | 1 |
| `#999999` | 1 |
| `rgba(6,182,212,…)` | 1 |
| `rgba(139,92,246,…)` | 1 |
| `rgba(236,72,153,…)` | 1 |
| `rgba(170,170,170,…)` | 1 |
| `rgba(20,20,20,…)` | 1 |
| `rgba(248,113,113,…)` | 1 |
| `rgba(167,139,250,…)` | 1 |
| `#fb923c` | 1 |
| `#0a0a0c` | 1 |
| `#1c1c20` | 1 |
| `#06160c` | 1 |
| `#c8d0dc` | 1 |
| `#00aaff` | 1 |
| `#cc2200` | 1 |
| `#00cc6a` | 1 |
| `#080d08` | 1 |
| `#0a100a` | 1 |
| `#d0f0d8` | 1 |
| `#142014` | 1 |
| `#2a3352` | 1 |
