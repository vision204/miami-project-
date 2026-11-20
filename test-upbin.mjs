// 2026-11-19 : 위치 올려 보내기 32바이트 묶음(upBin) — 새 묶음과 예전 JSON 이 같이 동작하는지
import { spawn } from 'node:child_process';import {once} from 'node:events';import {fileURLToPath} from 'node:url';import WebSocket from 'ws';import assert from 'node:assert/strict';
const srv=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('.',import.meta.url)),env:{...process.env,PORT:'8796',MIAMI_TEST_AUTH:'1'},stdio:'ignore'});srv.on('exit',c=>{if(c)console.log('server exited',c);});
for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:8796/healthz')).ok)break;}catch{}if(n===99)throw Error('Test server failed to start');await new Promise(r=>setTimeout(r,100));}
const pack=s=>{const v=new DataView(new ArrayBuffer(32)),i=x=>Math.max(-32767,Math.min(32767,Math.round(x||0)));v.setUint8(0,0x53);v.setUint8(1,1);v.setFloat32(2,s[0],true);v.setFloat32(6,s[1],true);v.setFloat32(10,s[2],true);
 v.setInt16(14,i(s[3]*1000),true);v.setUint8(16,s[4]?1:0);v.setUint16(17,s[5]&0xffff,true);v.setUint16(19,Math.round(s[6]*10),true);v.setUint8(21,s[7]&255);v.setUint8(22,s[8]&255);v.setUint8(23,s[9]);
 v.setInt16(24,i(s[10]*1000),true);v.setInt16(26,i(s[11]*1000),true);v.setInt16(28,i(s[12]*10000),true);v.setInt16(30,i(s[13]*10),true);return Buffer.from(v.buffer);};
const mk=name=>new Promise(res=>{const ws=new WebSocket(`ws://localhost:8796/?room=lobby&name=${name}`);const c={ws,snaps:[],welcome:null,pong:null};
 ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='welcome')c.welcome=m;if(m.t==='snap')c.snaps.push(m.a);if(m.t==='pong')c.pong=m;});ws.on('open',()=>res(c));});
const A=await mk('A'),B=await mk('B');
const sB=[-36123.45,57.25,-2101.5,1.234,1,321,55.5,4,7,88,.125,-.5,.0312,-54.3];
const tA=setInterval(()=>A.ws.send(JSON.stringify({t:'s',s:[-36100,57,-2100,0,0,0,0,0,0,100]})),60),tB=setInterval(()=>B.ws.send(pack(sB)),60);
B.ws.send(JSON.stringify({t:'ping',c:123.4}));
await new Promise(r=>setTimeout(r,1500));
assert.equal(A.welcome?.upBin,1,'server announces upBin');
const row=A.snaps.flat().filter(r=>r[0]===B.welcome.id).at(-1);assert.ok(row,'A sees B (binary sender)');
const got=row.slice(1);const want=[-36123.45,57.25,-2101.5,1.234,1,321,55.5,4,7,88,.125,-.5,.03,-54.3];
for(const [i,w] of want.entries())if(i===7)assert.ok((got[7]&4)===4,"flags keep my bit");else assert.ok(Math.abs(got[i]-w)<=.011,`field ${i}: ${got[i]} vs ${w}`);   // 상태 플래그는 서버가 보호막 비트를 더할 수 있다
assert.ok(B.snaps.flat().some(r=>r[0]===A.welcome.id),'B sees A (JSON sender)');
assert.equal(B.pong?.c,123.4,'pong echoes the ping time');
const bad=Buffer.alloc(32);bad[0]=0x53;bad[1]=9;B.ws.send(bad);B.ws.send(Buffer.alloc(31));const nan=pack(sB);nan.writeFloatLE(NaN,2);B.ws.send(nan);
await new Promise(r=>setTimeout(r,300));
const st=await (await fetch('http://localhost:8796/stats')).json();assert.equal(st.build,'mp-upbin-20261119-1');
console.log('PASS upBin: 32-byte position packets decoded (≤0.01 error), JSON clients still work, ping/pong, bad packets ignored');
clearInterval(tA);clearInterval(tB);A.ws.close();B.ws.close();if(srv.exitCode===null&&!srv.killed){const closed=once(srv,'exit');srv.kill();await closed;}else srv.kill();
