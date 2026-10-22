import {BOMB_RULES as R,bombFlight,bombDamage,bombInside,bombFighter} from './bombing-core.js';
export class Bombing {
 constructor({fleet,send,broadcast,protectedPeer=()=>false,now=Date.now}){Object.assign(this,{fleet,send,broadcast,protectedPeer,now});this.rooms=new Map();this.serial=0;}
 state(room){let s=this.rooms.get(room);if(!s)this.rooms.set(room,s={pending:new Map(),impacts:new Map()});return s;}
 receive(room,peer,m){const now=this.now();if(!peer.ready||this.protectedPeer(peer)||(peer.s[7]&(16|128))||!(peer.s[9]>0))return false;
  const s=this.state(room);
  if(m.t==='bombnpc'){
   const hit=s.impacts.get(m.id);if(!hit||now-hit.at>4000||!Array.isArray(m.k))return false;
   if(!bombInside([peer.s[0],hit.p[1],peer.s[2]],hit.p)&&peer.id!==hit.from)return false;
   const rows=[];for(const a of m.k.slice(0,16)){if(hit.npcs.size>=512)break;if(!Array.isArray(a)||a.length<4||!a.slice(0,4).every(Number.isFinite)||!Number.isInteger(a[0])||a[0]<0||a[0]>4294967295||!bombInside(a.slice(1,4),hit.p)||hit.npcs.has(a[0]))continue;hit.npcs.add(a[0]);rows.push([a[0],a[1],a[2],a[3],0,0]);}
   if(rows.length)this.broadcast(room,{t:'ped',from:hit.from,k:rows});return !!rows.length;
  }
  const deny=message=>{this.send(peer.ws,{t:'bomb',phase:'reject',message});return false;};
  if(m.t!=='bomb'||m.phase!=='drop')return false;
  if(!peer.s[4]||!bombFighter(this.fleet[peer.s[5]]))return deny('전투기에서만 폭격할 수 있어요.');
  if(now-(peer.stateAt||0)>1500)return deny('전투기 위치 연결을 확인해 주세요.');
  if(!Array.isArray(m.o)||m.o.length!==3||!m.o.every(Number.isFinite)||!Number.isFinite(m.g))return false;
  if(Math.hypot(m.o[0]-peer.s[0],m.o[1]-peer.s[1],m.o[2]-peer.s[2])>8+peer.s[6]*.35)return deny('전투기 위치가 갱신된 뒤 시도해 주세요.');
  const height=m.o[1]-m.g;if(m.g< -100||m.g>1500||height<R.minAltitude||height>R.maxAltitude)return deny('지면에서 12m 이상 올라가야 해요.');
  if(peer.bombAt!==undefined&&now-peer.bombAt<R.cooldown)return deny('폭탄 재장전 중이에요.');
  if(s.pending.size>=R.maxRoom||[...s.pending.values()].filter(b=>b.from===peer.id).length>=R.maxActive)return deny('앞서 떨어뜨린 폭탄이 낙하 중이에요.');
  const duration=bombFlight(m.o,m.g)*1000,b={t:'bomb',phase:'launch',id:'b'+(++this.serial),from:peer.id,o:[...m.o],p:[m.o[0],m.g,m.o[2]],at:now,duration,radius:R.radius};peer.bombAt=now;peer.s[7]&=~32;s.pending.set(b.id,b);this.broadcast(room,b);return true;
 }
 tick(rooms){const now=this.now();for(const [room,state]of this.rooms){const peers=[...rooms.values()].find(p=>p===room);if(!peers){this.rooms.delete(room);continue;}
  for(const [id,b]of state.pending){if(!peers.has(b.from)){state.pending.delete(id);this.broadcast(room,{t:'bomb',phase:'cancel',id});continue;}if(now<b.at+b.duration)continue;state.pending.delete(id);state.impacts.set(id,{p:b.p,at:now,from:b.from,npcs:new Set()});this.broadcast(room,{t:'bomb',phase:'impact',id,from:b.from,p:b.p,radius:R.radius});
   for(const target of peers.values()){if(!target.ready||now-(target.stateAt||0)>2500||!(target.s[9]>0)||(target.s[7]&(16|32|128))||this.protectedPeer(target))continue;
    const p=[target.s[0],target.s[1],target.s[2]];if(bombInside(p,b.p))this.send(target.ws,{t:'hurt',from:b.from,dmg:bombDamage(Math.hypot(p[0]-b.p[0],p[2]-b.p[2])) ,w:2,bomb:id});
   }
  }for(const [id,h]of state.impacts)if(now-h.at>5000)state.impacts.delete(id);
 }}
}
