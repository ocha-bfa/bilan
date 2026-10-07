"""SQL compact : valeurs en tableaux alignés sur la liste canonique des 47 pcodes (ordre des fichiers clusters)."""
import sys, os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from charger_clusters import pick_files, read_file
PC=['BF1300','BF4701','BF4702','BF4801','BF4802','BF4803','BF4901','BF4902','BF4903','BF5001','BF5002','BF5003','BF5004','BF5101','BF5102','BF5103','BF5301','BF5302','BF5303','BF5401','BF5402','BF5403','BF5404','BF5501','BF5502','BF5503','BF5701','BF5702','BF5703','BF5704','BF5801','BF5802','BF5901','BF5902','BF6001','BF6002','BF6101','BF6102','BF6103','BF6201','BF6202','BF6203','BF6301','BF6302','BF6401','BF6402','BF6403']
K=['non_deplaces','pdi','retournes','refugies','filles','garcons','femmes','hommes','agees_f','agees_h','handicapes','total']
PCA="array["+','.join(f"'{p}'" for p in PC)+"]"
def arr(d):
    v=[d.get(p) for p in PC]
    if all(x is None for x in v): return 'null::bigint[]'
    return "string_to_array('"+','.join('' if x is None else str(x) for x in v)+"',',','')::bigint[]"
def build(folder,mois):
    ind=[];dis=[]
    for cl,f in sorted(pick_files(folder).items()):
        c,inds,d,w,cib=read_file(f); src=os.path.basename(f).replace("'","''")
        for code,vals in sorted(inds.items()):
            assert set(vals)<=set(PC), (f,code,set(vals)-set(PC)); ind.append(f"('{code}','{src}',{arr(vals)})")
        if d:
            dd={p:x for p,x in d}; assert set(dd)<=set(PC)
            dis.append(f"('{cl}','{src}',"+','.join(arr({p:x.get(k) for p,x in dd.items()}) for k in K)+")")
    s1=f"""insert into hpc_indicator_values (indicator_code,mois,adm2_pcode,realise,source_file)
select c,{mois},u.p,u.v,s from (values {','.join(ind)}) t(c,s,vs), unnest({PCA},vs) u(p,v) where u.v is not null
on conflict (hpc_cycle,indicator_code,mois,adm2_pcode) do update set realise=excluded.realise, source_file=excluded.source_file, loaded_at=now();"""
    s2=f"""insert into cluster_reached_disagg (cluster,mois,adm2_pcode,{','.join(K)},source_file)
select cl,{mois},u.p,{','.join('u.'+k for k in K)},s from (values {','.join(dis)}) t(cl,s,{','.join('a_'+k for k in K)}),
unnest({PCA},{','.join('a_'+k for k in K)}) u(p,{','.join(K)}) where u.total is not null
on conflict (hpc_cycle,cluster,mois,adm2_pcode) do update set {','.join(f'{k}=excluded.{k}' for k in K)},source_file=excluded.source_file,loaded_at=now();"""
    return s1,s2
if __name__=='__main__':
    s1,s2=build(sys.argv[1],int(sys.argv[2])); open(sys.argv[3]+'_ind.sql','w').write(s1); open(sys.argv[3]+'_dis.sql','w').write(s2)
"""SQL compact v2 : réalisé + cible (cible provinciale la plus récente, appliquée à tous les mois où l'indicateur est rapporté)."""
import sys, os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from charger_clusters import pick_files, read_file

B="/mnt/user-data/uploads/03_Bilan/2026/"
M={2:'02_Fevrier',3:'03_Mars',4:'04-Avril',5:'05-Mai',6:'06-Juin',7:'07-Juillet'}
SKIP_TGT={'REF-01'}   # cibles du fichier (21 376) incohérentes avec le HNRP (42 000)
def targets():
    T={}
    for m in sorted(M):
        for c,f in pick_files(B+M[m]+'/Clusters').items():
            *_,cib=read_file(f)
            for k,v in cib.items():
                if k in SKIP_TGT: continue
                if sum(x or 0 for x in v.values())>0: T[k]={p:x for p,x in v.items() if x}
    return T
def build(m,T,with_dis=True):
    ind=[];dis=[]
    for cl,f in sorted(pick_files(B+M[m]+'/Clusters').items()):
        c,inds,d,w,cib=read_file(f); src=os.path.basename(f).replace("'","''")
        if m==5 and cl=='EDU': inds['EDU-01']={p:x.get('total') for p,x in d}   # correction : colonne décalée dans le fichier de mai
        for code,vals in sorted(inds.items()):
            t=T.get(code,{})
            ind.append(f"('{code}','{src}',{arr(vals)},{arr(t)})")
        if d and with_dis:
            dd={p:x for p,x in d}
            dis.append(f"('{cl}','{src}',"+','.join(arr({p:x.get(k) for p,x in dd.items()}) for k in K)+")")
    s1=f"""insert into hpc_indicator_values (indicator_code,mois,adm2_pcode,realise,cible,source_file)
select c,{m},u.p,u.v,u.t,s from (values {','.join(ind)}) t(c,s,vs,ts), unnest({PCA},vs,ts) u(p,v,t) where u.v is not null or u.t is not null
on conflict (hpc_cycle,indicator_code,mois,adm2_pcode) do update set realise=excluded.realise, cible=excluded.cible, source_file=excluded.source_file, loaded_at=now();"""
    s2=None
    if dis: s2=f"""insert into cluster_reached_disagg (cluster,mois,adm2_pcode,{','.join(K)},source_file)
select cl,{m},u.p,{','.join('u.'+k for k in K)},s from (values {','.join(dis)}) t(cl,s,{','.join('a_'+k for k in K)}),
unnest({PCA},{','.join('a_'+k for k in K)}) u(p,{','.join(K)}) where u.total is not null
on conflict (hpc_cycle,cluster,mois,adm2_pcode) do update set {','.join(f'{k}=excluded.{k}' for k in K)},source_file=excluded.source_file,loaded_at=now();"""
    return s1,s2
if __name__=='__main__':
    T=targets()
    for m in M:
        s1,s2=build(m,T,with_dis=m>=5)
        open(f'v2_{m}_ind.sql','w').write(s1.replace(PCA,'PCA'))
        if s2: open(f'v2_{m}_dis.sql','w').write(s2.replace(PCA,'PCA'))
