// The ring layout and match rules are shared verbatim with the relay.
export const STADIUM={x:-2842.4167558578647,z:24.710898057053786,y:3.4211539001121896,rot:-1.5737129290333054};
export const RINGS=[[-16,-12],[16,-12],[-16,12],[16,12]].map(([u,v],i)=>({id:i,u,v}));
export function ringWorld(r,x=0,z=0,y=1.35){const c=Math.cos(STADIUM.rot),s=Math.sin(STADIUM.rot),u=r.u+x,v=r.v+z;return[STADIUM.x+u*c-v*s,STADIUM.y+y,STADIUM.z+u*s+v*c];}
export const ringGate=r=>ringWorld(r,0,5.3,.48);
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
export function newBout(ids,now){return{ids,phase:'count',until:now+3000,round:1,at:now,winner:null,reason:'준비 · 3초',seq:0,players:ids.map((id,i)=>({id,p:[i?1.2:-1.2,0],hp:100,stamina:100,guard:false,move:[0,0],lastInput:now,cool:0,punch:0,hand:0,score:0,total:0,downs:0,roundDowns:0,downUntil:0,actionSeq:-1}))};}
export function finishBout(b,winner,reason,now){b.phase='over';b.winner=winner;b.reason=reason;b.until=now+8000;}
export function punch(b,i,hand,seq,now){const a=b.players[i],o=b.players[1-i];if(b.phase!=='fight'||!a||!o||a.downUntil||o.downUntil||now<a.cool||a.stamina<12||!Number.isSafeInteger(seq)||seq<=a.actionSeq)return false;
 a.actionSeq=seq;a.cool=now+360;a.stamina-=12;
 a.combo=now-a.punch<1150?((a.combo||0)+1)%4:0;a.style=hand===1?'cross':['jab','cross','hook','uppercut'][a.combo];
 a.punch=now;a.hand=a.style==='cross'||a.style==='uppercut'?1:0;a.guard=false;b.seq++;
 const gap=Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1]);if(gap>1){const step=a.style==='jab'?.18:a.style==='cross'?.12:.08;for(let k=0;k<2;k++)a.p[k]=limit(a.p[k]+(o.p[k]-a.p[k])/gap*step,-2.65,2.65);}
 if(Math.hypot(a.p[0]-o.p[0],a.p[1]-o.p[1])<=1.8){const guarded=o.guard&&o.stamina>=8,dmg=guarded?3:12;if(guarded)o.stamina=Math.max(0,o.stamina-8);o.hp=Math.max(0,o.hp-dmg);a.score+=dmg;b.reason=guarded?'가드':'정타';
  if(o.hp===0){o.downs++;o.roundDowns++;o.guard=false;o.move=[0,0];if(o.downs>=3)finishBout(b,i,'3회 다운 · TKO',now);else{o.downUntil=now+8000;b.reason='다운 · 8 카운트';}}
 }else b.reason='헛스윙';return true;
}
export function tickBout(b,now){const dt=limit((now-b.at)/1000,0,.2);b.at=now;
 if(b.phase==='count'||b.phase==='rest'){if(now<b.until)return;b.phase='fight';b.until=now+60000;b.reason='파이트';}
 if(b.phase!=='fight')return;
 for(const p of b.players){if(p.downUntil){if(now>=p.downUntil){p.downUntil=0;p.hp=65;p.stamina=80;p.p=[p===b.players[0]?-1.5:1.5,0];}continue;}
  if(now-p.lastInput>450){p.move=[0,0];p.guard=false;}
  p.stamina=limit(p.stamina+dt*(p.guard?-6:14),0,100);if(!p.stamina)p.guard=false;
  const n=Math.max(1,Math.hypot(...p.move)),speed=p.guard?1.3:2.8;for(let i=0;i<2;i++)p.p[i]=limit(p.p[i]+p.move[i]/n*speed*dt,-2.65,2.65);
 }
 const a=b.players[0],c=b.players[1],dx=c.p[0]-a.p[0],dz=c.p[1]-a.p[1],d=Math.hypot(dx,dz);if(d<.75&&!a.downUntil&&!c.downUntil){const ux=d?dx/d:1,uz=d?dz/d:0;for(const [p,sg]of[[a,-1],[c,1]]){p.p[0]=limit(p.p[0]+sg*ux*(.75-d)/2,-2.65,2.65);p.p[1]=limit(p.p[1]+sg*uz*(.75-d)/2,-2.65,2.65);}}
 if(now>=b.until&&!b.players.some(p=>p.downUntil)){const scores=b.players.map(p=>p.score-p.roundDowns*30),max=Math.max(...scores);b.players.forEach((p,i)=>{p.total+=scores[i]===max?10:Math.max(7,9-p.roundDowns);p.score=0;p.roundDowns=0;});
  if(b.round===3){finishBout(b,a.total===c.total?-1:a.total>c.total?0:1,'3라운드 판정',now);}else{b.round++;b.phase='rest';b.until=now+10000;b.reason='라운드 휴식 · 10초';for(const [i,p]of b.players.entries()){p.hp=Math.min(100,p.hp+25);p.stamina=100;p.move=[0,0];p.guard=false;p.p=[i?1.5:-1.5,0];}}}
}
