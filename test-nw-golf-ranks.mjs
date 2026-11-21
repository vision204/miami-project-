// 2026-11-20 (Claude) 미국 대륙 골프장 3곳 통합 랭킹 검사 (메모리 가짜 Firestore). node server/test-nw-golf-ranks.mjs
import assert from 'node:assert/strict';
import {GolfRanks,NW_GOLF} from './golf-ranks.js';
const store=new Map();
const snap=(id,v)=>({id,exists:v!==undefined,data:()=>v&&structuredClone(v)});
const db={doc:p=>({id:p.split('/')[1],path:p,get:async()=>snap(p.split('/')[1],store.get(p))}),
 runTransaction:async fn=>fn({get:async r=>r.get(),set:(r,v)=>store.set(r.path,structuredClone(v))}),
 collection:c=>{const all=()=>[...store].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({id:k.split('/')[1],v}));
  return {orderBy:(f)=>({limit:n=>({get:async()=>({docs:all().sort((a,b)=>b.v[f]-a.v[f]).slice(0,n).map(d=>snap(d.id,d.v))})})}),
   where:(f,op,x)=>({count:()=>({get:async()=>({data:()=>({count:all().filter(d=>d.v[f]>x).length})})})})};}};
let clock=1e12;const sent=[];const R=new GolfRanks(()=>({db}),{send:(ws,m)=>sent.push([ws,m]),now:()=>clock});
const last=uid=>sent.filter(([w])=>w===uid).at(-1)?.[1];
const wait=()=>new Promise(r=>setTimeout(r,5));
const at=(uid,name,c)=>({uid,name,ws:uid,stateAt:clock,s:[c.x,0,c.z]});
async function play(p,card,ms){p.stateAt=clock;R.receive(p,{k:'begin',holes:card.length,from:0});clock+=ms;p.stateAt=clock;R.receive(p,{k:'submit',holes:card.length,card});await wait();return last(p.ws);}
const [links,redwood,dunes]=NW_GOLF;
// 세 코스 모두 같은 목록(nwGolfRanks)에 쌓인다 · 파는 코스마다
let r=await play(at('u1','링크스',links),[4,3,5],60000);assert.ok(r.ok);assert.equal(r.pool,'nw');assert.equal(r.round.over,0);
r=await play(at('u2','레드우드',redwood),[4,4,3,5,4,5],120000);assert.ok(r.ok);assert.equal(r.round.over,0);
r=await play(at('u3','듄스',dunes),[3,3,3],60000);assert.ok(r.ok);assert.equal(r.round.over,-2);
r=await play(at('u2','레드우드',redwood),[5,5,4],60000);assert.ok(r.ok);
assert.ok(store.has('nwGolfRanks/u1')&&store.has('nwGolfRanks/u2')&&store.has('nwGolfRanks/u3'));
assert.ok(![...store.keys()].some(k=>k.startsWith('golfRanks/')),'마이애미 목록과 섞이면 안 됨');
// 코스 파 + 5 넘는 타수 거절 (레드우드 3번 홀 파3 → 9타 안 됨)
assert.equal((await play(at('u4','x',redwood),[4,4,9],60000)).why,'card');
// 코스 밖에서 begin → 기록 안 됨
assert.equal((await play({uid:'u5',name:'y',ws:'u5',stateAt:clock,s:[0,0,0]},[4,4,3],60000)).why,'round');
// 보드 : course nw → 통합 목록, 표시 course:'nw'
clock+=30000;const p=at('u3','듄스',dunes);R.receive(p,{k:'board',course:'nw'});await wait();const b=last('u3');
assert.equal(b.k,'board');assert.equal(b.course,'nw');assert.deepEqual(b.top.map(x=>x.n),['듄스','링크스','레드우드']);assert.equal(b.me.rank,1);
// 마이애미 보드는 따로 (비어 있음) · 같은 사람이 바로 이어서 요청해도 각자 2.5초 제한
R.receive(p,{k:'board'});await wait();const m=last('u3');assert.equal(m.course,undefined);assert.equal(m.top.length,0);
console.log('nw golf ranks ok',b.top.map(x=>x.n+':'+x.score).join(' '));
