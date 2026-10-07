// Bilan interactif 2026 — rendu des feuilles. Données lues dans Supabase (vues bilan_*), voir sql/.
// Règle : une donnée absente en base s'affiche « non disponible », jamais 0.

/* ---------- accès Supabase (clé publique, lecture seule) ---------- */
const SB_URL='https://vshnatreclfntadwcyhy.supabase.co';
const SB_KEY='sb_publishable_aNoGyj5YIlLWE9N8d0O07g_gn73kTc1';
async function sb(path){
  const r=await fetch(`${SB_URL}/rest/v1/${path}`,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
  if(!r.ok) throw new Error(`${path.split('?')[0]} → HTTP ${r.status}`);
  return r.json();
}
// l'API renvoie au plus 1 000 lignes par requête : lecture par pages
async function sbAll(path){
  const out=[];for(let off=0;;off+=1000){const p=await sb(`${path}${path.includes('?')?'&':'?'}limit=1000&offset=${off}`);out.push(...p);if(p.length<1000)return out}
}

/* ---------- référentiels ---------- */
const MONTHS=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const LONG=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const ANNEE=2026, INT='INTERSECTORIEL';
// clusters de la réponse (ordre d'affichage) ; fts = code FTS quand il diffère du code cluster_reached
const CL=[
 {k:'SECAL',n:'Sécurité alimentaire'},{k:'WASH',n:'EHA'},{k:'SANTE',n:'Santé'},{k:'PRO',n:'Protection'},{k:'EDU',n:'Éducation'},
 {k:'NUT',n:'Nutrition'},{k:'ABRIS',n:'Abris/AME'},{k:'GSAT',n:'GSAT'},{k:'refugee',n:'Réfugiés',fts:'REFUGIES'},
];
const FIN_ONLY={LOG:'Logistique',COORD:'Coordination',MULTI:'MCP (multi-clusters partagés)',NON_RAPPORTE:'Non spécifié'};
const ftsCode=k=>(CL.find(c=>c.k===k)||{}).fts||k;
const fromFts=code=>(CL.find(c=>(c.fts||c.k)===code)||{}).k||code;
const clName=k=>k==='PLAN'?'Plan 2026':k===INT?'Intersectoriel':(CL.find(c=>c.k===k)||{}).n||FIN_ONLY[k]||k;
// libellés courts des bailleurs / organisations
const SHORT=[[/European Commission's Humanitarian Aid.*/,'ECHO'],[/^(.+), Government of$/,'$1'],[/United Nations High Commissioner for Refugees/,'HCR'],[/United Nations Children's Fund/,'UNICEF'],
 [/World Food Programme/,'PAM'],[/World Health Organization/,'OMS'],[/Food and Agriculture Organization.*/,'FAO'],[/United Nations Population Fund/,'UNFPA'],
 [/Office for the Coordination of Humanitarian Affairs/,'OCHA'],[/Burkina Faso \(West, Central Africa HF\)/,'Fonds humanitaire régional'],[/Action Contre la Faim.*/,'ACF'],
 [/Alliance for International Medical Action/,'ALIMA'],[/Première Urgence Internationale/,'PUI'],[/Norwegian Refugee Council/,'NRC'],[/Danish Refugee Council/,'DRC'],
 [/INTERSOS.*/,'INTERSOS'],[/Swedish International Development Cooperation Agency \(SIDA\)/,'SIDA (Suède)'],[/Italian Agency for Development Cooperation/,'AICS (Italie)'],
 [/International NGOs \(Confidential\)/,'ONG internationales (confid.)'],[/National NGOs \(Confidential\)/,'ONG nationales (confid.)'],[/Deutsche Welthungerhilfe.*/,'Welthungerhilfe'],
 [/Agency for Technical Cooperation and Development/,'ACTED'],[/Cooperazione Internazionale - COOPI/,'COOPI'],[/Solidarités International/,'Solidarités Int.'],
 [/Global Partnership for Education/,'GPE'],[/Multi-donor flexible humanitarian contribution.*/,'UNICEF thématique'],[/Private \(individuals & organizations\)/,'Privé'],
 [/Educo - .*/,'Educo'],[/Office de Développement des Eglises Evangéliques/,'ODE'],[/Handicap International.*/,'HI'],[/WeWorld.*/,'WeWorld'],[/Progettomondo.*/,'Progettomondo']];
const PAYS={Germany:'Allemagne',Belgium:'Belgique',Canada:'Canada','United States of America':'Etats Unis',Switzerland:'Suisse',Italy:'Italie',Norway:'Norvège',
 Japan:'Japon',Sweden:'Suède',Denmark:'Danemark','Korea, Republic of':'République de Corée','Saudi Arabia (Kingdom of)':'Arabie Saoudite',Spain:'Espagne',
 Luxembourg:'Luxembourg',Austria:'Autriche',Iceland:'Islande',Monaco:'Monaco',Cyprus:'Chypre','United Kingdom':'Royaume-Uni',France:'France',
 Netherlands:'Pays-Bas',Ireland:'Irlande',Finland:'Finlande',Australia:'Australie','Czech Republic':'République tchèque',Qatar:'Qatar',Kuwait:'Koweït'};
const DONOR_GROUP=[[/^Swedish International Development Cooperation Agency/,'Suède']];
const donorName=n=>{for(const [re,to] of DONOR_GROUP)if(re.test(n))return to;const m=n.match(/^(.+), Government of$/);return m?(PAYS[m[1]]||m[1]):short(n)};
const short=n=>{for(const [re,to] of SHORT){if(re.test(n))return n.replace(re,to)}return n};

/* ---------- état ---------- */
let month=null, cluster='SECAL', region=null, finSel='PLAN', lens='global';
const DATA={summary:[],intAll:[],snaps:[],byMonth:{}}; // byMonth[m] = {prov, fin, orgs}
let RG=[]; // régions du mois courant (intersectoriel) : {n,k,c,a,c4,a4}

/* ---------- helpers ---------- */
const f=v=>v>=1e6?(v/1e6).toFixed(1).replace('.',',')+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v));
const fk=v=>v>=1e6?(v/1e6).toFixed(1).replace('.',',')+'M':v>=1000?(v/1000).toFixed(1).replace('.',',')+'K':String(Math.round(v));
const fm=v=>v.toFixed(1).replace('.',',')+'M';
const pct=(a,c)=>c?Math.round(a/c*1000)/10:null;
const fp=(a,c)=>{const p=pct(a,c);return p===null?(a?'>100 %':'—'):(p>100?'>100 %':p.toFixed(1).replace('.',',')+' %')};
const sev=p=>p===null||p===0?'s0':p<=20?'s1':p<=40?'s2':p<=60?'s3':'s4';
const sum=(rows,k)=>rows.reduce((s,r)=>s+(+r[k]||0),0);
const agg=rows=>({c:sum(rows,'cible'),a:sum(rows,'atteint'),c4:sum(rows,'cible_sev4'),a4:sum(rows,'atteint_sev4')});
const norm=t=>t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace('koosin','kossin').replace('kouritenga','kourittenga').replace('tannouyan','tannounyan');
const geoR=n=>GEO.R.find(r=>norm(r.n)===norm(n)), geoP=n=>GEO.P.find(p=>norm(p.n)===norm(n));
function bbox(d){const xs=[],ys=[];d.replace(/(-?[\d.]+),(-?[\d.]+)/g,(m,x,y)=>{xs.push(+x);ys.push(+y)});return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]}
const seriesOf=rows=>{const s={};rows.forEach(r=>{s[r.mois]=(s[r.mois]||0)+(+r.atteint)});return s}; // {mois: atteint cumulé}
const cur=()=>DATA.byMonth[month];
const provRows=(k,r)=>cur().prov.filter(x=>x.cluster===k&&(!r||x.adm1_name===r));
const monthsAvail=()=>[...new Set(DATA.summary.map(r=>r.mois))].sort((a,b)=>a-b);
const dateFr=d=>new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

