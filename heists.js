import {randomInt} from 'node:crypto';
import {TIDE,distance,visible,wallDistance,contractFloor,passable,GUARD_SIGHT,guardSees} from './heist-layout.js';
// An isolated solo combat session; money is exclusively settled by EconomyStore.
/* 2026-10-15 (Opus) 고친 것
   · 이동 판정 : 순간 허용량을 0.6초 몫(걸음 9.6 m · 차 39 m)으로 — 네트워크가 잠깐 몰려 와도 정상 주행이 실패하지 않는다. 벽은 0.45 m 줄여서 본다(모서리 오판 방지).
     부두 밖 : 바로 실패하지 않고 3초 안에 돌아오면 계속. 물에 빠지면 실패.
   · 밸런스 : 플레이어 총 사거리 70 m · 퍼짐 · 거리에 따라 피해 감소. 경비 시야 40 m(경보 75 m) · 반응 0.65초 · 명중은 거리 · 움직임 · 차에 따라 15~85% · 한 발 8.
     경보가 울리면 경비가 마지막으로 본 곳으로 다가온다(집에서 18 m 까지). 보석을 꺼내면 다리 입구에 증원 2명(한 번만).
   · 방탄복 : 시작할 때 서버 계정의 방어도(armor)를 가져와 먼저 깎는다(습격 안에서만, 계정 방어도는 그대로).
   · 보안 회로 : 4칸 순서 기억(3색 · 81가지). 틀리면 경보 + 새 순서. */
const RNG=()=>randomInt(1000000)/1000000;
const HZ={foot:16,car:65,burst:.6,offDeck:3000,
 shot:{range:70,spread:.012,near:20,dmgNear:34,dmgFar:20,interval:95},
 guard:{see:GUARD_SIGHT.range,seeAlarm:GUARD_SIGHT.alarmRange,react:GUARD_SIGHT.reactionMs,fire:1300,dmg:8,speed:2.2,leash:18,
  hit:(d,moving,car)=>Math.max(.15,Math.min(.85,.92-d/110-(moving?.25:0)-(car?.15:0)))}};
