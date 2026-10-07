-- 01 — Atteints par province × cluster × mois, avec cible et sévérité intersectorielle (grain de base du Bilan).
-- Appliqué à Supabase le 22/09/2026 (migration « bilan_v_reach_province »).
-- cible   : hpc_pin figure_type='target' — somme des groupes de population par cluster ; 'total' pour l'intersectoriel (inclut les réfugiés).
-- sévérité: hpc_severity dimension INTERSECTOR (référence du Bilan) ; sévérité 4 = zone priorisée.
-- atteint : cluster_reached, cumulé au mois. La vue couvre toutes les provinces × clusters × mois (0 si rien).
-- Contrôle juillet 2026 : INTERSECTORIEL 2 651 926 / 1 065 878 ; sév. 4 1 158 565 / 404 015 (34,9 %) ; SECAL 715 364 / 385 522 ; GSAT sév. 4 1 610.
-- Usage : agréger par cluster (feuille Global), par région (Global 2, Cluster), par province (Région) — toujours sum() sur les 4 mesures.

create or replace view bilan_reach_province as
with sev as (
  select adm2_pcode, severity from hpc_severity where hpc_cycle=2026 and dimension_name='INTERSECTOR'),
tgt as (
  select adm2_pcode,
         case cluster when 'intersectoral' then 'INTERSECTORIEL' when 'refugee' then 'refugee' else cluster end cluster,
         sum(figure_value) cible
  from hpc_pin
  where hpc_cycle=2026 and figure_type='target' and cluster_level in ('cluster','intersectoral','refugee')
    and ((cluster='intersectoral' and population_group='total') or cluster<>'intersectoral')
  group by 1,2),
grid as (
  select p.adm2_pcode, p.adm2_name, p.adm1_pcode, a1.adm1_name, c.cluster, m.mois
  from admin2_provinces p
  join admin1_regions a1 using (adm1_pcode)
  cross join (select distinct cluster from cluster_reached where hpc_cycle=2026) c
  cross join (select distinct mois from cluster_reached where hpc_cycle=2026) m)
select g.mois, g.cluster, g.adm1_pcode, g.adm1_name, g.adm2_pcode, g.adm2_name,
       s.severity,
       coalesce(t.cible,0)::bigint cible,
       coalesce(r.personnes_atteintes,0)::bigint atteint,
       case when s.severity=4 then coalesce(t.cible,0) else 0 end::bigint cible_sev4,
       case when s.severity=4 then coalesce(r.personnes_atteintes,0) else 0 end::bigint atteint_sev4
from grid g
left join sev s on s.adm2_pcode=g.adm2_pcode
left join tgt t on t.adm2_pcode=g.adm2_pcode and t.cluster=g.cluster
left join (select adm2_pcode, cluster, mois, sum(personnes_atteintes) personnes_atteintes
           from cluster_reached where hpc_cycle=2026 group by 1,2,3) r
       on r.adm2_pcode=g.adm2_pcode and r.cluster=g.cluster and r.mois=g.mois;
comment on view bilan_reach_province is 'Bilan : atteints cumulés par province × cluster × mois, cible (hpc_pin) et sévérité intersectorielle (hpc_severity). cible_sev4/atteint_sev4 = part priorisée. Agréger par cluster, région ou national selon la feuille.';
grant select on bilan_reach_province to anon, authenticated;