/* ---------- composants ---------- */
function kpis(el,items){el.innerHTML=items.map(i=>`<div class="kpi ${i.cls}"><div class="v">${i.v}</div><div class="l">${i.l}</div>${i.d?`<div class="d">${i.d}</div>`:''}</div>`).join('')}
function bar(cls,v,max,txt,w4){const w=max?Math.min(1,v/max):0;
  if(cls==='a'&&w4!==undefined){const ww4=max?Math.min(1,w4/max):0;return`<span class="bc a" style="--w4:${ww4};--w3:${Math.max(0,w-ww4)}"><i class="b4" style="--w:${ww4}"></i><i class="b3"></i><span class="bv">${txt}</span></span>`}
  return`<span class="bc ${cls}" style="--w:${w}"><i class="b"></i><span class="bv">${txt}</span></span>`}
function table(el,rows,{head='Cluster',click,sel,total}={}){
  const mx=k=>Math.max(...rows.map(r=>r[k]||0));
  const M={c:mx('c'),a:mx('a'),c4:mx('c4'),a4:mx('a4')};
  const cell=r=>`${bar('c',r.c,M.c,r.nt?'n.c.':f(r.c))}${bar('a',r.a,M.a,fk(r.a),r.a4)}<span class="pct">${fp(r.a,r.c)}</span><span></span>${bar('pc',r.c4,M.c4,r.c4?f(r.c4):'—')}${bar('pa',r.a4,M.a4,r.c4?fk(r.a4):'—')}<span class="pct">${r.c4?fp(r.a4,r.c4):''}</span>`;
  const name=r=>`${click?`<button type="button" class="n" data-k="${r.k}">`:'<span class="n">'}${r.sev?`<span class="badge s${r.sev}">${r.sev}</span>`:''}${r.n}${click?'</button>':'</span>'}`;
  el.style.setProperty('--cols','128px 1fr 1fr 44px 12px 0.9fr 0.9fr 44px');
  el.innerHTML=`<div class="tr grp"><span></span><span class="gc" style="grid-column:span 3">Personnes ciblées</span><span></span><span class="gp" style="grid-column:span 3">Personnes priorisées · sévérité 4</span></div>
  <div class="tr hd"><span>${head}</span><span>Cible</span><span>Atteints</span><span class="pct">%</span><span></span><span>Cible</span><span>Atteints</span><span class="pct">%</span></div>
  ${total?`<div class="tr tot"><span class="n">${total.n}</span>${cell(total)}</div>`:''}
  ${rows.map(r=>`<div class="tr ${r.k===sel?'sel':''}">${name(r)}${cell(r)}</div>`).join('')}`;
  if(click)el.querySelectorAll('button.n').forEach(b=>b.addEventListener('click',()=>click(b.dataset.k)));
}
function ftable(el,rows,total,click,sel){
  const mq=Math.max(...rows.map(r=>r.req)),mf=Math.max(...rows.map(r=>r.fin));
  const cell=r=>`${bar('rq',r.req,mq,r.req?fm(r.req):'—')}${bar('fn',r.fin,mf,fm(r.fin))}<span class="pct">${r.req?fp(r.fin,r.req):''}</span>`;
  const name=r=>r.k?`<button type="button" class="n" data-k="${r.k}">${r.n}</button>`:`<span class="n" style="${r.rec?'color:var(--ink3);font-weight:400':''}">${r.n}</span>`;
  el.style.setProperty('--cols','150px 1fr 1fr 48px');
  el.innerHTML=`<div class="tr hd"><span>Cluster</span><span>Requis</span><span>Reçus</span><span class="pct">% couvert</span></div>
  <div class="tr tot ${sel==='PLAN'?'sel':''}"><button type="button" class="n" data-k="PLAN">${total.n}</button>${cell(total)}</div>
  ${rows.map(r=>`<div class="tr ${r.k===sel?'sel':''}">${name(r)}${cell(r)}</div>`).join('')}`;
  el.querySelectorAll('button.n').forEach(b=>b.addEventListener('click',()=>click(b.dataset.k)));
}
function indtable(el,rows,{prio=true,cols}={}){
  el.style.setProperty('--icols',cols||(prio?'110px 1fr 60px 60px 48px 14px 60px 60px 48px':'1fr 64px 64px 52px'));
  if(!rows.length){el.innerHTML=`<div class="na">Indicateurs non disponibles pour ${LONG[month-1].toLowerCase()} — données non chargées dans la base.</div>`;return}
  const head=prio?`<div class="tr grp"><span></span><span></span><span class="gc" style="grid-column:span 3">Toute la région</span><span></span><span class="gp" style="grid-column:span 3">Provinces priorisées · sévérité 4</span></div>
  <div class="tr hd"><span>Cluster</span><span>Indicateur</span><span class="v">Cible</span><span class="v">Réalisé</span><span class="pct">%</span><span></span><span class="v">Cible</span><span class="v">Réalisé</span><span class="pct">%</span></div>`
  :`<div class="tr hd"><span>Indicateur</span><span class="v">Cible</span><span class="v">Réalisé</span><span class="pct">%</span></div>`;
  const n=v=>v==null?'—':fk(v), p=(a,c)=>c?fp(a,c):'—';
  el.innerHTML=head+rows.map(r=>`<div class="tr">${prio?`<span class="cl">${r.cl}</span>`:''}<span class="lab">${r.lab}</span><span class="v vc">${n(r.c)}</span><span class="v va">${n(r.a)}</span><span class="pct"><b>${p(r.a,r.c)}</b></span>${prio?`<span></span><span class="v vp">${r.c4!=null?n(r.c4):'—'}</span><span class="v vq">${r.a4!=null?n(r.a4):'—'}</span><span class="pct">${r.c4?fp(r.a4,r.c4):''}</span>`:''}</div>`).join('');
}
function hbars(el,items,max){el.innerHTML=items.length?items.map(([n,v,o])=>`<div class="r${o?' oth':''}"><span class="n" title="${n}">${short(n)}</span><span class="t"><i style="width:${v/max*100}%"></i></span><span class="v">${fm(v)}</span></div>`).join(''):`<div class="na">Non disponible</div>`}
function sevcmp(el,{c4,a4,c3,a3}){
  const p4=pct(a4,c4),p3=pct(a3,c3);
  el.innerHTML=`<div class="r"><span class="n"><span class="badge s4">4</span>Sévérité 4 · priorisées</span><span class="track"><i style="width:${Math.min(100,p4||0)}%"></i></span><span class="v"><b>${fk(a4)}</b> / ${f(c4)} · <b>${fp(a4,c4)}</b></span></div>
  <div class="r lo"><span class="n"><span class="badge s3">≤3</span>Sévérité 3 et moins</span><span class="track"><i style="width:${Math.min(100,p3||0)}%"></i></span><span class="v"><b>${fk(a3)}</b> / ${f(c3)} · <b>${fp(a3,c3)}</b></span></div>
  <div class="gap">${p4!==null&&p3!==null?(p4<p3?`Les zones de sévérité 4 sont couvertes <b>${(p3-p4).toFixed(1).replace('.',',')} pts</b> de moins que les zones de sévérité ≤ 3.`:`Les zones de sévérité 4 sont couvertes <b>${(p4-p3).toFixed(1).replace('.',',')} pts</b> de plus que les zones de sévérité ≤ 3.`):p4!==null?'Toute la cible de cette sélection est en zone de sévérité 4.':'Pas de cible priorisée dans cette sélection.'}</div>`;
}
// répartition des atteints par niveau de sévérité (2/3/4), depuis le résumé national du mois
function sevstack(el){
  const rows=DATA.summary.filter(r=>r.mois===month);
  const items=[...CL.map(c=>({n:c.n,k:c.k})),{n:'Intersectoriel',k:INT,int:true}].map(x=>{const r=rows.find(y=>y.cluster===x.k)||{};const t=+r.atteint||0;
    const s=t?[+r.atteint_sev2||0,+r.atteint_sev3||0,+r.atteint_sev4||0].map(v=>Math.round(v/t*100)):[0,0,0];return{...x,s}});
  el.innerHTML=items.map(x=>`<div class="${x.int?'int':''}"><div class="bar">${[4,3,2].map((lv,i)=>{const v=x.s[2-i];return v?`<i class="s${lv}" style="flex:${v}">${v>=9?v+'%':''}</i>`:''}).join('')}</div><span class="lb">${x.n}</span></div>`).join('');
}
// désagrégation des atteints du cluster (national, mois choisi) : statut, âge, sexe — bloc à 0 = non rempli par le cluster
const DCOL={k1:'#0074B7',k2:'#64BDEA',k3:'#C5DFEF',k4:'#8FB3CF',a1:'#338C46',a2:'#72BF44',a3:'#CEE3A0',x1:'#7B4A94',x2:'#C4A6D4'};
function disagg(el,k){
  const d=(cur().dis||[]).find(r=>r.cluster===k);
  const mk=(vals,labels,cls,ok)=>{
    if(!d||!ok)return{bar:'<span class="st nd">non disponible</span>',lg:''};
    const v=vals.map(x=>+x||0),t=v.reduce((a,b)=>a+b,0)||1;
    const keep=v.map((x,i)=>i).filter(i=>v[i]>0||i<3&&cls!=='k'||cls==='k'&&i<3);
    return{bar:`<span class="st">${v.map((x,i)=>{const p=x/t*100;return p?`<i class="${cls}${i+1}" style="flex:${p}">${p>=12?Math.round(p)+'%':''}</i>`:''}).join('')}</span>`,
      lg:`<div class="lg">${keep.map(i=>`<span><i style="background:${DCOL[cls+(i+1)]}"></i>${labels[i]} <b>${fk(v[i])}</b></span>`).join('')}</div>`}};
  const fem=d?(+d.filles||0)+(+d.femmes||0)+(+d.agees_f||0):0, hom=d?(+d.garcons||0)+(+d.hommes||0)+(+d.agees_h||0):0;
  const pg=mk(d&&[d.pdi,d.retournes,d.non_deplaces,d.refugies],['PDI','Retournés','Non-déplacés','Réfugiés'],'k',d&&d.statut_dispo);
  const ag=mk(d&&[d.enfants,d.adultes,d.personnes_agees],['Enfants','Adultes','Pers. âgées'],'a',d&&d.age_dispo);
  const sx=mk([fem,hom],['Femmes et filles','Hommes et garçons'],'x',d&&d.age_dispo);
  el.innerHTML=`<div class="t">Personnes atteintes — désagrégation <small>national, fin ${LONG[month-1].toLowerCase()}</small></div>
  <div class="r"><span class="l">Statut</span>${pg.bar}</div>${pg.lg}
  <div class="r"><span class="l">Âge</span>${ag.bar}</div>${ag.lg}
  <div class="r"><span class="l">Sexe</span>${sx.bar}</div>${sx.lg}`;
}
function drawMap(el,items,{view,height=300,onClick,selected,outline=true,big=false}={}){
  const vb=view||[0,0,GEO.W,GEO.H];
  // taille des étiquettes en unités SVG pour rester lisible (~10 px à l'écran et à l'impression) quelle que soit la taille de la carte
  const w=el.clientWidth||el.parentElement?.clientWidth||0;
  const scale=Math.min(w?w/vb[2]:Infinity,height/vb[3]);
  const fl=(big?10.5:10)/scale, fv=(big?9.5:9)/scale;
  el.innerHTML=`<svg class="map ${big?'big':''}" style="height:${height}px;--fl:${fl.toFixed(2)}px;--fv:${fv.toFixed(2)}px" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img">
   ${items.map(i=>`<path class="${i.cls} ${i.key===selected?'sel':''}" d="${i.geo.d}" data-k="${i.key}"><title>${i.title||i.label}</title></path>`).join('')}
   ${outline?`<path class="adm0" d="${GEO.R.map(r=>r.d).join('')}"/>`:''}
   ${items.map(i=>i.label?`<text class="${i.dark?'dk':''}" x="${i.geo.c[0]}" y="${i.geo.c[1]-fv*0.15}">${i.label}</text><text class="v ${i.dark?'dk':''}" x="${i.geo.c[0]}" y="${i.geo.c[1]+fv*1.05}">${i.value}</text>`:'').join('')}
  </svg>`;
  if(onClick)el.querySelectorAll('path[data-k]').forEach(p=>p.addEventListener('click',()=>onClick(p.dataset.k)));
}
function regionMap(el,regions,onClick,height,big){
  // petite carte : les régions sans cible ni atteint ne sont pas étiquetées (le centre du pays reste lisible) ; l'infobulle garde le nom
  drawMap(el,regions.filter(r=>geoR(r.n)).map(r=>{const p=pct(r.a,r.c);const cls=sev(p===null&&r.a?101:p);const has=r.c||r.a;return{geo:geoR(r.n),cls,key:r.n,label:(big||has)?r.n:'',value:has?fp(r.a,r.c):'',dark:cls==='s3'||cls==='s4',title:`${r.n} — ${fk(r.a)} atteints / ${f(r.c)} ciblées`}}),{onClick,height,big});
}
// progression cumulée : series = {mois: valeur}
// hauteur des barres relative à la hauteur du bloc .tl (moins les deux lignes de texte) : le graphique s'adapte à l'espace de la feuille
function timeline(el,series){const vals=Object.values(series);const max=Math.max(1,...vals);
  el.innerHTML=MONTHS.map((m,i)=>{const mo=i+1;const has=series[mo]!==undefined;const v=has?series[mo]:0;const h=has?`max(4px, calc((100% - 30px) * ${(v/max).toFixed(3)}))`:'0px';
  return `<div class="${mo===month?'cur':''} ${has?'':'none'}"><span>${has?f(v):''}</span><i style="height:${h}"></i><span>${m}</span></div>`}).join('')}