function guardOf(i,[x,z,yaw]){return {id:i,x,z,yaw,hp:100,homeX:x,homeZ:z,homeYaw:yaw,shotAt:0,seenAt:0,lastX:null,lastZ:null};}
function newCode(){return Array.from({length:4},()=>randomInt(3));}
export class Heists{
 constructor({clock=Date.now,capacity=24,fleet=[],random=RNG}={}){this.clock=clock;this.capacity=capacity;this.fleet=fleet;this.random=random;this.runs=new Map();this.reservations=new Map();}
 reserve(uid){if(this.runs.has(uid))return;if(!this.reservations.has(uid)&&this.runs.size+this.reservations.size>=this.capacity)throw Error('습격 서버가 혼잡합니다. 잠시 후 다시 시도하세요.');this.reservations.set(uid,(this.reservations.get(uid)||0)+1);}
 release(uid){const n=this.reservations.get(uid)||0;if(n>1)this.reservations.set(uid,n-1);else this.reservations.delete(uid);}
 start(uid,a,position=null,armor=0){if(this.runs.get(uid)?.id===a.id)return;const now=this.clock();for(const [k,r]of this.runs)if(now-r.at>1800000)this.runs.delete(k);if(this.runs.size>=this.capacity)throw Error('습격 서버가 혼잡합니다. 잠시 후 다시 시도하세요.');
  this.runs.set(uid,{id:a.id,at:now,began:now,phase:'infiltrate',hp:100,armor:Math.max(0,Math.min(150,Math.floor(Number(armor)||0))),ammo:30,reloadAt:0,shotAt:0,alarm:false,invalid:false,bonus:false,seq:0,budget:3,speed:0,offAt:0,reinforced:false,
   p:{x:position?.x??TIDE.start[0],y:TIDE.y,z:position?.z??TIDE.start[1],car:false,at:now},guards:TIDE.guards.map((g,i)=>guardOf(i,g)),code:newCode()});}
 get(uid,id){const r=this.runs.get(uid);return r&&(!id||r.id===id)?r:null;}
 fail(r,reason){r.invalid=true;r.phase='failed';r.reason=reason;}
 observe(uid,s){const r=this.get(uid);if(!r||['done','failed'].includes(r.phase))return;const now=this.clock(),p={x:s[0],y:s[1],z:s[2],car:!!s[4],yaw:s[3],at:now};if(![p.x,p.y,p.z].every(Number.isFinite))return;
  if(p.car&&this.fleet.length&&this.fleet[s[5]]!=='sports'){this.fail(r,'작전에는 지급 차량만 쓸 수 있어요.');return;}
  /* 부두 밖 : 3초까지는 봐준다(난간에 부딪혀 튕기는 순간 등). 물에 빠지면 끝 */
  if(p.y>TIDE.y+2.5){this.fail(r,'비정상적인 높이의 이동입니다.');return;}
  const off=contractFloor(p.x,p.z,1.5)===null;
  if(p.y<TIDE.y-1.2){this.fail(r,'부두 밖으로 떨어졌어요 · 집결지에서 다시 도전하세요.');return;}
  if(off){r.offAt||=now;if(now-r.offAt>HZ.offDeck){this.fail(r,'작전 부두를 벗어났어요.');return;}}else r.offAt=0;
  if(r.p){const dt=(now-r.p.at)/1000,len=Math.hypot(p.x-r.p.x,p.y-r.p.y,p.z-r.p.z),max=p.car?HZ.car:HZ.foot;
   r.budget=Math.min(max*HZ.burst,Math.max(3,r.budget??3)+max*Math.max(0,dt));
   if(dt>30||len>r.budget){this.fail(r,'이동 또는 연결 상태를 확인하지 못했습니다.');return;}
   r.budget-=len;r.speed=dt>0?len/dt:r.speed;
   if(len>.05&&!passable([r.p.x,r.p.y+.7,r.p.z],[p.x,p.y+.7,p.z])){this.fail(r,'막힌 통로를 통과한 이동입니다.');return;}}
  r.p=p;r.at=now;if(now-r.began>1800000)this.fail(r,'제한 시간 30분이 지났습니다.');}
 hurt(r,n){const a=Math.min(r.armor,n);r.armor-=a;r.hp=Math.max(0,r.hp-(n-a));if(!r.hp){r.phase='failed';r.reason='전투불능 · 집결지에서 다시 도전하세요.';}}
 tick(){const now=this.clock();for(const [uid,r]of this.runs){if(now-r.at>1800000){this.runs.delete(uid);continue;}if(['done','failed'].includes(r.phase))continue;if(!r.p)continue;if(now-r.p.at>30000){r.phase='failed';r.reason='연결이 끊겨 작업을 종료했습니다.';continue;}if(now-r.p.at>1500)continue;
   if(r.reloadAt&&now>=r.reloadAt){r.ammo=30;r.reloadAt=0;}
   const p=r.p,dt=Math.min(.25,(now-(r.tickAt||now))/1000);r.tickAt=now;
   if(distance(p,TIDE.start)>650&&r.phase!=='escape'){r.phase='failed';r.reason='작전 구역을 벗어났습니다.';continue;}
   const moving=(r.speed||0)>2.5;
   for(const g of r.guards){if(g.hp<=0)continue;
    if(!g.seenAt){/* 평소 : 제자리 ±3 m 순찰 · 고개 돌리기 */
     if(r.alarm&&g.lastX!==null){/* 경보 : 마지막으로 본 곳으로 다가간다 (집에서 leash 까지, 벽은 못 뚫는다) */
      const tx=g.lastX-g.x,tz=g.lastZ-g.z,tl=Math.hypot(tx,tz);if(tl>2){const step=Math.min(tl,HZ.guard.speed*dt),nx=g.x+tx/tl*step,nz=g.z+tz/tl*step;
       if(Math.hypot(nx-g.homeX,nz-g.homeZ)<=HZ.guard.leash&&contractFloor(nx,nz)!==null&&passable([g.x,TIDE.y+.7,g.z],[nx,TIDE.y+.7,nz])){g.x=nx;g.z=nz;}g.yaw=Math.atan2(tz,tx);}}
     else if(!r.alarm){const base=g.homeYaw,cycle=(now-r.began)/4000+g.id;g.x=g.homeX+Math.cos(base)*Math.sin(cycle)*3;g.z=g.homeZ+Math.sin(base)*Math.sin(cycle)*3;g.yaw=base+Math.sin(cycle)*.5;}}
    const dx=p.x-g.x,dz=p.z-g.z,d=Math.hypot(dx,dz),sees=guardSees(g,p,r.alarm);
    if(!sees){g.seenAt=0;continue;}
    g.yaw=Math.atan2(dz,dx);g.lastX=p.x;g.lastZ=p.z;if(!g.seenAt)g.seenAt=now;if(now-g.seenAt<HZ.guard.react)continue;
    if(!r.alarm){r.alarm=true;for(const o of r.guards)if(o.lastX===null){o.lastX=p.x;o.lastZ=p.z;}}
    if(now-g.shotAt>HZ.guard.fire){g.shotAt=now;if(this.random()<HZ.guard.hit(d,moving,p.car)){this.hurt(r,HZ.guard.dmg);if(r.phase==='failed')break;}}}
  }}
 action(uid,m){const r=this.get(uid,m.run),now=this.clock();if(!r)return {error:'진행 중인 습격이 없습니다. 취소 후 다시 시작하세요.'};if(['done','failed'].includes(r.phase))return this.snapshot(uid);if(!r.p||now-r.p.at>1500)return {error:'멀티플레이 연결을 확인해 주세요.'};if(!Number.isSafeInteger(m.seq)||m.seq<=r.seq||m.seq>r.seq+10000)return this.snapshot(uid);r.seq=m.seq;const p=r.p,near=q=>!p.car&&distance(p,q)<3&&Math.abs(p.y-TIDE.y)<1.5&&visible([p.x,p.y+1,p.z],[q[0],TIDE.y+1,q[1]]);
  if(m.action==='reload'){if(!r.reloadAt&&r.ammo<30)r.reloadAt=now+1500;}
  else if(m.action==='shoot'){
   if(p.car||r.reloadAt||r.ammo<=0||now-r.shotAt<HZ.shot.interval)return this.snapshot(uid);let d=m.dir;if(!Array.isArray(d)||d.length!==3||!d.every(Number.isFinite)||Math.abs(Math.hypot(...d)-1)>.02)return this.snapshot(uid);
   r.ammo--;r.shotAt=now;
   /* 퍼짐 : 작은 원뿔 안에서 무작위 */
   const S=HZ.shot.spread*(r.speed>2.5?1.6:1),j=[0,1,2].map(()=>(this.random()*2-1)*S);d=d.map((n,i)=>n+j[i]);const dl=Math.hypot(...d);d=d.map(n=>n/dl);
   const o=[p.x,p.y+1.4,p.z],max=wallDistance(o,d,HZ.shot.range);let hit=null,at=max;
   for(const g of r.guards){if(g.hp<=0)continue;const v=[g.x-o[0],TIDE.y+1-o[1],g.z-o[2]],t=v.reduce((s,n,i)=>s+n*d[i],0);if(t<0||t>at)continue;if(v.reduce((s,n,i)=>s+(n-d[i]*t)**2,0)<.65**2){hit=g;at=t;}}
   if(hit){const k=Math.max(0,Math.min(1,(at-HZ.shot.near)/(HZ.shot.range-HZ.shot.near))),dmg=Math.round(HZ.shot.dmgNear+(HZ.shot.dmgFar-HZ.shot.dmgNear)*k);hit.hp=Math.max(0,hit.hp-dmg);hit.lastX=p.x;hit.lastZ=p.z;}
   /* 총소리 : 50 m 안의 경비가 알아챈다 */
   for(const g of r.guards)if(g.hp>0&&Math.hypot(g.x-p.x,g.z-p.z)<50){g.lastX??=p.x;g.lastZ??=p.z;}r.alarm=true;
  }else if(m.action==='terminal'&&r.phase==='infiltrate'&&near(TIDE.terminal)){r.phase='security';}
  else if(m.action==='puzzle'&&r.phase==='security'&&near(TIDE.terminal)){if(Array.isArray(m.code)&&JSON.stringify(m.code)===JSON.stringify(r.code)){r.phase='vault';}else{r.alarm=true;r.code=newCode();}}
  else if(m.action==='take'&&r.phase==='vault'&&near(TIDE.vault)){r.phase='escape';if(!r.reinforced){r.reinforced=true;r.alarm=true;const n=r.guards.length;TIDE.reinforce.forEach((g,i)=>{const q=guardOf(n+i,g);q.lastX=p.x;q.lastZ=p.z;r.guards.push(q);});}}
  else if(m.action==='bonus'&&r.phase==='escape'&&!r.bonus&&near(TIDE.bonus)){r.bonus=true;}
  else if(m.action==='exit'&&r.phase==='escape'&&distance(p,TIDE.exit)<7&&Math.abs(p.y-TIDE.y)<2){r.phase='done';r.finishedAt=now;}
  return this.snapshot(uid);
 }
 snapshot(uid){const r=this.get(uid);return r?{visibilityVersion:GUARD_SIGHT.version,id:r.id,phase:r.phase,hp:r.hp,armor:r.armor,ammo:r.ammo,reloading:r.reloadAt>this.clock(),alarm:r.alarm,bonus:r.bonus,reason:r.reason||'',seconds:Math.floor(((r.finishedAt||this.clock())-r.began)/1000),seq:r.seq,code:r.phase==='security'?r.code:null,offDeck:!!r.offAt,guards:r.guards.map(g=>({id:g.id,x:g.x,z:g.z,yaw:g.yaw,hp:g.hp,alert:!!g.seenAt,flash:this.clock()-g.shotAt<180}))}:null;}
 proof(uid,id){const r=this.get(uid,id);return r?{id:r.id,valid:!r.invalid&&r.phase==='done'&&r.hp>0,seconds:Math.ceil((r.finishedAt-r.began)/1000),reward:TIDE.reward+(r.bonus?10000:0)}:null;}
 clear(uid,id){if(this.get(uid,id))this.runs.delete(uid);}
}
