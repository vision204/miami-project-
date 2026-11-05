import assert from 'node:assert/strict';
import {Billiards} from './billiards.js';
import {applyCommand,migrateAccount} from './economy-engine.js';
import fs from 'node:fs';
import {CUE_TABLES,KINDS,newGame,preShot,strike,simulate,judge,cueOf,CUE_REWARD} from './sports-shared/billiards-rules.js';
/* 물리 · 규칙 */
{const g=newGame('pool'),pre=preShot(g);strike(g.balls[0],[1,0],8,[0,0],KINDS.pool);const r=simulate(g.balls,'pool');judge(g,r,pre);assert.equal(g.breakShot,false);assert.ok(r.steps>100);
 const a=newGame('carom'),b=newGame('carom');for(const x of [a,b]){strike(x.balls[0],[.6,.8],3.3,[.3,.4],KINDS.carom);simulate(x.balls,'carom');}assert.deepEqual(a.balls,b.balls,'같은 입력 = 같은 결과');}
/* 테이블 · 증빙 */
const sent=[],rooms=new Map(),room=new Map();rooms.set('r',room);const sports={rooms,send:(ws,m)=>sent.push([ws,m]),protected:()=>false};
const B=new Billiards(sports),T0=CUE_TABLES[3];
const peer=(id,uid,x=T0.x,z=T0.z+1.5)=>({id,uid,ready:true,roomId:'r',ws:id,stateAt:Date.now(),s:[x,T0.y,z,0]});
const a=peer(1,'ua'),b=peer(2,'ub');room.set(1,a);room.set(2,b);
B.receive(a,{t:'cue',k:'join',table:T0.id,mode:'pvp'});assert.equal(B.state('r')[T0.id].phase,'wait');
B.receive(b,{t:'cue',k:'join',table:T0.id,mode:'pvp'});const t=B.state('r')[T0.id];assert.equal(t.phase,'play');assert.deepEqual(t.seats,[1,2]);
const flat=bs=>bs.flatMap(x=>[x.n,x.x,x.z,x.on?1:0]),g=newGame('pool');const shot=(p,by,seq,after)=>B.receive(p,{k:'shot',table:T0.id,seq,by,pre:flat(g.balls),post:flat(g.balls),dir:[1,0],v:3,tip:[0,0],cue:null,after});
shot(b,1,1,{turn:1,score:[0,0],over:false,winner:-1});assert.equal(t.seq,0,'차례 아닌 사람 거절');
for(let k=1;k<=11;k++)shot(k%2?a:b,(k+1)%2,k,{turn:k%2?1:0,score:[0,0],over:false,winner:-1});assert.equal(t.seq,11);
t.startedAt-=70000;shot(b,1,12,{turn:1,score:[0,0],over:true,winner:1});assert.equal(t.phase,'over');const pr=B.proof('ub',t.game);assert.ok(pr&&pr.mode==='pvp');assert.equal(B.proof('ua',t.game),null);
/* 보상 */
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url))),acc=migrateAccount({save:{property:{cash:1000,homes:[],guns:['fists']}}},catalog);
const out=applyCommand(acc,{type:'cue.claim',game:t.game},catalog,{cueProof:pr});assert.equal(out.account.property.cash,1000+CUE_REWARD.pvp);
assert.throws(()=>applyCommand(out.account,{type:'cue.claim',game:t.game},catalog,{cueProof:pr}),/이미/);
assert.throws(()=>applyCommand(acc,{type:'cue.claim',game:t.game},catalog,{cueProof:null}),/확인/);
assert.throws(()=>applyCommand(acc,{type:'cue.claim',game:t.game},catalog,{cueProof:{...pr,startedAt:pr.endedAt-1000}}),/1분/);
/* NPC 모드 : NPC 가 이기면 증빙 없음 */
const T1=CUE_TABLES[4],c=peer(3,'uc',T1.x,T1.z+1.4);room.set(3,c);B.receive(c,{k:'join',table:T1.id,mode:'npc',diff:'hard'});const t1=B.state('r')[T1.id];assert.equal(t1.phase,'play');assert.deepEqual(t1.seats,[3,'npc']);
console.log('PASS billiards: deterministic physics, pvp seats/turns, proof only for winner, claim once / short game / unverified, npc seat');