/* ---------- agrégats du mois ---------- */
// indicateurs clés : national par cluster ; région = somme des provinces (priorisées = provinces de sévérité 4)
const numOrNull=v=>v==null?null:+v;
function indNational(k){
  return (cur().ind||[]).filter(r=>r.niveau==='national'&&r.cluster===k).sort((a,b)=>a.ordre-b.ordre)
    .map(r=>({lab:r.libelle_fr,c:numOrNull(r.cible),a:numOrNull(r.realise)}));
}
function indRegion(reg){
  const sevOf={};cur().prov.filter(x=>x.cluster===INT&&x.adm1_name===reg).forEach(x=>sevOf[norm(x.adm2_name)]=+x.severity);
  const by={};
  (cur().ind||[]).filter(r=>r.niveau==='province'&&norm(r.region||'')===norm(reg)).forEach(r=>{
    const o=by[r.indicator_code]=by[r.indicator_code]||{k:r.cluster,ordre:r.ordre,lab:r.libelle_fr,c:null,a:null,c4:null,a4:null};
    const add=(f,v)=>{if(v!=null)o[f]=(o[f]||0)+ +v};
    add('c',r.cible);add('a',r.realise);
    if(sevOf[norm(r.nom)]===4){add('c4',r.cible);add('a4',r.realise)}
  });
  const has4=Object.values(sevOf).includes(4);
  return CL.flatMap(c=>Object.values(by).filter(o=>o.k===c.k).sort((a,b)=>a.ordre-b.ordre)
    .map((o,i)=>({...o,cl:i?'':c.n,c4:has4?o.c4:null,a4:has4?o.a4:null})));
}
function regionsFor(k){
  const by={};provRows(k).forEach(r=>{(by[r.adm1_name]=by[r.adm1_name]||[]).push(r)});
  return Object.entries(by).map(([n,rows])=>({n,k:n,...agg(rows)})).sort((a,b)=>b.c-a.c||b.a-a.a);
}
function provincesFor(k,r){
  return provRows(k,r).map(p=>({n:p.adm2_name,k:p.adm2_name,sev:p.severity,c:+p.cible,a:+p.atteint,c4:+p.cible_sev4,a4:+p.atteint_sev4,nt:+p.cible<100})).sort((a,b)=>b.c-a.c||b.a-a.a);
}
function clustersFor(r){
  return CL.map(c=>({...agg(provRows(c.k,r)),n:c.n,k:c.k})).sort((a,b)=>b.c-a.c);
}
function finFor(){ // financement du mois : null si absent
  const rows=cur().fin;if(!rows.length)return null;
  const byCode={};rows.forEach(r=>byCode[r.cluster_code]=r);
  const req=k=>+(byCode[k]||{}).requis_usd/1e6||0, fin=k=>+(byCode[k]||{}).recu_usd/1e6||0;
  return{byCode,req,fin,totalReq:rows.filter(r=>r.categorie==='cluster').reduce((s,r)=>s+(+r.requis_usd||0),0)/1e6,totalFin:rows.reduce((s,r)=>s+(+r.recu_usd||0),0)/1e6,asof:rows[0].as_of_date};
}
// top n (+ ligne « Autres » si other=true) ; bailleurs regroupés par pays (donorName)
function orgsFor(scope,role,n,other){
  const by={};cur().orgs.filter(o=>o.scope===scope&&o.role===role).forEach(o=>{const k=role==='bailleur'?donorName(o.organisation):o.organisation;by[k]=(by[k]||0)+ +o.montant_usd/1e6});
  const all=Object.entries(by).sort((a,b)=>b[1]-a[1]), top=all.slice(0,n), rest=all.slice(n).reduce((s,x)=>s+x[1],0);
  return other&&rest>0.05?[...top,['Autres',rest,true]]:top;
}

