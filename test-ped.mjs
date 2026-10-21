// node test-ped.mjs — NPC 사망 공유 'ped' 중계 검사 (가까운 사람만 · 잘못된 값 거름 · 속도 제한 · 보낸 사람 제외)
import { spawn } from 'child_process';import {fileURLToPath} from 'node:url';import assert from 'assert';import { WebSocket } from 'ws';
const PORT = 18000 + Math.floor(Math.random() * 900), srv = spawn(process.execPath, ['server.js'], { cwd: fileURLToPath(new URL('.', import.meta.url)), env: { ...process.env, PORT, ALLOWED_ORIGINS: '' }, stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:'+PORT+'/healthz')).ok)break;}catch{}if(n===99)throw Error('server did not start');await wait(100);}
const open = name => new Promise(res => { const ws = new WebSocket(`ws://localhost:${PORT}/?room=pt&name=${name}`); const c={ws,id:0,ped:[]};
  ws.on('message',(d,bin)=>{if(bin)return;const m=JSON.parse(d.toString());if(m.t==='welcome')c.id=m.id;if(m.t==='ped')c.ped.push(m);}); ws.on('open',()=>res(c)); });
const st = (c,x,z,f=0) => c.ws.send(JSON.stringify({t:'s',s:[x,1,z,0,0,0,0,f,0,100]}));
try{
  const A=await open('a'),B=await open('b'),Far=await open('far');await wait(150);
  for(let i=0;i<5;i++){st(A,0,0);st(B,30,10);st(Far,5000,5000);await wait(60);}
  A.ws.send(JSON.stringify({t:'ped',k:[[123456789,12.5,0.4,-3.25,1.2,-0.4],[-5,0,0,0],[1.5,0,0,0],[99,900,0,900],['x',1,1,1],[4294967295,1,2,3,99,-99]]}));
  await wait(300);
  assert.equal(B.ped.length,1,'B gets one message');const k=B.ped[0].k;
  assert.deepEqual(k.map(a=>a[0]),[123456789,4294967295],'only valid ids near the killer');
  assert.deepEqual(k[0],[123456789,12.5,0.4,-3.25,1.2,-0.4],'values kept');assert.deepEqual(k[1].slice(4),[5,-5],'push clamped');
  assert.equal(B.ped[0].from,A.id,'from killer');assert.equal(A.ped.length,0,'killer does not get echo');assert.equal(Far.ped.length,0,'far player not told');
  // 속도 제한 : 1초에 24명
  B.ped.length=0;await wait(1100);for(let i=0;i<3;i++)A.ws.send(JSON.stringify({t:'ped',k:Array.from({length:16},(_,j)=>[1000+i*16+j,1,0,1,0,0])}));await wait(300);
  assert.equal(B.ped.reduce((n,m)=>n+m.k.length,0),24,'rate limited to 24/s');
  // 집 안(비공개 128) 이면 무시
  B.ped.length=0;await wait(1100);st(A,0,0,128);await wait(100);A.ws.send(JSON.stringify({t:'ped',k:[[7,1,0,1,0,0]]}));await wait(300);assert.equal(B.ped.length,0,'private flag ignored');
  const stats=await (await fetch('http://127.0.0.1:'+PORT+'/stats')).json();assert.equal(stats.build,'atelier-20261022-1','build tag');
  console.log('PED relay test passed');for(const c of [A,B,Far])c.ws.close();
}finally{srv.kill();}
