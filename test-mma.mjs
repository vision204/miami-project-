import assert from 'node:assert/strict';import {Sports}from'./sports.js';import{ARENAS,CAGES,RINGS,ringGate,newBout,punch,tickBout}from'./sports-shared/boxing-rules.js';
const rooms=new Map([['qa',new Map()]]),sent=[],sp=new Sports(rooms,(ws,m)=>sent.push(m),()=>{}),box=sp.boxing,cage=CAGES[0];
const p=(id,gate=ringGate(cage))=>{const pl={id,uid:'qa'+id,ready:true,roomId:'qa',s:[gate[0],gate[1],gate[2],0,0,0,0,0,0,100],stateAt:Date.now(),ws:{}};rooms.get('qa').set(id,pl);return pl;};
assert.equal(box.state('qa').length,5);assert.equal(box.state('qa')[4].mma,true);
const a=p(1),b=p(2);box.receive(a,{k:'join',ring:4,mode:'pvp'});box.receive(b,{k:'join',ring:4,mode:'pvp'});const r=box.mine(a);assert(r.bout?.mma);
let now=Date.now();tickBout(r.bout,now+3100);const B=r.bout,[P0,P1]=B.players;P0.p=[-.5,0];P1.p=[.5,0];
// 킥
assert(punch(B,0,2,1,now+3200));assert.equal(P1.hp,85);assert.equal(B.last.kind,'hit');assert.equal(B.last.style,'kick');
// 복싱 링에서는 킥 · 테이크다운 거부
const q=newBout([7,8],0);tickBout(q,3001);q.players[0].p=[-.5,0];q.players[1].p=[.5,0];assert(!punch(q,0,2,1,4000));assert(!punch(q,0,3,1,4000));
// 테이크다운 : 상대가 가드를 올리고 있으면 성공
P1.guard=true;P1.punch=0;assert(punch(B,0,3,2,now+4000));assert.equal(B.last.kind,'td');assert(P0.top&&P0.ground&&P1.ground&&!P1.top);
// 아래에서는 탈출, 위에서는 파운딩
const hp=P1.hp;assert(punch(B,0,0,3,now+4950));assert.equal(P1.hp,hp-7);assert.equal(B.last.kind,'gnp');
assert(punch(B,1,0,1,now+5000));assert.equal(B.last.kind,'esc');
// 서브미션 : 체력 38 이하
P1.hp=30;P0.stamina=100;assert(punch(B,0,3,4,now+5500));assert.equal(B.phase,'over');assert.equal(B.winner,0);assert.equal(B.reason,'서브미션 승');
// 테이크다운 실패 : 상대가 방금 펀치를 날렸으면 막힘
const m=newBout([1,2],0,true);tickBout(m,3001);m.players[0].p=[-.5,0];m.players[1].p=[.5,0];m.players[1].punch=3900;m.players[1].guard=true;assert(punch(m,0,3,1,4000));assert.equal(m.last.kind,'stuff');assert(!m.players[0].ground);
// 바닥 시간이 지나면 일어선다
const g=newBout([1,2],0,true);tickBout(g,3001);g.players[0].p=[-.5,0];g.players[1].p=[.5,0];g.players[1].stamina=20;assert(punch(g,0,3,1,4000));assert(g.players[0].ground);tickBout(g,9100);assert(!g.players[0].ground&&!g.players[1].ground);
box.drop(a);box.drop(b);
// NPC 와 한 판 끝까지 (사람은 가끔 잽 · 킥 · 가드)
const c=p(3);box.receive(c,{k:'join',ring:4,mode:'npc'});const rc=box.mine(c);assert.equal(rc.seats[1],'npc');let t=Date.now(),seq=0,kinds=new Set();
const realNow=Date.now;for(let k=0;k<4000&&rc.bout&&rc.bout.phase!=='over';k++){t+=100;Date.now=()=>t;try{box.receive(c,{k:'input',ring:4,dir:[.5,0],guard:k%9===0});c.stateAt=t;if(k%6===0)box.receive(c,{k:'punch',ring:4,hand:k%24===0?2:k%2,seq:++seq});
 box.tick(t);}finally{Date.now=realNow;}if(rc.bout?.last)kinds.add(rc.bout.last.kind+':'+rc.bout.last.by);}
console.log('NPC 한 판 :',rc.bout?.phase,rc.bout?.reason,'승자',rc.bout?.winner,'· 나온 동작',[...kinds].sort().join(' '));assert.equal(rc.bout.phase,'over');
console.log('PASS mma cage/kick/no-kick-in-boxing/takedown/ground-and-pound/escape/submission/stuff/stand-up/NPC bout');