/* ---------- rendu des feuilles ---------- */
function renderGlobal(){
  const T=agg(provRows(INT)), S=seriesOf(DATA.summary.filter(r=>r.cluster===INT));
  const prev=S[month]-(S[month-1]||0);
  document.getElementById('g-narr').innerHTML=`Au mois de <b>${LONG[month-1].toLowerCase()} 2026</b>, les partenaires humanitaires ont atteint cumulativement <b>${T.a.toLocaleString('fr-FR')} personnes</b>, soit ${fp(T.a,T.c)} de la cible intersectorielle (+${f(prev)} sur le mois), dont ${f(T.a4)} personnes vivant dans des zones de sévérité 4, soit ${fp(T.a4,T.c4)} de la cible priorisée.`;
  kpis(document.getElementById('g-kpis'),[
    {cls:'c',v:f(T.c),l:'Personnes ciblées'},{cls:'a',v:f(T.a),l:'Atteintes',d:`<b>+${f(prev)}</b> ce mois`},{cls:'a',v:fp(T.a,T.c),l:'% atteint'},
    {cls:'p',v:f(T.c4),l:'Priorisées (sév. 4)'},{cls:'p2',v:f(T.a4),l:'Atteintes'},{cls:'p2',v:fp(T.a4,T.c4),l:'% atteint'}]);
  sevcmp(document.getElementById('g-sev'),{c4:T.c4,a4:T.a4,c3:T.c-T.c4,a3:T.a-T.a4});
  table(document.getElementById('g-table'),CL.map(c=>({...agg(provRows(c.k)),n:c.n,k:c.k})),{click:kk=>{cluster=kk;setLens('cluster')},total:{n:'Intersectoriel',...T}});
  timeline(document.getElementById('g-tl'),S);
  regionMap(document.getElementById('g-map'),RG,n=>{region=n;setLens('region')},400,true);
  table(document.getElementById('g-rtable'),RG,{head:'Région',click:n=>{region=n;setLens('region')},total:{n:'Burkina Faso',...T}});
  sevstack(document.getElementById('g-stk'));
}
function renderFin(){
  const F=finFor();
  const info=document.getElementById('f-info');
  if(!F){kpis(document.getElementById('f-kpis'),[{cls:'r',v:'—',l:'Fonds requis (USD)'},{cls:'f',v:'—',l:'Fonds reçus'},{cls:'f',v:'—',l:'% couvert'}]);
    info.hidden=false;info.innerHTML=`<b>Financement non disponible pour ${LONG[month-1].toLowerCase()} 2026.</b> Aucun instantané FTS n'a été chargé pour ce mois.`;
    document.getElementById('f-table').innerHTML='<div class="na">Non disponible</div>';['f-donors','f-recip'].forEach(id=>document.getElementById(id).innerHTML='<div class="na">Non disponible</div>');
    ['f-sel-1','f-sel-2'].forEach(id=>document.getElementById(id).textContent='');document.getElementById('f-note').innerHTML='';return}
  kpis(document.getElementById('f-kpis'),[{cls:'r',v:fm(F.totalReq),l:'Fonds requis (USD)'},{cls:'f',v:fm(F.totalFin),l:'Fonds reçus'},{cls:'f',v:fp(F.totalFin,F.totalReq),l:'% couvert'}]);
  info.innerHTML='';info.hidden=true;
  const rows=cur().fin.map(r=>({k:r.categorie==='cluster'?fromFts(r.cluster_code):null,n:clName(fromFts(r.cluster_code)),req:+r.requis_usd/1e6||0,fin:+r.recu_usd/1e6||0,rec:r.categorie!=='cluster'})).sort((a,b)=>(b.req-a.req)||(b.fin-a.fin));
  ftable(document.getElementById('f-table'),rows,{n:'Plan 2026 — tous clusters',req:F.totalReq,fin:F.totalFin},k=>{finSel=k;renderFin()},finSel);
  const scope=finSel==='PLAN'?'PLAN':ftsCode(finSel);
  ['f-sel-1','f-sel-2'].forEach(id=>document.getElementById(id).textContent=clName(finSel));
  const d=orgsFor(scope,'bailleur',10,true),r=orgsFor(scope,'destinataire',10,true);
  hbars(document.getElementById('f-donors'),d,Math.max(1e-9,...d.map(x=>x[1])));hbars(document.getElementById('f-recip'),r,Math.max(1e-9,...r.map(x=>x[1])));
  document.getElementById('f-note').innerHTML=finSel==='PLAN'?'':`<span>Flux affectés à ce seul cluster ; les flux multi-clusters partagés (MCP, ${fm(F.fin('MULTI'))}) et non spécifiés (${fm(F.fin('NON_RAPPORTE'))}) ne sont pas ventilés et n'apparaissent pas ici.</span>`;
}
function renderCluster(){
  const c=CL.find(x=>x.k===cluster), T=agg(provRows(c.k)), F=finFor(), code=ftsCode(c.k);
  document.getElementById('c-name-1').textContent=c.n;
  kpis(document.getElementById('c-kpis'),[
    {cls:'c',v:f(T.c),l:'Ciblées'},{cls:'a',v:fk(T.a),l:'Atteintes'},{cls:'a',v:fp(T.a,T.c),l:'% atteint'},
    {cls:'p',v:f(T.c4),l:'Priorisées (sév. 4)'},{cls:'p2',v:fk(T.a4),l:'Atteintes'},{cls:'p2',v:fp(T.a4,T.c4),l:'% atteint'},
    {cls:'r',v:F?fm(F.req(code)):'—',l:'Requis (USD)'},{cls:'f',v:F?fm(F.fin(code)):'—',l:'Reçus (FTS)'},{cls:'f',v:F?fp(F.fin(code),F.req(code)):'—',l:'% couvert'}]);
  disagg(document.getElementById('c-dis'),c.k);
  const regs=regionsFor(c.k);
  regionMap(document.getElementById('c-map'),regs,n=>{region=n;setLens('region')},232);
  table(document.getElementById('c-table'),regs.filter(r=>r.c>1000||r.a>500).slice(0,12),{head:'Région (12 premières)',click:n=>{region=n;setLens('region')}});
  sevcmp(document.getElementById('c-sev'),{c4:T.c4,a4:T.a4,c3:T.c-T.c4,a3:T.a-T.a4});
  const d=F?orgsFor(code,'bailleur',5):[],r=F?orgsFor(code,'destinataire',5):[];
  hbars(document.getElementById('c-donors'),d,d[0]?d[0][1]:1);hbars(document.getElementById('c-recip'),r,r[0]?r[0][1]:1);
  indtable(document.getElementById('c-ind'),indNational(c.k),{prio:false});
  document.getElementById('c-ind-date').textContent=`national, fin ${LONG[month-1].toLowerCase()}`;
  timeline(document.getElementById('c-tl'),seriesOf(DATA.summary.filter(r=>r.cluster===c.k)));
}
function renderRegion(){
  const r=region, T=agg(provRows(INT,r));
  ['r-name-1','r-name-2','r-name-3'].forEach(id=>document.getElementById(id).textContent=r);
  document.getElementById('r-loc').innerHTML=`<svg class="locator" viewBox="0 0 ${GEO.W} ${GEO.H}">${GEO.R.map(x=>`<path class="${norm(x.n)===norm(r)?'sel':''}" d="${x.d}"/>`).join('')}</svg>`;
  const pv=provincesFor(INT,r), cls=clustersFor(r);
  kpis(document.getElementById('r-kpis'),[
    {cls:'c',v:f(T.c),l:'Ciblées'},{cls:'a',v:fk(T.a),l:'Atteintes'},{cls:'a',v:fp(T.a,T.c),l:'% atteint'},
    {cls:'p',v:T.c4?f(T.c4):'—',l:'Priorisées (sév. 4)'},{cls:'p2',v:T.c4?fk(T.a4):'—',l:'Atteintes'},{cls:'p2',v:T.c4?fp(T.a4,T.c4):'—',l:'% atteint'},
    {cls:'r',v:String(pv.length),l:'Provinces'},{cls:'f',v:String(pv.filter(p=>p.sev===4).length),l:'Provinces en sévérité 4'},{cls:'f',v:String(cls.filter(c=>c.a>0).length),l:'Clusters actifs'}]);
  table(document.getElementById('r-prov'),pv,{head:'Province'});
  sevcmp(document.getElementById('r-sev'),{c4:T.c4,a4:T.a4,c3:T.c-T.c4,a3:T.a-T.a4});
  const gr=geoR(r);
  if(gr){const [x0,y0,x1,y1]=bbox(gr.d);const pad=12;
    drawMap(document.getElementById('r-map'),pv.map(p=>{const g=geoP(p.n);return g?{geo:g,cls:'v'+(p.sev||2),key:p.n,label:p.n,value:p.nt?fk(p.a):fp(p.a,p.c),dark:(p.sev||2)>=3,title:`${p.n} — sévérité ${p.sev||'?'} — ${fk(p.a)} atteints`}:null}).filter(Boolean),
      {view:[x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad],height:210,outline:false});}
  table(document.getElementById('r-table'),cls,{head:'Cluster',click:kk=>{cluster=kk;setLens('cluster')}});
  timeline(document.getElementById('r-tl'),seriesOf(DATA.intAll.filter(x=>x.adm1_name===r)));
  indtable(document.getElementById('r-ind'),indRegion(r));
  document.getElementById('r-ind-date').textContent=`fin ${LONG[month-1].toLowerCase()} · cible et réalisé = somme des provinces de la région ; « — » : cible provinciale non fournie par le cluster`;
}

