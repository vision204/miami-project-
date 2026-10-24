/* =====================================================================
   플레이어 티어 (2026-10-22 · Opus)
   ---------------------------------------------------------------------
   점수 = 전 재산 60% + (킬 · 이동 거리 · 미션 성공) 평균 40%
   · 네 값은 단위가 너무 달라서(돈은 억 단위, 킬은 수십) 그대로 더하지 않고, 전체 플레이어 중 '몇 % 위치인지'(0~1)로 바꿔서 더한다.
     0 인 값(아직 한 번도 안 한 것)은 0 으로 친다.
   · 전 재산 = 현금 + 집 · 격납고 · 타워 펜트하우스 + 차 · 배 · 비행기 · 헬기(카탈로그 정가) + 명품 옷 · 시계 + 옷 + 총 + 방탄복.
     값은 서버 원장(economyAccounts)만 쓴다 — 브라우저가 보낸 값은 안 믿는다.
   · 킬 · 이동 거리는 players/{uid}.stats (게임이 저장하는 기록). 미션 성공은 서버 원장 account.stats.missions
     (일거리 완료 · 블랙 타이드 습격 성공 때 서버가 1씩 올린다. 2026-10-22 부터 센다).
   · 티어는 점수 순위의 위치로 정한다 (위에서부터) : 챌린저 0.1% · 그랜드마스터 0.4% · 마스터 2.5% · 다이아 7% ·
     플래티넘 13% · 골드 22% · 실버 30% · 브론즈 25%.
   · 전체 목록은 누가 Tab 을 눌렀을 때만, 최대 1시간에 한 번 다시 읽는다 (Firestore 읽기 = 계정 수 x 2).
     내 점수는 요청할 때 내 문서 2개만 새로 읽어서(30초 캐시) 그 분포에 끼워 넣는다.
   ===================================================================== */
export const TIERS=[
 {id:'challenger',ko:'챌린저',top:.001},{id:'grandmaster',ko:'그랜드마스터',top:.005},{id:'master',ko:'마스터',top:.03},
 {id:'diamond',ko:'다이아',top:.10},{id:'platinum',ko:'플래티넘',top:.23},{id:'gold',ko:'골드',top:.45},
 {id:'silver',ko:'실버',top:.75},{id:'bronze',ko:'브론즈',top:1}];
export const WEIGHTS={asset:.6,kills:.4/3,distance:.4/3,missions:.4/3};
const list=v=>Array.isArray(v)?v:[];
const num=(v,max)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;

