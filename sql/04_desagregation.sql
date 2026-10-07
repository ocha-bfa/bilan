-- 04 — Désagrégation des atteints (statut, sexe/âge) par cluster × province × mois.
-- Appliqué à Supabase le 23/09/2026 (migration « bilan_disagg »). Source : feuille « Case load Monitoring template » des fichiers clusters.
-- Chargé : fév → juil 2026 (janvier à reprendre plus tard). Contrôle : total = cluster_reached pour chaque cluster et chaque mois.
-- Règles : un bloc entièrement à 0 pour un cluster = non rempli → « non disponible » (statut_dispo / age_dispo) ; handicapes est transversal.
-- Indicateurs (03) chargés le même jour : réalisé fév → juil ; cibles provinciales (colonne « Cible » des fichiers, la plus récente par
-- indicateur) sauf Santé et SECAL (non fournies) et Réfugiés (fichier 21 376 ≠ HNRP 42 000 → cible du catalogue).
-- Corrections : EDU-01 mai = case load Éducation par province (colonne « Atteint cumulatif » décalée dans le fichier) ;
-- Santé : seule la feuille cumulative « Case load Monitoring template » est lue (les feuilles du mois seul sont ignorées).

create table if not exists cluster_reached_disagg (
  hpc_cycle    smallint not null default 2026,
  cluster      text     not null,
  mois         smallint not null check (mois between 1 and 12),
  adm2_pcode   text     not null references admin2_provinces(adm2_pcode),
  non_deplaces integer, pdi integer, retournes integer, refugies integer,
  filles integer, garcons integer, femmes integer, hommes integer, agees_f integer, agees_h integer, handicapes integer,
  total        integer,
  source_file  text,
  loaded_at    timestamptz not null default now(),
  primary key (hpc_cycle, cluster, mois, adm2_pcode)
);
alter table cluster_reached_disagg enable row level security;
create policy "lecture publique" on cluster_reached_disagg for select to anon, authenticated using (true);
grant select on cluster_reached_disagg to anon, authenticated;

create or replace view bilan_disagg as
with d as (
  select x.hpc_cycle, x.cluster, x.mois, p.adm1_pcode, a1.adm1_name_fr adm1_name,
         x.non_deplaces, x.pdi, x.retournes, x.refugies, x.filles, x.garcons, x.femmes, x.hommes, x.agees_f, x.agees_h, x.handicapes, x.total
  from cluster_reached_disagg x join admin2_provinces p on p.adm2_pcode=x.adm2_pcode join admin1_regions a1 on a1.adm1_pcode=p.adm1_pcode),
g as (
  select hpc_cycle, cluster, mois, 'national'::text niveau, 'BF'::text pcode, 'Burkina Faso'::text nom,
         sum(non_deplaces) non_deplaces, sum(pdi) pdi, sum(retournes) retournes, sum(refugies) refugies,
         sum(filles) filles, sum(garcons) garcons, sum(femmes) femmes, sum(hommes) hommes, sum(agees_f) agees_f, sum(agees_h) agees_h, sum(handicapes) handicapes, sum(total) total
  from d group by 1,2,3
  union all
  select hpc_cycle, cluster, mois, 'region', adm1_pcode, adm1_name,
         sum(non_deplaces), sum(pdi), sum(retournes), sum(refugies), sum(filles), sum(garcons), sum(femmes), sum(hommes), sum(agees_f), sum(agees_h), sum(handicapes), sum(total)
  from d group by 1,2,3,5,6)
select g.*,
       coalesce(non_deplaces,0)+coalesce(pdi,0)+coalesce(retournes,0)+coalesce(refugies,0) statut_total,
       coalesce(filles,0)+coalesce(garcons,0) enfants, coalesce(femmes,0)+coalesce(hommes,0) adultes, coalesce(agees_f,0)+coalesce(agees_h,0) personnes_agees,
       (coalesce(non_deplaces,0)+coalesce(pdi,0)+coalesce(retournes,0)+coalesce(refugies,0))>0 statut_dispo,
       (coalesce(filles,0)+coalesce(garcons,0)+coalesce(femmes,0)+coalesce(hommes,0)+coalesce(agees_f,0)+coalesce(agees_h,0))>0 age_dispo
from g;
grant select on bilan_disagg to anon, authenticated;
