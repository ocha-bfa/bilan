# Bilan interactif 2026 — Burkina Faso (OCHA)

Application web statique servie par GitHub Pages à `ocha-bfa.github.io/bilan/` (dépôt github.com/ocha-bfa/bilan ; ancienne adresse assefay.github.io/bfa-humanbase/bilan/ redirigée ici),
données lues dans Supabase (projet bfa-humanbase, clé anon + RLS, PostgREST).
`index.html` est la maquette v8 validée le 21/09/2026 : elle est la spécification.
Ne pas changer la structure des feuilles ni les conventions ci-dessous sans l'accord de l'utilisateur.

## Produit
- 6 feuilles A4 paysage, chaque feuille = une page imprimée (CSS @page, bouton « Tout imprimer »).
  Global 1/2 Réponse · Global 2/2 Géographie et sévérité · Financement · Cluster · Région 1/2 · Région 2/2 Indicateurs.
- Filtres : mois (chips), cluster, région. Tout suit le mois sélectionné, financement compris
  (montants FTS à la fin du mois choisi, pas le dernier FTS disponible).
- Donnée absente en base → afficher « non disponible » (jamais 0, jamais un bloc vide).
- Couleurs sémantiques (ne jamais inverser) : cible orange #F58220 ; atteint vert #72BF44
  (foncé #338C46 = atteints en zone de sévérité 4, clair = sévérité ≤ 3) ; priorisé rouge #ED1847 / rose #F3859B ;
  fonds requis gris #999999 ; fonds reçus bleu #009EDB ; sévérité des besoins en bleus (2 #BBD9F2, 3 #5B9BD5, 4 #1F4E79).
- Une seule forme de table sur toutes les feuilles (ligne = cluster / région / province) ; barres « atteints »
  scindées sév. 4 / ≤ 3 partout.
- Cartes en SVG inline (admin1/admin2 v03 depuis bfa_admin_ocha_v6.gpkg), pas de fond de carte, pas de Mapbox.
- Police Roboto / Roboto Condensed (Google Fonts). Français, format des nombres fr-FR (1 065 878 ; 35,7 %).

## Données (Supabase)
- Existant : cluster_reached (adm2 × cluster × mois, cumulé), hpc_pin (cibles adm2 × cluster × groupe),
  hpc_severity (sévérité par adm2, dimension INTERSECTOR + par cluster), fts_requirements, fts_flows,
  admin1_regions, admin2_provinces.
- Sévérité de référence = intersectorielle. « Priorisées » = cible dans les provinces de sévérité 4.
- FTS : total plan = somme des flux boundary='Incoming' uniquement ; ne jamais ventiler un flux multi-clusters.
- À créer : FTS mensualisé (instantané par mois), hpc_indicators (cluster, indicateur, niveau admin, période,
  cible, réalisé), cluster_reached_disagg (statut PDI/retournés/non-déplacés ; âge 0-17/18-64/65+),
  bilan_narrative (texte par mois).
- Chaque bloc de l'app lit une vue SQL dédiée (fichiers dans sql/, appliqués à Supabase), paramétrée par mois /
  cluster / région. Aucune donnée en dur dans l'app une fois la vue disponible.

## Structure du dossier
index.html · app.js · style.css · data/geo_bfa.js (frontières) · sql/*.sql (une vue par bloc)

## Façon de travailler
- Petites étapes, une feuille ou un bloc à la fois ; montrer le résultat avant de passer au suivant.
- Ne pas réécrire la maquette : extraire progressivement (CSS → style.css, JS → app.js, GEO → data/geo_bfa.js),
  puis remplacer bloc par bloc les données inline par les vues Supabase.
- Comparer chaque bloc migré aux chiffres de juillet 2026 de la maquette (ex. intersectoriel 1 065 878 ;
  sév. 4 404 015 / 1 130 332 ; SECAL 715 364 ; FTS 126,7M au 18/09).
