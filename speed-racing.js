import {randomUUID} from 'node:crypto';

export const RULES=Object.freeze({invite:12000,cooldown:600000,prepare:10000,countdown:3000,duration:120000,fee:1000,max:8,start:-1980,finish:-480,y:26,x:-6801.040764008565,z:-1418.9592359914345,rot:Math.PI*.75});
export function local(x,z){const dx=x-RULES.x,dz=z-RULES.z,c=Math.cos(RULES.rot),s=Math.sin(RULES.rot);return [dx*c+dz*s,-dx*s+dz*c];}
export function grid(i){const lane=-28.1+i*2.6,c=Math.cos(RULES.rot),s=Math.sin(RULES.rot);return {x:RULES.x+RULES.start*c-lane*s,z:RULES.z+RULES.start*s+lane*c,y:RULES.y,yaw:RULES.rot,lane};}
export const prize=n=>Math.min(200000,100000+Math.max(0,n-2)*20000);

// Only server-owned race objects reach this repository. Clients cannot choose a reward.
export class RaceLedger{
 constructor(backend){this.backend=backend;}
 db(){const db=this.backend()?.db;if(!db)throw Error('서버 거래 연결을 확인해 주세요.');return db;}
 async open(r){const db=this.db(),ref=db.doc('speedRaceRooms/'+r.room);await db.runTransaction(async tx=>{const d=await tx.get(ref),a=(await tx.get(db.doc('economyAccounts/'+r.hostUid))).data();if(!a||a.property.cash<1000||a.speedRace||a.work?.active?.expiresAt>r.createdAt||a.heist?.active||a.fishing?.active?.expiresAt>r.createdAt)throw Error('참가비와 진행 중인 작업을 확인해 주세요.');if((d.data()?.nextAt||0)>r.createdAt)throw Error('이 세션은 레이싱을 연 뒤 10분 동안 다시 열 수 없어요.');tx.set(ref,{id:r.id,nextAt:r.nextAt,createdAt:r.createdAt});});}
 async join(r,uid){const db=this.db(),ref=db.doc('economyAccounts/'+uid),legacy=db.doc('players/'+uid);return db.runTransaction(async tx=>{const [d,l,control]=await Promise.all([tx.get(ref),tx.get(legacy),tx.get(db.doc('economyControl/config'))]);if(control.data()?.lockedVersion!==1)throw Error('서버 거래 점검 중이에요.');const a=d.data();if(!a)throw Error('계정 정보를 먼저 불러와 주세요.');if(a.speedRace?.id===r.id)return a;
  if(a.speedRace||a.work?.active?.expiresAt>Date.now()||a.heist?.active||a.fishing?.active?.expiresAt>Date.now())throw Error('진행 중인 작업을 먼저 마쳐 주세요.');if(a.property.cash<RULES.fee)throw Error('참가비 $1,000이 필요해요.');a.property.cash-=RULES.fee;a.version++;a.updatedAt=Date.now();a.speedRace={id:r.id,expiresAt:r.createdAt+240000};tx.set(ref,a);tx.set(legacy,{save:{...(l.data()?.save||{}),property:a.property},economyVersion:a.version},{mergeFields:['save','economyVersion']});return a;});}
 async settle(r,results){const db=this.db(),receipt=db.doc('speedRaceResults/'+r.id);return db.runTransaction(async tx=>{const done=await tx.get(receipt);if(done.exists)return done.data().results;
  const docs=await Promise.all(results.map(async row=>{const ref=db.doc('economyAccounts/'+row.uid),legacy=db.doc('players/'+row.uid);return {row,ref,legacy,a:(await tx.get(ref)).data(),l:(await tx.get(legacy)).data()};}));
  for(const {row,ref,legacy,a,l}of docs){if(!a||a.speedRace?.id!==r.id)continue;a.property.cash+=row.credit;a.version++;a.updatedAt=Date.now();delete a.speedRace;tx.set(ref,a);tx.set(legacy,{save:{...(l?.save||{}),property:a.property},economyVersion:a.version},{mergeFields:['save','economyVersion']});}
  tx.create(receipt,{at:Date.now(),room:r.room,results});return results;});}
 async next(room){return (await this.db().doc('speedRaceRooms/'+room).get()).data()?.nextAt||0;}
}

