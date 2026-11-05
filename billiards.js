/* 당구 · 포켓볼 테이블 (2026-11-05 · Opus) — 자리 · 차례 · 점수 · 승자만 관리하고 샷은 가까운 사람에게 전달한다.
   물리는 각 브라우저가 같은 코드(sports-shared/billiards-rules.js)로 굴린다. 보상 증빙(proof)은 서버가 끝난 경기에서만 만든다. */
import {randomUUID} from 'node:crypto';
import {CUE_TABLES,KINDS,CUE_REWARD} from './sports-shared/billiards-rules.js';
const MODES=['npc','pvp','solo'],DIFFS=['easy','normal','hard'];
const fresh=t=>({id:t.id,kind:t.kind,seats:[null,null],uids:[null,null],mode:null,diff:'normal',target:10,phase:'idle',turn:0,score:[0,0],groups:[null,null],seq:0,game:null,startedAt:0,waitingUntil:0,shots:[0,0],post:null,postSeq:0,winner:-1,endedAt:0,until:0});
const num=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
function ballsOk(a,K){if(!Array.isArray(a)||a.length>64||a.length%4)return false;for(let i=0;i<a.length;i+=4){if(!Number.isInteger(a[i])||a[i]<0||a[i]>15||!num(a[i+1],-K.HX-.2,K.HX+.2)||!num(a[i+2],-K.HZ-.2,K.HZ+.2)||(a[i+3]!==0&&a[i+3]!==1))return false;}return true;}
export class Billiards{
 constructor(sports){this.sports=sports;this.states=new Map();this.proofs=new Map();}
 state(room){if(!this.states.has(room))this.states.set(room,CUE_TABLES.map(fresh));return this.states.get(room);}
 mine(p){return this.states.get(p.roomId)?.find(t=>t.seats.includes(p.id))||null;}
 protected(p){const t=this.mine(p);return !!t&&t.phase!=='idle';}
 view(t){const {id,kind,seats,mode,diff,target,phase,turn,score,groups,seq,game,post,postSeq,winner,waitingUntil}=t;return {id,kind,seats,mode,diff,target,phase,turn,score,groups,seq,game,post,postSeq,winner,waitingUntil};}
 snapshot(room){return {t:'cue',k:'state',now:Date.now(),tables:this.state(room).map(t=>this.view(t))};}
 near(p,spec,r){const s=p.s;return Array.isArray(s)&&Math.hypot(s[0]-spec.x,s[2]-spec.z)<r&&Math.abs(s[1]-spec.y)<3;}
 audience(room,spec){const peers=this.sports.rooms.get(room);return peers?[...peers.values()].filter(p=>this.near(p,spec,45)):[];}
 publish(room){const peers=this.sports.rooms.get(room);if(!peers)return;const m=this.snapshot(room);for(const p of peers.values())if(this.mine(p)||CUE_TABLES.some(t=>this.near(p,t,60)))this.sports.send(p.ws,m);}
 receive(p,m){if(!p.uid||!p.ready)return;if(m.k==='sync'){this.sports.send(p.ws,this.snapshot(p.roomId));return;}
  const all=this.state(p.roomId),t=all.find(x=>x.id===m.table),spec=CUE_TABLES.find(x=>x.id===m.table),now=Date.now();if(!t||!spec)return;const K=KINDS[spec.kind];
  if(m.k==='join'){if(!MODES.includes(m.mode)||!this.near(p,spec,6)||now-(p.stateAt||0)>2500)return;const other=this.mine(p);if(other&&other!==t)this.drop(p);if(this.sports.protected(p)&&!this.mine(p))return;
   const target=[5,10,15,20].includes(m.target)?m.target:10,diff=DIFFS.includes(m.diff)?m.diff:'normal';
   if(m.mode==='pvp'&&t.phase==='wait'&&t.mode==='pvp'&&t.seats[1]===null&&t.seats[0]!==p.id&&t.uids[0]!==p.uid){t.seats[1]=p.id;t.uids[1]=p.uid;t.phase='play';t.startedAt=now;}
   else if(t.phase==='idle'){Object.assign(t,fresh(spec),{mode:m.mode,diff,target:spec.kind==='carom'?target:10,seats:[p.id,m.mode==='npc'?'npc':null],uids:[p.uid,null],game:randomUUID().replace(/-/g,''),phase:m.mode==='pvp'?'wait':'play',startedAt:now,waitingUntil:now+90000});}
   else return;
   this.publish(p.roomId);return;}
  const i=t.seats.indexOf(p.id);if(i<0)return;
  if(m.k==='leave'){this.drop(p);return;}
  if(m.k==='shot'){if(t.phase!=='play'||!Number.isInteger(m.seq)||m.seq!==t.seq+1)return;
   const by=t.mode==='npc'&&m.by===1&&i===0?1:i;if(t.mode!=='solo'&&by!==t.turn)return;
   const a=m.after;if(!Array.isArray(m.dir)||m.dir.length!==2||!m.dir.every(x=>num(x,-1.001,1.001))||Math.abs(Math.hypot(m.dir[0],m.dir[1])-1)>.01||!num(m.v,0,K.vmax+.01)||!Array.isArray(m.tip)||m.tip.length!==2||!m.tip.every(x=>num(x,-1,1)))return;
   if(!ballsOk(m.pre,K)||!ballsOk(m.post,K)||(m.cue!==null&&m.cue!==undefined&&!(Array.isArray(m.cue)&&m.cue.length===2&&num(m.cue[0],-K.HX,K.HX)&&num(m.cue[1],-K.HZ,K.HZ))))return;
   if(!a||![0,1].includes(a.turn)||!Array.isArray(a.score)||a.score.length!==2||!a.score.every(x=>Number.isInteger(x)&&x>=0&&x<1000)||typeof a.over!=='boolean'||![-1,0,1].includes(a.winner))return;
   t.seq=m.seq;t.turn=t.mode==='solo'?0:a.turn;t.score=a.score;t.groups=Array.isArray(a.groups)&&a.groups.length===2&&a.groups.every(g=>g===null||g==='solid'||g==='stripe')?a.groups:t.groups;t.post=m.post;t.postSeq++;t.shots[by]++;
   const relay={t:'cue',k:'shot',table:t.id,seq:m.seq,by,pre:m.pre,cue:m.cue??null,dir:m.dir,v:m.v,tip:m.tip,post:m.post,after:{turn:t.turn,score:t.score,over:a.over,winner:a.winner,groups:t.groups}};
   for(const q of this.audience(p.roomId,spec))if(q.id!==p.id)this.sports.send(q.ws,relay);
   if(a.over&&t.mode!=='solo')this.finish(t,a.winner,now);
   this.publish(p.roomId);}
 }
 /** 경기 끝 : 이긴 사람에게 보상 증빙 */
 finish(t,winner,now){t.phase='over';t.winner=winner;t.endedAt=now;t.until=now+6000;const uid=winner>=0?t.uids[winner]:null;
  if(uid&&(t.mode==='npc'?winner===0:t.mode==='pvp')){const list=(this.proofs.get(uid)||[]).filter(x=>now-x.endedAt<15*60000);list.push({game:t.game,mode:t.mode,diff:t.diff,kind:t.kind,startedAt:t.startedAt,endedAt:now,shots:t.shots[winner]});this.proofs.set(uid,list.slice(-12));}}
 proof(uid,game){return (this.proofs.get(uid)||[]).find(x=>x.game===game)||null;}
 drop(p){const t=this.mine(p);if(!t)return;const i=t.seats.indexOf(p.id);
  if(t.phase==='play'&&t.mode==='pvp'&&t.seats[1-i]){const tot=t.shots[0]+t.shots[1];if(tot>=CUE_REWARD.minShots*2)this.finish(t,1-i,Date.now());else{t.phase='over';t.winner=1-i;t.until=Date.now()+3000;}}
  if(t.phase!=='over'||t.mode!=='pvp'){Object.assign(t,fresh(CUE_TABLES.find(x=>x.id===t.id)));}
  else{t.seats[i]=null;}
  this.publish(p.roomId);}
 tick(now){for(const [room,tables] of this.states){const peers=this.sports.rooms.get(room);if(!peers){this.states.delete(room);continue;}let changed=false;
  for(const t of tables){const spec=CUE_TABLES.find(x=>x.id===t.id);
   if(t.phase==='wait'&&now>t.waitingUntil){Object.assign(t,fresh(spec));changed=true;continue;}
   if(t.phase==='over'&&now>t.until){Object.assign(t,fresh(spec));changed=true;continue;}
   for(const id of t.seats){if(id===null||id==='npc')continue;const q=peers.get(id);if(!q||!this.near(q,spec,9)){if(q)this.drop(q);else{const i=t.seats.indexOf(id);if(t.phase==='play'&&t.mode==='pvp'&&t.seats[1-i]&&t.shots[0]+t.shots[1]>=CUE_REWARD.minShots*2)this.finish(t,1-i,now);else Object.assign(t,fresh(spec));}changed=true;break;}}}
  if(changed)this.publish(room);}
  for(const [uid,list] of this.proofs){const keep=list.filter(x=>now-x.endedAt<15*60000);if(keep.length)this.proofs.set(uid,keep);else this.proofs.delete(uid);}}
}
