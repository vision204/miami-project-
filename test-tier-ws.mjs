// node test-tier-ws.mjs — 'tier' 메시지 길 확인 (2026-10-22). 서버 경제가 꺼진 로컬에서 : 비로그인 → login, 로그인 → unavailable, 2초 안 재요청 → busy, rank 줄에 tier 칸
import { spawn } from 'child_process';import {fileURLToPath} from 'node:url';import assert from 'assert';import { WebSocket } from 'ws';
const PORT=18000+Math.floor(Math.random()*900),srv=spawn(process.execPath,['server.js'],{cwd:fileURLToPath(new URL('.',import.meta.url)),env:{...process.env,PORT,ALLOWED_ORIGINS:'',MIAMI_TEST_AUTH:'1'},stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:'+PORT+'/healthz')).ok)break;}catch{}if(n===99)throw Error('no server');await wait(100);}
const open=name=>new Promise(res=>{const ws=new WebSocket(`ws://localhost:${PORT}/?room=t&name=${name}`);const c={ws,q:[]};ws.on('message',d=>{try{c.q.push(JSON.parse(d.toString()));}catch{}});ws.on('open',()=>res(c));});
const next=async(c,t,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){const i=c.q.findIndex(m=>m.t===t);if(i>=0)return c.q.splice(i,1)[0];await wait(20);}return null;};
const a=await open('guest'),b=await open('user');await wait(200);
a.ws.send(JSON.stringify({t:'tier'}));const r1=await next(a,'tier');assert.equal(r1?.error,'login');console.log('OK   로그인 안 한 연결 → login');
b.ws.send(JSON.stringify({t:'auth',token:'test:tieruser01'}));await wait(400);
b.ws.send(JSON.stringify({t:'tier'}));const r2=await next(b,'tier');assert.equal(r2?.error,'unavailable');console.log('OK   로그인 · 경제 꺼짐 → unavailable');
b.ws.send(JSON.stringify({t:'tier'}));const r3=await next(b,'tier');assert.equal(r3?.error,'busy');console.log('OK   2초 안 재요청 → busy');
b.ws.send(JSON.stringify({t:'cash',v:1234}));b.ws.send(JSON.stringify({t:'rank'}));const r4=await next(b,'rank');assert.ok(r4&&r4.rows.every(r=>'tier' in r));console.log('OK   rank 줄에 tier 칸',JSON.stringify(r4.rows));
a.ws.close();b.ws.close();console.log('\n모두 통과');
}finally{srv.kill();}
