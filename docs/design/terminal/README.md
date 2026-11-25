# Maquettes ATP Terminal · espace Marchés

Validées le 25/11/2026. Références visuelles du nouveau menu à 2 espaces et des pages de l'espace Marchés.
Ouvre-les dans un navigateur ou avec Playwright. Les liens du menu passent d'un écran à l'autre.

- 00-menu.html : architecture du menu (Mon trading / Marchés), barre du haut selon l'espace, palette ⌘K, barre d'onglets mobile
- 01 à 09 : une page par écran de l'espace Marchés

## Règles pour l'implémentation
- Données d'exemple partout, SAUF la saisonnalité (vraies données 2006-2025) et les taux directeurs / dates de réunion (réels au 25/11/2026).
- Couleurs et polices des maquettes = approximations de la DA. En code : tokens sémantiques et primitives existants (PageHeader, KpiCard, DataTable, EmptyState, Badge...), jamais de hex en dur.
- Montants en $. Heures dans le fuseau du membre.
- Phase 1 (data gratuite) : vue d'ensemble, sessions & horaires, COT, saisonnalité, sentiment de risque, banques centrales.
- Phase 2 (petit budget) : calendrier éco, actus & squawk, récap de séance.
- Plus tard : macro, graphiques et heatmaps (cotations sous licence).
