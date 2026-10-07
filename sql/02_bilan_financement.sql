-- 02 — Financement du plan par mois (feuille Financement, KPI financement des feuilles Cluster).
-- Appliqué à Supabase le 22/09/2026 (migration « bilan_v_financement »).
-- Règles : reçus = flux entrants hors promesses = table FTS par cluster ; les flux multi-clusters ne sont jamais ventilés ;
-- le financement suit le mois sélectionné (mois_bilan), jamais le dernier export. Mois absent de fts_snapshots → « non disponible ».
-- Contrôle juillet 2026 : plan 118,5M (table) ; ECHO 41,4M, Allemagne 13,2M, Belgique 6,9M ; PAM 17,2M, FH régional 11,8M.

-- Requis / reçus / couverture par cluster et par mois (table FTS par cluster, source autoritaire)
create or replace view bilan_fin_cluster as
select r.annee, r.mois_bilan, r.cluster_code, ref.libelle_fr libelle, r.categorie,
       r.requirements_usd requis_usd, r.funding_usd recu_usd, r.pledges_usd promesses_usd,
       case when r.requirements_usd>0 then round(r.funding_usd/r.requirements_usd,3) end couverture,
       r.as_of_date, r.source_file
from fts_requirements r left join fts_cluster_ref ref using (cluster_code);
comment on view bilan_fin_cluster is 'Bilan : financement FTS par cluster et par mois (mois_bilan). categorie=cluster pour les vrais clusters ; non_rapporte et multi_clusters = lignes de réconciliation (dans le total du plan, hors classement par cluster). Somme des recu_usd = total reçu du plan.';
grant select on bilan_fin_cluster to anon, authenticated;

-- Bailleurs (source) et organisations financées (destination) par mois, pour le plan ('PLAN') et par cluster (flux mono-cluster)
create or replace view bilan_fin_orgs as
with f as (
  select annee, mois_bilan, flow_id, source_org, destination_org, montant_usd,
         case when n_clusters=1 then cluster_codes[1] end cluster_code
  from fts_flows where boundary='Incoming' and funding_status<>'Pledge')
select annee, mois_bilan, 'PLAN' scope, 'bailleur' role, source_org organisation, sum(montant_usd) montant_usd, count(*) n_flux from f group by 1,2,5
union all
select annee, mois_bilan, 'PLAN', 'destinataire', destination_org, sum(montant_usd), count(*) from f where destination_org is not null group by 1,2,5
union all
select annee, mois_bilan, cluster_code, 'bailleur', source_org, sum(montant_usd), count(*) from f where cluster_code is not null group by 1,2,3,5
union all
select annee, mois_bilan, cluster_code, 'destinataire', destination_org, sum(montant_usd), count(*) from f where cluster_code is not null and destination_org is not null group by 1,2,3,5;
comment on view bilan_fin_orgs is 'Bilan : montants par organisation et par mois. scope = PLAN (tous flux entrants hors promesses) ou code cluster (flux mono-cluster uniquement). role = bailleur (source) ou destinataire (organisation financée). Trier par montant_usd desc, prendre les 10 premiers.';
grant select on bilan_fin_orgs to anon, authenticated;
