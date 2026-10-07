-- 03 — Indicateurs clés par cluster (feuilles Cluster et Région 2/2).
-- Catalogue repris du Bilan T2 2026 (26 indicateurs). Les clusters rapportent par province (admin2), chaque mois, en cumulé.
-- cible_nationale du catalogue = valeur arrondie du Bilan T2 (référence provisoire) ; dès que les cibles provinciales
-- sont chargées, la cible nationale affichée = somme des provinces.

create table if not exists hpc_indicators (
  hpc_cycle       smallint not null default 2026,
  indicator_code  text     not null,            -- ex. SECAL-01
  cluster         text     not null,            -- codes de cluster_reached : SECAL, WASH, SANTE, PRO, EDU, NUT, ABRIS, GSAT, refugee
  ordre           smallint not null,
  libelle_fr      text     not null,
  unite           text     not null check (unite in ('personnes','ménages','enfants','femmes','sites','consultations','accouchements')),
  sous_domaine    text,                         -- Protection : PE, PG, VBG, LTB
  cible_nationale bigint,                       -- référence (arrondie, Bilan T2) ; null si inconnue
  dans_bilan      boolean  not null default true,
  note            text,
  primary key (hpc_cycle, indicator_code)
);
comment on table hpc_indicators is 'Catalogue des indicateurs clés du Bilan (un par ligne). Codes stables : <CLUSTER>-<nn>. cible_nationale = référence arrondie du Bilan T2 2026 ; la cible provinciale fait foi quand elle est chargée.';

create table if not exists hpc_indicator_values (
  hpc_cycle      smallint not null default 2026,
  indicator_code text     not null,
  mois           smallint not null check (mois between 1 and 12),
  adm2_pcode     text     not null references admin2_provinces(adm2_pcode),
  cible          bigint,                        -- cible de la province (null si non fournie)
  realise        bigint,                        -- réalisé cumulé à la fin du mois
  source_file    text,
  loaded_at      timestamptz not null default now(),
  primary key (hpc_cycle, indicator_code, mois, adm2_pcode),
  foreign key (hpc_cycle, indicator_code) references hpc_indicators(hpc_cycle, indicator_code)
);
create index if not exists hpc_indicator_values_mois_idx on hpc_indicator_values (hpc_cycle, mois);
comment on table hpc_indicator_values is 'Réalisations des indicateurs clés par province et par mois (cumulé depuis janvier). Une ligne par indicateur × province × mois. Charger le mois complet ; un mois absent = « non disponible » dans le Bilan.';

-- Vue du Bilan : un niveau par ligne (national, région, province) pour chaque indicateur et chaque mois chargé.
create or replace view bilan_indicators as
with v as (
  select v.hpc_cycle, v.indicator_code, v.mois, p.adm1_pcode, a1.adm1_name_fr adm1_name, v.adm2_pcode, p.adm2_name_fr adm2_name, v.cible, v.realise
  from hpc_indicator_values v
  join admin2_provinces p using (adm2_pcode)
  join admin1_regions a1 on a1.adm1_pcode = p.adm1_pcode),
agg as (
  select hpc_cycle, indicator_code, mois, 'province' niveau, adm2_pcode pcode, adm2_name nom, adm1_name region, cible, realise from v
  union all
  select hpc_cycle, indicator_code, mois, 'region', adm1_pcode, adm1_name, adm1_name, sum(cible), sum(realise) from v group by 1,2,3,5,6,7
  union all
  select hpc_cycle, indicator_code, mois, 'national', 'BF', 'Burkina Faso', null, sum(cible), sum(realise) from v group by 1,2,3)
select a.hpc_cycle, a.mois, i.cluster, i.ordre, a.indicator_code, i.libelle_fr, i.unite, i.sous_domaine,
       a.niveau, a.pcode, a.nom, a.region,
       case when a.niveau='national' then coalesce(a.cible, i.cible_nationale) else a.cible end cible,
       a.realise,
       case when coalesce(case when a.niveau='national' then coalesce(a.cible, i.cible_nationale) else a.cible end,0)>0
            then round(a.realise::numeric / case when a.niveau='national' then coalesce(a.cible, i.cible_nationale) else a.cible end, 3) end taux
from agg a join hpc_indicators i using (hpc_cycle, indicator_code)
where i.dans_bilan;
comment on view bilan_indicators is 'Bilan : indicateurs clés par mois et par niveau (national / region / province). Feuille Cluster : niveau=national et cluster=… ; feuille Région 2/2 : niveau=region et nom=… (ou province pour le détail). Filtrer mois = mois sélectionné.';