/* ---------- chargement ---------- */
async function loadMonth(m){
  if(DATA.byMonth[m])return;
  const [prov,fin,orgs,ind,dis]=await Promise.all([
    sbAll(`bilan_reach_province?mois=eq.${m}&select=cluster,adm1_name,adm2_name,severity,cible,atteint,cible_sev4,atteint_sev4`),
    sb(`bilan_fin_cluster?annee=eq.${ANNEE}&mois_bilan=eq.${m}&select=cluster_code,categorie,requis_usd,recu_usd,as_of_date`),
    sbAll(`bilan_fin_orgs?annee=eq.${ANNEE}&mois_bilan=eq.${m}&select=scope,role,organisation,montant_usd`),
    sbAll(`bilan_indicators?mois=eq.${m}&niveau=in.(national,province)&select=cluster,ordre,indicator_code,libelle_fr,niveau,nom,region,cible,realise&order=indicator_code,niveau,pcode`),
    sb(`bilan_disagg?mois=eq.${m}&niveau=eq.national`)]);
  DATA.byMonth[m]={prov,fin,orgs,ind,dis};
}
async function boot(){
  const st=document.getElementById('status');
  try{
    st.textContent='Chargement…';
    const [summary,intAll,snaps]=await Promise.all([
      sb('bilan_reach_month?select=mois,cluster,cible,atteint,cible_sev4,atteint_sev4,atteint_sev2,atteint_sev3'),
      sbAll(`bilan_reach_province?cluster=eq.${INT}&select=mois,adm1_name,adm2_name,atteint`),
      sb(`fts_snapshots?annee=eq.${ANNEE}&select=mois_bilan,as_of_date,recu_musd`)]);
    Object.assign(DATA,{summary,intAll,snaps});
    const avail=monthsAvail(); month=avail[avail.length-1];
    document.getElementById('months').innerHTML=MONTHS.map((m,i)=>`<button type="button" id="m-${i+1}" ${avail.includes(i+1)?'':'disabled'} aria-pressed="${i+1===month}" title="${DATA.snaps.find(s=>s.mois_bilan===i+1)?'':'financement non disponible'}">${m}</button>`).join('');
    document.querySelectorAll('#months button').forEach(b=>b.addEventListener('click',async()=>{month=+b.id.slice(2);await go()}));
    await go();
  }catch(e){st.textContent='Erreur de chargement : '+e.message;console.error(e)}
}
async function go(){
  const st=document.getElementById('status');st.textContent='Chargement…';
  try{await loadMonth(month)}catch(e){st.textContent='Erreur : '+e.message;console.error(e);return}
  RG=regionsFor(INT);
  if(!region||!RG.find(r=>r.n===region))region=RG[0].n;
  document.getElementById('sel-region').innerHTML=RG.map(r=>`<option value="${r.n}">${r.n}</option>`).join('');
  document.getElementById('btn-print-all').textContent=`Tout imprimer (${nbPagesAll()} p.)`;
  render(); st.textContent='';
}

