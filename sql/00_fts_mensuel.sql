-- 00 — FTS mensualisé (appliqué au projet Supabase bfa-humanbase le 22/09/2026, migration « fts_mensuel »)
-- Un instantané FTS par mois : mois_bilan = mois que représente l'export (1-12), as_of_date = date réelle de l'export.
-- Clés : fts_flows (annee, mois_bilan, flow_id) ; fts_requirements (annee, mois_bilan, cluster_code).
-- Règle du Bilan : le financement affiché est celui du mois sélectionné, jamais le dernier export.
-- Lignes chargées avant cette migration (export du 18/09/2026) = septembre, provisoire ; à remplacer par l'export de fin septembre.

alter table fts_flows add column if not exists mois_bilan smallint;
alter table fts_requirements add column if not exists mois_bilan smallint;

update fts_flows set mois_bilan = extract(month from as_of_date)::smallint where mois_bilan is null;
update fts_requirements set mois_bilan = extract(month from as_of_date)::smallint where mois_bilan is null;

alter table fts_flows alter column mois_bilan set not null;
alter table fts_requirements alter column mois_bilan set not null;
alter table fts_flows add constraint fts_flows_mois_chk check (mois_bilan between 1 and 12);
alter table fts_requirements add constraint fts_requirements_mois_chk check (mois_bilan between 1 and 12);

alter table fts_flows drop constraint fts_flows_pkey;
alter table fts_flows add constraint fts_flows_pkey primary key (annee, mois_bilan, flow_id);
alter table fts_requirements drop constraint fts_requirements_pkey;
alter table fts_requirements add constraint fts_requirements_pkey primary key (annee, mois_bilan, cluster_code);

create index if not exists fts_flows_mois_idx on fts_flows (annee, mois_bilan, boundary);

comment on column fts_flows.mois_bilan is 'Mois du Bilan que représente cet instantané FTS (1-12). Une ligne par flux et par mois. Utiliser le mois sélectionné dans le Bilan, jamais le dernier export.';
comment on column fts_requirements.mois_bilan is 'Mois du Bilan que représente cet instantané FTS (1-12). Une ligne par cluster et par mois.';

-- Mois disponibles pour le financement ; un mois absent = « non disponible » dans le Bilan.
-- recu_musd = flux entrants hors promesses (règle du Bilan) = table FTS par cluster (recu_table_musd, contrôle).
create or replace view fts_snapshots as
select f.annee, f.mois_bilan, max(f.as_of_date) as_of_date, count(*) n_flux,
       round(sum(f.montant_usd) filter (where f.boundary='Incoming' and f.funding_status<>'Pledge')/1e6, 1) recu_musd,
       round(sum(f.montant_usd) filter (where f.boundary='Incoming' and f.funding_status='Pledge')/1e6, 1) promesses_musd,
       (select round(sum(r.funding_usd)/1e6,1) from fts_requirements r where r.annee=f.annee and r.mois_bilan=f.mois_bilan) recu_table_musd
from fts_flows f group by f.annee, f.mois_bilan order by f.annee, f.mois_bilan;
comment on view fts_snapshots is 'Mois disponibles pour le financement (Bilan). recu_musd = flux entrants hors promesses (= table FTS par cluster). Un mois absent = « non disponible ».';
grant select on fts_snapshots to anon, authenticated;

-- Chargement des mois (22/09/2026) : fév (export plan 03/03), mars (01/04), avr (export pays 30/04, flux HNRP identifiés par ID),
-- mai (export plan 01/06), juin (export pays 30/06, par ID), juil (export plan 31/07), sept provisoire (18/09).
-- Table par cluster : export « Field cluster/sector » (fév, mars) ou PDF « Aperçu du financement » du mois (avr → juil), arrondi 0,1M.
-- Pour avril et juin, l'export pays ne porte pas le cluster : attribution reprise des exports plan voisins (mois précédent en priorité).
