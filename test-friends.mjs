import { spawn } from 'node:child_process';import WebSocket from 'ws';import assert from 'node:assert/strict';
const srv=spawn('node',['server.js'],{env:{...process.env,PORT:'8798',MIAMI_TEST_AUTH:'1'},stdio:'inherit'});
await new Promise(r=>setTimeout(r,800));
const mk=(name,uid,pos)=>new Promise(res=>{const ws=new WebSocket(`ws://localhost:8798/?room=lobby&name=${name}`);const c={ws,name,got:[],snaps:[],fr:[]};
 ws.on('message',d=>{const m=JSON.parse(d);c.got.push(m);if(m.t==='snap')c.snaps.push(m.a.map(x=>x[0]));if(m.t==='fr')c.fr.push(m.a);if(m.t==='welcome')c.id=m.id;if(m.t==='authok')c.code=m.code;});
 ws.on('open',()=>{c.pos=pos;c.send=o=>ws.send(JSON.stringify(o));c.tick=setInterval(()=>c.send({t:'s',s:[c.pos[0],10,c.pos[1],0,0,0,0,0,0,100]}),60);c.send({t:'auth',token:'test:'+uid,friends:[]});res(c);});});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const A=await mk('A','uidAAAAAA',[0,0]),B=await mk('B','uidBBBBBB',[300,0]),C=await mk('C','uidCCCCCC',[5000,0]);
await wait(1500);
const last=c=>c.snaps.at(-1)||[];
console.log('A sees',last(A),'C sees',last(C),'codes',A.code,C.code);
assert.ok(last(A).includes(B.id)&&!last(A).includes(C.id),'A sees only near B');assert.equal(C.snaps.length,0,'C alone far: no snaps');
// C requests A by code
C.send({t:'freq',code:A.code});await wait(300);
const inA=A.got.find(m=>m.t==='freq_in');assert.ok(inA&&inA.name==='C','A got request');
A.send({t:'fresp',uid:inA.uid,ok:true});await wait(1600);
assert.ok(A.got.some(m=>m.t==='fadd'&&m.name==='C')&&C.got.some(m=>m.t==='fadd'&&m.name==='A'),'both fadd');
const frC=C.fr.at(-1);console.log('C friends',JSON.stringify(frC),'B fr',JSON.stringify(B.fr.at(-1)||null));
assert.ok(frC&&frC[0][0]==='uidAAAAAA'&&frC[0][2]===0,'C sees far friend A');
assert.ok(!B.fr.length||!B.fr.at(-1).length,'B not friend');
// B near request by id to A, A declines
B.send({t:'freq',id:A.id});await wait(300);const inB=A.got.filter(m=>m.t==='freq_in').at(-1);assert.equal(inB.name,'B');A.send({t:'fresp',uid:inB.uid,ok:false});await wait(1200);
assert.ok(!B.got.some(m=>m.t==='fadd'),'declined');
// C cannot request B by id (too far)
C.send({t:'freq',id:B.id});await wait(300);assert.ok(C.got.filter(m=>m.t==='freq_res').at(-1).ok===false,'far id refused');
// remove
A.send({t:'fdel',uid:'uidCCCCCC'});await wait(1300);assert.ok(C.got.some(m=>m.t==='fdel'));assert.equal((C.fr.at(-1)||[]).length,0,'C no longer sees A');
// spoof: D claims A as friend without consent
const D=await mk('D','uidDDDDDD',[9000,0]);D.ws.send(JSON.stringify({t:'auth',token:'test:uidDDDDDD',friends:['uidAAAAAA']}));await wait(1300);assert.equal((D.fr.at(-1)||[]).length,0,'no one-sided tracking');
// bad token
const E=await new Promise(res=>{const ws=new WebSocket('ws://localhost:8798/?room=lobby&name=E');const got=[];ws.on('message',d=>got.push(JSON.parse(d)));ws.on('open',()=>{ws.send(JSON.stringify({t:'auth',token:'garbage'}));setTimeout(()=>res(got),1500);});});
assert.ok(E.some(m=>m.t==='authfail'),'bad token refused');
const st=await (await fetch('http://localhost:8798/stats')).json();console.log(JSON.stringify(st));
console.log('PASS relay: near-only snapshots, friend code request/accept/decline/remove, far friend 1Hz, one-sided list ignored, bad token refused');
for(const c of [A,B,C,D]){clearInterval(c.tick);c.ws.close();}srv.kill();process.exit(0);
