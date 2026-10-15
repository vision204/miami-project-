import {randomInt} from 'node:crypto';
import {TIDE,distance,visible,wallDistance,contractFloor} from './heist-layout.js';
// An isolated solo combat session; money is exclusively settled by EconomyStore.
export class Heists{
 constructor({clock=Date.now,capacity=24,fleet=[]}={}){this.clock=clock;this.capacity=capacity;this.fleet=fleet;this.runs=new Map();this.reservations=new Map();}
 reserve(uid){if(this.runs.has(uid))return;if(!this.reservations.has(uid)&&this.runs.size+this.reservations.size>=this.capacity)throw Error('습격 서버가 혼잡합니다. 잠시 후 다시 시도하세요.');this.reservations.set(uid,(this.reservations.get(uid)||0)+1);}
 release(uid){const n=this.reservations.get(uid)||0;if(n>1)this.reservations.set(uid,n-1);else this.reservations.delete(uid);}
 start(uid,a,position=null){if(this.runs.get(uid)?.id===a.id)return;const now=this.clock();for(const [k,r]of this.runs)if(now-r.at>1800000)this.runs.delete(k);if(this.runs.size>=this.capacity)throw Error('습격 서버가 혼잡합니다. 잠시 후 다시 시도하세요.');this.runs.set(uid,{id:a.id,at:now,began:now,phase:'infiltrate',hp:100,ammo:30,reloadAt:0,shotAt:0,alarm:false,invalid:false,bonus:false,seq:0,budget:3,p:{x:position?.x??TIDE.start[0],y:TIDE.y,z:position?.z??TIDE.start[1],car:false,at:now},guards:TIDE.guards.map(([x,z,yaw],i)=>({id:i,x,z,yaw,hp:100,homeX:x,homeZ:z,shotAt:0,seenAt:0})),code:[0,1,2].sort(()=>randomInt(3)-1)});}
 get(uid,id){const r=this.runs.get(uid);return r&&(!id||r.id===id)?r:null;}
 observe(uid,s){const r=this.get(uid);if(!r||['done','failed'].includes(r.phase))return;const now=this.clock(),p={x:s[0],y:s[1],z:s[2],car:!!s[4],yaw:s[3],at:now};if(![p.x,p.y,p.z].every(Number.isFinite))return;
  if(contractFloor(p.x,p.z,1)===null||p.y<TIDE.y-.6||p.y>TIDE.y+2.5||(p.car&&this.fleet.length&&this.fleet[s[5]]!=='sports')){r.invalid=true;r.phase='failed';r.reason='작전 부두와 지급 차량을 이용해 주세요.';return;}
  if(r.p){const dt=(now-r.p.at)/1000,len=Math.hypot(p.x-r.p.x,p.y-r.p.y,p.z-r.p.z),max=p.car?65:16;r.budget=Math.min(3,(r.budget??3)+max*Math.max(0,dt));
   if(dt>30||len>r.budget){r.invalid=true;r.phase='failed';r.reason='이동 또는 연결 상태를 확인하지 못했습니다.';return;}
   r.budget-=len;
   if(len>.05&&!visible([r.p.x,r.p.y+.7,r.p.z],[p.x,p.y+.7,p.z])){r.invalid=true;r.phase='failed';r.reason='막힌 통로를 통과한 이동입니다.';return;}}
  r.p=p;r.at=now;if(now-r.began>1800000){r.phase='failed';r.reason='제한 시간 30분이 지났습니다.';}}
 tick(){const now=this.clock();for(const [uid,r]of this.runs){if(now-r.at>1800000){this.runs.delete(uid);continue;}if(['done','failed'].includes(r.phase))continue;if(!r.p)continue;if(now-r.p.at>30000){r.phase='failed';r.reason='연결이 끊겨 작업을 종료했습니다.';continue;}if(now-r.p.at>1500)continue;
   if(r.reloadAt&&now>=r.reloadAt){r.ammo=30;r.reloadAt=0;}
   const p=r.p;if(distance(p,TIDE.start)>650&&r.phase!=='escape'){r.phase='failed';r.reason='작전 구역을 벗어났습니다.';continue;}
   for(const g of r.guards){if(g.hp<=0)continue;const base=TIDE.guards[g.id][2],cycle=(now-r.began)/4000+g.id;g.x=g.homeX+Math.cos(base)*Math.sin(cycle)*3;g.z=g.homeZ+Math.sin(base)*Math.sin(cycle)*3;const angle=Math.sin((now-r.began)/4000+g.id)*.5;g.yaw=TIDE.guards[g.id][2]+angle;const dx=p.x-g.x,dz=p.z-g.z,d=Math.hypot(dx,dz),dot=(Math.cos(g.yaw)*dx+Math.sin(g.yaw)*dz)/Math.max(1,d);const sees=d<(r.alarm?65:32)&&(r.alarm||dot>.5)&&visible([g.x,TIDE.y+1.45,g.z],[p.x,p.y+1,p.z]);
    if(!sees){g.seenAt=0;continue;}g.yaw=Math.atan2(dz,dx);if(!g.seenAt)g.seenAt=now;if(now-g.seenAt<900)continue;r.alarm=true;
    if(now-g.shotAt>1600){g.shotAt=now;r.hp=Math.max(0,r.hp-7);if(!r.hp){r.phase='failed';r.reason='전투불능 · 집결지에서 다시 도전하세요.';break;}}}
  }}
 action(uid,m){const r=this.get(uid,m.run),now=this.clock();if(!r)return {error:'진행 중인 습격이 없습니다. 취소 후 다시 시작하세요.'};if(['done','failed'].includes(r.phase))return this.snapshot(uid);if(!r.p||now-r.p.at>1500)return {error:'멀티플레이 연결을 확인해 주세요.'};if(!Number.isSafeInteger(m.seq)||m.seq<=r.seq||m.seq>r.seq+10000)return this.snapshot(uid);r.seq=m.seq;const p=r.p,near=q=>!p.car&&distance(p,q)<3&&Math.abs(p.y-TIDE.y)<1.5&&visible([p.x,p.y+1,p.z],[q[0],TIDE.y+1,q[1]]);
  if(m.action==='reload'){if(!r.reloadAt&&r.ammo<30)r.reloadAt=now+1500;}
  else if(m.action==='shoot'){
   if(p.car||r.reloadAt||r.ammo<=0||now-r.shotAt<95)return this.snapshot(uid);const d=m.dir;if(!Array.isArray(d)||d.length!==3||!d.every(Number.isFinite)||Math.abs(Math.hypot(...d)-1)>.02)return this.snapshot(uid);r.ammo--;r.shotAt=now;r.alarm=true;const o=[p.x,p.y+1.4,p.z],max=wallDistance(o,d,125);let hit=null,at=max;
   for(const g of r.guards){if(g.hp<=0)continue;const v=[g.x-o[0],TIDE.y+1-o[1],g.z-o[2]],t=v.reduce((s,n,i)=>s+n*d[i],0);if(t<0||t>at)continue;if(v.reduce((s,n,i)=>s+(n-d[i]*t)**2,0)<.65**2){hit=g;at=t;}}
   if(hit)hit.hp=Math.max(0,hit.hp-34);
  }else if(m.action==='terminal'&&r.phase==='infiltrate'&&near(TIDE.terminal)){r.phase='security';}
  else if(m.action==='puzzle'&&r.phase==='security'&&near(TIDE.terminal)){if(Array.isArray(m.code)&&JSON.stringify(m.code)===JSON.stringify(r.code)){r.phase='vault';}else r.alarm=true;}
  else if(m.action==='take'&&r.phase==='vault'&&near(TIDE.vault)){r.phase='escape';}
  else if(m.action==='bonus'&&r.phase==='escape'&&!r.bonus&&near(TIDE.bonus)){r.bonus=true;}
  else if(m.action==='exit'&&r.phase==='escape'&&distance(p,TIDE.exit)<7&&Math.abs(p.y-TIDE.y)<2){r.phase='done';r.finishedAt=now;}
  return this.snapshot(uid);
 }
 snapshot(uid){const r=this.get(uid);return r?{id:r.id,phase:r.phase,hp:r.hp,ammo:r.ammo,reloading:r.reloadAt>this.clock(),alarm:r.alarm,bonus:r.bonus,reason:r.reason||'',seconds:Math.floor(((r.finishedAt||this.clock())-r.began)/1000),seq:r.seq,code:r.phase==='security'?r.code:null,guards:r.guards.map(g=>({id:g.id,x:g.x,z:g.z,yaw:g.yaw,hp:g.hp,alert:!!g.seenAt,flash:this.clock()-g.shotAt<180}))}:null;}
 proof(uid,id){const r=this.get(uid,id);return r?{id:r.id,valid:!r.invalid&&r.phase==='done'&&r.hp>0,seconds:Math.ceil((r.finishedAt-r.began)/1000),reward:TIDE.reward+(r.bonus?10000:0)}:null;}
 clear(uid,id){if(this.get(uid,id))this.runs.delete(uid);}
}
