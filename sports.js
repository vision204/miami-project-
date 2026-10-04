import { PADS } from '../assets/sports/golf-course.js';
import { Basketball } from './basketball.js';
import { PP_PADS } from '../assets/sports/pingpong-pads.js';
import { newRound, currentPlayer, playShot, advanceRound } from '../assets/sports/golf-rules.js';
export class Sports {
 constructor(rooms,send,broadcast){this.rooms=rooms;this.send=send;this.broadcast=broadcast;this.states=new Map();this.basket=new Basketball(this);}
 state(room){if(!this.states.has(room))this.states.set(room,{pads:PADS.map(p=>({id:p.id,seats:p.slots.map(()=>null),phase:'wait',startAt:0,round:null})),pp:PP_PADS.map(()=>({seats:[null,null],busy:false}))});return this.states.get(room);}
 snapshot(room){const s=this.state(room);return {t:'golf',k:'state',serverNow:Date.now(),pads:s.pads};}
 publish(room){const peers=this.rooms.get(room);if(peers)this.broadcast(peers,this.snapshot(room));}
 protected(peer){const s=this.states.get(peer.roomId);return this.basket.protected(peer)||!!s&&(s.pads.some(p=>p.seats.includes(peer.id))||s.pp.some(p=>p.seats.includes(peer.id)));}
 near(peer,p,r=1.6){return peer.ready&&!(peer.s[7]&(16|128))&&!peer.s[4]&&Math.hypot(peer.s[0]-p[0],peer.s[2]-p[2])<=r&&Math.abs(peer.s[1]-p[1])<2;}
 receive(peer,m){const s=this.state(peer.roomId);if(m.k==='sync'){this.send(peer.ws,this.snapshot(peer.roomId));return;}
  const p=s.pads.find(p=>p.id===m.pad),spec=PADS.find(p=>p.id===m.pad);if(!p)return;
  if(m.k==='claim'){
   const slot=m.slot;if(!Number.isInteger(slot)||!spec.slots[slot]||p.phase!=='wait'||p.seats[slot]!==null||this.protected(peer)||!this.near(peer,spec.slots[slot])){this.send(peer.ws,{t:'golf',k:'denied',message:'다른 사람이 사용 중이거나 발판에서 벗어났습니다.'});return;}
   p.seats[slot]=peer.id;if(p.seats.every(id=>id!==null)){p.phase='count';p.startAt=Date.now()+5000;}this.publish(peer.roomId);
  }else if(m.k==='leave'&&p.seats.includes(peer.id)){this.leaveGolf(peer,p,m.forfeit!==false);}
  else if(m.k==='shot'&&p.phase==='play'&&p.round.phase==='play'&&currentPlayer(p.round)===peer.id&&m.seq===p.round.seq){
   const a=m.input;if(!a||!Number.isInteger(a.club)||a.club<0||a.club>3||![a.angle,a.power,a.error].every(Number.isFinite)||a.power<.01||a.power>1||Math.abs(a.angle)>Math.PI*4||Math.abs(a.error)>1)return;
   playShot(p.round,a,Date.now());this.publish(peer.roomId);
  }
 }
 leaveGolf(peer,p,forfeit){if(p.phase==='play'){const r=p.round;r.phase='over';r.winner=r.teams.length>1?1-r.teams.findIndex(t=>t.includes(peer.id)):null;r.reason=forfeit?'기권패':'연결 종료로 기권패';p.phase='over';p.endAt=Date.now()+5000;}
  else if(p.phase==='over'){p.seats=p.seats.map(id=>id===peer.id?null:id);if(p.seats.every(id=>id===null)){p.phase='wait';p.round=null;}}
  else{p.seats=p.seats.map(id=>id===peer.id?null:id);p.phase='wait';p.startAt=0;p.round=null;}this.publish(peer.roomId);}
 pp(peer,m){const s=this.state(peer.roomId),tb=m.tb,side=m.side;if(!Number.isInteger(tb)||tb<0||tb>1||![0,1].includes(side))return null;const table=s.pp[tb],room=this.rooms.get(peer.roomId);
  if(m.k==='sit'){if(table.seats[side]!==peer.id){if(table.busy||table.seats[side]!==null||this.protected(peer)||!this.near(peer,PP_PADS[tb][side],1.6)){this.send(peer.ws,{t:'pp',k:'denied',tb,side});return null;}table.seats[side]=peer.id;}
   if(table.seats.every(id=>id!==null)&&!table.startAt){table.startAt=Date.now()+5000;table.busy=true;}
   if(m.busy)table.busy=true;return {t:'pp',k:'sit',tb,side,id:peer.id,busy:table.busy?1:0,seats:table.seats,startAt:table.startAt||0};}
  if(table.seats[side]!==peer.id&&!(table.busy&&table.seats.includes(peer.id)&&table.seats[side]===null&&['shot','point'].includes(m.k)))return null;
  if(['shot','point'].includes(m.k)&&table.startAt&&Date.now()<table.startAt)return null;
  if(m.k==='stand'){table.seats[side]=null;table.busy=false;table.startAt=0;return {t:'pp',k:'stand',tb,side,id:peer.id};}
  if(!table.busy||!['pad','shot','point','end'].includes(m.k))return null;
  if(m.k==='end'){table.busy=false;table.startAt=0;}return {t:'pp',k:m.k,tb,side,id:peer.id,...(m.k==='end'&&m.forfeit?{forfeit:true,winner:1-side}:{})};
 }
 tick(time=Date.now()){
  this.basket.tick(time);
  for(const [room,s]of this.states){const peers=this.rooms.get(room);if(!peers){this.states.delete(room);continue;}let changed=false;
   s.pads.forEach((p,i)=>{if(p.phase==='wait'||p.phase==='count'){p.seats.forEach((id,j)=>{if(id!==null&&(!peers.has(id)||!this.near(peers.get(id),PADS[i].slots[j],2.2))){p.seats[j]=null;p.phase='wait';p.startAt=0;changed=true;}});if(p.phase==='count'&&time>=p.startAt){p.round=newRound(p.seats,PADS[i].holes,PADS[i].mode);p.round.deadline=time+60000;p.phase='play';changed=true;}}
    else if(p.phase==='play'){if(advanceRound(p.round,time)){changed=true;if(p.round.phase==='over'){p.phase='over';p.endAt=time+7000;}}else if(p.round.phase==='play'&&time>p.round.deadline){playShot(p.round,{club:3,power:.01,angle:0,error:0},time);changed=true;}}
    else if(p.phase==='over'&&time>=p.endAt){p.seats=p.seats.map(()=>null);p.phase='wait';p.round=null;changed=true;}});
   s.pp.forEach((p,tb)=>{if(!p.busy)p.seats.forEach((id,side)=>{if(id!==null&&(!peers.has(id)||!this.near(peers.get(id),PP_PADS[tb][side],1.8))){p.seats[side]=null;this.broadcast(peers,{t:'pp',k:'stand',tb,side,id});}});});
   if(changed)this.publish(room);
  }
 }
 drop(peer){this.basket.drop(peer);const s=this.states.get(peer.roomId);if(!s)return;s.pads.filter(p=>p.seats.includes(peer.id)).forEach(p=>this.leaveGolf(peer,p,false));s.pp.forEach((p,tb)=>p.seats.forEach((id,side)=>{if(id===peer.id){p.seats[side]=null;p.busy=false;const r=this.rooms.get(peer.roomId);if(r)this.broadcast(r,{t:'pp',k:'stand',tb,side,id});}}));}
}