export class SpeedRacing{
 constructor({rooms,send,broadcast,ledger,now=Date.now,blocked=()=>false}){Object.assign(this,{rooms,send,broadcast,ledger,now,blocked});this.races=new Map();this.pending=new Set();this.ticking=false;}
 public(r){return {id:r.id,phase:r.phase,host:r.host,createdAt:r.createdAt,nextAt:r.nextAt,until:r.until,startAt:r.startAt||0,deadline:r.deadline||0,players:[...r.players.values()].map(p=>({id:p.peerId,name:p.name,slot:p.slot,ready:p.ready,finish:p.finish||0,dnf:p.dnf||false})),prize:prize(r.players.size)};}
 push(r){const room=this.rooms.get(r.room);if(room)this.broadcast(room,{t:'speedrace',k:'state',now:this.now(),race:this.public(r)});}
 tell(p,k,data={}){this.send(p.ws,{t:'speedrace',k,now:this.now(),...data});}
 async receive(p,m){if(!p.uid||!p.ready)return;if(this.now()-(p.raceActionAt||0)<250)return;p.raceActionAt=this.now();const key=p.roomId;if(this.pending.has(key))return;this.pending.add(key);
  try{let r=this.races.get(key);if(m.k==='sync'){if(r)this.tell(p,'state',{race:this.public(r)});else this.tell(p,'cooldown',{nextAt:await this.ledger.next(key)});return;}
   if(m.k==='open'){if(this.blocked(p)||p.s[7]&16)throw Error('지금은 레이싱에 참가할 수 없어요.');if(r&&r.nextAt>this.now())throw Error('이 세션은 10분에 한 번 레이싱을 열 수 있어요.');r={id:randomUUID(),room:key,createdAt:this.now(),nextAt:this.now()+RULES.cooldown,until:this.now()+RULES.invite,phase:'invite',hostUid:p.uid,host:{id:p.id,name:p.name,look:p.look||[]},players:new Map()};await this.ledger.open(r);this.races.set(key,r);try{await this.join(p,r);}catch(e){r.phase='cancelled';this.push(r);throw e;}this.push(r);return;}
   if(!r||m.id!==r.id)return;if(m.k==='join'){if(r.phase!=='invite'||this.now()>=r.until)throw Error('참가 신청이 끝났어요.');await this.join(p,r);this.push(r);}
   else if(m.k==='ready'){const q=r.players.get(p.uid);if(q&&q.peerId===p.id&&r.phase==='preparing'){const [x,z]=local(p.s[0],p.s[2]);if(p.s[4]&&Math.abs(x-RULES.start)<5&&Math.abs(z-grid(q.slot).lane)<1.5&&Math.abs(p.s[1]-26)<2){q.ready=true;q.lastAt=this.now();q.x=x;this.push(r);}}}
   else if(m.k==='leave'){const q=r.players.get(p.uid);if(q&&q.peerId===p.id){q.dnf=true;this.push(r);}}
  }catch(e){this.tell(p,'error',{message:e.message});}finally{this.pending.delete(key);}}
 async join(p,r){if(r.players.has(p.uid))return;if(r.players.size>=RULES.max)throw Error('참가 인원 8명이 모두 찼어요.');if(this.blocked(p)||p.s[7]&16)throw Error('진행 중인 활동을 먼저 마쳐 주세요.');await this.ledger.join(r,p.uid);const q={uid:p.uid,peerId:p.id,name:p.name,slot:r.players.size,ready:false,x:RULES.start,lastAt:0};r.players.set(p.uid,q);this.tell(p,'joined',{id:r.id,slot:q.slot});}
 async tick(){if(this.ticking)return;this.ticking=true;try{for(const r of this.races.values()){if(this.pending.has(r.room))continue;const now=this.now(),room=this.rooms.get(r.room);if(['done','cancelled'].includes(r.phase)){if(now>r.nextAt)this.races.delete(r.room);continue;}
   for(const q of r.players.values()){const p=room?.get(q.peerId);if(!p||p.uid!==q.uid)q.dnf=true;}
   if(r.phase==='invite'&&now>=r.until){if(r.players.size<2){await this.end(r,true);continue;}r.phase='preparing';r.until=now+RULES.prepare;for(const q of r.players.values()){const p=room?.get(q.peerId);if(p)this.tell(p,'stage',{id:r.id,grid:grid(q.slot),slot:q.slot});}this.push(r);}
   else if(r.phase==='preparing'){if([...r.players.values()].every(q=>q.ready&&!q.dnf)){r.phase='countdown';r.startAt=now+RULES.countdown;r.deadline=r.startAt+RULES.duration;this.push(r);}else if(now>=r.until)await this.end(r,true);}
   else if(r.phase==='countdown'){if(now>=r.startAt){r.phase='racing';for(const q of r.players.values()){q.lastAt=now;q.x=RULES.start;}this.push(r);}}
   else if(r.phase==='racing'){for(const q of r.players.values()){if(q.dnf||q.finish)continue;const p=room?.get(q.peerId);if(!p||now-(p.stateAt||0)>5000){q.dnf=true;continue;}if(q.sampleAt===p.stateAt)continue;q.sampleAt=p.stateAt;const [x,z]=local(p.s[0],p.s[2]),dt=(now-q.lastAt)/1000;
     if(!p.s[4]||p.s[5]!==2||p.s[7]&16||Math.abs(p.s[1]-26)>3||Math.abs(z-grid(q.slot).lane)>1.8||x<RULES.start-6||x-q.x>65*dt+8||x-RULES.start>Math.min(65*((now-r.startAt)/1000),5.7*((now-r.startAt)/1000)**2)+12){q.dnf=true;continue;}
     if(x>=RULES.finish){const cross=now-(x-RULES.finish)/Math.max(1,x-q.x)*(now-q.lastAt);if(cross-r.startAt<1500/65*1000){q.dnf=true;continue;}q.finish=cross-r.startAt;}q.x=x;q.lastAt=now;
    }if(now>=r.deadline||[...r.players.values()].every(q=>q.finish||q.dnf))await this.end(r,false);else if(now-(r.sentAt||0)>1000){r.sentAt=now;this.push(r);}}
  }}catch(e){/* Storage failures retain the pending race and retry, never mint a new result. */}finally{this.ticking=false;}}
 async end(r,cancel){const rows=[...r.players.values()].sort((a,b)=>(a.finish||Infinity)-(b.finish||Infinity));const finishers=rows.filter(q=>q.finish),last=rows.at(-1);const results=rows.map((q,i)=>({uid:q.uid,id:q.peerId,name:q.name,rank:q.finish?i+1:null,time:q.finish||0,credit:cancel?RULES.fee:q===finishers[0]?RULES.fee+prize(rows.length):q!==last&&q.finish?RULES.fee:0,net:cancel?0:q===finishers[0]?prize(rows.length):q!==last&&q.finish?0:-RULES.fee}));await this.ledger.settle(r,results);r.phase=cancel?'cancelled':'done';const room=this.rooms.get(r.room);if(room)this.broadcast(room,{t:'speedrace',k:'result',now:this.now(),id:r.id,cancelled:cancel,nextAt:r.nextAt,results:results.map(({uid,...row})=>row)});this.push(r);}
 protected(p){const r=this.races.get(p.roomId),q=r?.players.get(p.uid);return !!q&&q.peerId===p.id&&['preparing','countdown','racing'].includes(r.phase);}
}