grant select on hpc_indicators, hpc_indicator_values, bilan_indicators to anon, authenticated;
alter table hpc_indicators enable row level security;
alter table hpc_indicator_values enable row level security;
create policy "lecture publique" on hpc_indicators for select to anon, authenticated using (true);
create policy "lecture publique" on hpc_indicator_values for select to anon, authenticated using (true);

-- Catalogue 2026 (Bilan T2, libellés harmonisés)
insert into hpc_indicators (indicator_code, cluster, ordre, libelle_fr, unite, sous_domaine, cible_nationale) values
('ABRIS-01','ABRIS',1,'Ménages ayant bénéficié d''une distribution de kits AME (minimum ou complet)','ménages',null,52000),
('ABRIS-02','ABRIS',2,'Ménages ayant reçu une solution d''abri d''urgence (durée de vie de 6 mois à 1 an)','ménages',null,52000),
('ABRIS-03','ABRIS',3,'Ménages affectés par la crise ayant bénéficié de la construction d''abris transitionnels (durée de vie d''un an et plus)','ménages',null,103000),
('WASH-01','WASH',1,'Personnes ayant un accès durable à au moins 15 l/j/p d''eau aux normes de qualité','personnes',null,1500000),
('WASH-02','WASH',2,'Personnes ayant un accès sécurisé et adéquat à des latrines hygiéniques, fonctionnelles et sécurisées','personnes',null,900000),
('WASH-03','WASH',3,'Personnes ayant bénéficié des activités de promotion de l''hygiène et de mobilisation communautaire','personnes',null,1100000),
('EDU-01','EDU',1,'Enfants en âge scolaire ayant accès à l''éducation formelle et non formelle','enfants',null,807000),
('EDU-02','EDU',2,'Enfants ayant reçu des fournitures scolaires','enfants',null,365000),
('EDU-03','EDU',3,'Enfants ayant suivi des cours dont l''enseignant a été formé à l''appui psychosocial','enfants',null,90000),
('GSAT-01','GSAT',1,'SAT et ZAD couverts par un suivi multisectoriel régulier avec rapport de profilage partagé','sites',null,150),
('GSAT-02','GSAT',2,'Personnes déplacées vivant dans les SAT/ZAD bénéficiant des activités de coordination et de gestion des sites','personnes',null,205000),
('GSAT-03','GSAT',3,'Sites et zones d''accueil dotés de mécanismes fonctionnels de plaintes et de retour d''information','sites',null,150),
('NUT-01','NUT',1,'Enfants de 6 à 59 mois souffrant de MAS avec complications admis pour traitement','enfants',null,55000),
('NUT-02','NUT',2,'Enfants de 6 à 59 mois souffrant de MAS admis en ambulatoire pour traitement','enfants',null,91000),
('NUT-03','NUT',3,'Femmes enceintes et allaitantes souffrant de MA admises pour traitement','femmes',null,39000),
('PRO-01','PRO',1,'Enfants, adolescents, parents et personnes s''occupant d''enfants bénéficiant de services de santé mentale et psychosociaux (espaces amis des enfants, espaces sûrs)','personnes','PE',682000),
('PRO-02','PRO',2,'Personnes en situation de vulnérabilité ayant reçu une assistance individuelle de protection','personnes','PG',420000),
('PRO-03','PRO',3,'Femmes et filles ayant bénéficié d''activités de bien-être dans les espaces sûrs','femmes','VBG',366000),
('PRO-04','PRO',4,'Personnes formées sur les droits LTB (logement, terre et biens)','personnes','LTB',155000),
('SANTE-01','SANTE',1,'Personnes bénéficiaires de consultations curatives en ambulatoire','consultations',null,394000),
('SANTE-02','SANTE',2,'Accouchements assistés par un personnel qualifié','accouchements',null,81000),
('SANTE-03','SANTE',3,'Enfants pris en charge par des agents communautaires, notamment à travers la PCIME communautaire','enfants',null,111000),
('SECAL-01','SECAL',1,'Personnes bénéficiant d''une aide alimentaire régulière en nature (individuel)','personnes',null,1500000),
('SECAL-02','SECAL',2,'Ménages bénéficiant d''un réapprovisionnement en animaux','ménages',null,15000),
('SECAL-03','SECAL',3,'Ménages bénéficiant d''un soutien en maraîchage','ménages',null,18000),
('REF-01','refugee',1,'Réfugiés ayant une attestation individuelle valide','personnes',null,42000)
on conflict (hpc_cycle, indicator_code) do nothing;
