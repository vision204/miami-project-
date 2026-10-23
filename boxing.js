import {RINGS,ringGate,ringWorld,newBout,punch,tickBout,finishBout} from './sports-shared/boxing-rules.js';
export class Boxing{
 constructor(sports){this.sports=sports;this.states=new Map();}
 state(room){if(!this.states.has(room))this.states.set(room,RINGS.map(r=>({id:r.id,seats:[null,null],bout:null,waitingUntil:0})));return this.states.get(room);}
 mine(p){return this.states.get(p.roomId)?.find(r=>r.seats.includes(p.id));}
 protected(p){return !!this.mine(p);}
 snapshot(room){return{t:'boxing',k:'state',now:Date.now(),rings:this.state(room)};}
 publish(room){const peers=this.sports.rooms.get(room);if(peers){const m=this.snapshot(room);for(const p of peers.values())if(this.mine(p)||Math.hypot(p.s[0]-ringGate(RINGS[0])[0],p.s[2]-ringGate(RINGS[0])[2])<270)this.sports.send(p.ws,m);}}
 place(p){const r=this.mine(p),i=r?.seats.indexOf(p.id);if(!r?.bout||i<0)return;const a=r.bout.players[i],o=r.bout.players[1-i],v=ringWorld(RINGS[r.id],...a.p);p.s[0]=v[0];p.s[1]=v[1];p.s[2]=v[2];p.s[3]=Math.atan2(o.p[1]-a.p[1],o.p[0]-a.p[0])+(-1.5737129290333054);p.s[4]=0;p.s[6]=0;p.s[8]=0;}
 receive(p,m){if(!p.uid||!p.ready)return;if(m.k==='sync'){this.sports.send(p.ws,this.snapshot(p.roomId));return;}
  const all=this.state(p.roomId),r=all.find(r=>r.id===m.ring),spec=RINGS[m.ring],now=Date.now();if(!r||!spec)return;
  if(m.k==='join'){const near=this.sports.near(p,ringGate(spec),3),others=this.sports.rooms.get(p.roomId);
   if(!near||this.sports.protected(p)||r.bout||!['npc','pvp'].includes(m.mode)||now-(p.stateAt||0)>2000||r.seats.some(id=>id!==null&&others.get(id)?.uid===p.uid))return;
   const slot=r.seats.indexOf(null);if(slot<0||m.mode==='npc'&&slot!==0)return;r.seats[slot]=p.id;r.waitingUntil=now+20000;
   if(m.mode==='npc')r.seats[1]='npc';if(r.seats.every(id=>id!==null)){r.bout=newBout([...r.seats],now);for(const id of r.seats)if(others.has(id))this.place(others.get(id));}this.publish(p.roomId);return;
  }
  if(!r.seats.includes(p.id))return;const i=r.seats.indexOf(p.id),b=r.bout,a=b?.players[i];
  if(m.k==='leave'){this.drop(p);return;}if(!a||b.phase==='over')return;
  if(m.k==='input'&&Array.isArray(m.dir)&&m.dir.length===2&&m.dir.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)){a.move=m.dir;a.guard=m.guard===true&&!a.downUntil;a.lastInput=now;}
  else if(m.k==='punch'&&[0,1].includes(m.hand))punch(b,i,m.hand,m.seq,now);
 }
 drop(p){const r=this.mine(p);if(!r)return;if(r.bout&&r.bout.phase!=='over')finishBout(r.bout,1-r.seats.indexOf(p.id),'기권 / 연결 종료',Date.now());r.seats=r.seats.map(id=>id===p.id?null:id);if(!r.bout||r.seats.every(id=>id===null||id==='npc')){r.bout=null;r.seats=[null,null];}this.publish(p.roomId);}
 tick(now){for(const [room,rings]of this.states){const peers=this.sports.rooms.get(room);if(!peers){this.states.delete(room);continue;}
  for(const r of rings){if(!r.bout){if(now>r.waitingUntil||r.seats.some(id=>id!==null&&(!peers.has(id)||Math.hypot(peers.get(id).s[0]-ringGate(RINGS[r.id])[0],peers.get(id).s[2]-ringGate(RINGS[r.id])[2])>4))){r.seats=[null,null];}continue;}
   const b=r.bout;if(b.phase==='over'){if(now>=b.until){r.bout=null;r.seats=[null,null];}continue;}
   for(const id of r.seats)if(id!=='npc'&&!peers.has(id)){finishBout(b,1-r.seats.indexOf(id),'연결 종료',now);}
   if(r.seats[1]==='npc'){const a=b.players[1],o=b.players[0],d=Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1]);a.move=d>1.25?[(o.p[0]-a.p[0])/Math.max(d,1),(o.p[1]-a.p[1])/Math.max(d,1)]:[0,0];a.guard=(Math.floor(now/900)%4===0)&&a.stamina>25;a.lastInput=now;if(d<1.75&&now-a.punch>850)punch(b,1,Math.floor(now/850)%2,a.actionSeq+1,now);}
   tickBout(b,now);for(const id of r.seats)if(peers.has(id))this.place(peers.get(id));
  }this.publish(room);
 }}
}