/* ---------- état d'affichage ---------- */
function setLens(l){lens=l;document.querySelectorAll('.lens button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lens===l));render()}
function render(){
  document.querySelectorAll('.paper:not(.pa)').forEach(p=>p.classList.toggle('on',p.dataset.lens===lens));
  document.getElementById('pick-cluster').hidden=lens!=='cluster';document.getElementById('pick-region').hidden=lens!=='region';
  document.getElementById('sel-cluster').value=cluster;document.getElementById('sel-region').value=region;
  document.querySelectorAll('#months button').forEach((b,i)=>b.setAttribute('aria-pressed',i+1===month));
  // titre de chaque feuille avec son cluster / sa région, quelle que soit la vue affichée (utile pour « Tout imprimer »)
  const sub={global:'',fin:'',cluster:' — '+clName(cluster),region:region?' — '+region:''};
  const F=finFor();
  document.querySelectorAll('.paper:not(.pa)').forEach(p=>{p.querySelector('.lensname').textContent=p.dataset.title+sub[p.dataset.lens];
    p.querySelector('.period').textContent=(p.dataset.lens==='fin'?(F?`FTS à fin ${LONG[month-1].toLowerCase()} 2026`:`${LONG[month-1]} 2026 — financement non disponible`):LONG[month-1]+' 2026')});
  ({global:renderGlobal,fin:renderFin,cluster:renderCluster,region:renderRegion})[lens]();
  fit();
}
document.querySelectorAll('.paper').forEach(p=>{
  p.insertAdjacentHTML('afterbegin',`<div class="head"><div><h1>BURKINA FASO</h1><div class="sub">Suivi de la réponse humanitaire</div></div><div class="right"><div class="lensname"></div><div class="period"></div></div></div>`);
  p.insertAdjacentHTML('beforeend',`<div class="foot"><span>Les désignations et les limites administratives utilisées n'impliquent pas une reconnaissance officielle par l'Organisation des Nations Unies.</span><span><b>Date de création :</b> ${new Date().toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})} &nbsp; <b>Sources :</b> Clusters, FTS, HPC 2026 &nbsp; <b>Feedback :</b> ocha-burkinafaso@un.org</span></div>`);
});
document.querySelectorAll('.lens button').forEach(b=>b.addEventListener('click',()=>setLens(b.dataset.lens)));
document.getElementById('sel-cluster').innerHTML=CL.map(c=>`<option value="${c.k}">${c.n}</option>`).join('');
document.getElementById('sel-cluster').addEventListener('change',e=>{cluster=e.target.value;render()});
document.getElementById('sel-region').addEventListener('change',e=>{region=e.target.value;render()});
// impression : la dernière feuille visible ne force pas de saut de page (sinon page blanche en fin de document)
window.addEventListener('beforeprint',()=>{const ps=[...document.querySelectorAll('.paper')];ps.forEach(p=>p.classList.remove('last'));
  const vis=ps.filter(p=>getComputedStyle(p).display!=='none');if(vis.length)vis[vis.length-1].classList.add('last')});
document.getElementById('btn-print').addEventListener('click',()=>window.print());
// « Tout imprimer » : Global (2) + Financement (1) + une feuille par cluster + deux feuilles par région.
// Chaque feuille est rendue avec son cluster / sa région puis copiée (.pa) ; les feuilles d'origine sont masquées pendant l'impression.
const nbPagesAll=()=>3+CL.length+2*RG.length;
function printAll(){
  const saved={lens,cluster,region};
  const orig=[...document.querySelectorAll('.paper:not(.pa)')], sheets=document.getElementById('sheets');
  const of=l=>orig.filter(p=>p.dataset.lens===l);
  const snap=(p,sub)=>{const c=p.cloneNode(true);c.classList.remove('on','last');c.classList.add('pa');
    c.querySelector('.lensname').textContent=p.dataset.title+(sub?' — '+sub:'');sheets.appendChild(c)};
  document.querySelectorAll('.paper.pa').forEach(p=>p.remove());
  orig.forEach(p=>p.classList.add('on')); // feuilles affichées pendant le rendu : les cartes mesurent leur vraie largeur
  renderGlobal();renderFin();of('global').forEach(p=>snap(p));of('fin').forEach(p=>snap(p));
  for(const c of CL){cluster=c.k;renderCluster();of('cluster').forEach(p=>snap(p,c.n))}
  for(const r of RG){region=r.n;renderRegion();of('region').forEach(p=>snap(p,r.n))}
  lens=saved.lens;cluster=saved.cluster;region=saved.region;
  render(); // rétablit la vue à l'écran (classes .on, sélections)
  document.body.classList.add('all');
  setTimeout(()=>window.print(),50);
}
window.addEventListener('afterprint',()=>{if(!document.body.classList.contains('all'))return;
  document.body.classList.remove('all');document.querySelectorAll('.paper.pa').forEach(p=>p.remove());fit()});
document.getElementById('btn-print-all').addEventListener('click',printAll);

function fit(){const st=document.getElementById('stage'),sh=document.getElementById('sheets');const w=st.clientWidth-32;const s=Math.min(1,w/1123);sh.style.transform=`scale(${s})`;const n=document.querySelectorAll('.paper.on').length;st.style.height=((794*n+18*(n-1))*s+44)+'px'}
addEventListener('resize',fit);
boot();
