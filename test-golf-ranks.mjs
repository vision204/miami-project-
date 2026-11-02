// 2026-11-02 Opus · golf-ranks.js 검사 (메모리 가짜 Firestore). node server/test-golf-ranks.mjs
import assert from 'node:assert/strict';
import {GolfRanks,golfScore,GOLF_PARS} from './golf-ranks.js';
const store=new Map();
const snap=(id,v)=>({id,exists:v!==undefined,data:()=>v&&structuredClone(v)});
const db={doc:p=>({id:p.split('/')[1],path:p,get:async()=>snap(p.split('/')[1],store.get(p))}),
 runTransaction:async fn=>fn({get:async r=>r.get(),set:(r,v)=>store.set(r.path,structuredClone(v))}),
 collection:c=>{const all=()=>[...store].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.split('/')[1],v}));
  return {orderBy:(f,dir)=>({limit:n=>({get:async()=>({docs:all().sort((a,b)=>b.v[f]-a.v[f]).slice(0,n).map(d=>snap(d.id,d.v))})})}),
   where:(f,op,x)=>({count:()=>({get:async()=>({data:()=>({count:all().filter(d=>d.v[f]>x).length})})})})};}};
let clock=1e12;const sent=[];const R=new GolfRanks(()=>({db}),{send:(ws,m)=>sent.push([ws,m]),now:()=>clock});
const peer=(uid,name)=>({uid,name,ws:uid,ready:true,stateAt:clock,s:[-1280,2,2995]});
const last=uid=>sent.filter(([w])=>w===uid).at(-1)?.[1];
const wait=()=>new Promise(r=>setTimeout(r,5));
async function play(p,card,ms){p.stateAt=clock;R.receive(p,{k:'begin',holes:card.length,from:0});clock+=ms;p.stateAt=clock;R.receive(p,{k:'submit',holes:card.length,card});await wait();return last(p.ws);}
// 점수식
assert.equal(golfScore({holes:3,over:0}),310);            // 1판 · 이븐파
assert.equal(golfScore({holes:30,over:30}),300);          // 10판 · 홀당 +1
assert.equal(golfScore({holes:600,over:0}),800);          // 판수 점수는 50판까지만
// 너무 빨리 끝낸 라운드 · 코스 밖 · 이상한 타수 · 비로그인
const a=peer('ua','에이스'),b=peer('ub','버디'),c=peer('uc','캐디'),g={...peer(null,'손님'),ws:'g'};
assert.equal((await play(a,[4,4,3],10000)).why,'round');
const far={...peer('uf','멀리'),s:[0,0,0]};assert.equal((await play(far,[4,4,3],60000)).why,'round');
assert.equal((await play(a,[4,4,9],60000)).why,'card');
assert.equal((await play(a,[0,4,3],60000)).why,'card');
assert.equal((await play(g,[4,4,3],60000)).why,'login');
R.receive(a,{k:'submit',holes:3,card:[4,4,3]});await wait();assert.equal(last('ua').why,'round');   // begin 없이 제출
// 정상 기록
let r=await play(a,[3,4,3],60000);assert.ok(r.ok);assert.deepEqual(r.round,{holes:3,strokes:10,over:-1});
r=await play(b,[5,5,4,4,4,5],120000);assert.ok(r.ok);assert.equal(r.row.h,6);
for(let i=0;i<6;i++)await play(c,[5,5,4],60000);
assert.equal(store.get('golfRanks/uc').rounds,6);
// 보드 : 상위 + 내 순위
clock+=30000;R.receive(a,{k:'board'});await wait();let bd=last('ua');
assert.equal(bd.k,'board');assert.deepEqual(bd.top.map(x=>x.n),['에이스','캐디','버디']);assert.equal(bd.me.rank,1);
// a: 1판 −1 → 10+(3+1/3)*100 = 343.3 / c: 6판 홀당+1 → 60+200 = 260 / b: 2판 홀당+1 → 20+200 = 220
assert.equal(bd.top[0].score,343.3);assert.equal(bd.top[1].score,260);assert.equal(bd.top[2].score,220);
R.receive(a,{k:'board'});await wait();assert.equal(sent.filter(([w,m])=>w==='ua'&&m.k==='board').length,1);  // 2.5초 안 재요청 무시
// 50명 넘으면 50명까지, 51위 밖의 나는 따로 순위
for(let i=0;i<60;i++)store.set('golfRanks/z'+i,{name:'z'+i,holes:30,strokes:120,over:-10+i,rounds:10,at:i,score:golfScore({holes:30,over:-10+i})});
clock+=30000;R.top=null;const late=peer('uc','캐디');R.receive(late,{k:'board'});await wait();bd=last('uc');
assert.equal(bd.top.length,50);assert.ok(bd.me.rank>50);assert.equal(bd.me.n,'캐디');
g.golfBoardAt=0;R.receive(g,{k:'board'});await wait();assert.equal(last('g').me,null);assert.equal(last('g').login,false);
// 서버 저장소가 없을 때
const off=new GolfRanks(()=>null,{send:(ws,m)=>sent.push([ws,m]),now:()=>clock});off.receive({...peer('uo','오프'),ws:'uo'},{k:'board'});await wait();assert.equal(last('uo').off,true);
console.log('golf-ranks ok',{pars:GOLF_PARS,top3:bd.top.slice(0,3).map(x=>x.n+':'+x.score),me:bd.me});