/* 서버 원장 property → 전 재산 (카탈로그 정가 기준) */
export function assetValue(p,c){
 if(!p||typeof p!=='object')return 0;
 const price=new Map(list(c?.vehicles).map(v=>[v.id,v.price||0])),home=new Map(list(c?.homes).map(h=>[h.id,h.price||0]));
 let v=num(p.cash,1e13);
 for(const id of list(p.homes))v+=home.get(id)||0;
 for(const id of list(p.hangars?.owned))v+=list(c?.hangars).find(h=>h.id===id)?.price||0;
 for(const f of list(p.pent?.owned))v+=list(c?.penthouses).find(h=>h.floor===f)?.price||0;
 const car=r=>{if(r&&typeof r==='object')v+=price.get(r.k)||0;};
 for(const a of Object.values(p.cars||{}))list(a).forEach(car);
 for(const a of Object.values(p.pent?.cars||{}))list(a).forEach(car);
 for(const a of Object.values(p.hangars?.planes||{}))list(a).forEach(car);
 for(const r of Object.values(p.helis||{}))car(r);
 list(p.boats?.boats).forEach(car);list(p.over).forEach(car);
 const lux=new Map(list(c?.lux).map(q=>[q.k+':'+q.id,q.p||0]));
 for(const [k,key] of [['t','tops'],['b','bottoms'],['w','watches']])for(const id of list(p.lux?.[key]))v+=lux.get(k+':'+id)||0;
 const cloth=new Map(list(c?.clothes).map(q=>[q.id,q.p||0]));for(const id of list(p.clothes?.owned))v+=cloth.get(id)||0;
 const gun=new Map(list(c?.guns).map(g=>[g.id,g.price||0]));for(const id of list(p.guns))v+=gun.get(id)||0;
 const armor=list(c?.armor).find(a=>a.v===p.armor);if(armor)v+=armor.p||0;
 return Math.round(v);
}
export function rawOf(account,player,catalog){
 const st=player?.stats||{};
 return {asset:assetValue(account?.property,catalog),kills:Math.floor(num(st.kills,1e7)),distance:Math.round(num(st.distanceM,1e9)),missions:Math.floor(num(account?.stats?.missions,1e6))};
}
/* 정렬된 배열에서 v 보다 작은 개수 + 같은 것의 절반 → 0~1. 0 은 0 */
function pct(sorted,v){if(!(v>0)||!sorted.length)return 0;let lo=0,hi=sorted.length;while(lo<hi){const m=lo+hi>>1;if(sorted[m]<v)lo=m+1;else hi=m;}const less=lo;let hi2=lo;while(hi2<sorted.length&&sorted[hi2]===v)hi2++;return (less+(hi2-less)/2)/sorted.length;}
export function tierAt(position){for(const t of TIERS)if(position<t.top)return t;return TIERS[TIERS.length-1];}
export function buildBoard(rows){
 const keys=['asset','kills','distance','missions'],sorted={};for(const k of keys)sorted[k]=rows.map(r=>r.raw[k]).sort((a,b)=>a-b);
 const scored=rows.map(r=>{const parts={};let s=0;for(const k of keys){parts[k]=pct(sorted[k],r.raw[k]);s+=parts[k]*WEIGHTS[k];}return {...r,parts,score:s};});
 scored.sort((a,b)=>b.score-a.score||(a.uid<b.uid?-1:1));
 const N=scored.length,map=new Map();scored.forEach((r,i)=>{const t=tierAt(i/N);map.set(r.uid,{...r,rank:i+1,tier:t.id});});
 return {N,sorted,scores:scored.map(r=>r.score),map};
}
export function placeInBoard(board,uid,raw){
 const keys=['asset','kills','distance','missions'],parts={};let score=0;
 for(const k of keys){parts[k]=pct(board.sorted[k],raw[k]);score+=parts[k]*WEIGHTS[k];}
 const old=board.map.get(uid);let above=0;for(const s of board.scores)if(s>score)above++;if(old&&old.score>score)above--;
 const N=Math.max(1,board.N+(old?0:1)),position=above/N,t=tierAt(position),i=TIERS.indexOf(t),next=i>0?TIERS[i-1]:null;
 return {tier:t.id,ko:t.ko,rank:above+1,total:N,top:Math.min(100,+(Math.max(position,1/N)*100).toFixed(2)),score:+score.toFixed(4),parts,raw,
  next:next?{tier:next.id,ko:next.ko,top:+(next.top*100).toFixed(2),rankNeeded:Math.max(1,Math.ceil(next.top*N-1e-9))}:null};
}
export class TierBoard{
 constructor(db,catalog,{ttlMs=Number(process.env.TIER_REFRESH_MIN||60)*60000,now=()=>Date.now()}={}){Object.assign(this,{db,catalog,ttlMs,now,board:null,at:0,loading:null,mine:new Map()});}
 async refresh(){
  const [acc,pl]=await Promise.all([this.db.collection('economyAccounts').select('property','stats').get(),this.db.collection('players').select('stats').get()]);
  const stats=new Map();for(const d of pl.docs)stats.set(d.id,d.data());
  // Disposable QA identities never participate in the public ranking population.
  const rows=acc.docs.filter(d=>!d.id.startsWith('qa-bomb-')).map(d=>({uid:d.id,raw:rawOf(d.data(),stats.get(d.id),this.catalog)}));
  this.board=buildBoard(rows);this.at=this.now();return this.board;
 }
 async ensure(){if(this.board&&this.now()-this.at<this.ttlMs)return this.board;if(!this.loading)this.loading=this.refresh().finally(()=>{this.loading=null;});return this.loading;}
 cached(uid){return this.board?.map.get(uid)?.tier||null;}
 async me(uid){
  const board=await this.ensure();const hit=this.mine.get(uid);
  if(hit&&this.now()-hit.at<30000)return hit.value;
  const [a,p]=await Promise.all([this.db.doc('economyAccounts/'+uid).get(),this.db.doc('players/'+uid).get()]);
  const value={...placeInBoard(board,uid,rawOf(a.exists?a.data():null,p.exists?p.data():null,this.catalog)),updatedAt:this.at};
  this.mine.set(uid,{at:this.now(),value});if(this.mine.size>5000)for(const [k,v] of this.mine)if(this.now()-v.at>30000)this.mine.delete(k);
  return value;
 }
}
