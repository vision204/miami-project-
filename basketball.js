import {COURTS,slots,world,startRound,action,tickRound,jumpHeight} from './sports-shared/basketball-rules.js';
export class Basketball {
 constructor(sports){this.sports=sports;this.states=new Map();}
 state(room){if(!this.states.has(room))this.states.set(room,COURTS.map(c=>({id:c.id,seats:[null,null,null],phase:'wait',startAt:0,round:null})));return this.states.get(room);}
 snapshot(room){return{t:'basket',k:'state',serverNow:Date.now(),courts:this.state(room)};}
 publish(room){const peers=this.sports.rooms.get(room);if(peers)this.sports.broadcast(peers,this.snapshot(room));}
 mine(peer){return this.states.get(peer.roomId)?.find(c=>c.seats.includes(peer.id));}
 protected(peer){return!!this.mine(peer);}
 place(peer){const c=this.mine(peer);if(!c?.round||!['play','over'].includes(c.phase))return;const p=c.round.players.find(p=>p.id===peer.id);if(p){const a=world(COURTS.find(x=>x.id===c.id),p.p[0],p.p[1],jumpHeight(p,Date.now()));peer.s[0]=a[0];peer.s[1]=a[1];peer.s[2]=a[2];peer.s[3]=Math.atan2(-p.p[1],.59-p.p[0])+COURTS[0].rot;peer.s[6]=Math.hypot(...p.move)*4.5;}}
 receive(peer,m){const s=this.state(peer.roomId);if(m.k==='sync'){this.sports.send(peer.ws,this.snapshot(peer.roomId));return;}const c=s.find(c=>c.id===m.court),spec=COURTS.find(c=>c.id===m.court);if(!c)return;const time=Date.now();
 if(m.k==='claim'){const slot=m.slot;if(!Number.isInteger(slot)||slot<0||slot>2||c.phase!=='wait'||c.seats[slot]!==null||this.sports.protected(peer)||!this.sports.near(peer,slots(spec)[slot])||(slot===2?c.seats.some(id=>id!==null):c.seats[2]!==null)){this.sports.send(peer.ws,{t:'basket',k:'denied',message:'사용 중인 코트이거나 발판에서 벗어났습니다.'});return;}c.seats[slot]=peer.id;if(slot===2||c.seats[0]!==null&&c.seats[1]!==null){c.phase='count';c.startAt=time+5000;}this.publish(peer.roomId);return;}
 if(!c.seats.includes(peer.id))return;
 if(m.k==='leave'){this.leave(peer,c);return;}if(c.phase!=='play')return;
 const r=c.round,p=r.players.find(p=>p.id===peer.id);if(!p)return;
 if(m.k==='move'&&Array.isArray(m.dir)&&m.dir.length===2&&m.dir.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)){p.move=m.dir;p.sprint=!!m.sprint;p.inputAt=time;}
 else if(m.k==='action'&&m.seq===r.seq&&['charge','release','cancel','steal','block','recall'].includes(m.action)){if(action(r,peer.id,m.action,time))this.publish(peer.roomId);}
 }
 leave(peer,c){if(c.phase==='play'&&!c.round.practice){c.phase=c.round.phase='over';c.round.winner=1-c.round.ids.indexOf(peer.id);c.round.reason='기권으로 경기 종료';c.endAt=Date.now()+5000;}else if(c.phase==='over'){c.seats=c.seats.map(id=>id===peer.id?null:id);}else{c.seats=c.seats.map(id=>id===peer.id?null:id);c.phase='wait';c.startAt=0;c.round=null;}this.publish(peer.roomId);}
 tick(time){for(const [room,courts]of this.states){const peers=this.sports.rooms.get(room);if(!peers){this.states.delete(room);continue;}for(const c of courts){const spec=COURTS.find(x=>x.id===c.id);if(c.phase==='wait'||c.phase==='count'){c.seats.forEach((id,i)=>{if(id!==null&&(!peers.has(id)||!this.sports.near(peers.get(id),slots(spec)[i],2))){c.seats[i]=null;c.phase='wait';c.startAt=0;}});if(c.phase==='count'&&time>=c.startAt){const practice=c.seats[2]!==null;c.round=startRound(practice?[c.seats[2]]:c.seats.slice(0,2),practice,time);c.phase='play';}}
 else if(c.phase==='play'){for(const p of c.round.players)if(time-(p.inputAt||0)>400)p.move=[0,0];tickRound(c.round,time);if(c.round.phase==='over'){c.phase='over';c.endAt=time+7000;}c.seats.forEach(id=>{if(peers.has(id))this.place(peers.get(id));});}
 else if(c.phase==='over'&&(time>=c.endAt||c.seats.every(id=>id===null))){c.seats=[null,null,null];c.phase='wait';c.round=null;}}
 this.publish(room);}}
 drop(peer){const c=this.mine(peer);if(c){this.leave(peer,c);c.seats=c.seats.map(id=>id===peer.id?null:id);}}
}

