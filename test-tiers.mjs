/* node test-tiers.mjs — 티어 계산 시험 (2026-10-22). Firestore 없이 가짜 db 로 돈다. */
import fs from 'node:fs';
import {TIERS,assetValue,buildBoard,placeInBoard,TierBoard,rawOf} from './tiers.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url),'utf8'));
let bad=0;const ok=(c,m)=>{console.log((c?'OK  ':'FAIL')+' '+m);if(!c)bad++;};
// 1) 전 재산
const car=catalog.vehicles.find(v=>v.price>0),home=catalog.homes.find(h=>h.price>0);
const v=assetValue({cash:1000,homes:[home.id],cars:{[home.id]:[{a:0,k:car.id,c:0,p:0}]}},catalog);
ok(v===1000+home.price+car.price,`전 재산 = 현금 + 집 + 차 (${v})`);
ok(assetValue(null,catalog)===0&&assetValue({cash:-5},catalog)===0,'빈 계정 · 음수 현금은 0');
// 2) 1만 명 분포
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const rows=[];for(let i=0;i<10000;i++)rows.push({uid:'u'+i,raw:{asset:Math.floor(rnd()**3*1e9),kills:rnd()<.2?0:Math.floor(rnd()*500),distance:Math.floor(rnd()*1e6),missions:rnd()<.5?0:Math.floor(rnd()*80)}});
const B=buildBoard(rows),count={};for(const r of B.map.values())count[r.tier]=(count[r.tier]||0)+1;
const want={challenger:10,grandmaster:40,master:250,diamond:700,platinum:1300,gold:2200,silver:3000,bronze:2500};
for(const t of TIERS)ok(count[t.id]===want[t.id],`${t.ko} ${count[t.id]}명 (기대 ${want[t.id]})`);
const top=[...B.map.values()].find(r=>r.rank===1);ok(top.tier==='challenger','1위는 챌린저');
// 3) 내 자리 (판에 있는 사람 · 새 사람)
const me=placeInBoard(B,top.uid,top.raw);ok(me.rank===1&&me.tier==='challenger'&&me.next===null,'1위가 다시 물어도 1위 · 다음 티어 없음');
const mid=[...B.map.values()].find(r=>r.rank===5000),pm=placeInBoard(B,mid.uid,mid.raw);
ok(pm.rank===5000&&pm.tier===mid.tier,`5000위 그대로 (${pm.tier}, 상위 ${pm.top}%)`);
ok(pm.next&&pm.next.rankNeeded===Math.ceil(TIERS.find(t=>t.id===pm.next.tier).top*10000),'다음 티어까지 필요한 순위');
const zero=placeInBoard(B,'new',{asset:0,kills:0,distance:0,missions:0});ok(zero.tier==='bronze'&&zero.total===10001&&zero.score===0,'새 사람(전부 0)은 브론즈 · 전체 +1');
const rich=placeInBoard(B,'new2',{asset:2e9,kills:0,distance:0,missions:0});ok(rich.parts.asset===1&&Math.abs(rich.score-.6)<1e-9,'재산만 1등이면 점수 0.6');
// 4) 한 명뿐일 때
const one=buildBoard([{uid:'a',raw:{asset:1,kills:0,distance:0,missions:0}}]);ok(one.map.get('a').tier==='challenger','혼자면 챌린저');
// 5) TierBoard 가짜 db : 새로 읽기 횟수 · 캐시
let reads=0;const docs={economyAccounts:{a:{property:{cash:5e6},stats:{missions:3}},b:{property:{cash:10}}},players:{a:{stats:{kills:4,distanceM:900}},b:{stats:{kills:99}}}};
const snap=(id,d)=>({id,exists:!!d,data:()=>d});
const db={collection:n=>({select:()=>({get:async()=>{reads++;return {docs:Object.entries(docs[n]).map(([k,d])=>snap(k,d))};}})}),doc:p=>({get:async()=>{reads++;const [c,id]=p.split('/');return snap(id,docs[c][id]);}})};
let clock=0;const TB=new TierBoard(db,catalog,{ttlMs:3600e3,now:()=>clock});
const [x,y]=await Promise.all([TB.me('a'),TB.me('b')]);
ok(reads===2+4,`두 사람 동시에 : 전체 1번(2) + 각자 문서(4) = ${reads}`);
ok(x.raw.missions===3&&x.raw.kills===4&&x.raw.asset===5e6&&x.total===2,'내 값 (미션 3 · 킬 4 · 재산)');
await TB.me('a');ok(reads===6,'30초 안에는 다시 안 읽음');
clock+=31e3;await TB.me('a');ok(reads===8,'30초 뒤엔 내 문서만 다시');
clock+=3600e3;await TB.me('b');ok(reads===12,'1시간 뒤엔 전체 다시');
ok(TB.cached('a')&&TB.cached('zz')===null,'순위표용 cached');
ok(rawOf({property:{},stats:{missions:-4}},{stats:{kills:1e12,distanceM:NaN}},catalog).kills===1e7,'이상한 값은 잘라냄');
console.log(bad?`\n실패 ${bad}개`:'\n모두 통과');process.exit(bad?1:0);
